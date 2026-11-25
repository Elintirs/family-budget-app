import type { Account, Bootstrap } from '@budget/core';
import { kv } from './db';

/**
 * Счёт для ручных трат и покупок, где банк не назвал карту (Mir Pay).
 * Выбор в настройках главнее; не выбран: первый дебетовый счёт из таблицы, чтобы трата не осталась без счёта.
 */
export function defaultAccountId(accounts?: Account[]): string | undefined {
  const chosen = kv.get('defaultAccount');
  if (chosen) return chosen;
  const list = accounts ?? kv.getJson<Bootstrap>('bootstrap')?.accounts ?? [];
  return list.find((a) => a.type === 'debit' && !a.hidden)?.id;
}
