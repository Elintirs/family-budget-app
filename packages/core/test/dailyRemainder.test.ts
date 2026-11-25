import { describe, expect, it } from 'vitest';
import { dailyRemainder, rub, type Operation, type Summary } from '../src';

// Цифры из листа «Лимиты на месяц» на 5 октября 2026.
const now = new Date(2026, 9, 5, 12, 45);
const summary: Summary = {
  asOf: new Date(2026, 9, 5, 9, 0).toISOString(),
  monthLimit: rub(80000),
  spentMonthBeforeToday: rub(33506),
  spentToday: 0,
  limitGroups: ['Повседневные'],
};

const expense = (id: string, rubles: number, at: Date, extra: Partial<Operation> = {}): Operation => ({
  id,
  kind: 'expense',
  amount: rub(rubles),
  occurredAt: at.toISOString(),
  subcategory: 'Продукты',
  source: 'notification',
  author: 'Олег',
  status: 'ready',
  ...extra,
});

describe('dailyRemainder', () => {
  it('совпадает с таблицей без неотправленных: 1 722 в день, 46 494 на месяц', () => {
    const r = dailyRemainder(summary, [], now);
    expect(r).toMatchObject({
      dailyLimit: rub(1722),
      remainingToday: rub(1722),
      remainingMonth: rub(46494),
      daysLeft: 27,
    });
  });

  it('макет: 640 ₽ неотправленных сегодня -> можно ещё 1 082, на месяц 45 854', () => {
    const ops = [expense('a', 523, now), expense('b', 117, new Date(2026, 9, 5, 10, 5))];
    const r = dailyRemainder(summary, ops, now);
    expect(r).toMatchObject({
      spentToday: rub(640),
      remainingToday: rub(1082),
      remainingMonth: rub(45854),
      pendingCount: 2,
    });
  });

  it('отправленные, удалённые, переводы и доходы не считаются повторно', () => {
    const ops: Operation[] = [
      expense('s', 100, now, { status: 'synced' }),
      expense('d', 100, now, { deleted: true }),
      { ...expense('t', 5000, now), kind: 'transfer', subcategory: undefined },
      { ...expense('i', 50000, now), kind: 'income', subcategory: undefined },
    ];
    expect(dailyRemainder(summary, ops, now).pendingCount).toBe(0);
  });

  it('вчерашняя неотправленная трата уменьшает лимит на день, а не сегодняшние траты', () => {
    const r = dailyRemainder(summary, [expense('y', 2700, new Date(2026, 9, 4, 20, 0))], now);
    expect(r.spentToday).toBe(0);
    expect(r.dailyLimit).toBe(Math.floor((rub(80000) - rub(33506) - rub(2700)) / 27));
  });

  it('сводка со вчера: её «сегодня» уходит в «до сегодня»', () => {
    const stale = {
      ...summary,
      asOf: new Date(2026, 9, 4, 22, 0).toISOString(),
      spentMonthBeforeToday: rub(30000),
      spentToday: rub(3506),
    };
    expect(dailyRemainder(stale, [], now).dailyLimit).toBe(rub(1722));
  });

  it('сводка прошлого месяца: новый месяц с нуля', () => {
    const old = { ...summary, asOf: new Date(2026, 8, 30, 22, 0).toISOString() };
    const first = new Date(2026, 10, 1, 9, 0);
    expect(dailyRemainder(old, [], first).dailyLimit).toBe(Math.floor(rub(80000) / 30));
  });

  it('«Обязательные» и «Крупные» не уменьшают дневной лимит, неразмеченная уменьшает', () => {
    const groups: Record<string, string> = { Продукты: 'Повседневные', Аренда: 'Обязательные' };
    const ops = [
      expense('rent', 30000, now, { subcategory: 'Аренда' }),
      expense('food', 500, now),
      expense('unknown', 100, now, { subcategory: undefined, status: 'new' }),
    ];
    const r = dailyRemainder(summary, ops, now, (s) => groups[s]);
    expect(r.spentToday).toBe(rub(600));
    expect(r.pendingCount).toBe(2);
  });

  it('ночная покупка в 01:30 относится к вчерашнему дню', () => {
    const night = expense('night', 900, new Date(2026, 9, 5, 1, 30));
    const r = dailyRemainder(summary, [night], now);
    expect(r.spentToday).toBe(0);
    expect(r.dailyLimit).toBe(Math.floor((rub(80000) - rub(33506) - rub(900)) / 27));
  });

  it('в 02:00 «сегодня» ещё вчерашний день: до конца месяца 28 дней', () => {
    const at2 = new Date(2026, 9, 5, 2, 0);
    const r = dailyRemainder({ ...summary, asOf: at2.toISOString() }, [], at2);
    expect(r.daysLeft).toBe(28);
  });
});
