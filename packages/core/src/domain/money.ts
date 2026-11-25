/** Деньги храним в копейках целым числом, чтобы не ловить ошибки округления. */
export type Kopecks = number;

const NBSP = '\u00A0';
const SPACES = /[\s\u00A0\u202F\u2009]/g;

/** Разбирает сумму из текста банка или таблицы: «1 355,00», «1355.5», «−523 ₽», «1 290,00 RUB». */
export function parseRub(text: string): Kopecks | null {
  const m = text.replace(SPACES, '').match(/[-−]?\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  const normalized = m[0].replace('−', '-').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * Сумма в поле ввода, пока её набирают: «1355» -> «1 355», «1355,5» -> «1 355,5».
 * Точку меняет на запятую, лишнее выкидывает, копеек не больше двух, минус в начале оставляет
 * (остаток кредитки). Разбирается обратно parseRub.
 */
export function formatAmountInput(text: string): string {
  const minus = /^\s*[-−]/.test(text) ? '−' : '';
  const clean = text
    .replace(SPACES, '')
    .replace('.', ',')
    .replace(/[^\d,]/g, '');
  const [intRaw = '', ...rest] = clean.split(',');
  const int = intRaw.replace(/^0+(?=\d)/, '');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  if (!rest.length) return minus + grouped;
  return `${minus}${grouped || '0'},${rest.join('').slice(0, 2)}`;
}

export function rub(rubles: number): Kopecks {
  return Math.round(rubles * 100);
}

/** «1 355 ₽», «1 355,50 ₽», со знаком: «−523 ₽» / «+50 000 ₽». */
export function formatRub(k: Kopecks, opts: { sign?: boolean; whole?: boolean } = {}): string {
  // whole: итоговые цифры без копеек, округление до рубля.
  const value = opts.whole ? Math.round(k / 100) * 100 : k;
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const cents = abs % 100;
  const body = cents ? `${whole},${String(cents).padStart(2, '0')}` : whole;
  const prefix = negative ? '−' : opts.sign && value > 0 ? '+' : '';
  return `${prefix}${body}${NBSP}₽`;
}
