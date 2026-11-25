import { describe, expect, it } from 'vitest';
import { BootstrapSchema, PullSchema, TableOperationsSchema } from '../src';

const boot = {
  tableName: 'тест',
  subcategories: [{ name: 'Продукты', group: 'Повседневные' }],
  incomeCategories: [],
  accounts: [
    { id: 'Т-Банк', name: 'Т-Банк', type: 'debit', cardMasks: [] },
    // Новый тип счёта, о котором старое приложение не знает (как adjustment для 0.3.11).
    { id: 'Вклад', name: 'Вклад', type: 'savings', cardMasks: [] },
  ],
  summary: { asOf: new Date().toISOString(), monthLimit: 0, spentMonthBeforeToday: 0, spentToday: 0 },
  balances: [{ accountId: 'Т-Банк', computed: 100 }],
  rules: [],
  recurring: [{ id: 'r', name: 'Аренда', amount: 100, day: 10, match: 'аренда', author: 'Олег', schedule: { every: 'week' } }],
};

describe('совместимость ответа сервера со старым приложением', () => {
  it('счёт незнакомого типа пропускается, остальной bootstrap разбирается', () => {
    const b = BootstrapSchema.parse(boot);
    expect(b.accounts.map((a) => a.id)).toEqual(['Т-Банк']);
    expect(b.balances).toHaveLength(1);
  });

  it('новые поля в элементе не мешают: регулярный с расписанием читается', () => {
    expect(BootstrapSchema.parse(boot).recurring.map((r) => r.id)).toEqual(['r']);
  });

  it('операция незнакомого вида пропускается, зеркало остаётся', () => {
    const now = new Date().toISOString();
    const t = TableOperationsSchema.parse({
      from: now,
      operations: [
        { id: 'a', kind: 'expense', amount: 1, occurredAt: now, source: 'form', author: 'Олег', status: 'synced' },
        { id: 'b', kind: 'refund', amount: 1, occurredAt: now, source: 'form', author: 'Олег', status: 'synced' },
      ],
    });
    expect(t.operations.map((o) => o.id)).toEqual(['a']);
  });

  it('pull с bootstrap внутри тоже терпимый', () => {
    const p = PullSchema.parse({ rev: 1, bootstrap: boot });
    expect(p.bootstrap?.accounts).toHaveLength(1);
  });
});
