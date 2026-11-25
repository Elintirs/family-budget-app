import { describe, expect, it } from 'vitest';
import { rub, spendStructure } from '../src';

describe('регулярные и единовременные расходы', () => {
  it('октябрь: ремонт машины и взыскания отдельно, прогноз без них', () => {
    const s = spendStructure({
      month: '2026-10',
      income: rub(237000),
      expense: rub(222417),
      groups: {},
      subcategories: {},
      incomeCategories: {},
      oneOff: rub(49687),
      oneOffSubcategories: { Взыскания: rub(19187), 'Ремонт машины': rub(30500) },
    });
    expect(s.regular).toBe(rub(172730));
    expect(s.oneOffItems.map((i) => i.name)).toEqual(['Ремонт машины', 'Взыскания']);
    expect(s.forecastFree).toBe(rub(64270));
  });

  it('старая аналитика без отметок: всё регулярное', () => {
    const s = spendStructure({
      month: '2026-09',
      income: rub(100),
      expense: rub(80),
      groups: {},
      subcategories: {},
      incomeCategories: {},
    });
    expect(s).toMatchObject({ regular: rub(80), oneOff: 0, oneOffItems: [] });
  });
});
