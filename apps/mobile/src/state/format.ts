const DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function humanDate(d: Date): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Заголовок дня в списках: «Сегодня», «Вчера, 4 октября», «3 октября» (год, если не текущий). */
export function dayTitle(d: Date, now = new Date()): string {
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`;
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return `Вчера, ${date}`;
  return date;
}

export function humanTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.toDateString() === now.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay) return `сегодня ${hm}`;
  if (d.toDateString() === y.toDateString()) return `вчера ${hm}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Короткое имя магазина для фраз: «Самокат», «PYATEROCHKA». */
export function shortMerchant(m: string | undefined) {
  return (m ?? '').split(/[.,;\n]/)[0]?.trim() || 'этого магазина';
}

const MONTHS_NOM = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const MONTHS_DAT = [
  'январю',
  'февралю',
  'марту',
  'апрелю',
  'маю',
  'июню',
  'июлю',
  'августу',
  'сентябрю',
  'октябрю',
  'ноябрю',
  'декабрю',
];

/** «2026-09» -> «сентябрю»: для подписей «−79% к сентябрю». */
export function monthDative(key: string): string {
  const m = Number(key.split('-')[1] ?? 1);
  return MONTHS_DAT[m - 1] ?? '';
}

/** «2027-03» -> «марту 2027»: к какому месяцу. */
export const monthDativeYear = (key: string) => `${monthDative(key)} ${key.slice(0, 4)}`;

/**
 * Изменение к прошлому периоду для подписи: «−72%, было 43 824 ₽». Если раньше было почти ничего
 * (рост больше чем в 10 раз), проценты бессмысленны: «было 7 ₽».
 */
export function deltaCaption(now: number, prev: number, fmt: (k: number) => string): string {
  if (!prev) return 'не было';
  if (now > prev * 10) return `было ${fmt(prev)}`;
  return `${deltaPct(now, prev)}, было ${fmt(prev)}`;
}

/** «2026-10» -> «Октябрь 2026» */
export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_NOM[(m ?? 1) - 1]} ${y}`;
}

/** «2026-10» -> «окт» */
export function monthShort(key: string): string {
  return MONTHS_SHORT[Number(key.split('-')[1] ?? 1) - 1] ?? key;
}

export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y ?? 2026, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Изменение в процентах: «+12%» / «−73%», без деления на ноль. */
export function deltaPct(now: number, prev: number): string | undefined {
  if (!prev) return undefined;
  const p = Math.round(((now - prev) / prev) * 100);
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`;
}

/** Сверка с банком: разница меньше рубля (копейки округления) считается совпадением, как и в таблице. */
export const reconciled = (diff: number) => Math.abs(diff) < 100;

/**
 * Факт банка минус расчёт на момент снимка (старый сервер: минус текущий расчёт).
 * unsent: неотправленные операции телефона до снимка, иначе покупка без категории выглядит как расхождение.
 */
export const bankDiff = (b: { fact?: number; computed: number; computedAtFact?: number }, unsent = 0) =>
  b.fact !== undefined ? b.fact - (b.computedAtFact ?? b.computed) - unsent : undefined;
