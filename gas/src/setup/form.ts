import type { SpreadsheetLike } from '../sheets/table';
import { DAY_START_HOUR } from './migrate';

type Ss = GoogleAppsScript.Spreadsheet.Spreadsheet;

const DATE_COL = 'Дата операции (если не сегодня)';

/** Ключ сортировки как у «Обработанных данных»: «Дата операции», иначе отметка времени со сдвигом на 05:00. */
function sortKey(row: unknown[], iA: number, iI: number): number {
  const i = row[iI];
  if (i instanceof Date) return i.getTime();
  const a = row[iA];
  return a instanceof Date ? a.getTime() - DAY_START_HOUR * 3600 * 1000 : Number.MAX_SAFE_INTEGER;
}

/** Сортирует строки «Формы» по дате операции. Возвращает, сколько строк поменяли место. */
export function sortForm(ss: SpreadsheetLike, dry: boolean): { rows: number; moved: number } {
  const sh = ss.getSheetByName('Форма')!;
  const last = sh.getLastRow();
  if (last < 3) return { rows: Math.max(0, last - 1), moved: 0 };
  const width = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, width).getValues()[0]!.map(String);
  const iA = 0;
  const iI = head.indexOf(DATE_COL);
  const range = sh.getRange(2, 1, last - 1, width);
  const values = range.getValues();
  const sorted = values
    .map((row, idx) => ({ row, idx, key: sortKey(row, iA, iI) }))
    .sort((x, y) => x.key - y.key || x.idx - y.idx);
  const moved = sorted.filter((x, i) => x.idx !== i).length;
  if (moved && !dry) {
    // Пишем только кусок, где строки сдвинулись: ручные правки в остальных строках не затираются.
    const first = sorted.findIndex((x, i) => x.idx !== i);
    let end = sorted.length - 1;
    while (sorted[end]!.idx === end) end--;
    sh.getRange(2 + first, 1, end - first + 1, width).setValues(sorted.slice(first, end + 1).map((x) => x.row));
  }
  return { rows: values.length, moved };
}

/** Ставит «Дату операции» строкам с отметкой времени в [from, to), где она пустая. Для разового переноса ночи. */
export function setOperationDate(ss: Ss, from: Date, to: Date, date: Date, dry: boolean) {
  const sh = ss.getSheetByName('Форма')!;
  const width = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, width).getValues()[0]!.map(String);
  const iI = head.indexOf(DATE_COL);
  if (iI < 0) throw new Error(`Нет колонки «${DATE_COL}»`);
  const values = sh.getRange(1, 1, sh.getLastRow(), width).getDisplayValues();
  const raw = sh.getRange(1, 1, sh.getLastRow(), width).getValues();
  const hits: { row: number; at: string; amount: string; subcategory: string; comment: string }[] = [];
  raw.forEach((r, i) => {
    const a = r[0];
    if (i === 0 || !(a instanceof Date) || a < from || a >= to || r[iI] instanceof Date) return;
    hits.push({
      row: i + 1,
      at: values[i]![0]!,
      amount: values[i]![head.indexOf('Сумма')]!,
      subcategory: values[i]![head.indexOf('Подкатегория')]!,
      comment: values[i]![head.indexOf('Комментарий')]!,
    });
    if (!dry)
      sh.getRange(i + 1, iI + 1)
        .setValue(date)
        .setNumberFormat('dd.mm.yyyy');
  });
  return hits;
}
