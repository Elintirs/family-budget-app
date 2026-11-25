import type { RecurringRule } from '@budget/core';
import { kop } from './read';
import { sheet, Table, type SheetLike, type SpreadsheetLike } from './table';

export const RECURRING_SHEET = 'Регулярные';
const HEADERS = ['ID', 'Название', 'Сумма', 'Число', 'Слово', 'Подкатегория', 'Счёт', 'Автор', 'Создано'];

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** Регулярные платежи с листа «Регулярные»: общий список на два телефона, виден и в самой таблице. */
export function readRecurring(ss: SpreadsheetLike): RecurringRule[] {
  const sh = ss.getSheetByName(RECURRING_SHEET);
  if (!sh) return [];
  return new Table(sh)
    .rows()
    .filter((r) => text(r['ID']) && text(r['Название']) && kop(r['Сумма']) > 0)
    .map((r) => ({
      id: text(r['ID']),
      name: text(r['Название']),
      amount: kop(r['Сумма']),
      day: Math.min(31, Math.max(1, Number(r['Число']) || 1)),
      match: text(r['Слово']) || text(r['Название']),
      ...(text(r['Подкатегория']) ? { subcategory: text(r['Подкатегория']) } : {}),
      ...(text(r['Счёт']) ? { accountId: text(r['Счёт']) } : {}),
      author: text(r['Автор']),
      ...extraFrom(r),
    }));
}

/**
 * Новые поля (0.3.16): вид, счёт назначения, верхняя граница суммы, слова, расписание JSON, пауза.
 * Колонки появляются при первой записи такого правила (Table.updateRow/append создают их справа).
 */
const KINDS = { Расход: 'expense', Доход: 'income', Перевод: 'transfer' } as const;
const KIND_TITLE = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' } as const;

function extraFrom(r: Record<string, unknown>): Partial<RecurringRule> {
  const out: Partial<RecurringRule> = {};
  const kind = KINDS[text(r['Тип']) as keyof typeof KINDS];
  if (kind) out.kind = kind;
  if (text(r['Куда'])) out.toAccountId = text(r['Куда']);
  if (kop(r['До суммы']) > 0) out.amountMax = kop(r['До суммы']);
  const words = text(r['Слова']).split(',').map((w) => w.trim()).filter(Boolean);
  if (words.length) out.keywords = words;
  try {
    if (text(r['Расписание'])) out.schedule = JSON.parse(text(r['Расписание']));
  } catch {
    // Испорченный JSON руками: правило остаётся старым «раз в месяц day-го».
  }
  if (text(r['Пауза']).toLowerCase() === 'да') out.paused = true;
  return out;
}

/** Запись новых полей. Только если правило пришло с расписанием (новое приложение): старое их не знает и не должно стирать. */
function extraTo(rule: RecurringRule): Record<string, unknown> {
  if (!rule.schedule) return {};
  return {
    Тип: KIND_TITLE[rule.kind ?? 'expense'],
    Куда: rule.toAccountId ?? '',
    'До суммы': rule.amountMax ? rule.amountMax / 100 : '',
    Слова: (rule.keywords ?? []).join(', '),
    Расписание: JSON.stringify(rule.schedule),
    Пауза: rule.paused ? 'да' : '',
  };
}

/** Лист создаётся при первой записи, с заголовками. */
function recurringSheet(ss: SpreadsheetLike): SheetLike {
  const found = ss.getSheetByName(RECURRING_SHEET);
  if (found) return found;
  if (!ss.insertSheet) throw new Error(`Нет листа «${RECURRING_SHEET}»`);
  const sh = ss.insertSheet(RECURRING_SHEET);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sh;
}

function toRow(rule: RecurringRule): unknown[] {
  return [
    rule.id,
    rule.name,
    rule.amount / 100,
    rule.day,
    rule.match,
    rule.subcategory ?? '',
    rule.accountId ?? '',
    rule.author,
  ];
}

/** Новый платёж дописывается, существующий (тот же ID) перезаписывается, «Создано» сохраняется. */
export function upsertRecurring(ss: SpreadsheetLike, rule: RecurringRule, now: Date): 'added' | 'updated' {
  const sh = recurringSheet(ss);
  const t = new Table(sh);
  const ids = t.column('ID').map((v) => text(v));
  const record = { ...Object.fromEntries(HEADERS.slice(0, 8).map((h, j) => [h, toRow(rule)[j]])), ...extraTo(rule) };
  if (ids.includes(rule.id) && t.updateRow('ID', rule.id, record)) return 'updated';
  t.append([{ ...record, Создано: now }]);
  return 'added';
}

export function deleteRecurring(ss: SpreadsheetLike, id: string): boolean {
  const sh = ss.getSheetByName(RECURRING_SHEET);
  if (!sh) return false;
  const i = new Table(sh)
    .column('ID')
    .map((v) => text(v))
    .indexOf(id);
  if (i < 0) return false;
  if (!sh.deleteRow) throw new Error('Лист не умеет удалять строки');
  sh.deleteRow(i + 2);
  return true;
}

/** Группы, у которых может быть свой месячный лимит (вне лимита на день). */
export const LIMIT_GROUPS = ['Обязательные', 'Крупные'] as const;
const groupLabel = (g: string) => `Лимит ${g}`;

/** Лимиты групп: строки «Лимит Обязательные», «Лимит Крупные» в «Лимитах на месяц» (подпись в A, рубли в B). */
export function readGroupLimits(ss: SpreadsheetLike): Record<string, number> {
  const sh = ss.getSheetByName('Лимиты на месяц');
  if (!sh) return {};
  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getValues();
  const out: Record<string, number> = {};
  for (const g of LIMIT_GROUPS) {
    const row = values.find((r) => text(r[0]) === groupLabel(g));
    if (row && text(row[1])) out[g] = kop(row[1]);
  }
  return out;
}

/** Строка лимита группы: есть, меняется значение; нет, дописывается в конец листа. null очищает. */
export function writeGroupLimit(ss: SpreadsheetLike, group: string, limit: number | null): void {
  const sh = sheet(ss, 'Лимиты на месяц');
  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  const i = values.findIndex((r) => text(r[0]) === groupLabel(group));
  const value = limit === null ? '' : limit / 100;
  if (i >= 0) sh.getRange(i + 1, 2, 1, 1).setValues([[value]]);
  else if (limit !== null)
    sh.getRange(sh.getLastRow() + 1, 1, 1, 3).setValues([
      [groupLabel(group), value, 'лимит группы на месяц, вне лимита на день (из приложения)'],
    ]);
}
