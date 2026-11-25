import type { SyncRequest } from '@budget/core';
import { HIDDEN_COLUMN, LIMIT_COLUMN, SHEETS } from '../sheets/read';
import { RECURRING_SHEET } from '../sheets/recurring';
import { GOALS_SHEET } from '../sheets/accounts';
import { Table, type SheetLike, type SpreadsheetLike } from '../sheets/table';

/** Переименования подкатегорий: строка «Справочника» остаётся на месте, от порядка зависит «Дэшборд». */
export const RENAMED_SUBCATEGORIES: Record<string, string> = {
  'Ремонт машины': 'Машина',
  Гинекология: 'Здоровье',
  Взыскания: 'Штрафы/Госпошлины',
};
/** Слитые подкатегории: операции уходят в другую, строка «Справочника» скрывается, лимит снимается. */
export const MERGED_SUBCATEGORIES: Record<string, string> = {
  Аптека: 'Здоровье',
  Свадьба: 'Развлечения',
};
/** Новая группа подкатегории: «Одежда и обувь» не повседневная трата, в лимит на день не идёт. */
export const REGROUPED_SUBCATEGORIES: Record<string, string> = { 'Одежда и обувь': 'Крупные' };
export const RENAMED_ACCOUNTS: Record<string, string> = { 'Т-Банк 2': 'Т-Банк Елена' };

const SUBCATEGORY = { ...RENAMED_SUBCATEGORIES, ...MERGED_SUBCATEGORIES };
const mapped = (map: Record<string, string>, v: string | undefined) => (v && map[v]) || v;

/**
 * Телефон с неотправленной очередью или старым кэшем ещё шлёт прежние названия: подменяем их на сервере,
 * иначе в таблице снова появились бы старые подкатегории и счёт без строки в «Счетах».
 */
export function applyAliases(req: SyncRequest): SyncRequest {
  return {
    ...req,
    operations: req.operations.map((o) => ({
      ...o,
      subcategory: mapped(SUBCATEGORY, o.subcategory),
      accountId: mapped(RENAMED_ACCOUNTS, o.accountId),
      toAccountId: mapped(RENAMED_ACCOUNTS, o.toAccountId),
    })),
    rules: req.rules.map((r) => ({
      ...r,
      subcategory: mapped(SUBCATEGORY, r.subcategory ?? undefined) ?? null,
    })),
    edits: req.edits.map((e) => ({
      ...e,
      fields: {
        ...e.fields,
        ...(e.fields.subcategory ? { subcategory: mapped(SUBCATEGORY, e.fields.subcategory) } : {}),
        ...(e.fields.accountId ? { accountId: mapped(RENAMED_ACCOUNTS, e.fields.accountId) } : {}),
        ...(e.fields.toAccountId ? { toAccountId: mapped(RENAMED_ACCOUNTS, e.fields.toAccountId) } : {}),
      },
    })),
    balanceFacts: req.balanceFacts.map((f) => ({ ...f, accountId: mapped(RENAMED_ACCOUNTS, f.accountId)! })),
  };
}

/** Заменяет значения в колонке листа, только изменившиеся ячейки. Возвращает, сколько заменено. */
function replaceColumn(
  sh: SheetLike | null,
  column: string,
  map: Record<string, string>,
  dry: boolean,
): number {
  if (!sh) return 0;
  const t = new Table(sh);
  if (!t.has(column)) return 0;
  const col = t.col(column);
  let n = 0;
  t.column(column).forEach((v, i) => {
    const to = map[String(v).trim()];
    if (!to) return;
    n++;
    if (!dry) sh.getRange(i + 2, col, 1, 1).setValues([[to]]);
  });
  return n;
}

/**
 * Новые названия подкатегорий и счёта во всех листах с данными. Повторный запуск ничего не меняет.
 * Лист «Счета по месяцам» держит имена счетов в формулах: его пересобирает миграция (вызывает main.ts).
 */
export function renameDictionary(ss: SpreadsheetLike, dry: boolean) {
  const changes: Record<string, number> = {};
  const count = (key: string, n: number) => {
    if (n) changes[key] = n;
  };
  const ref = ss.getSheetByName(SHEETS.reference);
  count('Справочник: переименовано', replaceColumn(ref, 'Подкатегория', RENAMED_SUBCATEGORIES, dry));
  if (ref) {
    const t = new Table(ref);
    const hidden: string[] = [];
    t.column('Подкатегория').forEach((v, i) => {
      if (!(String(v).trim() in MERGED_SUBCATEGORIES)) return;
      const row = t.rows()[i]!;
      if (String(row[HIDDEN_COLUMN] ?? '').trim() === 'да' && !String(row[LIMIT_COLUMN] ?? '').trim()) return;
      hidden.push(String(v).trim());
      if (dry) return;
      ref.getRange(i + 2, t.col(HIDDEN_COLUMN, true), 1, 1).setValues([['да']]);
      if (t.has(LIMIT_COLUMN)) ref.getRange(i + 2, t.col(LIMIT_COLUMN), 1, 1).setValues([['']]);
    });
    count('Справочник: скрыто', hidden.length);
    let regrouped = 0;
    t.rows().forEach((row, i) => {
      const group = REGROUPED_SUBCATEGORIES[String(row['Подкатегория']).trim()];
      if (!group || String(row['Категория по умолчанию']).trim() === group) return;
      regrouped++;
      if (!dry) ref.getRange(i + 2, t.col('Категория по умолчанию'), 1, 1).setValues([[group]]);
    });
    count('Справочник: другая группа', regrouped);
  }
  const form = ss.getSheetByName(SHEETS.form);
  count('Форма: подкатегории', replaceColumn(form, 'Подкатегория', SUBCATEGORY, dry));
  count('Форма: Карта/счёт', replaceColumn(form, 'Карта/счёт', RENAMED_ACCOUNTS, dry));
  count('Форма: Куда перевели', replaceColumn(form, 'Куда перевели', RENAMED_ACCOUNTS, dry));
  count('Правила', replaceColumn(ss.getSheetByName('Правила'), 'Подкатегория', SUBCATEGORY, dry));
  const recurring = ss.getSheetByName(RECURRING_SHEET);
  count('Регулярные: подкатегории', replaceColumn(recurring, 'Подкатегория', SUBCATEGORY, dry));
  count('Регулярные: счета', replaceColumn(recurring, 'Счёт', RENAMED_ACCOUNTS, dry));
  count('Цели', replaceColumn(ss.getSheetByName(GOALS_SHEET), 'Счёт', RENAMED_ACCOUNTS, dry));
  count('Счета', replaceColumn(ss.getSheetByName('Счета'), 'Счёт', RENAMED_ACCOUNTS, dry));
  count(
    'Снимки балансов',
    replaceColumn(ss.getSheetByName('Снимки балансов'), 'Счёт', RENAMED_ACCOUNTS, dry),
  );
  return { dry, changes };
}
