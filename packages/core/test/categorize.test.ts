import { describe, expect, it } from 'vitest';
import {
  merchantKey,
  rub,
  ruleFor,
  shouldProposeRule,
  suggestCategories,
  type Operation,
  type Rule,
} from '../src';

const known = [
  'Продукты',
  'Доставка еды',
  'Вкусняшки',
  'Транспорт',
  'Здоровье',
  'Рестораны и кафе',
  'Аренда',
];
let n = 0;
const op = (merchant: string, subcategory?: string): Operation => ({
  id: `o${++n}`,
  kind: 'expense',
  amount: rub(100),
  occurredAt: new Date(2026, 9, 5).toISOString(),
  merchant,
  subcategory,
  source: 'notification',
  author: 'Олег',
  status: subcategory ? 'synced' : 'new',
});

describe('merchantKey', () => {
  it('нормализует и берёт до первой точки или запятой', () => {
    expect(merchantKey('PYATEROCHKA. Баланс 68 161 ₽')).toBe('pyaterochka');
    expect(merchantKey('Produkty Gagarina 101, карта *2202')).toBe('produkty gagarina');
    expect(merchantKey('Самокат')).toBe('самокат');
    expect(merchantKey('123')).toBeUndefined();
  });
});

describe('suggestCategories', () => {
  const rules: Rule[] = [{ pattern: 'PYATEROCHKA', subcategory: 'Продукты', author: 'Олег' }];

  it('правило первым', () => {
    const s = suggestCategories(op('PYATEROCHKA. Баланс 1 ₽'), { rules, history: [], known });
    expect(s[0]).toMatchObject({ subcategory: 'Продукты', reason: 'rule' });
  });

  it('история по магазину, потом популярные по убыванию', () => {
    const history = [
      op('Самокат', 'Доставка еды'),
      op('Самокат', 'Доставка еды'),
      op('Кофе', 'Вкусняшки'),
      op('Кофе', 'Вкусняшки'),
      op('Кофе', 'Вкусняшки'),
    ];
    const popular = [
      { name: 'Продукты', count: 40 },
      { name: 'Транспорт', count: 12 },
      { name: 'Вкусняшки', count: 10 },
    ];
    const s = suggestCategories(op('Самокат'), { rules: [], history, known, popular });
    expect(s.map((x) => [x.subcategory, x.reason])).toEqual([
      ['Доставка еды', 'history'],
      ['Продукты', 'frequent'],
      ['Транспорт', 'frequent'],
    ]);
    expect(s[0]!.why).toBe('2 раза ставил «Доставка еды» для этого магазина');
  });

  it('новый магазин: сначала популярные, слова в названии только если не хватило', () => {
    const popular = [
      { name: 'Транспорт', count: 5 },
      { name: 'Продукты', count: 3 },
    ];
    const s = suggestCategories(op('APTEKA 36.6'), { rules: [], history: [], known, popular });
    expect(s.map((x) => x.subcategory)).toEqual(['Транспорт', 'Продукты', 'Здоровье']);
  });

  it('без таблицы популярность по истории телефона', () => {
    const s = suggestCategories(op('APTEKA 36.6'), { rules: [], history: [op('x', 'Транспорт')], known });
    expect(s.map((x) => x.subcategory)).toEqual(['Транспорт', 'Здоровье']);
  });

  it('доходам подсказки подкатегорий не нужны, неизвестные подкатегории не предлагаем', () => {
    expect(suggestCategories({ kind: 'income', merchant: 'x' }, { rules: [], history: [], known })).toEqual(
      [],
    );
    expect(
      suggestCategories(op('x'), {
        rules: [{ pattern: 'x', subcategory: 'Нет такой', author: 'Н' }],
        history: [],
        known,
      }),
    ).toEqual([]);
  });
});

describe('правила', () => {
  it('ruleFor ищет по ключу магазина', () => {
    const rules: Rule[] = [{ pattern: 'Produkty Gagarina', subcategory: 'Продукты', author: 'Н' }];
    expect(ruleFor('Produkty Gagarina 101, карта *1', rules)?.subcategory).toBe('Продукты');
    expect(ruleFor('Другой', rules)).toBeUndefined();
  });

  it('предложить правило на второй одинаковый выбор', () => {
    const first = op('Самокат', 'Доставка еды');
    const second = op('Самокат', 'Доставка еды');
    expect(shouldProposeRule(first, [], [])).toBe(false);
    expect(shouldProposeRule(second, [first], [])).toBe(true);
    expect(
      shouldProposeRule(second, [first], [{ pattern: 'Самокат', subcategory: 'Доставка еды', author: 'Н' }]),
    ).toBe(false);
  });
});
