import type { RecurringRule } from '../contract';
import type { Kopecks } from '../domain/money';
import { formatRub } from '../domain/money';
import type { Operation } from '../domain/operation';
import { budgetMoment, monthKey } from '../domain/period';

type Schedule = NonNullable<RecurringRule['schedule']>;

const DAY = 24 * 3600 * 1000;
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return at(y!, (m ?? 1) - 1, d ?? 1);
};
/** День недели с понедельника: 0 пн … 6 вс. */
const wd = (d: Date) => (d.getDay() + 6) % 7;
const lastDay = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Расписание правила: у старых правил его нет, тогда раз в месяц day-го числа. */
export function scheduleOf(rule: RecurringRule): Schedule {
  return rule.schedule ?? { every: 'month', interval: 1, days: [rule.day], shift: 'none' };
}

function hits(s: Schedule, d: Date, start: Date): boolean {
  const n = s.interval || 1;
  if (s.every === 'day') return Math.round((d.getTime() - start.getTime()) / DAY) % n === 0;
  if (s.every === 'week') {
    const days = s.weekdays?.length ? s.weekdays : [wd(start)];
    const weeks = Math.floor((Math.round((d.getTime() - start.getTime()) / DAY) + wd(start)) / 7);
    return days.includes(wd(d)) && weeks % n === 0;
  }
  if (s.every === 'year')
    return d.getMonth() === start.getMonth() && d.getDate() === start.getDate() && (d.getFullYear() - start.getFullYear()) % n === 0;
  const months = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
  if (months % n !== 0) return false;
  const days = s.days?.length ? s.days : [start.getDate()];
  const last = lastDay(d);
  // 31-е в коротком месяце и «последний» (32) падают на последний день.
  return days.some((x) => (x >= last ? d.getDate() === last : d.getDate() === x));
}

/** Перенос с выходных: раньше на пятницу, позже на понедельник. */
function shifted(d: Date, shift: Schedule['shift']): Date {
  const w = wd(d);
  if (w < 5 || shift === 'none') return d;
  return new Date(d.getTime() + (shift === 'before' ? -(w - 4) : 7 - w) * DAY);
}

/** Даты срабатываний правила в промежутке [from, to] (полдень, локальное время). */
export function occurrences(rule: RecurringRule, from: Date, to: Date): Date[] {
  if (rule.paused) return [];
  const s = scheduleOf(rule);
  const start = s.start ? parse(s.start) : at(2000, 0, s.every === 'month' ? 1 : 3);
  const end = s.end ? parse(s.end) : undefined;
  const out: Date[] = [];
  // Перенос двигает дату не больше чем на 2 дня: смотрим с запасом.
  const a = at(from.getFullYear(), from.getMonth(), from.getDate() - 3);
  const b = at(to.getFullYear(), to.getMonth(), to.getDate() + 3);
  let made = 0;
  // Счётчик «N раз» считаем от начала правила, а не от from.
  if (s.count) {
    for (let d = new Date(start); d < a; d = new Date(d.getTime() + DAY)) if (hits(s, d, start)) made++;
  }
  for (let d = a; d <= b; d = at(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (d < start || (end && d > end)) continue;
    if (!hits(s, d, start)) continue;
    if (s.count && ++made > s.count) break;
    const real = shifted(d, s.shift);
    if (real >= at(from.getFullYear(), from.getMonth(), from.getDate()) && real <= at(to.getFullYear(), to.getMonth(), to.getDate())) out.push(real);
  }
  return out;
}

const norm = (x?: string) => (x ?? '').toLowerCase().replace(/ё/g, 'е');

/** Слова, по которым узнаём оплату или приход: match и keywords. */
export function ruleWords(rule: RecurringRule): string[] {
  return [rule.match, ...(rule.keywords ?? [])].map((w) => norm(w).trim()).filter((w) => w.length >= 2);
}

/**
 * Похожа ли операция на это правило: тот же вид (расход, доход, перевод на тот же счёт), слово в
 * комментарии, магазине, подкатегории или тексте пуша, сумма в границах (±20% к точной, или от
 * amount до amountMax с тем же запасом).
 */
export function matchesRule(rule: RecurringRule, op: Operation): boolean {
  const kind = rule.kind ?? 'expense';
  if (op.deleted || op.kind !== kind) return false;
  if (kind === 'transfer' && rule.toAccountId && op.toAccountId !== rule.toAccountId) return false;
  // «ЗП» бывает и у Олега, и у Елены: у дохода с указанным «чей» другой не подходит.
  if (kind === 'income' && rule.subcategory && op.incomeCategory && op.incomeCategory !== rule.subcategory)
    return false;
  // Доход на счёт: аванс Елены приходит и на карту, и наличными похожими суммами, счёт их различает.
  if (kind === 'income' && rule.accountId && op.accountId && op.accountId !== rule.accountId) return false;
  const hay = `${norm(op.comment)} ${norm(op.merchant)} ${norm(op.subcategory)} ${norm(op.incomeCategory)} ${norm(op.sourceText)}`;
  const word = ruleWords(rule).some((w) => hay.includes(w));
  // Перевод на кредитку узнаём и без слова: по счёту назначения.
  if (!word && !(kind === 'transfer' && rule.toAccountId)) return false;
  const lo = rule.amount * 0.8;
  const hi = (rule.amountMax ?? rule.amount) * 1.2;
  return op.amount >= lo && op.amount <= hi;
}

export interface Occurrence {
  rule: RecurringRule;
  /** Дата по расписанию (ISO, полдень). */
  dueAt: string;
  /** Операция, которой срабатывание закрыто. */
  paidBy?: Operation;
  /** Пришло или оплачено раньше срока. */
  early?: boolean;
  /** Срок прошёл, а операции не видно. */
  late: boolean;
}

/**
 * Срабатывания правил за период с найденными операциями. Операция ищется рядом со сроком: за 5 дней
 * до и 3 после (зарплата часто приходит раньше, перед выходными), одна операция закрывает одно
 * срабатывание, ближайшее по дате.
 */
export function matchOccurrences(rules: RecurringRule[], ops: Operation[], from: Date, to: Date, now: Date): Occurrence[] {
  const today = budgetMoment(now);
  const used = new Set<string>();
  const out: Occurrence[] = [];
  const all = rules.flatMap((rule) => occurrences(rule, from, to).map((d) => ({ rule, d })));
  all.sort((x, y) => x.d.getTime() - y.d.getTime());
  for (const { rule, d } of all) {
    const near = ops
      .filter((o) => !used.has(o.id) && matchesRule(rule, o))
      .map((o) => ({ o, gap: Date.parse(o.occurredAt) - d.getTime() }))
      // Старое правило без расписания: как раньше, любая операция того же бюджетного месяца.
      .filter((x) =>
        rule.schedule
          ? x.gap >= -5 * DAY && x.gap <= 3 * DAY
          : monthKey(budgetMoment(new Date(x.o.occurredAt))) === monthKey(d),
      )
      .sort((x, y) => Math.abs(x.gap) - Math.abs(y.gap))[0];
    if (near) used.add(near.o.id);
    out.push({
      rule,
      dueAt: d.toISOString(),
      paidBy: near?.o,
      early: near ? near.gap < -DAY / 2 : undefined,
      late: !near && d.getTime() + DAY / 2 < today.getTime(),
    });
  }
  return out;
}

/** Что за событие в графике денег: приход плюсом, расход и перевод минусом. */
export const signOf = (rule: RecurringRule) => ((rule.kind ?? 'expense') === 'income' ? 1 : -1);

export interface PaydayStage {
  /** Дата прихода (ISO), с которой начинается отрезок. */
  date: string;
  items: { rule: RecurringRule; amount: Kopecks; sign: 1 | -1; dueAt: string }[];
  /** На жизнь до следующего прихода и в день (по нижней границе плавающих сумм). */
  left: Kopecks;
  days: number;
}

/**
 * «До зарплаты»: сколько можно в день до ближайшего прихода и график следующих приходов и
 * обязательных платежей. Плавающая зарплата считается по нижней границе, чтобы не обещать лишнего.
 */
export function paydays(
  rules: RecurringRule[],
  ops: Operation[],
  money: Kopecks,
  now: Date,
  horizonDays = 35,
): { untilDate?: string; untilDays: number; perDay: Kopecks; before: Kopecks; stages: PaydayStage[] } {
  const today = budgetMoment(now);
  const t0 = at(today.getFullYear(), today.getMonth(), today.getDate());
  const occ = matchOccurrences(rules, ops, t0, new Date(t0.getTime() + horizonDays * DAY), now).filter((o) => !o.paidBy);
  const incomes = occ.filter((o) => signOf(o.rule) > 0);
  // Обязательное до первого прихода вычитаем из того, что есть.
  const first = incomes[0] ? Date.parse(incomes[0].dueAt) : undefined;
  const before = occ
    .filter((o) => signOf(o.rule) < 0 && (first === undefined || Date.parse(o.dueAt) < first))
    .reduce((s, o) => s + o.rule.amount, 0);
  const untilDays = first ? Math.max(1, Math.round((first - t0.getTime()) / DAY)) : 30;
  const perDay = Math.max(0, Math.floor((money - before) / untilDays));
  // Отрезки: каждый приход и всё до следующего прихода.
  const dates = [...new Set(incomes.map((o) => o.dueAt.slice(0, 10)))];
  const stages: PaydayStage[] = dates.map((date, i) => {
    const from = Date.parse(date);
    const next = dates[i + 1] ? Date.parse(dates[i + 1]!) : undefined;
    const inStage = occ.filter((o) => {
      const t = Date.parse(o.dueAt.slice(0, 10));
      return t >= from && (next === undefined || t < next) && (signOf(o.rule) < 0 || o.dueAt.slice(0, 10) === date);
    });
    const items = inStage.map((o) => ({ rule: o.rule, amount: o.rule.amount, sign: signOf(o.rule) as 1 | -1, dueAt: o.dueAt }));
    const left = items.reduce((s, x) => s + x.sign * x.amount, 0);
    const days = next ? Math.max(1, Math.round((next - from) / DAY)) : 0;
    return { date, items, left, days };
  });
  return { untilDate: incomes[0]?.dueAt, untilDays, perDay, before, stages };
}

const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const UNIT: Record<Schedule['every'], [string, string, string]> = {
  day: ['день', 'дня', 'дней'],
  week: ['неделю', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
  year: ['год', 'года', 'лет'],
};
const plural = (n: number, [one, few, many]: [string, string, string]) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

/** Фраза-итог правила для списка и шапки редактора: «Каждый месяц 10 и 25, в выходной раньше, 20–40 тыс.». */
export function describeRule(rule: RecurringRule): string {
  const s = scheduleOf(rule);
  const n = s.interval || 1;
  const every =
    n === 1
      ? { day: 'Каждый день', week: 'Каждую неделю', month: 'Каждый месяц', year: 'Каждый год' }[s.every]
      : `Каждые ${n} ${plural(n, UNIT[s.every])}`;
  const when =
    s.every === 'week'
      ? (s.weekdays ?? []).map((d) => WD[d]).join(', ')
      : s.every === 'month'
        ? (s.days ?? [rule.day]).map((d) => (d >= 32 ? 'последний день' : String(d))).join(' и ') + (s.days?.some((d) => d >= 32) ? '' : ' числа')
        : '';
  const shift = s.shift === 'before' ? 'в выходной раньше' : s.shift === 'after' ? 'в выходной позже' : '';
  const sum = rule.amountMax ? `${formatRub(rule.amount, { whole: true })}–${formatRub(rule.amountMax, { whole: true })}` : formatRub(rule.amount, { whole: true });
  return [rule.paused ? 'На паузе' : `${every}${when ? ' ' + when : ''}`, shift, sum].filter(Boolean).join(', ');
}

export { ymd as dayISO };
