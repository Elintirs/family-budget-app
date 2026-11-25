import { budgetMoment, monthKey } from '../domain/period';
import type { Operation, OperationKind } from '../domain/operation';
import type { Kopecks } from '../domain/money';

/** Фильтр «Истории»: вид или автор, подкатегория, месяц, строка поиска. Пустое поле: без условия. */
export interface HistoryFilter {
  kind?: OperationKind;
  author?: string;
  subcategory?: string;
  /** Любая из подкатегорий: группа лимита («Обязательные»). */
  subcategories?: readonly string[];
  /** 'YYYY-MM' бюджетного месяца (сутки начинаются в 4 утра, как везде). */
  month?: string;
  query?: string;
  /** id счёта → название: поиск по «сбер», «наличные». */
  accountNames?: Map<string, string>;
}

export interface HistoryTotals {
  count: number;
  expense: Kopecks;
  income: Kopecks;
}

const opMonth = (o: Operation) => monthKey(budgetMoment(new Date(o.occurredAt)));

/** Операции под фильтр и их итог: «на транспорт в октябре ушло 6 200 ₽ за 14 поездок». */
export function filterHistory(
  ops: readonly Operation[],
  f: HistoryFilter,
): { list: Operation[]; totals: HistoryTotals } {
  const needle = f.query?.trim().toLowerCase() ?? '';
  // «523» и «523,50» находят 523,50 ₽: сумму ищем и с копейками, и без.
  const list = ops.filter((o) => {
    if (o.deleted) return false;
    if (f.kind && o.kind !== f.kind) return false;
    if (f.author && o.author !== f.author) return false;
    if (f.subcategory && o.subcategory !== f.subcategory) return false;
    if (f.subcategories && !f.subcategories.includes(o.subcategory ?? '')) return false;
    if (f.month && opMonth(o) !== f.month) return false;
    if (!needle) return true;
    const rub = o.amount / 100;
    return [
      o.merchant,
      o.comment,
      o.sourceText,
      o.subcategory,
      o.incomeCategory,
      String(rub),
      rub.toFixed(2).replace('.', ','),
      o.accountId ? f.accountNames?.get(o.accountId) : undefined,
      o.toAccountId ? f.accountNames?.get(o.toAccountId) : undefined,
    ].some((x) => x?.toLowerCase().includes(needle));
  });
  const totals = list.reduce<HistoryTotals>(
    (t, o) => ({
      count: t.count + 1,
      expense: t.expense + (o.kind === 'expense' ? o.amount : 0),
      income: t.income + (o.kind === 'income' ? o.amount : 0),
    }),
    { count: 0, expense: 0, income: 0 },
  );
  return { list, totals };
}

/** Бюджетные месяцы, в которых есть операции, от свежего к старому: чипы периода. */
export function historyMonths(ops: readonly Operation[]): string[] {
  return [...new Set(ops.filter((o) => !o.deleted).map(opMonth))].sort().reverse();
}
