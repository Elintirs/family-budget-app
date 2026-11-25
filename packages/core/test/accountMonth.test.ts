import { describe, expect, it } from 'vitest';
import { accountMonth, rub, type Operation } from '../src';

const op = (
  kind: Operation['kind'],
  rubles: number,
  day: number,
  extra: Partial<Operation> = {},
): Operation => ({
  id: `${kind}${rubles}${day}`,
  kind,
  amount: rub(rubles),
  occurredAt: new Date(2026, 9, day, 12).toISOString(),
  accountId: 'Т-Банк',
  source: 'form',
  author: 'Олег',
  status: 'synced',
  ...extra,
});

describe('accountMonth', () => {
  it('начало месяца = сейчас минус движение; переводы в обе стороны; чужие счета и прошлый месяц мимо', () => {
    const m = accountMonth(
      [
        op('income', 50_000, 3),
        op('expense', 3_446, 5),
        op('transfer', 5_000, 4, { toAccountId: 'Сбер' }),
        op('transfer', 1_000, 6, { accountId: 'Сбер', toAccountId: 'Т-Банк' }),
        op('expense', 999, 5, { accountId: 'Сбер' }),
        op('expense', 700, 28, { occurredAt: new Date(2026, 8, 28).toISOString() }),
        op('expense', 100, 7, { status: 'ready' }),
      ],
      'Т-Банк',
      rub(116_554),
      new Date(2026, 9, 10),
    );
    expect(m).toEqual({
      income: rub(50_000),
      expense: rub(3_446),
      transfers: rub(-4_000),
      start: rub(74_000),
    });
  });
});
