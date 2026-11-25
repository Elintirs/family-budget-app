import type { Account } from '../domain/account';
import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';
import type { AccountBalance } from '../contract';
import { accountEffect } from './lateEntry';

export interface Overdraft {
  accountId: string;
  /** Остаток сейчас: таблица плюс неотправленные с телефона. */
  now: Kopecks;
  /** Остаток после операции или правки. */
  after: Kopecks;
}

/**
 * Обычный счёт (карта, наличные) не уходит в минус: если операция или правка уводит его ниже нуля,
 * это почти всегда не тот счёт или перевод в обратную сторону (49 334 от 29.10: ВТБ и Т-Банк 2
 * перепутаны местами, ВТБ +98 668, Т-Банк 2 −98 645). Кредитки и «Нам должны» не проверяем.
 *
 * before: операция до правки (её движение уже в остатке таблицы или в неотправленных), для новой нет.
 * Срабатывает, только если правка делает счёт хуже: уже ушедший в минус счёт не мешает его чинить.
 */
export function findOverdraft(
  accounts: Account[],
  balances: AccountBalance[],
  pending: Operation[],
  before: Operation | undefined,
  after: Operation,
): Overdraft | null {
  const ids = new Set(
    [before, after]
      .flatMap((o) => (o ? [o.accountId, o.toAccountId] : []))
      .filter((id): id is string => !!id),
  );
  for (const id of ids) {
    const acc = accounts.find((a) => a.id === id);
    if (!acc || (acc.type !== 'debit' && acc.type !== 'cash')) continue;
    const delta = accountEffect(after, id) - (before ? accountEffect(before, id) : 0);
    if (delta >= 0) continue;
    const cur =
      (balances.find((b) => b.accountId === id)?.computed ?? 0) +
      pending.filter((o) => o.status !== 'synced').reduce((s, o) => s + accountEffect(o, id), 0);
    if (cur + delta < 0) return { accountId: id, now: cur, after: cur + delta };
  }
  return null;
}

/**
 * Сколько на карте или наличных сейчас: таблица плюс неотправленные с телефона. Для формы «Добавить»:
 * «Доступно 1 200 ₽» под суммой и «было → станет» у счёта. Кредитки и «Нам должны»: undefined,
 * у них минус обычное дело.
 */
export function availableOn(
  accounts: Account[],
  balances: AccountBalance[],
  pending: Operation[],
  accountId: string | undefined,
): Kopecks | undefined {
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc || (acc.type !== 'debit' && acc.type !== 'cash')) return undefined;
  return (
    (balances.find((b) => b.accountId === acc.id)?.computed ?? 0) +
    pending.filter((o) => o.status !== 'synced').reduce((s, o) => s + accountEffect(o, acc.id), 0)
  );
}
