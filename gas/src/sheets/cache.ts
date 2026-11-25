import type { RangeLike, SheetLike, SpreadsheetLike } from './table';

/**
 * Таблица с кэшем чтения на один запрос. Каждый лист читается одним getValues целиком, дальше
 * любые диапазоны отдаются из памяти: раньше bootstrap читал «Форму» по разу на каждый счёт.
 * Любая запись сбрасывает кэш всех листов: формулы в «Балансах» и «Лимитах» зависят от «Формы».
 */
export function cachedSpreadsheet(ss: SpreadsheetLike): SpreadsheetLike & { reads(): number } {
  const sheets = new Map<string, CachedSheet | null>();
  const state = { reads: 0, generation: 0 };
  return {
    getSheetByName(name: string) {
      if (!sheets.has(name)) {
        const sh = ss.getSheetByName(name);
        sheets.set(name, sh ? new CachedSheet(sh, state) : null);
      }
      return sheets.get(name) ?? null;
    },
    insertSheet(name: string) {
      if (!ss.insertSheet) throw new Error('Таблица не умеет создавать листы');
      const sh = new CachedSheet(ss.insertSheet(name), state);
      sheets.set(name, sh);
      return sh;
    },
    reads: () => state.reads,
  };
}

class CachedSheet implements SheetLike {
  private data: unknown[][] | null = null;
  private seen = -1;

  constructor(
    private readonly sh: SheetLike,
    private readonly state: { reads: number; generation: number },
  ) {}

  private load(): unknown[][] {
    if (this.data && this.seen === this.state.generation) return this.data;
    const rows = this.sh.getLastRow();
    const cols = this.sh.getLastColumn();
    this.data = rows && cols ? this.sh.getRange(1, 1, rows, cols).getValues() : [];
    this.seen = this.state.generation;
    this.state.reads++;
    return this.data;
  }

  getLastRow(): number {
    return this.load().length;
  }

  getLastColumn(): number {
    return this.load()[0]?.length ?? 0;
  }

  deleteRow(row: number): unknown {
    if (!this.sh.deleteRow) throw new Error('Лист не умеет удалять строки');
    const res = this.sh.deleteRow(row);
    this.state.generation++;
    return res;
  }

  getRange(row: number, column: number, numRows: number, numColumns: number): RangeLike {
    return {
      getValues: () => {
        const data = this.load();
        const out: unknown[][] = [];
        for (let r = 0; r < numRows; r++) {
          const src = data[row - 1 + r];
          const line: unknown[] = [];
          for (let c = 0; c < numColumns; c++) line.push(src?.[column - 1 + c] ?? '');
          out.push(line);
        }
        return out;
      },
      setValues: (values: unknown[][]) => {
        const res = this.sh.getRange(row, column, numRows, numColumns).setValues(values);
        this.state.generation++;
        return res;
      },
    };
  }
}
