import { queueEdit, settleSent, type Edit, type TableOperations } from '@budget/core';
import { resolveHeldNow } from './held';
import { kv } from './db';

/**
 * Правки уже отправленных операций (своих, Елены, строк формы): копятся здесь и уходят в таблицу
 * тем же запросом, что и новые операции. До отправки накладываются поверх зеркала таблицы.
 */
export function pendingEdits(): Edit[] {
  return kv.getJson<Edit[]>('edits.pending') ?? [];
}

export function addEdit(edit: Edit) {
  kv.setJson('edits.pending', queueEdit(pendingEdits(), edit));
}

/**
 * Сервер применил правки или не нашёл их строку: из очереди убираем и те и другие, но только в том
 * виде, в каком они ушли. Правка той же операции, добавленная за время запроса, остаётся в очереди.
 */
export function settleEdits(sent: Edit[], ids: string[]) {
  if (!ids.length) return;
  const done = new Set(ids);
  kv.setJson(
    'edits.pending',
    settleSent(pendingEdits(), sent, (e) => done.has(e.id), (e) => e.id),
  );
}

/** Зеркало строк «Формы» за прошлый и текущий месяц: что видно в истории, даже если внесено не с телефона. */
export function mirrorFrom(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
}

export function savedMirror(): TableOperations | undefined {
  return kv.getJson<TableOperations>('mirror') ?? undefined;
}

export function saveMirror(m: TableOperations) {
  kv.setJson('mirror', m);
  kv.set('mirrorAt', new Date().toISOString());
  // Свежее зеркало: может, владелец карты уже отправил отложенную покупку.
  void resolveHeldNow();
}
