import type { Goal, MonthStats, Subcategory } from '../contract';
import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';
import { budgetMoment, monthKey } from '../domain/period';

const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y!, m! - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthsBetween = (from: string, to: string) => {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2! - y1!) * 12 + (m2! - m1!);
};

export interface DebtForecast {
  /** Сколько в среднем гасится в месяц (по последним месяцам), 0 если долг не уменьшается. */
  paydown: Kopecks;
  /** Месяц, когда долг закончится при таком темпе («2028-06»), если гасится. */
  payoffMonth?: string;
}

/**
 * Прогноз долга по суммарному долгу на конец месяцев (старые слева): средний темп за последние
 * два изменения, при нём сколько месяцев до нуля.
 */
export function debtForecast(points: { month: string; debt: Kopecks }[]): DebtForecast {
  const last = points.slice(-3);
  if (last.length < 2) return { paydown: 0 };
  const deltas = last.slice(1).map((p, i) => last[i]!.debt - p.debt);
  const paydown = Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length);
  const now = last[last.length - 1]!;
  if (paydown <= 0 || now.debt <= 0) return { paydown: Math.max(0, paydown) };
  return { paydown, payoffMonth: addMonths(now.month, Math.ceil(now.debt / paydown)) };
}

/** Через сколько месяцев закроется долг, если гасить amount в месяц. */
export function payoffWith(debt: Kopecks, perMonth: Kopecks, fromMonth: string): string | undefined {
  return perMonth > 0 && debt > 0 ? addMonths(fromMonth, Math.ceil(debt / perMonth)) : undefined;
}

export interface GoalPace {
  left: Kopecks;
  /** Сколько откладывать в месяц, чтобы успеть к сроку (включая текущий месяц). */
  perMonth?: Kopecks;
  monthsLeft?: number;
  done: boolean;
}

export function goalPace(goal: Goal, now: Date): GoalPace {
  const left = Math.max(0, goal.target - goal.saved);
  if (!left) return { left, done: true };
  if (!goal.deadline) return { left, done: false };
  const monthsLeft = Math.max(1, monthsBetween(monthKey(now), goal.deadline) + 1);
  return { left, monthsLeft, perMonth: Math.ceil(left / monthsLeft / 100) * 100, done: false };
}

export interface AuthorSpend {
  author: string;
  amount: Kopecks;
  /** Подкатегории по убыванию. */
  top: string[];
}

/**
 * Кто сколько потратил за месяц (расходы, кроме переводов). Строки формы без автора в доли не входят:
 * отдельно суммой «без автора».
 */
export function spendByAuthor(ops: Operation[], now: Date): { authors: AuthorSpend[]; unknown: Kopecks } {
  const key = monthKey(budgetMoment(now));
  const by = new Map<string, { amount: number; subs: Map<string, number> }>();
  let unknown = 0;
  for (const o of ops) {
    if (o.kind !== 'expense' || o.deleted) continue;
    if (monthKey(budgetMoment(new Date(o.occurredAt))) !== key) continue;
    if (!o.author || o.author === 'форма') {
      unknown += o.amount;
      continue;
    }
    const a = by.get(o.author) ?? { amount: 0, subs: new Map() };
    a.amount += o.amount;
    if (o.subcategory) a.subs.set(o.subcategory, (a.subs.get(o.subcategory) ?? 0) + o.amount);
    by.set(o.author, a);
  }
  const authors = [...by.entries()]
    .map(([author, a]) => ({
      author,
      amount: a.amount,
      top: [...a.subs.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 2)
        .map(([n]) => n),
    }))
    .sort((x, y) => y.amount - x.amount);
  return { authors, unknown };
}

export interface MonthSummary {
  month: string;
  /** Повседневные (что идёт в лимит на день). */
  everyday: Kopecks;
  limit: Kopecks;
  income: Kopecks;
  expense: Kopecks;
  /** Подкатегории, вышедшие за свой лимит: потрачено и лимит. */
  over: { name: string; spent: Kopecks; limit: Kopecks }[];
  top: { name: string; spent: Kopecks }[];
}

/** Итоги прошедшего месяца по аналитике таблицы и текущим лимитам. */
export function monthSummary(
  stats: MonthStats,
  monthLimit: Kopecks,
  subs: Subcategory[],
  limitGroups: string[] = ['Повседневные'],
): MonthSummary {
  const everyday = limitGroups.reduce((s, g) => s + (stats.groups[g] ?? 0), 0);
  const over = subs
    .filter((s) => (s.monthLimit ?? 0) > 0 && (stats.subcategories[s.name] ?? 0) > s.monthLimit!)
    .map((s) => ({ name: s.name, spent: stats.subcategories[s.name]!, limit: s.monthLimit! }));
  const top = Object.entries(stats.subcategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, spent]) => ({ name, spent }));
  return {
    month: stats.month,
    everyday,
    limit: monthLimit,
    income: stats.income,
    expense: stats.expense,
    over,
    top,
  };
}

/** Прошлый месяц для «2026-10»: «2026-09». */
export const previousMonth = (key: string) => addMonths(key, -1);

/**
 * Темп месяца для Главной: доля лимита против доли прошедших дней и прогноз к концу месяца при
 * таком темпе. Показываем, только когда тратим быстрее календаря.
 */
export function monthPace(
  summary: { monthLimit: Kopecks; spentMonthBeforeToday: Kopecks; spentToday: Kopecks },
  now: Date,
): { spent: Kopecks; spentShare: number; monthShare: number; forecast: Kopecks; ahead: boolean } {
  const b = budgetMoment(now);
  const days = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
  const day = b.getDate();
  const spent = summary.spentMonthBeforeToday + summary.spentToday;
  const spentShare = summary.monthLimit > 0 ? spent / summary.monthLimit : 0;
  const monthShare = day / days;
  const forecast = Math.round((spent / Math.max(1, day)) * days);
  return { spent, spentShare, monthShare, forecast, ahead: spentShare > monthShare * 1.1 && forecast > summary.monthLimit };
}

/**
 * Долг по месяцам при платеже perMonth: каждый месяц начисляются проценты по ставке ratePct годовых
 * (и страховка insurancePct от долга, если списывается), потом вносится платёж. До нуля или 10 лет.
 */
export function debtSchedule(
  debt: Kopecks,
  ratePct: number,
  perMonth: Kopecks,
  fromMonth: string,
  insurancePct = 0,
): { months: { month: string; debt: Kopecks }[]; payoffMonth?: string; interest: Kopecks } {
  const months: { month: string; debt: Kopecks }[] = [];
  let left = debt;
  let interest = 0;
  for (let i = 0; i < 120 && left > 0; i++) {
    const add = Math.round((left * ratePct) / 100 / 12 + (left * insurancePct) / 100);
    interest += add;
    left = Math.max(0, left + add - perMonth);
    months.push({ month: addMonths(fromMonth, i), debt: left });
    // Платёж не покрывает проценты: долг не закроется.
    if (add >= perMonth) return { months, interest };
  }
  return { months, payoffMonth: left <= 0 ? months[months.length - 1]?.month : undefined, interest };
}
