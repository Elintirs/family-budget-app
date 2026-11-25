import { sheet, Table, type SpreadsheetLike } from '../sheets/table';

/** Колонки «Формы», которые служебные команды могут менять точечно. */
const EDITABLE = ['Сумма', 'Карта/счёт', 'Куда перевели', 'Подкатегория', 'Комментарий'];

/** Точечная правка ячейки «Формы» (строка листа + имя колонки). expectId: защита от правки не той строки. */
export function setFormCell(
  ss: SpreadsheetLike,
  row: number,
  column: string,
  value: string,
  expectId: string | undefined,
  dry: boolean,
) {
  if (!EDITABLE.includes(column)) throw new Error(`Колонку «${column}» так менять нельзя`);
  const sh = sheet(ss, 'Форма');
  const t = new Table(sh);
  const idCol = t.has('ID') ? t.col('ID') : 0;
  const id = idCol ? String(sh.getRange(row, idCol, 1, 1).getValues()[0]?.[0] ?? '') : '';
  if (expectId !== undefined && id !== expectId)
    throw new Error(`В строке ${row} ID «${id}», ожидался «${expectId}»`);
  const cell = sh.getRange(row, t.col(column), 1, 1);
  const before = String(cell.getValues()[0]?.[0] ?? '');
  // Сумма числом, иначе формулы её не сложат.
  const typed = column === 'Сумма' ? Number(value.replace(',', '.')) : value;
  if (column === 'Сумма' && !Number.isFinite(typed)) throw new Error(`«${value}» не число`);
  if (!dry) cell.setValues([[typed]]);
  return { row, column, before, after: value, dry };
}

/** Удаление строки «Формы» (дубль). Только со сверкой ID, чтобы не удалить чужую строку. */
export function deleteFormRow(ss: SpreadsheetLike, row: number, expectId: string, dry: boolean) {
  const sh = sheet(ss, 'Форма');
  const t = new Table(sh);
  const values = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0] ?? [];
  const id = String(values[t.col('ID') - 1] ?? '');
  if (!expectId || id !== expectId) throw new Error(`В строке ${row} ID «${id}», ожидался «${expectId}»`);
  const summary = { row, id, amount: values[t.col('Сумма') - 1], comment: values[t.col('Комментарий') - 1] };
  if (!dry) sh.deleteRow!(row);
  return { ...summary, dry };
}

/**
 * Ответ формы без счёта: ставим счёт по умолчанию (Script Property DEFAULT_ACCOUNT, по умолчанию «Т-Банк»).
 * Форма счёт не спрашивает, а без него покупка не уменьшает остаток счёта и сверка расходится.
 */
export function fillDefaultAccount(sh: GoogleAppsScript.Spreadsheet.Sheet, row: number, account: string) {
  const t = new Table(sh as never);
  const cell = sh.getRange(row, t.col('Карта/счёт'));
  if (String(cell.getValue() ?? '').trim()) return false;
  cell.setValue(account);
  return true;
}

/**
 * Подстраховка триггера формы: пустой «Карта/счёт» у расходов и доходов после даты старта ЭТОГО счёта
 * (его «Дата старта» в «Счетах») получает счёт по умолчанию. Строки до старта не трогаем: они уже
 * учтены в остатке на старт, иначе остаток счёта уменьшится второй раз.
 */
export function fillEmptyAccounts(ss: SpreadsheetLike, account: string, dry = false, notBefore?: Date) {
  const settings = ss.getSheetByName('Счета');
  const start = settings
    ? new Table(settings).rows().find((r) => String(r['Счёт'] ?? '').trim() === account)?.['Дата старта']
    : undefined;
  if (!(start instanceof Date))
    return { filled: [] as number[], dry, reason: `нет даты старта у «${account}»` };
  // Остаток на старт на конец дня; notBefore: строки раньше уже сверены вручную (например, до триггера формы).
  const since = Math.max(start.getTime() + 24 * 3600 * 1000, notBefore?.getTime() ?? 0);
  const sh = sheet(ss, 'Форма');
  const t = new Table(sh);
  const accCol = t.col('Карта/счёт');
  const filled: number[] = [];
  t.rows().forEach((r, i) => {
    const at =
      r['Дата операции (если не сегодня)'] instanceof Date
        ? r['Дата операции (если не сегодня)']
        : r['Отметка времени'];
    const kind = String(r['Это доход или расход?'] ?? '');
    if (!(at instanceof Date) || at.getTime() < since) return;
    if (kind !== 'Расход' && kind !== 'Доход') return;
    if (String(r['Карта/счёт'] ?? '').trim()) return;
    filled.push(i + 2);
  });
  if (!dry) for (const row of filled) sh.getRange(row, accCol, 1, 1).setValues([[account]]);
  return { filled, dry };
}
