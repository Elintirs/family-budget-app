import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';

/** Как операция меняет остаток счёта: расход и перевод с него минус, доход и перевод на него плюс. */
export function accountEffect(op: Operation, accountId: string): Kopecks {
  if (op.deleted) return 0;
  if (op.kind === 'transfer') {
    if (op.toAccountId === accountId && op.accountId !== accountId) return op.amount;
    if (op.accountId === accountId && op.toAccountId !== accountId) return -op.amount;
    return 0;
  }
  if (op.accountId !== accountId) return 0;
  return op.kind === 'income' ? op.amount : -op.amount;
}

/** Снимок из ленты сверки: остаток в банке и расчёт таблицы на тот же момент. */
export interface SnapshotPoint {
  at: string;
  fact: Kopecks;
  computedAt: Kopecks;
}

/** Внесённое руками позже снимка ищем в этом окне после него. */
export const LATE_ENTRY_MS = 30 * 60 * 1000;
/** Насколько сумма операции может не совпасть с разницей: мелкие расхождения рядом (4 275 против 4 272). */
const TOLERANCE: Kopecks = 100_00;

/**
 * Разница между двумя снимками, которую объясняет одна операция, внесённая руками сразу после
 * более нового снимка. Журнал 12.10: перевод 32 499 ₽ пришёл до снимка 18:46, а внесён в 18:48, и
 * сверка показала «лишние 32 502». Деньги на месте, неверно только время операции.
 *
 * points: новые сверху, как в ленте. Ответ: время снимка -> операция, которую стоит поставить раньше.
 */
export function enteredAfterSnapshot(
  points: SnapshotPoint[],
  ops: Operation[],
  accountId: string,
  windowMs = LATE_ENTRY_MS,
): Map<string, Operation> {
  const found = new Map<string, Operation>();
  const used = new Set<string>();
  for (const [i, pt] of points.entries()) {
    const older = points[i + 1];
    if (!older) continue;
    const gap = pt.fact - pt.computedAt - (older.fact - older.computedAt);
    if (Math.abs(gap) < 100) continue;
    const at = Date.parse(pt.at);
    const best = ops
      .filter((o) => {
        if (o.source === 'notification' || used.has(o.id)) return false;
        const t = Date.parse(o.occurredAt);
        if (t <= at || t - at > windowMs) return false;
        const effect = accountEffect(o, accountId);
        return effect !== 0 && Math.abs(effect - gap) <= TOLERANCE;
      })
      .sort(
        (a, b) => Math.abs(accountEffect(a, accountId) - gap) - Math.abs(accountEffect(b, accountId) - gap),
      )[0];
    if (best) {
      found.set(pt.at, best);
      used.add(best.id);
    }
  }
  return found;
}
