import { splitAccountTags } from '@budget/core';
import type {
  Account,
  AccountBalance,
  Analytics,
  Kopecks,
  MonthStats,
  Rule,
  Subcategory,
  Summary,
} from '@budget/core';
import { sheet, Table, type SheetLike, type SpreadsheetLike } from './table';

export const SHEETS = {
  form: 'Форма',
  reference: 'Справочник',
  limits: 'Лимиты на месяц',
  balances: 'Балансы',
} as const;

/** Все деньги в таблице в рублях; в API в копейках. */
export function kop(v: unknown): Kopecks {
  if (typeof v === 'number') return Math.round(v * 100);
  const n = Number(
    String(v)
      .replace(/₽|р\.?/g, '')
      .replace(/[\s\u00A0]/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export const LIMIT_COLUMN = 'Лимит в месяц';
/** Отметка «да» в этой колонке «Справочника»: подкатегория скрыта из выбора в приложении. */
export const HIDDEN_COLUMN = 'Скрыта';
/** «да»: траты подкатегории по умолчанию единовременные. */
export const ONE_OFF_COLUMN = 'Единовременная';

/** «Справочник»: Подкатегория | Категория по умолчанию. ID пока равен имени, стабильные ID добавит миграция. */
export function readSubcategories(ss: SpreadsheetLike): Subcategory[] {
  const t = new Table(sheet(ss, SHEETS.reference));
  return t
    .rows()
    .filter((r) => text(r['Подкатегория']))
    .map((r) => ({
      id: text(r['ID']) || text(r['Подкатегория']),
      name: text(r['Подкатегория']),
      group: text(r['Категория по умолчанию']) || 'Повседневные',
      // Лимит подкатегории на месяц: колонка появляется при первой записи из приложения.
      ...(text(r[LIMIT_COLUMN]) ? { monthLimit: kop(r[LIMIT_COLUMN]) } : {}),
      ...(text(r[HIDDEN_COLUMN]) ? { hidden: true } : {}),
      ...(text(r[ONE_OFF_COLUMN]) ? { oneOff: true } : {}),
    }));
}

export function readIncomeCategories(ss: SpreadsheetLike): string[] {
  const t = new Table(sheet(ss, SHEETS.form));
  const seen = new Set<string>();
  for (const v of t.column('Категория дохода')) if (text(v)) seen.add(text(v));
  return [...seen];
}

/** Ищет строку по подписи в колонке A (и, если нужно, по примечанию в C). */
function labelled(sh: SheetLike, label: string, note?: string): unknown {
  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 3).getValues();
  const row = values.find((r) => text(r[0]) === label && (!note || text(r[2]).startsWith(note)));
  if (!row) throw new Error(`На листе «Лимиты на месяц» нет строки «${label}»${note ? ` (${note})` : ''}`);
  return row[1];
}

/** Сырые цифры «Лимитов на месяц»: остаток на день из них посчитает ядро. */
export function readSummary(ss: SpreadsheetLike, now: Date): Summary {
  const sh = sheet(ss, SHEETS.limits);
  const monthLimit = kop(labelled(sh, 'Выставляем лимит'));
  const before = kop(labelled(sh, 'Итого потрачено за месяц', 'не включая'));
  const total = kop(labelled(sh, 'Итого потрачено за месяц', 'включая'));
  return {
    asOf: now.toISOString(),
    monthLimit,
    spentMonthBeforeToday: before,
    spentToday: Math.max(0, total - before),
    limitGroups: ['Повседневные'],
  };
}

const TYPE: Record<string, Account['type']> = {
  дебет: 'debit',
  кредит: 'credit',
  кредитка: 'credit',
  наличные: 'cash',
  'нам должны': 'receivable',
  займ: 'receivable',
  служебный: 'adjustment',
};

function accountType(name: string, rawType: string): Account['type'] {
  const n = name.toLowerCase();
  if (n.includes('должны')) return 'receivable';
  if (n === 'наличные') return 'cash';
  return TYPE[rawType] ?? 'debit';
}

/**
 * Счета и остатки. Новая схема: настройки в «Счета», расчёт и сверка в «Балансах» (заголовок «Счёт» в A).
 * Старая схема (до миграции): всё в «Балансах», колонки «Расчётный остаток», «Факт (из банка)».
 */
export function readAccounts(ss: SpreadsheetLike): { accounts: Account[]; balances: AccountBalance[] } {
  const sh = sheet(ss, SHEETS.balances);
  const firstCol = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  const headerRow = firstCol.findIndex((r) => text(r[0]) === 'Счёт') + 1;
  if (!headerRow) throw new Error('На листе «Балансы» нет заголовка «Счёт»');
  const view = new Table(sh, headerRow);
  const settings = ss.getSheetByName('Счета');
  const conf = new Map((settings ? new Table(settings).rows() : []).map((r) => [text(r['Счёт']), r]));
  const isNew = view.has('Сейчас (расчёт)');
  const accounts: Account[] = [];
  const balances: AccountBalance[] = [];
  for (const r of view.rows()) {
    const name = text(r['Счёт']);
    if (!name) break;
    const c = conf.get(name) ?? r;
    const sheetType = accountType(name, text(r['Тип']).toLowerCase());
    // «Поправки» уходят скрытой кредиткой с отметкой adjustment: старое приложение не знает типа adjustment.
    const fix = sheetType === 'adjustment';
    const type = fix ? 'credit' : sheetType;
    const limitRaw = c['Кредитный лимит'];
    const limit = text(limitRaw) ? kop(limitRaw) : undefined;
    // Маски карт и слова из уведомления («счет RUB») живут в одной колонке.
    const { cardMasks, markers, owners } = splitAccountTags(text(c['Маски карт']));
    accounts.push({
      id: name,
      name,
      type,
      cardMasks,
      ...(markers.length ? { markers } : {}),
      ...(Object.keys(owners).length ? { cardOwners: owners } : {}),
      ...(limit !== undefined ? { creditLimit: limit } : {}),
      // «Поправки» не выбираются руками: их пишет только сверка.
      ...(fix ? { hidden: true, adjustment: true } : {}),
    });
    const computed = kop(isNew ? r['Сейчас (расчёт)'] : r['Расчётный остаток']);
    const factRaw = isNew ? r['В банке'] : r['Факт (из банка)'];
    const factAt = r['Снимок от'];
    const available = text(r['Доступно (банк)']);
    balances.push({
      accountId: name,
      computed,
      ...(text(factRaw) ? { fact: kop(factRaw) } : {}),
      ...(factAt instanceof Date ? { factAt: factAt.toISOString() } : {}),
      ...(isNew && factAt instanceof Date
        ? { computedAtFact: computed - movementAfter(ss, name, factAt) }
        : {}),
      ...(type === 'credit' && !fix
        ? isNew
          ? { debt: Math.max(0, -computed) }
          : limit !== undefined && available
            ? { debt: limit - kop(r['Доступно (банк)']) }
            : {}
        : {}),
    });
  }
  return { accounts, balances };
}

/**
 * Движение по счёту в «Форме» после момента at (приход плюс, уход минус).
 * Время операции: «Отметка времени»; строка с «Датой операции» раньше дня снимка считается до снимка.
 */
export function movementAfter(ss: SpreadsheetLike, account: string, at: Date): number {
  const sh = ss.getSheetByName(SHEETS.form);
  if (!sh) return 0;
  const day = new Date(at.getTime() - 5 * 3600 * 1000);
  day.setHours(0, 0, 0, 0);
  let sum = 0;
  for (const r of new Table(sh).rows()) {
    const ts = r['Отметка времени'];
    if (!(ts instanceof Date) || ts.getTime() <= at.getTime()) continue;
    const opDate = r['Дата операции (если не сегодня)'];
    if (opDate instanceof Date && opDate.getTime() < day.getTime()) continue;
    const amount = kop(r['Сумма']);
    const kind = text(r['Это доход или расход?']);
    const from = text(r['Карта/счёт']);
    const to = text(r['Куда перевели']);
    if (kind === 'Доход' && from === account) sum += amount;
    if (kind === 'Расход' && from === account) sum -= amount;
    if (kind === 'Перевод' && to === account) sum += amount;
    if (kind === 'Перевод' && from === account) sum -= amount;
  }
  return sum;
}

/** «Правила»: Шаблон мерчанта | Подкатегория | Автор | Создано. Пустая подкатегория: «спрашивать». */
export function readRules(ss: SpreadsheetLike): Rule[] {
  const sh = ss.getSheetByName('Правила');
  if (!sh) return [];
  return new Table(sh)
    .rows()
    .filter((r) => text(r['Шаблон мерчанта']))
    .map((r) => ({
      pattern: text(r['Шаблон мерчанта']),
      subcategory: text(r['Подкатегория']) || null,
      author: text(r['Автор']),
    }));
}

/** Подкатегории по числу расходов за последние дни, по убыванию: для порядка подсказок в приложении. */
export function readPopular(ss: SpreadsheetLike, now: Date, days = 90): { name: string; count: number }[] {
  const sh = ss.getSheetByName('Обработанные данные');
  if (!sh) return [];
  const since = now.getTime() - days * 24 * 3600 * 1000;
  const counts = new Map<string, number>();
  for (const r of new Table(sh).rows()) {
    const at = r['Отметка времени'];
    if (!(at instanceof Date) || at.getTime() < since) continue;
    if (text(r['Это доход или расход?']) !== 'Расход') continue;
    const sub = text(r['Подкатегория']);
    if (sub) counts.set(sub, (counts.get(sub) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

/** Аналитика по месяцам из «Обработанных данных»: дата уже со сдвигом дня на 05:00 и категорией. */
export function readAnalytics(ss: SpreadsheetLike): Analytics {
  const sh = ss.getSheetByName('Обработанные данные');
  if (!sh) return { months: [] };
  const byMonth = new Map<string, MonthStats>();
  for (const r of new Table(sh).rows()) {
    const at = r['Отметка времени'];
    if (!(at instanceof Date)) continue;
    const month = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
    const m = byMonth.get(month) ?? {
      month,
      income: 0,
      expense: 0,
      groups: {},
      subcategories: {},
      incomeCategories: {},
    };
    const amount = kop(r['Сумма']);
    const type = text(r['Это доход или расход?']);
    if (type === 'Доход') {
      m.income += amount;
      const c = text(r['Категория дохода']) || 'Без категории';
      m.incomeCategories[c] = (m.incomeCategories[c] ?? 0) + amount;
    } else if (type === 'Расход') {
      m.expense += amount;
      const g = text(r['Категория']) || 'Повседневные';
      const sub = text(r['Подкатегория']) || 'Без подкатегории';
      m.groups[g] = (m.groups[g] ?? 0) + amount;
      m.subcategories[sub] = (m.subcategories[sub] ?? 0) + amount;
    }
    byMonth.set(month, m);
  }
  addOneOff(ss, byMonth);
  return { months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)) };
}

/**
 * Единовременные расходы по месяцам: отметка строки «Формы» («да» / «нет»), иначе отметка подкатегории
 * в «Справочнике». Месяц как в «Обработанных данных»: «Дата операции», иначе отметка времени с днём от 05:00.
 */
function addOneOff(ss: SpreadsheetLike, byMonth: Map<string, MonthStats>): void {
  const form = ss.getSheetByName(SHEETS.form);
  if (!form) return;
  const bySub = new Set(
    readSubcategories(ss)
      .filter((s) => s.oneOff)
      .map((s) => s.name),
  );
  for (const r of new Table(form).rows()) {
    if (text(r['Это доход или расход?']) !== 'Расход' || text(r['Удалено'])) continue;
    const sub = text(r['Подкатегория']);
    const mark = text(r['Единовременный']);
    if (!(mark ? mark === 'да' : bySub.has(sub))) continue;
    const day = r['Дата операции (если не сегодня)'];
    const at = r['Отметка времени'];
    const d =
      day instanceof Date ? day : at instanceof Date ? new Date(at.getTime() - 5 * 3600 * 1000) : undefined;
    if (!d) continue;
    const m = byMonth.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    if (!m) continue;
    const amount = kop(r['Сумма']);
    m.oneOff = (m.oneOff ?? 0) + amount;
    const key = sub || 'Без подкатегории';
    m.oneOffSubcategories = { ...m.oneOffSubcategories, [key]: (m.oneOffSubcategories?.[key] ?? 0) + amount };
  }
}
