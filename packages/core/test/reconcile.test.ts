import { describe, expect, it } from 'vitest';
import {
  adjustmentOperation,
  explainGap,
  isAdjustment,
  rub,
  unknownCardMask,
  type Account,
  type Operation,
} from '../src';

const accounts: Account[] = [
  { id: 'Т-Банк', name: 'Т-Банк', type: 'debit', cardMasks: [] },
  // По проводу «Поправки» приходят скрытой кредиткой с отметкой adjustment (совместимость с 0.3.11).
  { id: 'Поправки', name: 'Поправки', type: 'credit', cardMasks: [], hidden: true, adjustment: true },
];
const op = (p: Partial<Operation>): Operation => ({
  id: 'x',
  kind: 'expense',
  amount: rub(100),
  occurredAt: '2026-10-30T12:00:00.000Z',
  accountId: 'Т-Банк',
  source: 'manual',
  author: 'Олег',
  status: 'synced',
  ...p,
});

describe('сверка и поправка', () => {
  it('в банке меньше: перевод со счёта на «Поправки», это не расход', () => {
    const a = adjustmentOperation({
      id: 'a',
      accountId: 'Т-Банк',
      adjustmentId: 'Поправки',
      gap: -rub(1762.94),
      at: '2026-10-30T12:39:00.000Z',
      author: 'Олег',
      comment: 'Поправка по сверке 30.10',
    });
    expect(a).toMatchObject({
      kind: 'transfer',
      amount: rub(1762.94),
      accountId: 'Т-Банк',
      toAccountId: 'Поправки',
    });
    expect(isAdjustment(a, accounts)).toBe(true);
    expect(isAdjustment(op({ kind: 'transfer', toAccountId: 'ВТБ' }), accounts)).toBe(false);
  });

  it('в банке больше: перевод с «Поправок» на счёт', () => {
    const a = adjustmentOperation({
      id: 'a',
      accountId: 'Т-Банк',
      adjustmentId: 'Поправки',
      gap: rub(4),
      at: '2026-10-30T12:39:00.000Z',
      author: 'Олег',
      comment: '',
    });
    expect(a).toMatchObject({ accountId: 'Поправки', toAccountId: 'Т-Банк', amount: rub(4) });
  });

  it('подсказки: неразобранные во «Входящих» и перевод в обратную сторону (49 334 от 29.10)', () => {
    const ops = [
      op({ id: 'n1', status: 'new', amount: rub(1263) }),
      op({ id: 'n2', status: 'new', amount: rub(500), accountId: 'ВТБ' }),
      op({ id: 't', kind: 'transfer', amount: rub(49334), accountId: 'ВТБ', toAccountId: 'Т-Банк' }),
    ];
    const h = explainGap(ops, 'Т-Банк', -rub(1263));
    expect(h.inbox.map((o) => o.id)).toEqual(['n1']);
    expect(h.inboxEffect).toBe(-rub(1263));
    expect(h.reversed).toBeUndefined();
    // Т-Банк по таблице получил 49 334, а в банке на 98 668 меньше: перевод записан не в ту сторону.
    expect(explainGap(ops, 'Т-Банк', -rub(98668)).reversed?.id).toBe('t');
  });
});

describe('новая карта в уведомлении', () => {
  it('маска, которой нет ни у одного счёта, спрашивается; известная нет', () => {
    const acc = [{ cardMasks: ['*1101', '*4404'] }, { cardMasks: ['*7707'] }];
    expect(unknownCardMask({ cardMask: '*8808' }, acc)).toBe('*8808');
    expect(unknownCardMask({ cardMask: '*4404' }, acc)).toBeUndefined();
    expect(unknownCardMask({}, acc)).toBeUndefined();
  });
});
