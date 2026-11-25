import { describe, expect, it } from 'vitest';
import { contrast, ensureContrast, isHexColor, mix, THEME_PRESETS, themeOverrides } from '../src';

const lightBase = { card: '#FFFFFF', ground: '#F2F3EE', heroMuted: '#B8C0CC' };
const darkBase = { card: '#1A1F26', ground: '#0F1216', heroMuted: '#B8C0CC' };

describe('контраст и подбор оттенка', () => {
  it('считает как WCAG', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#0B6E4F', '#FFFFFF')).toBeCloseTo(6.25, 1);
  });
  it('светлый акцент темнеет до 4,5 на белом, проходящий не трогается', () => {
    const c = ensureContrast('#B98AC9', '#FFFFFF', 4.5);
    expect(contrast(c, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#0B6E4F', '#FFFFFF', 4.5)).toBe('#0B6E4F');
  });
  it('mix и проверка hex', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(isHexColor('#0b6e4f')).toBe(true);
    expect(isHexColor('зелёный')).toBe(false);
  });
});

describe('своя тема: все готовые палитры и любой выбор проходят контраст', () => {
  const check = (c: Parameters<typeof themeOverrides>[0]) => {
    for (const [scheme, base] of [['light', lightBase], ['dark', darkBase]] as const) {
      const o = themeOverrides(c, scheme, base);
      expect(contrast(o.onAccent, o.accent), `${scheme} кнопка`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(o.accentInk, base.card), `${scheme} ссылка`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(o.accentSoftInk, o.accentSoft), `${scheme} плашка`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(o.heroAccent, o.hero), `${scheme} карточка`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(o.expense, base.card), `${scheme} расходы`).toBeGreaterThanOrEqual(3);
    }
  };
  for (const p of THEME_PRESETS) it(p.name, () => check(p.colors));
  it('неудачный светлый акцент из макета (#B98AC9) тоже исправляется', () =>
    check({ accent: '#B98AC9', hero: '#2A1730', expense: '#F2B28A' }));
});



describe('своя палитра: HSV и граница контраста', () => {
  it('hsv туда и обратно', async () => {
    const { hsvToHex, hexToHsv } = await import('../src');
    expect(hsvToHex(0, 1, 1)).toBe('#FF0000');
    const { h, s, v } = hexToHsv('#0B6E4F');
    expect(hsvToHex(h, s, v)).toBe('#0B6E4F');
  });
  it('на границе maxValue цвет проходит контраст для всех трёх мест и всех оттенков', async () => {
    const { hsvToHex, maxValue, COLOR_RULES } = await import('../src');
    for (const rule of Object.values(COLOR_RULES))
      for (let h = 0; h < 360; h += 15)
        for (const s of [0, 0.3, 0.7, 1]) expect(contrast(hsvToHex(h, s, maxValue(h, s, rule)), rule.bg)).toBeGreaterThanOrEqual(rule.min - 0.01);
  });
});

describe('цветовой круг и правила гармонии', () => {
  it('триада: акцент тянет за собой остальных на 120 и 240', async () => {
    const { moveOnWheel } = await import('../src');
    const p = { h: 0, s: 0.6, b: 1 };
    const w = moveOnWheel({ accent: p, hero: p, expense: p }, 'accent', { h: 30, s: 0.7 }, 'triad');
    expect([w.accent.h, w.hero.h, w.expense.h]).toEqual([30, 150, 270]);
  });
  it('тянем расходы в комплементарной: набор поворачивается, правило держится', async () => {
    const { moveOnWheel } = await import('../src');
    const p = { h: 100, s: 0.6, b: 1 };
    const w = moveOnWheel({ accent: p, hero: p, expense: { ...p, h: 280 } }, 'expense', { h: 300, s: 0.5 }, 'complementary');
    expect([w.accent.h, w.hero.h, w.expense.h]).toEqual([120, 120, 300]);
    expect(w.expense.s).toBe(0.5);
  });
  it('«Свои»: двигается только свой маркер', async () => {
    const { moveOnWheel } = await import('../src');
    const p = { h: 100, s: 0.6, b: 1 };
    const w = moveOnWheel({ accent: p, hero: p, expense: p }, 'hero', { h: 10, s: 0.2 }, 'custom');
    expect([w.accent.h, w.hero.h, w.expense.h]).toEqual([100, 10, 100]);
  });
  it('любые точки круга дают цвета, которые проходят контраст', async () => {
    const { wheelToColors, COLOR_RULES } = await import('../src');
    for (let h = 0; h < 360; h += 30)
      for (const s of [0, 0.5, 1])
        for (const b of [0.2, 0.6, 1]) {
          const c = wheelToColors({ accent: { h, s, b }, hero: { h, s, b }, expense: { h, s, b } });
          for (const k of ['accent', 'hero', 'expense'] as const)
            expect(contrast(c[k], COLOR_RULES[k].bg)).toBeGreaterThanOrEqual(COLOR_RULES[k].min);
        }
  });
  it('цвета → круг → цвета почти не меняются', async () => {
    const { wheelToColors, colorsToWheel, THEME_PRESETS } = await import('../src');
    const c = THEME_PRESETS[1]!.colors;
    const back = wheelToColors(colorsToWheel(c));
    for (const k of ['accent', 'hero', 'expense'] as const) expect(contrast(back[k], c[k])).toBeLessThan(1.15);
  });
});
