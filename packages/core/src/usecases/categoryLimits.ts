import type { MonthStats, Subcategory } from '../contract';
import type { Kopecks } from '../domain/money';
import { isPending, type Operation } from '../domain/operation';
import { budgetMoment, monthKey } from '../domain/period';

export interface CategoryLimit {
  name: string;
  limit: Kopecks;
  spent: Kopecks;
  /** Может быть отрицательным: превышен. */
  left: Kopecks;
  /** Доля потраченного: 0.8 = 80%. */
  ratio: number;
}

/**
 * Лимиты подкатегорий на текущий месяц: потрачено по таблице («Обработанные данные» за месяц)
 * плюс неотправленные траты телефона. Подкатегории без лимита не попадают.
 */
export function categoryLimits(
  subs: Subcategory[],
  month: MonthStats | undefined,
  operations: Operation[],
  now: Date,
): CategoryLimit[] {
  const key = monthKey(budgetMoment(now));
  const pending = new Map<string, Kopecks>();
  for (const o of operations) {
    if (o.kind !== 'expense' || !o.subcategory || !isPending(o)) continue;
    if (monthKey(budgetMoment(new Date(o.occurredAt))) !== key) continue;
    pending.set(o.subcategory, (pending.get(o.subcategory) ?? 0) + o.amount);
  }
  const fromTable = month?.month === key ? month.subcategories : {};
  return subs
    .filter((s) => (s.monthLimit ?? 0) > 0)
    .map((s) => {
      const limit = s.monthLimit!;
      const spent = (fromTable[s.name] ?? 0) + (pending.get(s.name) ?? 0);
      return { name: s.name, limit, spent, left: limit - spent, ratio: spent / limit };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Что показать плашкой на Главной: подкатегории, где потрачено от threshold (80%) лимита. */
export function limitWarnings(limits: CategoryLimit[], threshold = 0.8): CategoryLimit[] {
  return limits.filter((l) => l.ratio >= threshold);
}

export type GroupLimit = CategoryLimit;

/**
 * Лимиты групп вне лимита на день («Обязательные», «Крупные»): потрачено по таблице за месяц
 * плюс неотправленные траты подкатегорий этой группы.
 */
export function groupLimits(
  limits: Record<string, Kopecks>,
  month: MonthStats | undefined,
  operations: Operation[],
  groupOf: (subcategory: string) => string | undefined,
  now: Date,
): GroupLimit[] {
  const key = monthKey(budgetMoment(now));
  const fromTable = month?.month === key ? month.groups : {};
  return Object.entries(limits)
    .filter(([, limit]) => limit > 0)
    .map(([name, limit]) => {
      let spent = fromTable[name] ?? 0;
      for (const o of operations) {
        if (o.kind !== 'expense' || !o.subcategory || !isPending(o)) continue;
        if (monthKey(budgetMoment(new Date(o.occurredAt))) !== key) continue;
        if (groupOf(o.subcategory) === name) spent += o.amount;
      }
      return { name, limit, spent, left: limit - spent, ratio: spent / limit };
    });
}

/**
 * Потрачено за текущий бюджетный месяц по подкатегориям и группам, с лимитом или без: таблица плюс
 * неотправленные траты телефона этого месяца. Экран «Лимиты» раньше считал это сам, без фильтра по
 * месяцу и с подставным лимитом в 1 копейку ради группы без лимита.
 */
export function monthSpent(
  month: MonthStats | undefined,
  operations: Operation[],
  groupOf: (subcategory: string) => string | undefined,
  now: Date,
): { subcategories: Map<string, Kopecks>; groups: Map<string, Kopecks> } {
  const key = monthKey(budgetMoment(now));
  const current = month?.month === key ? month : undefined;
  const subcategories = new Map<string, Kopecks>(Object.entries(current?.subcategories ?? {}));
  const groups = new Map<string, Kopecks>(Object.entries(current?.groups ?? {}));
  for (const o of operations) {
    if (o.kind !== 'expense' || !o.subcategory || !isPending(o)) continue;
    if (monthKey(budgetMoment(new Date(o.occurredAt))) !== key) continue;
    subcategories.set(o.subcategory, (subcategories.get(o.subcategory) ?? 0) + o.amount);
    const g = groupOf(o.subcategory);
    if (g) groups.set(g, (groups.get(g) ?? 0) + o.amount);
  }
  return { subcategories, groups };
}

/** Сводка для свёрнутого списка на Главной: сколько лимитов превышено и сколько подошло к 80%. */
export function limitsBrief(limits: CategoryLimit[], threshold = 0.8): { over: number; near: number } {
  return {
    over: limits.filter((l) => l.left < 0).length,
    near: limits.filter((l) => l.left >= 0 && l.ratio >= threshold).length,
  };
}
