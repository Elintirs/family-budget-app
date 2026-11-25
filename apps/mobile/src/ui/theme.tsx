import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { themeOverrides, type ThemeColors } from '@budget/core';
import { kv } from '@/adapters/db';

/** Единственное место с цветами. В компонентах только токены. */
const light = {
  ground: '#F2F3EE',
  card: '#FFFFFF',
  ink: '#14181F',
  muted: '#5B6370',
  line: '#EEF0EA',
  border: '#DDE0D8',
  fill: '#E6E8E1',
  hero: '#14181F',
  heroInk: '#FFFFFF',
  heroMuted: '#B8C0CC',
  heroTrack: '#2A313B',
  heroChip: '#232A33',
  heroAccent: '#7FE0B5',
  accent: '#0B6E4F',
  accentInk: '#0B6E4F',
  onAccent: '#FFFFFF',
  accentSoft: '#DDEFE6',
  accentSoftInk: '#0A4A36',
  warn: '#B4531A',
  warnInk: '#B4531A',
  warnSoft: '#FBE7D9',
  warnSoftInk: '#6B2E0B',
  strong: '#14181F',
  onStrong: '#FFFFFF',
  // Выключенный переключатель и рамки полей, чипов: 3:1 к карточке (WCAG 1.4.11, аудит 05.11).
  toggleOff: '#878E84',
  control: '#878E84',
  // Расходы на графиках рядом с доходами: 3,4:1 к белому (персиковый #F2B28A давал 1,8).
  expense: '#CC7440',
  heroEdge: 'transparent',
  scrim: '#14181F',
  switchThumb: '#FFFFFF',
  onWarn: '#FFFFFF',
  monoYellow: '#F5E9B8',
  monoGreen: '#D8EEDF',
  monoGray: '#E4E7EF',
  monoPurple: '#ECE2F5',
};

export type Palette = typeof light;

const dark: Palette = {
  ground: '#0F1216',
  card: '#1A1F26',
  ink: '#ECEFF3',
  muted: '#9AA4B1',
  line: '#252C35',
  border: '#333B46',
  fill: '#252C35',
  hero: '#263A34',
  heroInk: '#FFFFFF',
  heroMuted: '#B8C0CC',
  heroTrack: '#2A313B',
  heroChip: '#232A33',
  heroAccent: '#7FE0B5',
  accent: '#0B6E4F',
  accentInk: '#5FD3A2',
  onAccent: '#FFFFFF',
  accentSoft: '#173A2E',
  accentSoftInk: '#9FE6C6',
  warn: '#B4531A',
  warnInk: '#F08A4B',
  warnSoft: '#3A2418',
  warnSoftInk: '#F6C3A0',
  strong: '#ECEFF3',
  onStrong: '#14181F',
  toggleOff: '#66707B',
  control: '#66707B',
  expense: '#F2B28A',
  // Тёмная главная карточка сливалась с фоном (1,27:1): светлее и с обводкой.
  heroEdge: '#3E5C51',
  scrim: '#000000',
  switchThumb: '#FFFFFF',
  onWarn: '#FFFFFF',
  monoYellow: '#3A3420',
  monoGreen: '#1F3A2A',
  monoGray: '#2A303B',
  monoPurple: '#33283F',
};

export const radius = { card: 22, hero: 28, input: 14 } as const;
export const space = { screen: 20, gap: 16 } as const;

export type ThemePref = 'system' | 'light' | 'dark';

interface ThemeValue {
  colors: Palette;
  scheme: 'light' | 'dark';
  pref: ThemePref;
  setPref(p: ThemePref): void;
  /** Свои цвета этого телефона; null — стандартная зелёная тема. Таблицу не трогают. */
  custom: (ThemeColors & { preset?: string }) | null;
  setCustom(c: (ThemeColors & { preset?: string }) | null): void;
}

/** Палитра с учётом своих цветов: без выбора стандартная, иначе акцент, карточка и расходы поверх. */
export function paletteFor(scheme: 'light' | 'dark', custom: ThemeColors | null): Palette {
  const base = scheme === 'dark' ? dark : light;
  return custom ? { ...base, ...themeOverrides(custom, scheme, base) } : base;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>(
    () => (kv.get('themePref') as ThemePref | null) ?? 'system',
  );
  const [custom, setCustomState] = useState<ThemeValue['custom']>(() => kv.getJson('themeColors') ?? null);
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const colors = useMemo(() => paletteFor(scheme, custom), [scheme, custom]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.ground);
  }, [colors.ground]);

  const value = useMemo<ThemeValue>(
    () => ({
      colors,
      scheme,
      pref,
      setPref(p) {
        kv.set('themePref', p);
        setPrefState(p);
      },
      custom,
      setCustom(c) {
        if (c) kv.setJson('themeColors', c);
        else kv.delete('themeColors');
        setCustomState(c);
      },
    }),
    [colors, scheme, pref, custom],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme вне ThemeProvider');
  return v;
}
