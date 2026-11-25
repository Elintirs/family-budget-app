import { describe, expect, it } from 'vitest';
import { describeRule, matchesRule, matchOccurrences, occurrences, paydays, rub, type Operation, type RecurringRule } from '../src';

const base: RecurringRule = { id: 'r', name: 'Зарплата Олега', amount: rub(20000), day: 10, match: 'зп', author: 'Олег' };
const d = (s: string) => new Date(`${s}T12:00:00`);
const days = (xs: Date[]) => xs.map((x) => `${x.getMonth() + 1}-${x.getDate()}`);

describe('occurrences: гибкое расписание', () => {
  it('старое правило: раз в месяц day-го числа, 31 в коротком месяце на последний день', () => {
    expect(days(occurrences(base, d('2026-11-01'), d('2026-12-31')))).toEqual(['11-10', '12-10']);
    expect(days(occurrences({ ...base, day: 31 }, d('2026-11-01'), d('2026-11-30')))).toEqual(['11-30']);
  });
  it('10 и 25 числа, в выходной раньше: 25.10.2026 воскресенье -> пятница 23', () => {
    const r: RecurringRule = { ...base, schedule: { every: 'month', interval: 1, days: [10, 25], shift: 'before' } };
    expect(days(occurrences(r, d('2026-10-01'), d('2026-11-30')))).toEqual(['10-9', '10-23', '11-10', '11-25']);
  });
  it('каждую неделю по субботам, раз в две недели, «последний день»', () => {
    const sat: RecurringRule = { ...base, schedule: { every: 'week', interval: 1, weekdays: [5], shift: 'none' } };
    expect(days(occurrences(sat, d('2026-11-01'), d('2026-11-30')))).toEqual(['11-7', '11-14', '11-21', '11-28']);
    const two: RecurringRule = { ...base, schedule: { every: 'week', interval: 2, weekdays: [5], shift: 'none', start: '2026-11-07' } };
    expect(days(occurrences(two, d('2026-11-01'), d('2026-11-30')))).toEqual(['11-7', '11-21']);
    const last: RecurringRule = { ...base, schedule: { every: 'month', interval: 1, days: [32], shift: 'none' } };
    expect(days(occurrences(last, d('2026-11-01'), d('2026-12-31')))).toEqual(['11-30', '12-31']);
  });
  it('N раз и пауза', () => {
    const r: RecurringRule = { ...base, schedule: { every: 'month', interval: 1, days: [10], shift: 'none', start: '2026-10-01', count: 2 } };
    expect(days(occurrences(r, d('2026-10-01'), d('2027-01-31')))).toEqual(['10-10', '11-10']);
    expect(occurrences({ ...base, paused: true }, d('2026-11-01'), d('2026-11-30'))).toEqual([]);
  });
});

describe('доходы: узнаём по словам и границам суммы', () => {
  const income: RecurringRule = {
    ...base,
    kind: 'income',
    amountMax: rub(40000),
    keywords: ['зарплата'],
    schedule: { every: 'month', interval: 1, days: [10, 25], shift: 'before' },
  };
  const op = (id: string, at: string, amount: number, comment: string): Operation => ({
    id, kind: 'income', amount: rub(amount), occurredAt: d(at).toISOString(), comment, source: 'manual', author: 'Олег', status: 'synced',
  });
  it('пришло раньше срока, вне границ и без слова не считается', () => {
    const occ = matchOccurrences(
      [income],
      [op('a', '2026-10-09', 24999, 'Зарплата'), op('b', '2026-10-24', 25000, 'ЗП 25 число'), op('c', '2026-10-24', 90000, 'ЗП'), op('x', '2026-10-15', 25000, 'подарок')],
      d('2026-10-01'), d('2026-10-31'), d('2026-11-05'),
    );
    expect(occ.map((o) => o.paidBy?.id)).toEqual(['a', 'b']);
  });
  it('«До зарплаты»: в день до ближайшего прихода, обязательное до него вычитается', () => {
    const rent: RecurringRule = { ...base, id: 'rent', name: 'Аренда маме', amount: rub(25000), match: 'аренда', kind: 'expense', schedule: { every: 'month', interval: 1, days: [8], shift: 'none' } };
    const p = paydays([income, rent], [], rub(30000), d('2026-11-05'));
    expect(p.untilDays).toBe(5);
    expect(p.before).toBe(rub(25000));
    expect(p.perDay).toBe(rub(1000));
    expect(p.stages[0]!.date).toBe('2026-11-10');
  });
  it('фраза-итог', () => {
    expect(describeRule(income).replace(/\u00a0/g, ' ')).toBe('Каждый месяц 10 и 25 числа, в выходной раньше, 20 000 ₽–40 000 ₽');
  });
  it('доход с «чей» не засчитывает чужую зарплату с тем же словом', () => {
    const rule: RecurringRule = { ...base, id: 'zp', name: 'Зарплата Олега', amount: rub(20000), amountMax: rub(40000), match: 'зп', kind: 'income', subcategory: 'Олег', schedule: { every: 'month', interval: 1, days: [10], shift: 'before' } };
    const inc = (incomeCategory: string): Operation => ({ id: incomeCategory, kind: 'income', amount: rub(30000), occurredAt: '2026-11-09T10:00:00', comment: 'ЗП', incomeCategory, source: 'manual', author: 'Олег', status: 'synced' });
    expect(matchesRule(rule, inc('Олег'))).toBe(true);
    expect(matchesRule(rule, inc('Елена'))).toBe(false);
  });
  it('доход со счётом: наличные не закрывают выплату на карту', () => {
    const card: RecurringRule = { ...base, id: 'card', name: 'Зарплата Елены, карта', amount: rub(15500), match: 'зп', keywords: ['зп', 'аванс'], kind: 'income', subcategory: 'Елена', accountId: 'Сбер Елены' };
    const op = (accountId?: string): Operation => ({ id: 'x', kind: 'income', amount: rub(15000), occurredAt: '2026-10-26T10:00:00', comment: 'Аванс', incomeCategory: 'Елена', accountId, source: 'manual', author: 'Елена', status: 'synced' });
    expect(matchesRule(card, op('Наличные'))).toBe(false);
    expect(matchesRule(card, op('Сбер Елены'))).toBe(true);
    expect(matchesRule(card, op(undefined))).toBe(true);
  });
});
