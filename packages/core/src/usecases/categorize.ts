import type { Rule } from '../contract';
import type { Operation } from '../domain/operation';

/**
 * Подсказки подкатегорий для операции. Порядок (см. макет «Подсказки категорий»):
 *  1. правило «всегда так» для магазина (ставится само);
 *  2. история: что ставили этому магазину, частые первыми;
 *  3. категория банка из пуша (Супермаркеты -> Продукты);
 *  4. слова в названии магазина (apteka -> Здоровье);
 *  5. самые частые подкатегории за 2 месяца, добивают до трёх.
 */

export type SuggestionReason = 'rule' | 'history' | 'bank' | 'keyword' | 'frequent';

export interface Suggestion {
  subcategory: string;
  reason: SuggestionReason;
  /** Человеческое объяснение для строки «почему» под чипами. */
  why: string;
}

/**
 * Ключ магазина: латиница/кириллица в нижнем регистре, без цифр и знаков, первые два слова.
 * «Produkty Gagarina 101, карта *2202» -> «produkty gagarina», «PYATEROCHKA. Баланс…» -> «pyaterochka баланс».
 * Пока пуши не обрезаются, берём только до первой точки или запятой.
 */
export function merchantKey(merchant: string | undefined): string | undefined {
  if (!merchant) return undefined;
  const head = merchant.split(/[.,;\n]/)[0] ?? merchant;
  const words = head
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return words.length ? words.slice(0, 2).join(' ') : undefined;
}

/** Правило подходит, если ключ магазина начинается с шаблона (шаблон тоже нормализован). */
export function ruleFor(merchant: string | undefined, rules: Rule[]): Rule | undefined {
  const key = merchantKey(merchant);
  if (!key) return undefined;
  return rules.find((r) => {
    const p = merchantKey(r.pattern);
    return p !== undefined && (key === p || key.startsWith(`${p} `) || key.startsWith(p));
  });
}

/** Категории банков -> подкатегории «Справочника». Дополняется по реальным пушам. */
export const BANK_CATEGORY_MAP: Record<string, string> = {
  супермаркеты: 'Продукты',
  продукты: 'Продукты',
  фастфуд: 'Рестораны и кафе',
  рестораны: 'Рестораны и кафе',
  кафе: 'Рестораны и кафе',
  такси: 'Транспорт',
  транспорт: 'Транспорт',
  аптеки: 'Здоровье',
  'различные товары': 'Товары для дома',
  развлечения: 'Развлечения',
  одежда: 'Одежда и обувь',
  связь: 'Связь',
};

const KEYWORDS: [RegExp, string][] = [
  [
    /pyaterochk|пятерочк|magnit|магнит|perekrest|перекрест|vkusvill|вкусвилл|lenta|лента|produkt|продукт|supermarket|ашан|auchan|dixy|дикси/,
    'Продукты',
  ],
  [/apteka|аптек|zdravc|здравсити/, 'Здоровье'],
  [
    /yandex go|яндекс go|yandex taxi|яндекс такси|taxi|такси|metro|метро|transport|транспорт|ckad|azs|азс/,
    'Транспорт',
  ],
  [/samokat|самокат|delivery|доставк|yandex eda|яндекс еда|kuper|купер/, 'Доставка еды'],
  [
    /cafe|кафе|coffee|кофе|restoran|ресторан|burger|бургер|kfc|vkusno|вкусно|pizza|пицц|shaurma|шаурм/,
    'Рестораны и кафе',
  ],
  [/cinema|кино|teatr|театр|park|парк|bowling|боулинг/, 'Развлечения'],
  [/ozon|wildberries|wb\b|vaillberris/, 'Товары для дома'],
];

export interface SuggestContext {
  rules: Rule[];
  /** Операции с подкатегорией за последние ~2 месяца (для истории и частых). */
  history: Operation[];
  /** Подкатегории из «Справочника»: подсказываем только существующие. */
  known: string[];
  /** Категория банка из пуша, если банк её присылает. */
  bankCategory?: string;
  /** Популярность подкатегорий по таблице (расходы за последние месяцы), по убыванию. */
  popular?: { name: string; count: number }[];
}

/** Популярность: таблица плюс ещё не отправленные операции с телефона, по убыванию. */
export function popularSubcategories(ctx: Pick<SuggestContext, 'history' | 'popular'>): [string, number][] {
  const m = new Map<string, number>();
  for (const p of ctx.popular ?? []) m.set(p.name, (m.get(p.name) ?? 0) + p.count);
  for (const o of ctx.history)
    if (o.kind === 'expense' && o.subcategory && !o.deleted && o.status !== 'synced')
      m.set(o.subcategory, (m.get(o.subcategory) ?? 0) + 1);
  // Без данных из таблицы опираемся на всю локальную историю.
  if (!ctx.popular?.length) return countBy(ctx.history);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function suggestCategories(
  op: Pick<Operation, 'merchant' | 'kind'>,
  ctx: SuggestContext,
  limit = 3,
): Suggestion[] {
  if (op.kind !== 'expense') return [];
  const known = new Set(ctx.known);
  const out: Suggestion[] = [];
  const add = (subcategory: string | null | undefined, reason: SuggestionReason, why: string) => {
    if (!subcategory || !known.has(subcategory) || out.some((s) => s.subcategory === subcategory)) return;
    out.push({ subcategory, reason, why });
  };

  const rule = ruleFor(op.merchant, ctx.rules);
  if (rule?.subcategory) add(rule.subcategory, 'rule', `по правилу «${rule.pattern} → ${rule.subcategory}»`);

  const key = merchantKey(op.merchant);
  if (key) {
    const counts = countBy(ctx.history.filter((o) => merchantKey(o.merchant) === key));
    for (const [sub, n] of counts)
      add(sub, 'history', `${n} ${plural(n)} ставил «${sub}» для этого магазина`);
  }

  // Дальше самые популярные по убыванию.
  const popular = popularSubcategories(ctx);
  for (const [i, [sub]] of popular.entries()) {
    if (out.length >= limit) break;
    add(sub, 'frequent', i === 0 ? 'самая частая трата' : `${i + 1}-я по частоте трата`);
  }

  // Истории ещё нет: категория банка и слова в названии магазина.
  if (ctx.bankCategory) {
    const mapped = BANK_CATEGORY_MAP[ctx.bankCategory.toLowerCase()];
    if (mapped) add(mapped, 'bank', `категория банка «${ctx.bankCategory}» → «${mapped}»`);
  }
  const text = (op.merchant ?? '').toLowerCase();
  for (const [re, sub] of KEYWORDS) if (re.test(text)) add(sub, 'keyword', `по названию магазина → «${sub}»`);
  return out.slice(0, limit);
}

/** Предложить правило, если для этого магазина уже второй раз выбрана та же подкатегория и правила нет. */
export function shouldProposeRule(op: Operation, history: Operation[], rules: Rule[]): boolean {
  if (op.kind !== 'expense' || !op.subcategory || ruleFor(op.merchant, rules)) return false;
  const key = merchantKey(op.merchant);
  if (!key) return false;
  const same = history.filter(
    (o) => o.id !== op.id && merchantKey(o.merchant) === key && o.subcategory === op.subcategory,
  );
  return same.length >= 1;
}

function countBy(ops: Operation[]): [string, number][] {
  const m = new Map<string, number>();
  for (const o of ops)
    if (o.kind === 'expense' && o.subcategory && !o.deleted)
      m.set(o.subcategory, (m.get(o.subcategory) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'раза' : 'раз';
}
