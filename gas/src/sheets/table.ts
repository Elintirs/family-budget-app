/** Минимум от листа Google, чтобы логику можно было тестировать на подделке. */
export interface SheetLike {
  getLastRow(): number;
  getLastColumn(): number;
  getRange(row: number, column: number, numRows: number, numColumns: number): RangeLike;
  /** Удаление строки целиком (есть у настоящего листа и у подделки в тестах). */
  deleteRow?(row: number): unknown;
}

export interface RangeLike {
  getValues(): unknown[][];
  setValues(values: unknown[][]): unknown;
}

export interface SpreadsheetLike {
  getSheetByName(name: string): SheetLike | null;
  /** Новый лист (есть у настоящей таблицы и у подделки в тестах). */
  insertSheet?(name: string): SheetLike;
}

export function sheet(ss: SpreadsheetLike, name: string): SheetLike {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Нет листа «${name}»`);
  return sh;
}

/**
 * Лист как таблица с заголовками: колонки ищутся по имени, а не по номеру,
 * поэтому вставка колонки в таблице ничего не ломает.
 */
export class Table {
  private headers: string[];

  constructor(
    private readonly sh: SheetLike,
    private readonly headerRow = 1,
  ) {
    const width = Math.max(sh.getLastColumn(), 1);
    this.headers = (sh.getRange(headerRow, 1, 1, width).getValues()[0] ?? []).map((h) => String(h).trim());
  }

  has(name: string): boolean {
    return this.headers.includes(name);
  }

  /** Номер колонки (с 1). Если колонки нет и create, дописывает её справа. */
  col(name: string, create = false): number {
    const i = this.headers.indexOf(name);
    if (i >= 0) return i + 1;
    if (!create) throw new Error(`Нет колонки «${name}»`);
    const at = this.headers.length + 1;
    this.sh.getRange(this.headerRow, at, 1, 1).setValues([[name]]);
    this.headers.push(name);
    return at;
  }

  ensure(names: string[]): void {
    for (const n of names) this.col(n, true);
  }

  rows(): Record<string, unknown>[] {
    const last = this.sh.getLastRow();
    if (last <= this.headerRow) return [];
    const values = this.sh
      .getRange(this.headerRow + 1, 1, last - this.headerRow, this.headers.length)
      .getValues();
    return values.map((v) => Object.fromEntries(this.headers.map((h, i) => [h, v[i]])));
  }

  /** Значения одной колонки (без заголовка). */
  column(name: string): unknown[] {
    const last = this.sh.getLastRow();
    if (last <= this.headerRow || !this.has(name)) return [];
    return this.sh
      .getRange(this.headerRow + 1, this.col(name), last - this.headerRow, 1)
      .getValues()
      .map((r) => r[0]);
  }

  /** Дописывает строки по именам колонок; неизвестные колонки создаются справа. */
  append(records: Record<string, unknown>[]): void {
    if (!records.length) return;
    for (const r of records) for (const k of Object.keys(r)) this.col(k, true);
    const start = this.sh.getLastRow() + 1;
    const values = records.map((r) => this.headers.map((h) => (h in r ? r[h] : '')));
    this.sh.getRange(start, 1, values.length, this.headers.length).setValues(values);
  }

  /**
   * Перезаписывает поля строки, найденной по ключевой колонке, по именам колонок: вставленная руками
   * колонка или другой порядок не сдвигают данные (раньше «Регулярные» и «Цели» писались по номерам).
   * Колонки, которых нет в record, не трогаются. Нет строки: false.
   */
  updateRow(keyColumn: string, key: string, record: Record<string, unknown>): boolean {
    const keys = this.column(keyColumn);
    const i = keys.findIndex((k) => String(k).trim() === key);
    if (i < 0) return false;
    for (const k of Object.keys(record)) this.col(k, true);
    const row = this.headerRow + 1 + i;
    const range = this.sh.getRange(row, 1, 1, this.headers.length);
    const current = range.getValues()[0] ?? [];
    range.setValues([this.headers.map((h, j) => (h in record ? record[h] : (current[j] ?? '')))]);
    return true;
  }

  /** Ставит значение в колонке строки, найденной по другой колонке. */
  update(keyColumn: string, key: string, column: string, value: unknown): boolean {
    const keys = this.column(keyColumn);
    const i = keys.findIndex((k) => String(k) === key);
    if (i < 0) return false;
    this.sh.getRange(this.headerRow + 1 + i, this.col(column, true), 1, 1).setValues([[value]]);
    return true;
  }
}
