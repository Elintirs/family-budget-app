import type { RecurringRule } from '../contract';
import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';
import { budgetMoment } from '../domain/period';
import { matchesRule, matchOccurrences } from './schedule';
import type { Recurring } from './recurring';

export interface RecurringStatus {
  rule: RecurringRule;
  /** Дата списания в этом месяце (число месяца, не позже последнего дня). */
  dueAt: string;
  /** Операция этого месяца, которой платёж оплачен. */
  paidBy?: Operation;
  /** Срок прошёл, а оплаты не видно. */
  late: boolean;
}

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/ё/g, 'е');

export { matchesRule };

/**
 * Срабатывания регулярных в текущем бюджетном месяце: оплаченные или пришедшие (нашлась похожая
 * операция рядом со сроком) и ожидаемые, сверху ближайшие по сроку, закрытые в конце. Правило с
 * несколькими датами в месяце (зарплата 10 и 25, игра раз в неделю) даёт по строке на дату.
 */
export function recurringStatus(rules: RecurringRule[], ops: Operation[], now: Date): RecurringStatus[] {
  const bnow = budgetMoment(now);
  const from = new Date(bnow.getFullYear(), bnow.getMonth(), 1, 12);
  const to = new Date(bnow.getFullYear(), bnow.getMonth() + 1, 0, 12);
  const out = matchOccurrences(rules, ops, from, to, now).map((o) => ({
    rule: o.rule,
    dueAt: o.dueAt,
    paidBy: o.paidBy,
    late: o.late,
  }));
  return out.sort((a, b) => Number(!!a.paidBy) - Number(!!b.paidBy) || a.dueAt.localeCompare(b.dueAt));
}

/** Сколько ещё спишется регулярными в этом месяце (приходы не считаются). */
export function recurringLeft(status: RecurringStatus[]): Kopecks {
  return status
    .filter((s) => !s.paidBy && (s.rule.kind ?? 'expense') !== 'income')
    .reduce((sum, s) => sum + s.rule.amount, 0);
}

/** Найденные по истории платежи, которых ещё нет среди заведённых (их предлагаем добавить). */
export function unmatchedSuggestions(found: Recurring[], rules: RecurringRule[]): Recurring[] {
  return found.filter(
    (f) => !rules.some((r) => norm(f.merchant).includes(norm(r.match)) || norm(r.name) === norm(f.merchant)),
  );
}
