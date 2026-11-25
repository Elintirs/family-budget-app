import { describe, expect, it } from 'vitest';
import { detectRecurring, rub, type Operation } from '../src';

let n = 0;
const op = (merchant: string, rubles: number, y: number, m: number, d: number): Operation => ({
  id: `r${++n}`,
  kind: 'expense',
  amount: rub(rubles),
  occurredAt: new Date(y, m, d, 12).toISOString(),
  merchant,
  subcategory: 'Подписки',
  source: 'notification',
  author: 'Олег',
  status: 'synced',
});

describe('detectRecurring', () => {
  it('подписка два месяца подряд с той же суммой', () => {
    const r = detectRecurring([
      op('KINOPOISK', 299, 2026, 7, 18),
      op('KINOPOISK', 299, 2026, 8, 18),
      op('Pyaterochka', 523, 2026, 8, 3),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ merchant: 'KINOPOISK', amount: rub(299), dayOfMonth: 18, months: 2 });
    expect(new Date(r[0]!.nextAt).getMonth()).toBe(9);
  });

  it('разные суммы или пропуск месяца: не регулярный', () => {
    expect(detectRecurring([op('Магазин', 300, 2026, 7, 1), op('Магазин', 900, 2026, 8, 1)])).toEqual([]);
    expect(detectRecurring([op('Связь', 650, 2026, 6, 12), op('Связь', 650, 2026, 8, 12)])).toEqual([]);
  });
});
