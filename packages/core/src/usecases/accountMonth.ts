import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';

export interface AccountMonth {
  /** Остаток на начало месяца: текущий расчёт минус всё движение с начала месяца. */
  start: Kopecks;
  income: Kopecks;
  expense: Kopecks;
  /** Переводы в сумме: пришло на счёт минус ушло со счёта. */
  transfers: Kopecks;
}

/**
 * Движение по счёту с начала месяца по строкам таблицы (отправленным операциям), как в «Октябрь по
 * счёту» в макете. computed: расчётный остаток таблицы сейчас.
 */
export function accountMonth(
  ops: Operation[],
  accountId: string,
  computed: Kopecks,
  now: Date,
): AccountMonth {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let income = 0;
  let expense = 0;
  let transfers = 0;
  for (const o of ops) {
    if (o.status !== 'synced' || o.deleted || Date.parse(o.occurredAt) < from) continue;
    if (o.kind === 'income' && o.accountId === accountId) income += o.amount;
    if (o.kind === 'expense' && o.accountId === accountId) expense += o.amount;
    if (o.kind === 'transfer' && o.toAccountId === accountId) transfers += o.amount;
    if (o.kind === 'transfer' && o.accountId === accountId) transfers -= o.amount;
  }
  return { start: computed - income + expense - transfers, income, expense, transfers };
}
