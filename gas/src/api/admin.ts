/**
 * Служебные действия для разработки и обслуживания таблицы. Доступны только с ADMIN_TOKEN.
 * Работают с таблицей из параметра table (test | prod), по умолчанию test.
 */

/** Что есть в таблице: листы, заголовки, формулы первых строк. Только чтение. */
export function schema(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, rows = 3) {
  return ss.getSheets().map((sh) => {
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const n = Math.min(Math.max(sh.getLastRow(), 1), rows + 1);
    const range = sh.getRange(1, 1, n, lastCol);
    return {
      name: sh.getName(),
      rows: sh.getLastRow(),
      cols: sh.getLastColumn(),
      values: range.getDisplayValues(),
      formulas: range.getFormulas(),
      namedRanges: sh.getNamedRanges?.().map((r) => r.getName()) ?? [],
      formLinked: Boolean(sh.getFormUrl?.()),
    };
  });
}

/** Строки «Формы» за период (для проверки переноса дат). Только чтение. */
export function formRows(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, from: string, to: string) {
  const sh = ss.getSheetByName('Форма')!;
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const display = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
  const head = values[0]!.map(String);
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return values
    .map((r, i) => ({ row: i + 1, r, d: display[i]! }))
    .filter(({ r, row }) => row > 1 && r[0] instanceof Date && r[0].getTime() >= a && r[0].getTime() < b)
    .map(({ row, d }) => ({ row, ...Object.fromEntries(head.map((h, j) => [h, d[j]])) }));
}

/** Новая точка старта счёта в «Счетах»: остаток (или долг для кредитки) на конец дня date. */
export function setAccountStart(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  name: string,
  start: { balance?: number; debt?: number; date: Date },
  dry: boolean,
) {
  const sh = ss.getSheetByName('Счета');
  if (!sh) throw new Error('Нет листа «Счета»: сначала миграция');
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const head = values[0]!.map(String);
  const row = values.findIndex((r, i) => i > 0 && String(r[0]).trim() === name);
  if (row < 0) throw new Error(`Нет счёта «${name}» в «Счетах»`);
  const col = (h: string) => head.indexOf(h) + 1;
  const before = Object.fromEntries(head.map((h, i) => [h, values[row]![i]]));
  if (!dry) {
    if (start.balance !== undefined) sh.getRange(row + 1, col('Остаток на старт')).setValue(start.balance);
    if (start.debt !== undefined) sh.getRange(row + 1, col('Долг на старт')).setValue(start.debt);
    sh.getRange(row + 1, col('Дата старта')).setValue(start.date);
  }
  return {
    name,
    before: { start: before['Остаток на старт'], debt: before['Долг на старт'], date: before['Дата старта'] },
    after: start,
  };
}

/**
 * Новый счёт: строка в «Счетах» (тип, остаток на старт, дата старта, банк, маски и слова из уведомления).
 * «Балансы» подхватывают его сами, «Счета по месяцам» пересоберёт следующая миграция.
 */
export function addAccount(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  a: {
    name: string;
    type: string;
    balance: number;
    date: Date;
    bank?: string;
    tags?: string;
    comment?: string;
  },
  dry: boolean,
) {
  const sh = ss.getSheetByName('Счета');
  if (!sh) throw new Error('Нет листа «Счета»: сначала миграция');
  if (!a.name.trim()) throw new Error('Нужно имя счёта');
  if (Number.isNaN(a.date.getTime())) throw new Error('Нужна дата старта');
  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), sh.getLastColumn()).getValues();
  const head = values[0]!.map(String);
  if (values.some((r, i) => i > 0 && String(r[0]).trim() === a.name.trim()))
    return { name: a.name, added: false, reason: 'уже есть' };
  const record: Record<string, unknown> = {
    Счёт: a.name.trim(),
    Тип: a.type,
    'Остаток на старт': a.balance,
    'Дата старта': a.date,
    Банк: a.bank ?? '',
    'Маски карт': a.tags ?? '',
    Комментарий: a.comment ?? '',
  };
  const row = head.map((h) => record[h] ?? '');
  if (!dry) sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  return { name: a.name, added: !dry, row: Object.fromEntries(head.map((h, i) => [h, row[i]])) };
}
