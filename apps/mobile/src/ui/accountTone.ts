import type { Palette } from './theme';

/** Цвет плашки с буквой счёта, когда иконки банка на телефоне нет. */
const MONO: Record<string, keyof Palette> = {
  'Т-Банк': 'monoYellow',
  Сбер: 'monoGreen',
  Наличные: 'monoGray',
  tbank: 'monoYellow',
  sber: 'monoGreen',
};

export const accountTone = (id: string | undefined): keyof Palette => (id && MONO[id]) || 'monoGray';
