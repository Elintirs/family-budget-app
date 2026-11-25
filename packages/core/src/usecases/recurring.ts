import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';
import { monthKey } from '../domain/period';
import { merchantKey } from './categorize';

export interface Recurring {
  key: string;
  merchant: string;
  subcategory?: string;
  /** Средняя сумма за месяц. */
  amount: Kopecks;
  dayOfMonth: number;
  months: number;
  lastAt: string;
  nextAt: string;
}

/**
 * Регулярные платежи: тот же магазин в ≥2 разных месяцах подряд с похожей суммой (±15%).
 * Ищем по операциям, прошедшим через приложение; со временем находок станет больше.
 */
export function detectRecurring(ops: Operation[]): Recurring[] {
  const groups = new Map<string, Operation[]>();
  for (const o of ops) {
    if (o.kind !== 'expense' || o.deleted) continue;
    const k = merchantKey(o.merchant ?? o.comment);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    const byMonth = new Map<string, Operation>();
    for (const o of [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)))
      byMonth.set(monthKey(new Date(o.occurredAt)), o);
    const months = [...byMonth.keys()].sort();
    if (months.length < 2) continue;
    const amounts = [...byMonth.values()].map((o) => o.amount);
    const avg = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    if (amounts.some((a) => Math.abs(a - avg) > avg * 0.15)) continue;
    const consecutive = months.every((m, i) => {
      if (i === 0) return true;
      const [y1, m1] = months[i - 1]!.split('-').map(Number);
      const [y2, m2] = m.split('-').map(Number);
      return (y2! - y1!) * 12 + (m2! - m1!) === 1;
    });
    if (!consecutive) continue;
    const last = byMonth.get(months[months.length - 1]!)!;
    const lastDate = new Date(last.occurredAt);
    const day = Math.round(
      [...byMonth.values()].reduce((s, o) => s + new Date(o.occurredAt).getDate(), 0) / byMonth.size,
    );
    const next = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, Math.min(day, 28));
    out.push({
      key,
      merchant: (last.merchant ?? last.comment ?? key).split(/[.,]/)[0]!.trim(),
      subcategory: last.subcategory,
      amount: avg,
      dayOfMonth: day,
      months: months.length,
      lastAt: last.occurredAt,
      nextAt: next.toISOString(),
    });
  }
  return out.sort((a, b) => a.nextAt.localeCompare(b.nextAt));
}
