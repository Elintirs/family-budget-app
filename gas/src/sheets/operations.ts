import type { Edit, Operation } from '@budget/core';
import { kop, SHEETS } from './read';
import { sheet, Table, type SpreadsheetLike } from './table';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * ID строки «Формы». У строк из приложения он в колонке «ID». У ответов Google Формы его нет:
 * выводим из отметки времени и суммы (форма ставит время до секунды, совпадений не бывает).
 * Строки не трогаем: старые сверенные строки остаются как есть.
 */
export function formRowId(r: Record<string, unknown>): string {
  const id = text(r['ID']);
  if (id) return id;
  const at = r['Отметка времени'];
  return `f:${at instanceof Date ? at.getTime() : text(at)}:${kop(r['Сумма'])}`;
}

const SOURCE: Record<string, Operation['source']> = {
  уведомление: 'notification',
  приложение: 'manual',
};

/** Когда была операция: «Дата операции» (день без времени), иначе отметка времени. */
function occurredAt(r: Record<string, unknown>): Date | undefined {
  const at = r['Отметка времени'];
  const day = r['Дата операции (если не сегодня)'];
  if (day instanceof Date) {
    // День из формы без времени: берём полдень, чтобы сдвиг начала дня (05:00) не унёс во вчера.
    const d = new Date(day);
    if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(12);
    return d;
  }
  return at instanceof Date ? at : undefined;
}

/** Строка «Формы» как операция приложения (уже в таблице: status synced). */
export function formRowToOperation(r: Record<string, unknown>): Operation | undefined {
  const at = occurredAt(r);
  const amount = kop(r['Сумма']);
  const type = text(r['Это доход или расход?']);
  if (!at || amount <= 0 || !type) return undefined;
  const kind = type === 'Доход' ? 'income' : type === 'Перевод' ? 'transfer' : 'expense';
  const op: Operation = {
    id: formRowId(r),
    kind,
    amount,
    occurredAt: at.toISOString(),
    source: SOURCE[text(r['Источник'])] ?? 'form',
    author: text(r['Автор']) || 'форма',
    status: 'synced',
  };
  const account = text(r['Карта/счёт']);
  if (account) op.accountId = account;
  if (kind === 'transfer' && text(r['Куда перевели'])) op.toAccountId = text(r['Куда перевели']);
  if (kind === 'expense' && text(r['Подкатегория'])) op.subcategory = text(r['Подкатегория']);
  if (kind === 'income' && text(r['Категория дохода'])) op.incomeCategory = text(r['Категория дохода']);
  if (text(r['Комментарий'])) op.comment = text(r['Комментарий']);
  if (text(r['Мерчант'])) op.merchant = text(r['Мерчант']);
  const card = text(r['Карта']).match(/^\*\d{4}/);
  if (card) op.cardMask = card[0];
  const oneOff = text(r['Единовременный']);
  if (kind === 'expense' && oneOff) op.oneOff = oneOff === 'да';
  if (text(r['Уведомление'])) op.sourceText = text(r['Уведомление']);
  return op;
}

/** Строки «Формы» с даты from: для зеркала таблицы на телефоне. */
export function readFormOperations(ss: SpreadsheetLike, from: Date): Operation[] {
  const out: Operation[] = [];
  for (const r of new Table(sheet(ss, SHEETS.form)).rows()) {
    const op = formRowToOperation(r);
    if (op && Date.parse(op.occurredAt) >= from.getTime()) out.push(op);
  }
  return out;
}

const TYPE = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' } as const;

function stamp(author: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${author}, ${p(now.getDate())}.${p(now.getMonth() + 1)} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

/**
 * Правки отправленных операций. Ячейки правятся по ID строки, в «Правке» остаётся, кто и когда.
 * Удаление удаляет строку целиком: формулы таблицы пометку «Удалено» не учитывают.
 */
export function applyEdits(
  ss: SpreadsheetLike,
  edits: Edit[],
  author: string,
  now: Date,
  owners: Record<string, string> = {},
): { edited: string[]; missing: string[] } {
  if (!edits.length) return { edited: [], missing: [] };
  const sh = sheet(ss, SHEETS.form);
  const t = new Table(sh);
  const rows = t.rows();
  const ids = rows.map(formRowId);
  const edited: string[] = [];
  const missing: string[] = [];
  const toDelete: number[] = [];
  for (const e of edits) {
    const i = ids.indexOf(e.id);
    if (i < 0) {
      missing.push(e.id);
      continue;
    }
    const row = i + 2;
    if (e.deleted) {
      toDelete.push(row);
      edited.push(e.id);
      continue;
    }
    const f = e.fields;
    const cells: Record<string, unknown> = {};
    if (f.kind) cells['Это доход или расход?'] = TYPE[f.kind];
    if (f.amount !== undefined) cells['Сумма'] = f.amount / 100;
    if (f.occurredAt) {
      // Точное время в «Отметке времени», день операции больше не нужен.
      cells['Отметка времени'] = new Date(f.occurredAt);
      cells['Дата операции (если не сегодня)'] = '';
    }
    if (f.accountId !== undefined) cells['Карта/счёт'] = f.accountId;
    if (f.toAccountId !== undefined) cells['Куда перевели'] = f.toAccountId;
    if (f.subcategory !== undefined) {
      cells['Подкатегория'] = f.subcategory;
      // Категорию из формы сбрасываем: таблица возьмёт её из «Справочника» по новой подкатегории.
      if (t.has('Категория')) cells['Категория'] = '';
    }
    if (f.incomeCategory !== undefined) cells['Категория дохода'] = f.incomeCategory;
    if (f.comment !== undefined) cells['Комментарий'] = f.comment;
    if (f.oneOff !== undefined) cells['Единовременный'] = f.oneOff ? 'да' : 'нет';
    if (f.merchant !== undefined) cells['Мерчант'] = f.merchant;
    if (f.cardMask !== undefined) cells['Карта'] = [f.cardMask, owners[f.cardMask]].filter(Boolean).join(' ');
    if (f.sourceText !== undefined) cells['Уведомление'] = f.sourceText;
    cells['Правка'] = stamp(author, now);
    // ID строки формы выводится из времени и суммы: закрепляем его, иначе правка суммы или времени сменит ID.
    if (!text(rows[i]!['ID'])) cells['ID'] = e.id;
    for (const [column, value] of Object.entries(cells))
      sh.getRange(row, t.col(column, true), 1, 1).setValues([[value]]);
    edited.push(e.id);
  }
  // Снизу вверх: номера строк выше удалённой не сдвигаются.
  for (const row of toDelete.sort((a, b) => b - a)) {
    if (!sh.deleteRow) throw new Error('Лист не умеет удалять строки');
    sh.deleteRow(row);
  }
  return { edited, missing };
}
