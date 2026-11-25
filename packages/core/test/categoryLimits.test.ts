import { describe, expect, it } from 'vitest';
import { categoryLimits, limitWarnings, rub, type MonthStats, type Operation } from '../src';

const now = new Date(2026, 9, 10, 14);
const month: MonthStats = {
  month: '2026-10',
  income: 0,
  expense: rub(20_000),
  groups: {},
  subcategories: { Продукты: rub(11_925), 'Доставка еды': rub(2_751), 'Товары для дома': rub(8_810) },
  incomeCategories: {},
};
const subs = [
  { id: 'Продукты', name: 'Продукты', group: 'Повседневные', monthLimit: rub(15_000) },
  { id: 'Доставка еды', name: 'Доставка еды', group: 'Повседневные', monthLimit: rub(8_000) },
  { id: 'Товары для дома', name: 'Товары для дома', group: 'Повседневные', monthLimit: rub(5_000) },
  { id: 'Аптека', name: 'Аптека', group: 'Повседневные' },
];
const pending = (rubles: number, sub: string, extra: Partial<Operation> = {}): Operation => ({
  id: `${sub}${rubles}`,
  kind: 'expense',
  amount: rub(rubles),
  occurredAt: new Date(2026, 9, 10, 12).toISOString(),
  subcategory: sub,
  source: 'manual',
  author: 'Олег',
  status: 'ready',
  ...extra,
});

describe('categoryLimits', () => {
  it('потрачено по таблице плюс неотправленное, сверху самые «горящие», без лимита не показываем', () => {
    const l = categoryLimits(
      subs,
      month,
      [pending(500, 'Продукты'), pending(100, 'Продукты', { status: 'synced' })],
      now,
    );
    expect(l.map((x) => x.name)).toEqual(['Товары для дома', 'Продукты', 'Доставка еды']);
    expect(l[1]).toMatchObject({ spent: rub(12_425), left: rub(2_575) });
    expect(l[0]!.left).toBe(rub(-3_810));
  });

  it('аналитика прошлого месяца не считается; предупреждения от 80%', () => {
    const l = categoryLimits(subs, { ...month, month: '2026-09' }, [], now);
    expect(l.every((x) => x.spent === 0)).toBe(true);
    const warn = limitWarnings(categoryLimits(subs, month, [], now));
    expect(warn.map((x) => x.name)).toEqual(['Товары для дома']);
  });
});
