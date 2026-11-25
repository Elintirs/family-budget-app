import { describe, expect, it } from 'vitest';
import { accountEffect, enteredAfterSnapshot, rub, type Operation } from '../src';

const op = (id: string, p: Partial<Operation>): Operation => ({
  id,
  kind: 'expense',
  amount: 0,
  occurredAt: '',
  source: 'manual',
  author: 'Олег',
  status: 'synced',
  ...p,
});

describe('внесено после снимка', () => {
  // Журнал 12.10: снимок 18:46 местного (16:46Z) 88 275 ₽, перевод ВТБ -> Т-Банк 32 499 внесён в 16:48Z.
  const transfer = op('t', {
    kind: 'transfer',
    amount: rub(32_499),
    accountId: 'ВТБ',
    toAccountId: 'Т-Банк',
    occurredAt: '2026-10-12T16:48:00Z',
  });
  const points = [
    { at: '2026-10-12T16:46:00Z', fact: rub(88_275), computedAt: rub(55_773) },
    { at: '2026-10-11T13:56:00Z', fact: rub(21_200), computedAt: rub(21_200) },
  ];

  it('перевод на счёт объясняет «лишние 32 502»', () => {
    expect(accountEffect(transfer, 'Т-Банк')).toBe(rub(32_499));
    expect(accountEffect(transfer, 'ВТБ')).toBe(-rub(32_499));
    expect(enteredAfterSnapshot(points, [transfer], 'Т-Банк').get(points[0]!.at)?.id).toBe('t');
  });

  it('пуш банка, другая сумма или внесено через час: не подсказываем', () => {
    const later = { ...transfer, id: 'l', occurredAt: '2026-10-12T17:50:00Z' };
    const push = { ...transfer, id: 'p', source: 'notification' as const };
    const other = { ...transfer, id: 'o', amount: rub(10_000) };
    expect(enteredAfterSnapshot(points, [later, push, other], 'Т-Банк').size).toBe(0);
  });
});
