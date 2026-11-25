import { describe, expect, it } from 'vitest';
import {
  groupLimits,
  matchesRule,
  recurringLeft,
  recurringStatus,
  rub,
  unmatchedSuggestions,
  type MonthStats,
  type Operation,
  type RecurringRule,
} from '../src';

const now = new Date(2026, 9, 10, 14);
const rule = (id: string, extra: Partial<RecurringRule> = {}): RecurringRule => ({
  id,
  name: id,
  amount: rub(1_000),
  day: 5,
  match: id.toLowerCase(),
  author: 'Олег',
  ...extra,
});
const op = (rubles: number, day: number, extra: Partial<Operation> = {}): Operation => ({
  id: `${rubles}-${day}-${extra.comment ?? ''}`,
  kind: 'expense',
  amount: rub(rubles),
  occurredAt: new Date(2026, 9, day, 12).toISOString(),
  source: 'form',
  author: 'Олег',
  status: 'synced',
  ...extra,
});

describe('регулярные платежи', () => {
  it('слово в комментарии или магазине и сумма ±20% — оплачено; ё и регистр не мешают', () => {
    expect(matchesRule(rule('Аренда'), op(1_100, 3, { comment: 'АРЕНДА за октябрь' }))).toBe(true);
    expect(matchesRule(rule('МТС'), op(1_000, 3, { merchant: 'MTS' }))).toBe(false);
    expect(matchesRule(rule('Связь', { match: 'связь' }), op(950, 3, { subcategory: 'Связь' }))).toBe(true);
    expect(matchesRule(rule('Аренда'), op(1_500, 3, { comment: 'аренда' }))).toBe(false);
    expect(matchesRule(rule('Ёлка', { match: 'ёлка' }), op(1_000, 3, { comment: 'елка' }))).toBe(true);
  });

  it('статус месяца: ожидаемые по сроку сверху, просроченные помечены, прошлый месяц не считается', () => {
    const st = recurringStatus(
      [rule('Аренда', { day: 1 }), rule('Интернет', { day: 15 }), rule('Связь', { day: 3 })],
      [
        op(1_000, 2, { comment: 'Аренда' }),
        op(1_000, 2, { comment: 'Связь', occurredAt: new Date(2026, 8, 3).toISOString() }),
      ],
      now,
    );
    expect(st.map((s) => [s.rule.id, !!s.paidBy, s.late])).toEqual([
      ['Связь', false, true],
      ['Интернет', false, false],
      ['Аренда', true, false],
    ]);
    expect(recurringLeft(st)).toBe(rub(2_000));
  });

  it('одна операция оплачивает только один платёж; найденное уже заведённое не предлагаем', () => {
    const st = recurringStatus(
      [rule('Кино'), rule('Кино2', { match: 'кино' })],
      [op(1_000, 5, { comment: 'кино' })],
      now,
    );
    expect(st.filter((s) => s.paidBy)).toHaveLength(1);
    const found = [
      { key: 'суши', merchant: 'Суши', amount: 1, dayOfMonth: 8, months: 2, lastAt: '', nextAt: '' },
      { key: 'кино', merchant: 'Кино Плюс', amount: 1, dayOfMonth: 8, months: 2, lastAt: '', nextAt: '' },
    ];
    expect(unmatchedSuggestions(found, [rule('Кино')]).map((f) => f.key)).toEqual(['суши']);
  });
});

describe('лимиты групп', () => {
  it('потрачено по группе за месяц плюс неотправленные траты её подкатегорий', () => {
    const month: MonthStats = {
      month: '2026-10',
      income: 0,
      expense: 0,
      groups: { Крупные: rub(28_000), Обязательные: rub(4_020) },
      subcategories: {},
      incomeCategories: {},
    };
    const groupOf = (s: string) => ({ 'Ремонт машины': 'Крупные', Продукты: 'Повседневные' })[s];
    const l = groupLimits(
      { Крупные: rub(30_000) },
      month,
      [
        op(1_500, 9, { status: 'ready', subcategory: 'Ремонт машины' }),
        op(500, 9, { status: 'ready', subcategory: 'Продукты' }),
      ],
      groupOf,
      now,
    );
    expect(l).toEqual([
      { name: 'Крупные', limit: rub(30_000), spent: rub(29_500), left: rub(500), ratio: 29_500 / 30_000 },
    ]);
  });
});
