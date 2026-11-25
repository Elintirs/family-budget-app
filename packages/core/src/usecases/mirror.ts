import type { Edit } from '../contract';
import type { Operation } from '../domain/operation';

/**
 * Что показывать в истории, аналитике по дням, подсказках и регулярных: строки таблицы (зеркало за окно
 * с даты from) плюс то, что есть только на телефоне.
 * - Строка таблицы главнее своей копии на телефоне (её могли поправить руками или с другого телефона).
 * - Отправленная операция телефона внутри окна, которой нет в таблице, удалена там: не показываем.
 * - Неотправленные показываем всегда.
 * - Ожидающие правки накладываются сверху, удалённые правкой скрываются.
 */
export function withTable(
  local: Operation[],
  table: Operation[] | undefined,
  from: string | undefined,
  edits: Edit[] = [],
): Operation[] {
  if (!table) return applyEdits(local, edits);
  const start = from ? Date.parse(from) : -Infinity;
  const byId = new Map(local.map((o) => [o.id, o]));
  const inTable = new Set(table.map((o) => o.id));
  // С телефона берём то, чего таблица не знает (иконка Mir Pay, приложение-источник), но поля из таблицы.
  const merged = table.map((t) => {
    const mine = byId.get(t.id);
    return mine ? { ...mine, ...t, status: 'synced' as const } : t;
  });
  const onlyLocal = local.filter((o) => {
    if (inTable.has(o.id)) return false;
    if (o.status !== 'synced') return true;
    return Date.parse(o.occurredAt) < start;
  });
  return applyEdits([...merged, ...onlyLocal], edits).sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}

function applyEdits(ops: Operation[], edits: Edit[]): Operation[] {
  if (!edits.length) return ops;
  const byId = new Map(edits.map((e) => [e.id, e]));
  const out: Operation[] = [];
  for (const o of ops) {
    const e = byId.get(o.id);
    if (!e) out.push(o);
    else if (!e.deleted) out.push({ ...o, ...e.fields });
  }
  return out;
}

/** Новая правка в очередь: поля той же операции складываются, удаление перекрывает всё. */
export function queueEdit(queue: Edit[], next: Edit): Edit[] {
  const prev = queue.find((e) => e.id === next.id);
  const rest = queue.filter((e) => e.id !== next.id);
  if (!prev) return [...rest, next];
  if (next.deleted || prev.deleted) return [...rest, { id: next.id, deleted: true, fields: {} }];
  return [...rest, { id: next.id, fields: { ...prev.fields, ...next.fields } }];
}
