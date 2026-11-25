import {
  dayKey,
  rub,
  type Analytics,
  type Bootstrap,
  type Operation,
  type SheetApi,
  type SyncResponse,
} from '@budget/core';
import { kv } from './db';

/**
 * Таблица-заглушка до этапа 5: цифры как в «Учёт Доходов/Расходов» на начало октября.
 * Принятые операции хранит в kv, чтобы сводка менялась как настоящая и дубли отсекались.
 */
const SUBCATEGORIES = [
  'Продукты',
  'Рестораны и кафе',
  'Доставка еды',
  'Транспорт',
  'Вкусняшки',
  'Аптека',
  'Развлечения',
  'Товары для дома',
  'Одежда и обувь',
  'Вредные привычки',
  'Взыскания',
];

function accepted(): Operation[] {
  return kv.getJson<Operation[]>('fake.rows') ?? [];
}

function build(): Bootstrap {
  const now = new Date();
  const today = dayKey(now);
  const rows = accepted().filter((o) => o.kind === 'expense' && !o.deleted);
  const sum = (ops: Operation[]) => ops.reduce((s, o) => s + o.amount, 0);
  const todayRows = rows.filter((o) => dayKey(new Date(o.occurredAt)) === today);
  const beforeRows = rows.filter((o) => dayKey(new Date(o.occurredAt)) !== today);
  return {
    tableName: 'Тестовая таблица (заглушка)',
    subcategories: SUBCATEGORIES.map((name, i) => ({ id: `s${i}`, name, group: 'Повседневные' })),
    incomeCategories: ['Олег', 'Елена'],
    recurring: [],
    groupLimits: {},
    goals: [],
    accounts: [
      {
        id: 'tbank',
        name: 'Т-Банк',
        type: 'debit',
        cardMasks: ['*2202'],
        bankPackage: 'com.idamob.tinkoff.android',
      },
      { id: 'sber', name: 'Сбер', type: 'debit', cardMasks: [] },
      { id: 'vtb', name: 'ВТБ', type: 'debit', cardMasks: [] },
      { id: 'cash', name: 'Наличные', type: 'cash', cardMasks: [] },
      { id: 'sbercredit', name: 'Сбер кредитка', type: 'credit', cardMasks: [], creditLimit: rub(700000) },
    ],
    summary: {
      asOf: now.toISOString(),
      monthLimit: Number(kv.get('fake.limit') ?? rub(80000)),
      spentMonthBeforeToday: rub(33506) + sum(beforeRows),
      spentToday: sum(todayRows),
      limitGroups: ['Повседневные'],
    },
    balances: [
      {
        accountId: 'tbank',
        computed: rub(70654) - sum(rows.filter((o) => o.accountId === 'tbank')),
        fact: rub(70112),
        factAt: now.toISOString(),
      },
      { accountId: 'sber', computed: rub(22891) - sum(rows.filter((o) => o.accountId === 'sber')) },
      { accountId: 'vtb', computed: 0 },
      { accountId: 'cash', computed: 0 },
      { accountId: 'sbercredit', computed: 0, debt: rub(620936) },
    ],
    rules: [],
    popular: [
      { name: 'Продукты', count: 31 },
      { name: 'Рестораны и кафе', count: 18 },
      { name: 'Транспорт', count: 12 },
      { name: 'Доставка еды', count: 9 },
    ],
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const fakeSheetApi: SheetApi = {
  async bootstrap() {
    await delay(300);
    return build();
  },
  async rev() {
    return 0;
  },
  async pull(rev, from) {
    if (rev === 0) return { rev: 0, unchanged: true };
    return {
      rev: 0,
      bootstrap: build(),
      analytics: await fakeSheetApi.analytics(),
      operations: await fakeSheetApi.operations(from),
    };
  },
  async sync(req) {
    await delay(700);
    const rows = accepted();
    const seen = new Set(rows.map((r) => r.id));
    const res: Omit<SyncResponse, 'summary' | 'balances'> = {
      accepted: [],
      duplicates: [],
      rejected: [],
      suspected: [],
      edited: [],
      missing: [],
    };
    for (const op of req.operations) {
      if (seen.has(op.id)) res.duplicates.push(op.id);
      else {
        rows.push({ ...op, status: 'synced' });
        res.accepted.push(op.id);
      }
    }
    for (const e of req.edits ?? []) {
      const i = rows.findIndex((r) => r.id === e.id);
      if (i < 0) res.missing.push(e.id);
      else {
        if (e.deleted) rows.splice(i, 1);
        else rows[i] = { ...rows[i]!, ...e.fields };
        res.edited.push(e.id);
      }
    }
    kv.setJson('fake.rows', rows);
    const b = build();
    return { ...res, summary: b.summary, balances: b.balances };
  },
  async balanceFacts() {},
  async operations(from) {
    return { from, operations: accepted().filter((o) => o.occurredAt >= from) };
  },
  async invite(author) {
    return { author, tableName: 'Заглушка', link: 'budget://connect?t=fake' };
  },
  async setMonthLimit(limit) {
    kv.set('fake.limit', String(limit));
  },
  async setSubcategoryLimit() {},
  async upsertSubcategory() {},
  async setSubcategoryHidden() {},
  async setSubcategoryOneOff() {},
  async upsertRecurring() {},
  async deleteRecurring() {},
  async setGroupLimit() {},
  async upsertGoal() {},
  async deleteGoal() {},
  async setAccountSettings() {},
  async balanceHistory() {
    return [];
  },
  async debtHistory() {
    return { accounts: [], interestThisMonth: 0 };
  },
  async analytics(): Promise<Analytics> {
    await delay(300);
    return {
      months: [
        {
          month: '2026-08',
          income: rub(45985),
          expense: rub(37062),
          groups: { Повседневные: rub(36363), Обязательные: rub(699) },
          subcategories: { Продукты: rub(12000) },
          incomeCategories: {},
        },
        {
          month: '2026-09',
          income: rub(243348),
          expense: rub(172230),
          groups: { Повседневные: rub(111945), Обязательные: rub(30285), Крупные: rub(30000) },
          subcategories: { Продукты: rub(43824), 'Доставка еды': rub(17587) },
          incomeCategories: {},
        },
        {
          month: '2026-10',
          income: rub(50000),
          expense: rub(35476),
          groups: { Повседневные: rub(31456), Обязательные: rub(4020) },
          subcategories: { Продукты: rub(11925), 'Товары для дома': rub(8810), Взыскания: rub(4020) },
          incomeCategories: {},
        },
      ],
    };
  },
};
