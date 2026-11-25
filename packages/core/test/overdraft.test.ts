import { describe, expect, it } from 'vitest';
import { findOverdraft, rub, type Account, type AccountBalance, type Operation } from '../src';

const acc = (id: string, type: Account['type']): Account => ({ id, name: id, type, cardMasks: [] });
const accounts = [
  acc('ВТБ', 'debit'),
  acc('Т-Банк 2', 'debit'),
  acc('Наличные', 'cash'),
  acc('Сбер кредитка', 'credit'),
];
const op = (p: Partial<Operation>): Operation => ({
  id: 'x',
  kind: 'expense',
  amount: rub(100),
  occurredAt: '2026-10-29T15:43:00.000Z',
  accountId: 'ВТБ',
  source: 'manual',
  author: 'Олег',
  status: 'synced',
  ...p,
});
const bal = (accountId: string, v: number): AccountBalance => ({ accountId, computed: rub(v) });

describe('обычный счёт не уходит в минус', () => {
  it('перевод больше остатка: ловим, и показываем во что превратится счёт', () => {
    const r = findOverdraft(
      accounts,
      [bal('Т-Банк 2', 18.69)],
      [],
      undefined,
      op({ kind: 'transfer', amount: rub(49334), accountId: 'Т-Банк 2', toAccountId: 'ВТБ' }),
    );
    expect(r).toEqual({ accountId: 'Т-Банк 2', now: rub(18.69), after: rub(18.69) - rub(49334) });
  });

  it('журнал 29.10: доход 49 334 на Т-Банк 2 в перевод «Откуда ВТБ»: ВТБ хватает, ошибки нет', () => {
    const income = op({ kind: 'income', amount: rub(49334), accountId: 'Т-Банк 2' });
    const transfer = { ...income, kind: 'transfer' as const, accountId: 'ВТБ', toAccountId: 'Т-Банк 2' };
    expect(
      findOverdraft(accounts, [bal('ВТБ', 49334), bal('Т-Банк 2', 49352.69)], [], income, transfer),
    ).toBeNull();
    // Наоборот (как записалось): Т-Банк 2 теряет 2 × 49 334, а на нём столько нет.
    const wrong = { ...income, kind: 'transfer' as const, accountId: 'Т-Банк 2', toAccountId: 'ВТБ' };
    expect(
      findOverdraft(accounts, [bal('ВТБ', 49334), bal('Т-Банк 2', 49352.69)], [], income, wrong)?.accountId,
    ).toBe('Т-Банк 2');
  });

  it('неотправленные с телефона тоже считаются', () => {
    const spent = op({ id: 'p', amount: rub(900), accountId: 'Наличные', status: 'ready' });
    expect(
      findOverdraft(accounts, [bal('Наличные', 1000)], [spent], undefined, op({ accountId: 'Наличные' })),
    ).toBeNull();
    expect(
      findOverdraft(
        accounts,
        [bal('Наличные', 1000)],
        [spent],
        undefined,
        op({ amount: rub(200), accountId: 'Наличные' }),
      ),
    ).toMatchObject({ now: rub(100), after: rub(-100) });
  });

  it('кредитку не проверяем, и уже ушедший в минус счёт можно чинить', () => {
    expect(
      findOverdraft(accounts, [], [], undefined, op({ accountId: 'Сбер кредитка', amount: rub(5000) })),
    ).toBeNull();
    const before = op({ amount: rub(500), accountId: 'ВТБ' });
    expect(
      findOverdraft(accounts, [bal('ВТБ', -400)], [], before, { ...before, amount: rub(300) }),
    ).toBeNull();
    expect(findOverdraft(accounts, [bal('ВТБ', -400)], [], before, { ...before, deleted: true })).toBeNull();
  });
});

describe('availableOn: доступно на карте для формы', () => {
  it('таблица плюс неотправленные, у кредитки undefined', async () => {
    const { availableOn, rub } = await import('../src');
    const accounts = [
      { id: 'Т-Банк', name: 'Т-Банк', type: 'debit' as const, cardMasks: [] },
      { id: 'Сбер кредитка', name: 'Сбер кредитка', type: 'credit' as const, cardMasks: [] },
    ];
    const balances = [{ accountId: 'Т-Банк', computed: rub(1200) }];
    const pending = [{ id: 'p', kind: 'expense' as const, amount: rub(200), occurredAt: new Date().toISOString(), accountId: 'Т-Банк', source: 'manual' as const, author: 'Олег', status: 'ready' as const }];
    expect(availableOn(accounts, balances, pending, 'Т-Банк')).toBe(rub(1000));
    expect(availableOn(accounts, balances, pending, 'Сбер кредитка')).toBeUndefined();
  });
});
