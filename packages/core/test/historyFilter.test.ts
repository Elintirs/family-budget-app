import { describe, expect, it } from 'vitest';
import { filterHistory, historyMonths, type Operation } from '../src';

const op = (id: string, p: Partial<Operation>): Operation => ({
  id,
  kind: 'expense',
  amount: 0,
  occurredAt: '2026-10-15T12:00:00',
  source: 'manual',
  author: 'Олег',
  status: 'synced',
  ...p,
});

const ops: Operation[] = [
  op('t1', { amount: 30000, subcategory: 'Транспорт', merchant: 'Яндекс Go', occurredAt: '2026-10-03T09:00:00' }),
  op('t2', { amount: 5250, subcategory: 'Транспорт', merchant: 'Метро', author: 'Елена', accountId: 'sber' }),
  op('t3', { amount: 12000, subcategory: 'Транспорт', occurredAt: '2026-11-02T10:00:00' }),
  op('p1', { amount: 52350, subcategory: 'Продукты', merchant: 'Пятёрочка' }),
  op('i1', { kind: 'income', amount: 4000000, incomeCategory: 'Зарплата', occurredAt: '2026-10-10T10:00:00' }),
  op('d1', { amount: 99900, subcategory: 'Транспорт', deleted: true }),
];

describe('фильтр истории', () => {
  it('транспорт за октябрь: список и сумма, удалённые не в счёт', () => {
    const r = filterHistory(ops, { subcategory: 'Транспорт', month: '2026-10' });
    expect(r.list.map((o) => o.id)).toEqual(['t1', 't2']);
    expect(r.totals).toEqual({ count: 2, expense: 35250, income: 0 });
  });

  it('1 ноября до 4 утра ещё октябрь', () => {
    const late = op('n', { amount: 100, occurredAt: '2026-11-01T03:30:00' });
    expect(filterHistory([late], { month: '2026-10' }).list).toHaveLength(1);
  });

  it('поиск по сумме с копейками, по счёту и по автору', () => {
    expect(filterHistory(ops, { query: '52,5' }).list.map((o) => o.id)).toEqual(['t2']);
    expect(filterHistory(ops, { query: '523' }).list.map((o) => o.id)).toEqual(['p1']);
    const names = new Map([['sber', 'Сбер Елены']]);
    expect(filterHistory(ops, { query: 'сбер', accountNames: names }).list.map((o) => o.id)).toEqual(['t2']);
    expect(filterHistory(ops, { author: 'Елена' }).totals.count).toBe(1);
  });

  it('поиск по комментарию и тексту уведомления, без учёта регистра', () => {
    const list = [
      op('c', { amount: 100, comment: 'Такси до вокзала' }),
      op('s', { amount: 200, sourceText: 'Покупка 200 ₽, ГОРТРАНС' }),
    ];
    expect(filterHistory(list, { query: 'вокзал' }).list.map((o) => o.id)).toEqual(['c']);
    expect(filterHistory(list, { query: 'гортранс' }).list.map((o) => o.id)).toEqual(['s']);
  });

  it('группа: любая из её подкатегорий', () => {
    expect(filterHistory(ops, { subcategories: ['Продукты', 'Транспорт'], month: '2026-10' }).totals.count).toBe(3);
  });

  it('доходы считаются отдельно', () => {
    expect(filterHistory(ops, { kind: 'income' }).totals).toEqual({ count: 1, expense: 0, income: 4000000 });
  });

  it('месяцы с операциями от свежего', () => {
    expect(historyMonths(ops)).toEqual(['2026-11', '2026-10']);
  });
});
