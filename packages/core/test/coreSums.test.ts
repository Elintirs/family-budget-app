import { describe, expect, it } from 'vitest';
import { monthSpent, netWorth, rub, type Operation } from '../src';

describe('netWorth: одно правило для Главной и виджета', () => {
  it('скрытые счета не считаются, кредитки дают долг, «нам должны» отдельно', () => {
    const r = netWorth(
      [
        { id: 'Т-Банк', type: 'debit' },
        { id: 'Наличные', type: 'cash' },
        { id: 'Поправки', type: 'credit', hidden: true },
        { id: 'Сбер кредитка', type: 'credit' },
        { id: 'Нам должны', type: 'receivable' },
      ],
      [
        { accountId: 'Т-Банк', computed: rub(9171) },
        { accountId: 'Наличные', computed: rub(20000) },
        { accountId: 'Поправки', computed: rub(24220), debt: rub(5) },
        { accountId: 'Сбер кредитка', computed: rub(-496221), debt: rub(496221) },
        { accountId: 'Нам должны', computed: rub(60000) },
      ],
    );
    expect(r).toEqual({ money: rub(29171), debt: rub(496221), owed: rub(60000) });
  });
});

describe('monthSpent: потрачено за бюджетный месяц', () => {
  const now = new Date(2026, 10, 5, 12);
  const op = (sub: string, at: Date, status: Operation['status'] = 'ready'): Operation => ({
    id: sub + at.toISOString(), kind: 'expense', amount: rub(100), occurredAt: at.toISOString(),
    subcategory: sub, source: 'manual', author: 'Олег', status,
  });
  it('таблица плюс неотправленные этого месяца, прошлый месяц и отправленные не добавляются', () => {
    const month = { month: '2026-11', income: 0, expense: 0, groups: { Повседневные: rub(1000) }, subcategories: { Продукты: rub(1000) }, incomeCategories: {} };
    const s = monthSpent(
      month,
      [op('Продукты', new Date(2026, 10, 4)), op('Продукты', new Date(2026, 9, 30)), op('Продукты', new Date(2026, 10, 4), 'synced')],
      () => 'Повседневные',
      now,
    );
    expect(s.subcategories.get('Продукты')).toBe(rub(1100));
    expect(s.groups.get('Повседневные')).toBe(rub(1100));
  });
  it('аналитика за другой месяц не берётся', () => {
    const old = { month: '2026-10', income: 0, expense: 0, groups: {}, subcategories: { Продукты: rub(5000) }, incomeCategories: {} };
    expect(monthSpent(old, [], () => undefined, now).subcategories.get('Продукты')).toBeUndefined();
  });
});
