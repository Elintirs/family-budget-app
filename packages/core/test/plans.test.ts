import { describe, expect, it } from 'vitest';
import {
  debtForecast,
  goalPace,
  monthSummary,
  payoffWith,
  previousMonth,
  rub,
  spendByAuthor,
  type Operation,
} from '../src';

describe('долги', () => {
  it('темп по последним месяцам и месяц, когда долг закончится', () => {
    const f = debtForecast([
      { month: '2026-08', debt: rub(685_000) },
      { month: '2026-09', debt: rub(646_000) },
      { month: '2026-10', debt: rub(621_000) },
    ]);
    expect(f.paydown).toBe(rub(32_000));
    expect(f.payoffMonth).toBe('2028-06');
  });
  it('долг растёт или один месяц: без прогноза; «если гасить 45 000»', () => {
    expect(debtForecast([{ month: '2026-10', debt: rub(1) }])).toEqual({ paydown: 0 });
    expect(
      debtForecast([
        { month: '2026-09', debt: rub(100) },
        { month: '2026-10', debt: rub(200) },
      ]),
    ).toEqual({ paydown: 0 });
    expect(payoffWith(rub(621_000), rub(45_000), '2026-10')).toBe('2027-12');
  });
});

describe('цели', () => {
  const goal = {
    id: 'g',
    name: 'Отпуск',
    target: rub(120_000),
    deadline: '2027-06',
    author: 'Н',
    saved: rub(25_000),
  };
  it('сколько откладывать в месяц до срока, округлено до рубля', () => {
    expect(goalPace(goal, new Date(2026, 9, 10))).toEqual({
      left: rub(95_000),
      monthsLeft: 9,
      perMonth: rub(10_556),
      done: false,
    });
    expect(goalPace({ ...goal, saved: rub(130_000) }, new Date(2026, 9, 10)).done).toBe(true);
  });
});

describe('кто сколько потратил и итоги месяца', () => {
  const op = (author: string, rubles: number, sub: string, extra: Partial<Operation> = {}): Operation => ({
    id: `${author}${rubles}${sub}`,
    kind: 'expense',
    amount: rub(rubles),
    occurredAt: new Date(2026, 9, 5, 12).toISOString(),
    subcategory: sub,
    source: 'manual',
    author,
    status: 'synced',
    ...extra,
  });
  it('доли по авторам, строки формы отдельно, переводы и прошлый месяц мимо', () => {
    const r = spendByAuthor(
      [
        op('Олег', 500, 'Продукты'),
        op('Олег', 300, 'Транспорт'),
        op('Елена', 600, 'Вкусняшки'),
        op('форма', 100, 'Продукты'),
        op('Елена', 999, 'x', { kind: 'transfer' }),
        op('Елена', 999, 'y', { occurredAt: new Date(2026, 8, 5).toISOString() }),
      ],
      new Date(2026, 9, 10),
    );
    expect(r.authors).toEqual([
      { author: 'Олег', amount: rub(800), top: ['Продукты', 'Транспорт'] },
      { author: 'Елена', amount: rub(600), top: ['Вкусняшки'] },
    ]);
    expect(r.unknown).toBe(rub(100));
  });
  it('итоги: повседневные против лимита, вышли за лимит, топ', () => {
    const s = monthSummary(
      {
        month: '2026-09',
        income: rub(236_000),
        expense: rub(120_000),
        groups: { Повседневные: rub(98_400), Обязательные: rub(21_600) },
        subcategories: {
          Продукты: rub(43_824),
          'Доставка еды': rub(17_587),
          Транспорт: rub(13_450),
          Аренда: rub(1),
        },
        incomeCategories: {},
      },
      rub(80_000),
      [
        { id: 'p', name: 'Продукты', group: 'Повседневные', monthLimit: rub(40_000) },
        { id: 't', name: 'Транспорт', group: 'Повседневные', monthLimit: rub(20_000) },
      ],
    );
    expect(s.everyday).toBe(rub(98_400));
    expect(s.over).toEqual([{ name: 'Продукты', spent: rub(43_824), limit: rub(40_000) }]);
    expect(s.top.map((t) => t.name)).toEqual(['Продукты', 'Доставка еды', 'Транспорт']);
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('темп месяца и график долга', () => {
  it('темп: тратим быстрее календаря', async () => {
    const { monthPace, rub } = await import('../src');
    const p = monthPace({ monthLimit: rub(54000), spentMonthBeforeToday: rub(8701), spentToday: 0 }, new Date(2026, 10, 4, 12));
    expect(Math.round(p.spentShare * 100)).toBe(16);
    expect(Math.round(p.monthShare * 100)).toBe(13);
    expect(p.forecast).toBe(Math.round((rub(8701) / 4) * 30));
    expect(p.ahead).toBe(true);
  });
  it('долг Сбера при 60 тыс. в месяц под 25,4% закрывается за 10 месяцев, проценты учтены', async () => {
    const { debtSchedule, rub } = await import('../src');
    const s = debtSchedule(rub(496221), 25.4, rub(60000), '2026-11');
    expect(s.payoffMonth).toBe('2027-08');
    expect(s.interest).toBeGreaterThan(rub(50000));
  });
  it('страховка 2,3% в месяц и маленький платёж: не закроется', async () => {
    const { debtSchedule, rub } = await import('../src');
    expect(debtSchedule(rub(500000), 25.4, rub(20000), '2026-11', 2.3).payoffMonth).toBeUndefined();
  });
});
