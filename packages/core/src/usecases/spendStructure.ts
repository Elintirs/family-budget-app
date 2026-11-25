import type { MonthStats } from '../contract';
import type { Kopecks } from '../domain/money';

export interface SpendStructure {
  /** Регулярные расходы: всё, что не отмечено единовременным. */
  regular: Kopecks;
  oneOff: Kopecks;
  /** Единовременные по подкатегориям, по убыванию. */
  oneOffItems: { name: string; amount: Kopecks }[];
  /** Свободно, если регулярные расходы останутся такими, а единовременных не будет. */
  forecastFree: Kopecks;
}

/** Расходы месяца на регулярные и единовременные (ремонт машины, штрафы) для аналитики. */
export function spendStructure(s: MonthStats): SpendStructure {
  const oneOff = Math.min(s.oneOff ?? 0, s.expense);
  const regular = s.expense - oneOff;
  return {
    regular,
    oneOff,
    oneOffItems: Object.entries(s.oneOffSubcategories ?? {})
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
    forecastFree: s.income - regular,
  };
}
