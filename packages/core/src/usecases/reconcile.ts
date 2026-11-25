import type { Account } from '../domain/account';
import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';
import { accountEffect } from './lateEntry';

/** Служебный счёт «Поправки» (тип «Служебный» в «Счетах»), если он заведён. */
export function adjustmentAccount(accounts: Account[]): Account | undefined {
  return accounts.find((a) => a.adjustment || a.type === 'adjustment');
}

/** Поправка по сверке: перевод на «Поправки» или с них. В расходы, доходы и лимиты не попадает. */
export function isAdjustment(op: Operation, accounts: Account[]): boolean {
  const adj = adjustmentAccount(accounts);
  return !!adj && op.kind === 'transfer' && (op.accountId === adj.id || op.toAccountId === adj.id);
}

/**
 * Поправка под банк: gap = в банке минус по таблице. В банке больше: перевод с «Поправок» на счёт,
 * меньше: со счёта на «Поправки». Готова к отправке, категория не нужна.
 */
export function adjustmentOperation(p: {
  id: string;
  accountId: string;
  adjustmentId: string;
  gap: Kopecks;
  at: string;
  author: string;
  comment: string;
}): Operation {
  const up = p.gap > 0;
  return {
    id: p.id,
    kind: 'transfer',
    amount: Math.abs(p.gap),
    occurredAt: p.at,
    accountId: up ? p.adjustmentId : p.accountId,
    toAccountId: up ? p.accountId : p.adjustmentId,
    comment: p.comment,
    source: 'manual',
    author: p.author,
    status: 'ready',
  };
}

/** Перевод в обратную сторону меняет остаток на две суммы: 49 334 от 29.10 дал на ВТБ +98 668. */
const REVERSED_TOLERANCE = 100;

export interface GapHints {
  /** Неразобранные во «Входящих» по этому счёту: в таблицу ещё не ушли. */
  inbox: Operation[];
  /** Сумма неразобранных со знаком, как они сдвинут остаток. */
  inboxEffect: Kopecks;
  /** Перевод, который в обратную сторону закрыл бы разницу. */
  reversed?: Operation;
}

/** Что могло дать разницу gap (банк минус расчёт с неотправленными): подсказки для экрана сверки. */
export function explainGap(ops: Operation[], accountId: string, gap: Kopecks): GapHints {
  const inbox = ops.filter((o) => o.status === 'new' && !o.deleted && o.accountId === accountId);
  const reversed = ops.find(
    (o) =>
      o.kind === 'transfer' &&
      !o.deleted &&
      o.toAccountId &&
      accountEffect(o, accountId) !== 0 &&
      Math.abs(-2 * accountEffect(o, accountId) - gap) <= REVERSED_TOLERANCE,
  );
  return {
    inbox,
    inboxEffect: inbox.reduce((s, o) => s + accountEffect(o, accountId), 0),
    ...(reversed ? { reversed } : {}),
  };
}

/**
 * Сколько неотправленные операции телефона двигают счёт к моменту at. Без них покупка, ждущая категорию,
 * выглядит как расхождение с банком: банк её уже списал, а таблица ещё нет.
 */
export function unsentEffect(ops: Operation[], accountId: string, at?: string): number {
  const until = at ? Date.parse(at) : Infinity;
  return ops
    .filter((o) => o.status !== 'synced' && !o.deleted && Date.parse(o.occurredAt) <= until)
    .reduce((s, o) => s + accountEffect(o, accountId), 0);
}
