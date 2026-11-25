import { describe, expect, it } from 'vitest';
import { newerVersion, planReminders, rub, type Analytics, type Bootstrap } from '../src';

const nb = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');

const boot = (extra: Partial<Bootstrap> = {}): Bootstrap => ({
  tableName: 'т',
  subcategories: [{ id: 'p', name: 'Продукты', group: 'Повседневные', monthLimit: rub(15_000) }],
  incomeCategories: [],
  accounts: [],
  summary: {
    asOf: '',
    monthLimit: rub(80_000),
    spentMonthBeforeToday: 0,
    spentToday: 0,
    limitGroups: ['Повседневные'],
  },
  balances: [],
  rules: [],
  popular: [],
  recurring: [
    {
      id: 'r',
      name: 'Аренда',
      amount: rub(35_000),
      day: 11,
      match: 'аренда',
      accountId: 'Т-Банк',
      author: 'Н',
    },
  ],
  groupLimits: { Крупные: rub(30_000) },
  goals: [],
  ...extra,
});
const analytics: Analytics = {
  months: [
    {
      month: '2026-09',
      income: rub(236_000),
      expense: rub(120_000),
      groups: { Повседневные: rub(98_400) },
      subcategories: { Продукты: rub(43_824) },
      incomeCategories: {},
    },
    {
      month: '2026-10',
      income: 0,
      expense: 0,
      groups: { Крупные: rub(28_000) },
      subcategories: { Продукты: rub(12_500) },
      incomeCategories: {},
    },
  ],
};
const all = { limits: true, recurring: true, month: true, update: true };

describe('напоминания', () => {
  it('лимиты 80%: подкатегория и группа, с ключом месяца и уровня', () => {
    const r = planReminders({
      boot: boot(),
      analytics,
      ops: [],
      now: new Date(2026, 9, 10, 12),
      appVersion: '0.3.0',
      toggles: all,
    });
    expect(r.map((x) => x.key)).toEqual(['limit:2026-10:Крупные:80', 'limit:2026-10:Продукты:80']);
    expect(nb(r[1]!.text)).toBe('Осталось 2 500 ₽ из 15 000 ₽ до конца месяца.');
  });

  it('регулярный: накануне с 18:00, оплаченный не напоминаем', () => {
    const at = (h: number) => new Date(2026, 9, 10, h);
    const keys = (h: number, ops = []) =>
      planReminders({
        boot: boot(),
        analytics,
        ops,
        now: at(h),
        appVersion: '0.3.0',
        toggles: { ...all, limits: false },
      }).map((x) => x.key);
    expect(keys(12)).toEqual([]);
    expect(keys(19)).toEqual(['rec:2026-10:r']);
  });

  it('итоги прошлого месяца в первые дни, новая версия', () => {
    const r = planReminders({
      boot: boot({ latestApp: { version: '0.4.0', url: 'https://drive.google.com/x', notes: 'Цели' } }),
      analytics,
      ops: [],
      now: new Date(2026, 9, 2, 10),
      appVersion: '0.3.0',
      toggles: { ...all, limits: false, recurring: false },
    });
    expect(r.map((x) => x.key)).toEqual(['month:2026-09', 'update:0.4.0']);
    expect(r[0]!.title).toBe('Итоги сентября');
    expect(nb(r[0]!.text)).toBe('Потрачено 98 400 ₽ из 80 000 ₽ лимита. Вышли за лимит: Продукты.');
    expect(newerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(newerVersion('0.3.0', '0.3.0')).toBe(false);
  });
});
