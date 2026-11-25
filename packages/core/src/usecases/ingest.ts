import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';
import { SERVICE_APPS, SERVICE_NOISE } from '../parsing/services';
import { parseBankText, type ParsedNotification } from '../parsing/universal';
import { SMS_WINDOW_MS, pairWindow, mergeAcrossApps, mergedMerchant, type CapturedEvent } from './dedup';

/** Сырое уведомление из SQLite (его пишет Kotlin-сервис). */
export interface RawNotification {
  id: string;
  package: string;
  appLabel?: string;
  notificationKey?: string;
  postedAt: number;
  title: string;
  text: string;
}

export interface IngestContext {
  author: string;
  newId(): string;
  /** Счёт по банку, маске карты и словам из текста: из «Счетов» (Банк, Маски карт). */
  accountFor(
    pkg: string,
    appLabel: string | undefined,
    cardMask: string | undefined,
    text: string,
  ): string | undefined;
  /** Счёт только по маске карты или слову из текста, без банка и счёта по умолчанию: для снимков. */
  exactAccountFor?(cardMask: string | undefined, text: string): string | undefined;
  /** Чья карта по маске («*1101» -> «Олег»), из «Масок карт». */
  cardOwner?(cardMask: string): string | undefined;
}

export interface IngestResult {
  /** Новые операции во «Входящие» (status new: нужна подкатегория). */
  operations: Operation[];
  /** Какое уведомление к какой операции относится (для журнала и повторного разбора). */
  links: { notificationId: string; operationId: string | null; note: string }[];
  /**
   * Покупки чужой картой (общий счёт: пуш Т-Банка и SMS про карту Олега приходят и Елене).
   * Во «Входящие» не идут: их отправит телефон владельца, см. resolveHeld.
   */
  held: Operation[];
  /** Остатки из уведомлений: в «Снимки балансов». */
  balances: { accountId: string; at: string; balance?: Kopecks; available?: Kopecks }[];
  /** Что дополнить в уже существующей операции по её позднему дублю (например, SMS после Mir Pay). */
  enrich: { operationId: string; patch: OperationPatch }[];
}

export type OperationPatch = Partial<Pick<Operation, 'merchant' | 'cardMask' | 'accountId' | 'sourceText'>>;

const SOURCE_TEXT_MAX = 1500;

/** Тексты уведомлений операции: без повторов, с ограничением на ячейку таблицы. */
export function mergeSourceText(existing: string | undefined, texts: string[]): string | undefined {
  const parts = (existing ? existing.split('\n---\n') : []).filter(Boolean);
  for (const t of texts.map((x) => x.trim()).filter(Boolean)) if (!parts.includes(t)) parts.push(t);
  return parts.length ? parts.join('\n---\n').slice(0, SOURCE_TEXT_MAX) : undefined;
}

/** Насколько дата в тексте может отставать от пуша: часовые пояса и задержки доставки. */
const STALE_MS = 12 * 3600 * 1000;

/**
 * Пуш и операция, внесённая руками раньше него: та же сумма, счёт и направление в пределах 12 часов.
 * Журнал 11.10: Елена внесла «Аренду» 25 000 руками, через час пришёл пуш Т-Банка, ушли обе.
 */
export const MANUAL_TWIN_MS = 12 * 3600 * 1000;

/** «12.10.2026, 18:39» в тексте (Mir Pay): местное время телефона. */
export function dateInText(text: string): Date | undefined {
  const m = text.match(/\b(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})\b/);
  if (!m) return undefined;
  const [, d, mo, y, h, mi] = m.map(Number) as number[];
  const at = new Date(y!, mo! - 1, d!, h!, mi!);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

/**
 * Уведомления -> операции. Склеивает банк + Mir Pay (одна покупка), прикрепляет поздний пуш
 * к уже созданной операции, не создаёт операций из шума (коды, реклама без суммы покупки).
 */
export function ingestNotifications(
  raw: RawNotification[],
  recent: Operation[],
  ctx: IngestContext,
): IngestResult {
  const result: IngestResult = { operations: [], links: [], held: [], balances: [], enrich: [] };
  const parsed = new Map<string, ParsedNotification>();
  const events: CapturedEvent[] = [];
  const staleIds = new Set<string>();
  // Ручная операция забирает не больше одного пуша: две одинаковые покупки за день бывают.
  const takenManual = new Set<string>();

  for (const r of raw) {
    if (SERVICE_NOISE[r.package]?.test(`${r.title}\n${r.text}`)) {
      result.links.push({ notificationId: r.id, operationId: null, note: 'не списание (сервис)' });
      continue;
    }
    // Mir Pay иногда показывает покупку с опозданием (журнал 12.10: пуш про 507 ₽ от 10.10 пришёл через
    // два дня). Время операции берём из текста, а не время пуша; дальше её может найти ручная операция.
    const said = dateInText(r.text);
    const stale = said !== undefined && r.postedAt - said.getTime() > STALE_MS;
    if (stale) staleIds.add(r.id);
    const raw0 = parseBankText(r.title, r.text);
    // Сервис (Яндекс Go): магазин это сам сервис, текст пуша («Оцените поездку») не магазин.
    const service = SERVICE_APPS[r.package];
    const p = raw0 && service ? { ...raw0, merchant: service, confidence: 'high' as const } : raw0;
    if (!p) {
      result.links.push({ notificationId: r.id, operationId: null, note: 'не похоже на операцию' });
      continue;
    }
    parsed.set(r.id, p);
    events.push({
      id: r.id,
      source: r.package,
      notificationKey: r.notificationKey,
      text: `${r.title}\n${r.text}`,
      postedAt: stale ? said.getTime() : r.postedAt,
      amount: p.amount,
      direction: p.direction,
      merchant: p.merchant,
      accountId: ctx.accountFor(r.package, r.appLabel, p.cardMask, `${r.title}\n${r.text}`),
      balance: p.balance,
    });
    // Снимок из любого уведомления с остатком, где счёт известен точно: неважно, станет ли оно операцией,
    // дублем или подтверждением ручной. Раньше остаток поздней SMS и склеенных пушей выбрасывался.
    const exact = ctx.exactAccountFor?.(p.cardMask, `${r.title}\n${r.text}`);
    if (exact && (p.balance !== undefined || p.available !== undefined)) {
      const fact = {
        accountId: exact,
        at: new Date(stale ? said.getTime() : r.postedAt).toISOString(),
        ...(p.balance !== undefined ? { balance: p.balance } : {}),
        ...(p.available !== undefined ? { available: p.available } : {}),
      };
      // Пуш и SMS об одной покупке несут один и тот же остаток: одного снимка хватит.
      const repeat = result.balances.some(
        (b) =>
          b.accountId === fact.accountId &&
          b.balance === fact.balance &&
          b.available === fact.available &&
          Math.abs(Date.parse(b.at) - Date.parse(fact.at)) <= SMS_WINDOW_MS,
      );
      if (!repeat) result.balances.push(fact);
    }
  }

  /** Что поздний дубль добавляет к операции: только то, чего в ней нет или что он знает точнее. */
  const enrich = (target: Operation, group: ReturnType<typeof mergeAcrossApps>[number]) => {
    const all = [group.primary, ...group.merged];
    const mask = all.map((e) => parsed.get(e.id)?.cardMask).find(Boolean);
    const exact = all.map((e) => ctx.exactAccountFor?.(parsed.get(e.id)?.cardMask, e.text)).find(Boolean);
    const known = ctx.exactAccountFor?.(target.cardMask, target.sourceText ?? '');
    const patch: OperationPatch = {};
    const merchant = mergedMerchant(group);
    if (merchant && !target.merchant) patch.merchant = merchant;
    if (mask && mask !== target.cardMask && (!target.cardMask || !known)) patch.cardMask = mask;
    // Ручной счёт выбирал человек: его не трогаем, только заполняем пустой.
    if (exact && exact !== target.accountId && !known && (target.source !== 'manual' || !target.accountId))
      patch.accountId = exact;
    const sourceText = mergeSourceText(
      target.sourceText,
      all.map((e) => e.text),
    );
    if (sourceText && sourceText !== target.sourceText) patch.sourceText = sourceText;
    if (Object.keys(patch).length) result.enrich.push({ operationId: target.id, patch });
  };

  for (const group of mergeAcrossApps(events)) {
    const all = [group.primary, ...group.merged];
    const p = parsed.get(group.primary.id)!;
    const at = new Date(group.primary.postedAt).toISOString();

    // Поздний пуш (например, Mir Pay) к операции, созданной раньше из пуша банка.
    const twin = recent.find(
      (o) =>
        o.source === 'notification' &&
        o.amount === group.primary.amount &&
        o.sourceApp !== group.primary.source &&
        Math.abs(Date.parse(o.occurredAt) - group.primary.postedAt) <=
          pairWindow(o.sourceApp, group.primary.source) &&
        (o.kind === 'income') === (group.primary.direction === 'credit'),
    );
    if (twin) {
      for (const e of all)
        result.links.push({
          notificationId: e.id,
          operationId: twin.id,
          note: 'дубль уже созданной операции',
        });
      enrich(twin, group);
      continue;
    }

    // Точный счёт любого из склеенных уведомлений главнее счёта по банку или по умолчанию.
    const accountId =
      all.map((e) => ctx.exactAccountFor?.(parsed.get(e.id)?.cardMask, e.text)).find(Boolean) ??
      all.map((e) => e.accountId).find(Boolean);
    // Уже внесено руками: пуш только подтверждает операцию, новой строки нет.
    const manual = recent
      .filter(
        (o) =>
          o.source === 'manual' &&
          !o.deleted &&
          !takenManual.has(o.id) &&
          o.kind !== 'transfer' &&
          o.amount === group.primary.amount &&
          (o.kind === 'income') === (group.primary.direction === 'credit') &&
          (!o.accountId || !accountId || o.accountId === accountId) &&
          Math.abs(Date.parse(o.occurredAt) - group.primary.postedAt) <= MANUAL_TWIN_MS,
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.occurredAt) - group.primary.postedAt) -
          Math.abs(Date.parse(b.occurredAt) - group.primary.postedAt),
      )[0];
    if (manual) {
      takenManual.add(manual.id);
      for (const e of all)
        result.links.push({ notificationId: e.id, operationId: manual.id, note: 'уже внесено руками' });
      enrich(manual, group);
      continue;
    }

    // Карта: у пуша банка или SMS настоящая маска, у Mir Pay своя; берём главного, потом любую.
    const mask = [group.primary, ...group.merged].map((e) => parsed.get(e.id)?.cardMask).find(Boolean);
    const op: Operation = {
      id: ctx.newId(),
      // Возврат приходит зачислением: пока доход с пометкой, человек решит во «Входящих».
      kind: group.primary.direction === 'credit' ? 'income' : 'expense',
      amount: group.primary.amount,
      occurredAt: at,
      ...(accountId ? { accountId } : {}),
      ...(mergedMerchant(group) ? { merchant: mergedMerchant(group) } : {}),
      source: 'notification',
      sourceApp: group.primary.source,
      ...(mask ? { cardMask: mask } : {}),
      ...(mergeSourceText(
        undefined,
        all.map((e) => e.text),
      )
        ? {
            sourceText: mergeSourceText(
              undefined,
              all.map((e) => e.text),
            )!,
          }
        : {}),
      ...(group.merged.length ? { alsoFrom: [...new Set(group.merged.map((e) => e.source))] } : {}),
      author: ctx.author,
      status: 'new',
      ...(p.refund ? { comment: 'Возврат' } : {}),
    };
    const owner = mask ? ctx.cardOwner?.(mask) : undefined;
    if (owner && owner !== ctx.author) {
      result.held.push({ ...op, heldFor: owner });
      for (const e of all)
        result.links.push({
          notificationId: e.id,
          operationId: op.id,
          note: `карта: ${owner}, ждём его телефон`,
        });
    } else result.operations.push(op);
    for (const e of owner && owner !== ctx.author ? [] : all) {
      result.links.push({
        notificationId: e.id,
        operationId: op.id,
        note:
          e !== group.primary
            ? 'склеено'
            : staleIds.has(e.id)
              ? 'создана по дате из текста, проверь'
              : p.confidence === 'low'
                ? 'создана, проверь'
                : 'создана',
      });
    }
  }
  return result;
}
