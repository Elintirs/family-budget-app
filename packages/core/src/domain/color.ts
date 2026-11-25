/**
 * Цвета темы: контраст по WCAG и подбор оттенка, который проходит порог. Нужно для своих цветов
 * темы: человек выбирает три цвета, остальные токены выводятся из них и проверяются здесь.
 */

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function isHexColor(s: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
}

function luminance(hex: string): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Контраст двух цветов по WCAG: 1…21. Текст от 4,5, элементы интерфейса от 3. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Смешение: t = 0 даёт a, t = 1 даёт b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb);
}

/**
 * Тот же оттенок, но с контрастом не ниже min на фоне bg: шаг за шагом к чёрному или белому
 * (смотря что дальше от фона). Уже проходит: цвет как есть.
 */
export function ensureContrast(color: string, bg: string, min: number): string {
  if (contrast(color, bg) >= min) return rgbToHex(hexToRgb(color));
  const target = luminance(bg) > 0.18 ? '#000000' : '#FFFFFF';
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(color, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

/** Три цвета, которые человек выбирает для темы. Остальные токены выводятся из них. */
export interface ThemeColors {
  accent: string;
  hero: string;
  expense: string;
}

/** Готовые палитры для экрана «Цвета». Все проходят проверку контраста (тест color.test.ts). */
export const THEME_PRESETS: { id: string; name: string; colors: ThemeColors }[] = [
  { id: 'green', name: 'Зелёная', colors: { accent: '#0B6E4F', hero: '#14181F', expense: '#CC7440' } },
  { id: 'plum', name: 'Сливовая', colors: { accent: '#7A3E8E', hero: '#2A1730', expense: '#C0684A' } },
  { id: 'sea', name: 'Морская', colors: { accent: '#0F6684', hero: '#10222B', expense: '#C9763C' } },
  { id: 'terracotta', name: 'Терракота', colors: { accent: '#A0461F', hero: '#2B1A14', expense: '#3F7A8C' } },
  { id: 'graphite', name: 'Графит', colors: { accent: '#3A4452', hero: '#14181F', expense: '#CC7440' } },
];

/** Поверх базовой палитры: токены акцента, главной карточки и расходов, с подбором контраста. */
export function themeOverrides(
  c: ThemeColors,
  scheme: 'light' | 'dark',
  base: { card: string; ground: string; heroMuted: string },
): Record<'accent' | 'accentInk' | 'onAccent' | 'accentSoft' | 'accentSoftInk' | 'hero' | 'heroAccent' | 'expense', string> {
  const white = '#FFFFFF';
  // Заливка кнопки: белый текст на ней от 4,5.
  const accent = ensureContrast(c.accent, white, 4.5);
  if (scheme === 'light') {
    const soft = mix(accent, white, 0.86);
    const hero = ensureContrast(c.hero, base.ground, 8);
    return {
      accent,
      accentInk: ensureContrast(accent, base.card, 4.5),
      onAccent: white,
      accentSoft: soft,
      accentSoftInk: ensureContrast(mix(accent, '#000000', 0.35), soft, 4.5),
      hero,
      heroAccent: ensureContrast(mix(accent, white, 0.55), hero, 4.5),
      expense: ensureContrast(c.expense, base.card, 3),
    };
  }
  const soft = mix(accent, base.ground, 0.72);
  // Тёмная главная карточка: светлее фона, чтобы не сливалась, подписи на ней читаются.
  const hero = mix(c.hero, accent, 0.18);
  return {
    accent,
    accentInk: ensureContrast(mix(accent, white, 0.45), base.card, 4.5),
    onAccent: white,
    accentSoft: soft,
    accentSoftInk: ensureContrast(mix(accent, white, 0.65), soft, 4.5),
    hero: contrast(base.heroMuted, hero) >= 4.5 ? hero : c.hero,
    heroAccent: ensureContrast(mix(accent, white, 0.55), hero, 4.5),
    expense: ensureContrast(mix(c.expense, white, 0.3), base.card, 3),
  };
}



/** HSV: оттенок 0…360, насыщенность и яркость 0…1. Удобно для квадрата палитры. */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}

/** Где цвет проходит контраст для своего места: фон проверки и порог. Все три места требуют тёмного. */
export const COLOR_RULES: Record<keyof ThemeColors, { bg: string; min: number }> = {
  // Акцент: заливка кнопок, белый текст на ней от 4,5.
  accent: { bg: '#FFFFFF', min: 4.5 },
  // Главная карточка: светлые подписи на ней от 4,5.
  hero: { bg: '#B8C0CC', min: 4.5 },
  // Расходы: столбики на белой карточке от 3.
  expense: { bg: '#FFFFFF', min: 3 },
};

/**
 * Самая большая яркость v при оттенке h и насыщенности s, при которой цвет ещё проходит контраст:
 * граница затемнённой зоны в палитре. Выше неё палитра не пускает ползунок.
 */
export function maxValue(h: number, s: number, rule: { bg: string; min: number }): number {
  let lo = 0;
  let hi = 1;
  if (contrast(hsvToHex(h, s, 1), rule.bg) >= rule.min) return 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(hsvToHex(h, s, mid), rule.bg) >= rule.min) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Правила гармонии, как в Adobe Color: как связаны оттенки трёх цветов темы. */
export type Harmony = 'custom' | 'analogous' | 'complementary' | 'triad' | 'split' | 'mono';
export const HARMONIES: { id: Harmony; name: string }[] = [
  { id: 'custom', name: 'Свободно' },
  { id: 'analogous', name: 'Аналоговая' },
  { id: 'complementary', name: 'Комплементарная' },
  { id: 'triad', name: 'Триада' },
  { id: 'split', name: 'Раздельная' },
  { id: 'mono', name: 'Монохром' },
];
/** Сдвиг оттенка карточки и расходов от акцента по правилу. Монохром: тот же оттенок. */
const OFFSETS: Record<Exclude<Harmony, 'custom'>, [number, number]> = {
  analogous: [-30, 30],
  complementary: [0, 180],
  triad: [120, 240],
  split: [150, 210],
  mono: [0, 0],
};

export interface WheelPoint {
  /** Оттенок 0…360. */
  h: number;
  /** Насыщенность 0…1: расстояние от центра круга. */
  s: number;
  /** Яркость как доля от допустимой для этого места: 1 = на границе контраста. */
  b: number;
}
export type WheelColors = Record<keyof ThemeColors, WheelPoint>;

const wrap = (h: number) => ((h % 360) + 360) % 360;

/**
 * Точку на круге передвинули: по правилу остальные идут следом. В «своих» двигается только она.
 * Сдвиг акцента поворачивает весь набор; сдвиг другого маркера меняет его насыщенность, а оттенок
 * поворачивает набор так, чтобы правило сохранилось.
 */
export function moveOnWheel(cur: WheelColors, slot: keyof ThemeColors, to: { h: number; s: number }, rule: Harmony): WheelColors {
  const next: WheelColors = { ...cur, [slot]: { ...cur[slot], h: wrap(to.h), s: Math.min(1, Math.max(0, to.s)) } };
  if (rule === 'custom') return next;
  const [dHero, dExp] = OFFSETS[rule];
  const off = { accent: 0, hero: dHero, expense: dExp }[slot];
  const base = wrap(to.h - off);
  next.accent = { ...next.accent, h: base };
  next.hero = { ...next.hero, h: wrap(base + dHero) };
  next.expense = { ...next.expense, h: wrap(base + dExp) };
  // Монохром различает цвета насыщенностью и яркостью: оттенок один.
  return next;
}

/** Применить правило к текущему набору: оттенки выстраиваются от акцента. */
export function applyHarmony(cur: WheelColors, rule: Harmony): WheelColors {
  return rule === 'custom' ? cur : moveOnWheel(cur, 'accent', cur.accent, rule);
}

/** Цвета темы из точек круга: яркость берётся как доля от границы контраста своего места. */
export function wheelToColors(w: WheelColors): ThemeColors {
  const out = {} as ThemeColors;
  for (const k of ['accent', 'hero', 'expense'] as const) {
    const p = w[k];
    const rule = COLOR_RULES[k];
    const v = maxValue(p.h, p.s, rule) * Math.min(1, Math.max(0.2, p.b));
    out[k] = ensureContrast(hsvToHex(p.h, p.s, v), rule.bg, rule.min);
  }
  return out;
}

/** Обратно: из сохранённых цветов в точки круга (яркость относительно границы). */
export function colorsToWheel(c: ThemeColors): WheelColors {
  const out = {} as WheelColors;
  for (const k of ['accent', 'hero', 'expense'] as const) {
    const { h, s, v } = hexToHsv(c[k]);
    const max = maxValue(h, s, COLOR_RULES[k]) || 1;
    out[k] = { h, s, b: Math.min(1, v / max) };
  }
  return out;
}
