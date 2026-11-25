import {
  accountForNotification,
  exactAccount,
  cardOwner,
  findRecaptured,
  ingestNotifications,
  parseBankText,
  refreshStatus,
  ruleFor,
  type Bootstrap,
  type BalanceFact,
  type Operation,
  type RawNotification,
} from '@budget/core';
import { randomUUID } from 'expo-crypto';
import { allRules } from './rules';
import { Platform } from 'react-native';
import { NotificationListener, type KnownBank } from '../../modules/notification-listener/src';
import { capture } from './capture';
import { kv } from './db';
import { defaultAccountId } from './defaultAccount';
import { log, pullNativeLogs } from './log';
import { addEdit } from './edits';
import { holdOperations, resolveHeldNow } from './held';
import { sqliteRepo } from './sqliteRepo';

/**
 * Мост между Kotlin-сервисом и приложением: разбирает пойманные уведомления в операции «Входящих»,
 * копит остатки из пушей для «Снимков балансов», отдаёт кандидатов в источники.
 */

export const listener = Platform.OS === 'android' ? NotificationListener : null;

interface CapturedRow {
  id: string;
  package: string;
  app_label: string | null;
  notification_key: string | null;
  posted_at: number;
  title: string | null;
  text: string | null;
  tracked: number;
  processed: number;
  operation_id: string | null;
}

const toRaw = (r: CapturedRow): RawNotification => ({
  id: r.id,
  package: r.package,
  appLabel: r.app_label ?? undefined,
  notificationKey: r.notification_key ?? undefined,
  postedAt: r.posted_at,
  title: r.title ?? '',
  text: r.text ?? '',
});

let running: Promise<number> | null = null;

/**
 * Разбирает новые уведомления выбранных источников. Возвращает число новых операций.
 * Один разбор за раз: запуск, возврат в приложение, событие пуша и фон приходят одновременно, и без
 * этого один пуш становился 25 операциями (журнал 12.10, реклама Сбера). Повторный вызов ждёт текущий.
 */
export function ingestPending(author: string): Promise<number> {
  running ??= ingestOnce(author).finally(() => {
    running = null;
  });
  return running;
}

async function ingestOnce(author: string): Promise<number> {
  pullNativeLogs();
  const pending = capture.all<CapturedRow>(
    'SELECT * FROM captured_notifications WHERE tracked = 1 AND processed = 0 ORDER BY posted_at',
  );
  if (!pending.length) return (await applyQuickChoices()) ? 1 : 0;
  const boot = kv.getJson<Bootstrap>('bootstrap');
  const accounts = boot?.accounts ?? [];
  const all = await sqliteRepo.list();

  // Тот же пуш пойман повторно (догрузка из шторки после переустановки): привязываем к уже
  // существующей операции, даже отправленной, а не создаём вторую.
  const rows = pending.filter((r) => {
    const p = parseBankText(r.title ?? '', r.text ?? '');
    const found = p
      ? findRecaptured(all, r.package, p.amount, r.posted_at, undefined, p.direction)
      : undefined;
    // Повтор того же пуша узнаётся и по тексту: «Перевод на 90 000, счет карты *6606» и через полминуты
    // «Перевод на 90 000, счет RUB» (журнал Елены 22.10) это два разных счёта, а не повтор.
    const sameText =
      found &&
      capture
        .all<{ text: string | null }>(
          'SELECT text FROM captured_notifications WHERE operation_id = ?',
          found.id,
        )
        .some((n) => (n.text ?? '') === (r.text ?? ''));
    const twin = sameText ? found : undefined;
    if (!twin) return true;
    capture.run([
      'UPDATE captured_notifications SET processed = 1, operation_id = ? WHERE id = ?',
      [twin.id, r.id],
    ]);
    log.info('ingest', 'Повторно пойманный пуш привязан к существующей операции', {
      notification: r.id,
      operation: twin.id,
      status: twin.status,
    });
    return false;
  });
  if (!rows.length) return (await applyQuickChoices()) ? 1 : 0;
  // Ручные за 3 дня: пуш подтверждает внесённое руками, в том числе опоздавший Mir Pay с датой в тексте.
  // Ручная, к которой уже привязан пуш, занята.
  // Пуши за 3 дня: Mir Pay присылает опоздавший пуш с датой в тексте (23.10 пришёл пуш про 20.10), его
  // время из текста, и склейка с SMS того дня должна его видеть. Окно по времени всё равно 3–10 минут.
  const since = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  const manualSince = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  const linked = new Set(
    capture
      .all<{ operation_id: string }>(
        'SELECT DISTINCT operation_id FROM captured_notifications WHERE operation_id IS NOT NULL',
      )
      .map((r) => r.operation_id),
  );
  const recent = all.filter((o) =>
    o.source === 'manual'
      ? o.occurredAt >= manualSince && !linked.has(o.id)
      : o.source === 'notification' && o.occurredAt >= since,
  );

  const result = ingestNotifications(rows.map(toRaw), recent, {
    author,
    newId: () => randomUUID(),
    accountFor: (_pkg, label, mask, text) =>
      accountForNotification(accounts, { cardMask: mask, text, appLabel: label }) ??
      // Не узнали по карте, слову и банку (например, Mir Pay): счёт по умолчанию.
      defaultAccountId(accounts),
    exactAccountFor: (mask, text) => exactAccount(accounts, { cardMask: mask, text }),
    cardOwner: (mask) => cardOwner(accounts, mask),
  });
  holdOperations(result.held);
  for (const op of result.held)
    log.info('ingest', `Покупка картой: ${op.heldFor}, ждём его телефон · ${op.amount / 100} ₽`, {
      operation: op.id,
      merchant: op.merchant ?? null,
      occurredAt: op.occurredAt,
    });

  // Правило «всегда так» ставит подкатегорию сразу: такая операция уже готова к отправке.
  const rules = allRules();
  for (const op of result.operations) {
    const rule = op.kind === 'expense' ? ruleFor(op.merchant, rules) : undefined;
    const next = rule?.subcategory ? refreshStatus({ ...op, subcategory: rule.subcategory }) : op;
    await sqliteRepo.upsert(next);
    log.info('ingest', `Операция ${op.kind} ${op.amount / 100} ₽ · ${op.merchant ?? 'без магазина'}`, {
      operation: op.id,
      account: op.accountId ?? null,
      sourceApp: op.sourceApp,
      alsoFrom: op.alsoFrom,
      occurredAt: op.occurredAt,
      duplicateOf: op.duplicateOf ?? null,
      rule: rule ? { pattern: rule.pattern, subcategory: rule.subcategory } : null,
      status: next.status,
    });
  }
  // Поздний дубль (SMS после Mir Pay): дополняем операцию. Отправленную правкой, чтобы дошло до таблицы.
  for (const { operationId, patch } of result.enrich) {
    // Свежая копия, а не снимок `all`: синхронизация или правка могли изменить операцию за время разбора.
    const op = await sqliteRepo.get(operationId);
    if (!op) continue;
    await sqliteRepo.upsert({ ...op, ...patch });
    if (op.status === 'synced') addEdit({ id: op.id, fields: patch });
    log.info('ingest', 'Операция дополнена из дубля', { operation: op.id, fields: Object.keys(patch) });
  }
  // По каждому пушу: что увидел парсер и что с пушем стало. По этим строкам настраиваем разбор банков.
  for (const row of rows) {
    const link = result.links.find((l) => l.notificationId === row.id);
    log.info('parse', `${row.app_label ?? row.package}: ${link?.note ?? 'не разобрано'}`, {
      notification: row.id,
      package: row.package,
      title: row.title,
      text: row.text,
      parsed: parseBankText(row.title ?? '', row.text ?? ''),
      operation: link?.operationId ?? null,
      delaySec: Math.round((Date.now() - row.posted_at) / 1000),
    });
  }
  capture.run(
    ...result.links.map(
      (l) =>
        [
          'UPDATE captured_notifications SET processed = 1, operation_id = ? WHERE id = ?',
          [l.operationId, l.notificationId],
        ] as [string, (string | null)[]],
    ),
  );
  if (result.balances.length) {
    const facts: BalanceFact[] = result.balances.map((b) => ({ ...b, source: 'notification' }));
    kv.setJson('pendingFacts', [...(kv.getJson<BalanceFact[]>('pendingFacts') ?? []), ...facts]);
  }
  await applyQuickChoices();
  await resolveHeldNow();
  log.info('ingest', `Уведомлений ${rows.length} -> операций ${result.operations.length}`, {
    links: result.links.map((l) => l.note),
    balances: result.balances.length,
  });
  return result.operations.length;
}

/** Остатки из пушей, ещё не отправленные в таблицу. */
export function takePendingFacts(): BalanceFact[] {
  return kv.getJson<BalanceFact[]>('pendingFacts') ?? [];
}

/** Остаток, введённый руками на экране счёта: в ту же очередь, уйдёт со следующей отправкой. */
export function queueFact(fact: BalanceFact) {
  kv.setJson('pendingFacts', [...takePendingFacts(), fact]);
}

export function clearPendingFacts(sent: number) {
  const all = takePendingFacts();
  kv.setJson('pendingFacts', all.slice(sent));
}

export interface Candidate {
  package: string;
  label: string;
  count: number;
  lastText: string;
  lastAt: number;
}

/** Приложения, которые присылали суммы, но ещё не выбраны источниками. */
export function candidates(): Candidate[] {
  return capture
    .all<{ package: string; label: string | null; count: number; lastAt: number }>(
      `SELECT package, MAX(app_label) AS label, COUNT(*) AS count, MAX(posted_at) AS lastAt
         FROM captured_notifications WHERE tracked = 0 GROUP BY package ORDER BY lastAt DESC`,
    )
    .map((r) => {
      const last = capture.first<{ title: string | null; text: string | null }>(
        'SELECT title, text FROM captured_notifications WHERE package = ? ORDER BY posted_at DESC LIMIT 1',
        r.package,
      );
      return {
        package: r.package,
        label: r.label ?? r.package,
        count: r.count,
        lastAt: r.lastAt,
        lastText: [last?.title, last?.text].filter(Boolean).join(' · '),
      };
    });
}

/** Включить приложение как источник: и на будущее, и для уже пойманных его уведомлений. */
export function enableSource(pkg: string) {
  if (!listener) return;
  listener.setSources([...new Set([...listener.getSources(), pkg])]);
  capture.run(['UPDATE captured_notifications SET tracked = 1 WHERE package = ?', [pkg]]);
  log.info('sources', `Источник включён: ${pkg}`);
}

export function disableSource(pkg: string) {
  if (!listener) return;
  listener.setSources(listener.getSources().filter((p) => p !== pkg));
  log.info('sources', `Источник выключен: ${pkg}`);
}

export function knownBanks(): KnownBank[] {
  return listener?.knownBanks() ?? [];
}

export function capturedCount() {
  return capture.first<{ n: number }>('SELECT COUNT(*) AS n FROM captured_notifications')?.n ?? 0;
}

export type { Operation };

/** Исходные пуши, из которых создана операция (для карточки операции). */
export function notificationsFor(
  operationId: string,
): { appLabel: string; title: string; text: string; postedAt: number }[] {
  return capture
    .all<{
      app_label: string | null;
      package: string;
      title: string | null;
      text: string | null;
      posted_at: number;
    }>(
      'SELECT app_label, package, title, text, posted_at FROM captured_notifications WHERE operation_id = ? ORDER BY posted_at',
      operationId,
    )
    .map((r) => ({
      appLabel: r.app_label ?? r.package,
      title: r.title ?? '',
      text: r.text ?? '',
      postedAt: r.posted_at,
    }));
}

/** Категории, выбранные кнопками в уведомлении (в том числе на заблокированном экране). */
export async function applyQuickChoices(): Promise<number> {
  if (!listener) return 0;
  let applied = 0;
  for (const c of listener.takeQuickChoices()) {
    const row = capture.first<{ operation_id: string | null }>(
      'SELECT operation_id FROM captured_notifications WHERE id = ?',
      c.capturedId,
    );
    if (!row?.operation_id) {
      log.info('quick', `Выбор ${c.subcategory} ждёт разбора уведомления`, { captured: c.capturedId });
      continue; // уведомление ещё не разобрано: применим в следующий раз
    }
    const op = await sqliteRepo.get(row.operation_id);
    if (op && op.status !== 'synced') {
      await sqliteRepo.upsert(refreshStatus({ ...op, subcategory: c.subcategory }));
      applied++;
      log.info('quick', `Категория из уведомления применена: ${c.subcategory}`, {
        operation: op.id,
        before: op.subcategory ?? null,
      });
    } else {
      log.warn('quick', `Выбор ${c.subcategory} не применён`, {
        operation: row.operation_id,
        reason: op ? 'уже отправлена' : 'операция не найдена',
      });
    }
    listener.deleteQuickChoice(c.capturedId);
  }
  return applied;
}

/** Операция, в которую превратилось уведомление (для ссылки «Все категории…» из уведомления). */
export function operationForCaptured(capturedId: string): string | null {
  return (
    capture.first<{ operation_id: string | null }>(
      'SELECT operation_id FROM captured_notifications WHERE id = ?',
      capturedId,
    )?.operation_id ?? null
  );
}
