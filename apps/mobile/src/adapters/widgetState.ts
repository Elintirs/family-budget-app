import {
  budgetMoment,
  dailyRemainder,
  dayKey,
  formatRub,
  type Bootstrap,
  type Operation,
  netWorth,
} from '@budget/core';
import { listener } from './notifications';
import { clock } from './index';

/**
 * Состояние виджета и экрана блокировки из сводки и операций телефона. Одно и для открытого приложения,
 * и для фона: раньше виджет пересчитывался только в приложении, и без его открытия цифры стояли сутками.
 */
export function pushWidgetState(boot: Bootstrap, ops: Operation[]) {
  if (!listener) return;
  const groups = new Map(boot.subcategories.map((s) => [s.name, s.group]));
  const r = dailyRemainder(boot.summary, ops, clock.now(), (name) => groups.get(name));
  const { money, debt } = netWorth(boot.accounts, boot.balances);
  const pending = ops.filter((o) => o.status !== 'synced' && !o.deleted).length;
  listener.setWidgetState(
    JSON.stringify({
      day: dayKey(budgetMoment(new Date())),
      remainingToday: r.remainingToday,
      spentToday: r.spentToday,
      dailyLimit: r.dailyLimit,
      remainingMonth: r.remainingMonth,
      daysLeft: r.daysLeft,
      pending,
      money: formatRub(money, { whole: true }),
      debt: debt ? formatRub(debt, { whole: true }) : '',
    }),
  );
}
