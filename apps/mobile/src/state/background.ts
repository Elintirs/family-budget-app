import * as Device from 'expo-device';
import { kv } from '@/adapters';

/** Прошивки, где без «Автозапуска» и «Без ограничений» батареи фоновая работа выгружается. */
export const AGGRESSIVE = /xiaomi|redmi|poco|huawei|honor|oppo|realme|oneplus|vivo|meizu|tecno|infinix|itel/i;

export const aggressiveVendor = () => AGGRESSIVE.test(`${Device.manufacturer ?? ''} ${Device.brand ?? ''}`);

/** Фоновая задача отмечает каждый запуск: по разрыву видно, что прошивка её усыпляет. */
export const markBackgroundRun = () => kv.set('bg.lastRun', new Date().toISOString());

/** После скольких часов без фона подсказываем: ночью перерыв в 7 часов бывает и на обычных телефонах. */
const STALE_H = 12;

/**
 * Сколько часов фон не запускался, если это похоже на усыпление прошивкой (журнал Елены 11–12.10:
 * Xiaomi на Android 16, перерыв 24 часа). undefined: всё в порядке или подсказку отложили.
 */
export function backgroundStaleHours(now = Date.now()): number | undefined {
  if (!aggressiveVendor() || kv.get('autoSend') !== '1') return undefined;
  const last = Date.parse(kv.get('bg.lastRun') ?? '');
  if (Number.isNaN(last)) return undefined;
  const later = Date.parse(kv.get('bg.later') ?? '');
  if (!Number.isNaN(later) && now - later < 3 * 86400_000) return undefined;
  const hours = Math.floor((now - last) / 3600_000);
  return hours >= STALE_H ? hours : undefined;
}

export const postponeBackgroundHint = () => kv.set('bg.later', new Date().toISOString());
