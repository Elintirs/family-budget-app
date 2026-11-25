import type { BalanceFact, Edit, Rule, SyncResponse } from '../contract';
import type { Operation } from '../domain/operation';
import type { OperationRepo, SheetApi } from '../ports';

export interface SyncResult {
  sent: number;
  rejected: SyncResponse['rejected'];
  suspected: SyncResponse['suspected'];
  response: SyncResponse;
  /**
   * Операции, которые человек поменял, пока шёл запрос: в таблицу ушла старая версия, поэтому
   * отличие уходит следующим запросом как правка по ID. Адаптер кладёт их в очередь правок.
   */
  followUpEdits: Edit[];
}

/** Поля, которые сервер умеет править по ID (`EditSchema.fields`). */
const EDIT_FIELDS = [
  'kind',
  'amount',
  'occurredAt',
  'accountId',
  'toAccountId',
  'subcategory',
  'incomeCategory',
  'comment',
  'oneOff',
  'merchant',
  'cardMask',
  'sourceText',
] as const;
const TEXT_FIELDS = new Set<string>(['accountId', 'toAccountId', 'subcategory', 'incomeCategory', 'comment', 'merchant', 'cardMask', 'sourceText']);

/** Чем операция отличается от отправленной версии: правка для таблицы или ничего. */
export function editFromChange(sent: Operation, now: Operation): Edit | undefined {
  if (now.deleted && !sent.deleted) return { id: now.id, deleted: true, fields: {} };
  const fields: Edit['fields'] = {};
  for (const k of EDIT_FIELDS) {
    if (JSON.stringify(sent[k]) === JSON.stringify(now[k])) continue;
    const v = now[k];
    // Очищенное текстовое поле уходит пустой строкой; у остальных пустого значения в правке нет.
    if (v === undefined && !TEXT_FIELDS.has(k)) continue;
    (fields as Record<string, unknown>)[k] = v ?? '';
  }
  return Object.keys(fields).length ? { id: now.id, fields } : undefined;
}

/**
 * Отправляет готовые операции. Принятые и дубли помечаются отправленными:
 * дубль значит, что прошлая отправка дошла, а ответ потерялся.
 * Отклонённые и неразмеченные остаются в очереди.
 *
 * Отметка ставится по свежей копии, а не по снимку до запроса: если операцию поменяли за время
 * отправки, правка не теряется, а уходит в `followUpEdits`.
 */
export async function syncQueue(
  repo: OperationRepo,
  api: SheetApi,
  rules: Rule[] = [],
  /** Правки уже отправленных: уходят тем же запросом, сервер находит строки по ID. */
  edits: Edit[] = [],
  /** Остатки из пушей и окно зеркала для свежих данных в ответе: всё тем же запросом. */
  extra: { balanceFacts?: BalanceFact[]; pullFrom?: string } = {},
): Promise<SyncResult> {
  const ready = await repo.list({ status: ['ready'], includeDeleted: true });
  const response = await api.sync({
    operations: ready,
    rules,
    edits,
    balanceFacts: extra.balanceFacts ?? [],
    ...(extra.pullFrom ? { pull: { from: extra.pullFrom } } : {}),
  });
  const sentById = new Map(ready.map((o) => [o.id, o]));
  const done = [...response.accepted, ...response.duplicates];
  const unchanged: string[] = [];
  const followUpEdits: Edit[] = [];
  for (const id of done) {
    const sent = sentById.get(id);
    const now = await repo.get(id);
    if (!sent || !now) continue;
    const edit = editFromChange(sent, now);
    if (!edit) {
      unchanged.push(id);
      continue;
    }
    // В таблице уже есть строка со старыми полями: копия на телефоне отправлена, отличие уходит правкой.
    await repo.upsert({ ...now, status: 'synced' });
    followUpEdits.push(edit);
  }
  if (unchanged.length) await repo.markSynced(unchanged);
  // Подозрение на дубль: операция остаётся во «Входящих» с пометкой, пока человек не решит.
  for (const s of response.suspected ?? []) {
    const now = await repo.get(s.id);
    if (now) await repo.upsert({ ...now, duplicateOf: s.otherAuthor });
  }
  return { sent: done.length, rejected: response.rejected, suspected: response.suspected ?? [], response, followUpEdits };
}

/**
 * Очередь после ответа: убираем только то, что ушло в неизменном виде. Если за время запроса
 * в очередь легла новая правка той же операции или правило того же магазина, оно остаётся.
 */
export function settleSent<T>(queue: T[], sent: T[], done: (item: T) => boolean, key: (item: T) => string): T[] {
  const sentByKey = new Map(sent.map((s) => [key(s), JSON.stringify(s)]));
  return queue.filter((q) => !(done(q) && sentByKey.get(key(q)) === JSON.stringify(q)));
}
