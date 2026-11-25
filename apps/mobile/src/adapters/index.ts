import type { Clock, SheetApi } from '@budget/core';
import { fakeSheetApi } from './fakeSheetApi';
import { getConnection } from './connection';
import { createGasApi } from './gasApi';

export { sqliteRepo as repo } from './sqliteRepo';
export { kv } from './db';
export { defaultAccountId } from './defaultAccount';
export { log } from './log';

/**
 * Таблица: адрес и ключ берутся из подключения при каждом запросе, поэтому подключение по ссылке
 * в онбординге начинает работать сразу, без перезапуска. Без подключения и без .env: заглушка (разработка).
 */
const devFake = !process.env.EXPO_PUBLIC_API_URL;
function current(): SheetApi {
  const c = getConnection();
  if (c) return createGasApi(c.url, c.token);
  if (devFake) return fakeSheetApi;
  throw new Error('Телефон не подключён к таблице: вставь ссылку подключения');
}
export const api: SheetApi = {
  bootstrap: () => current().bootstrap(),
  rev: () => current().rev(),
  pull: (rev, from) => current().pull(rev, from),
  operations: (from) => current().operations(from),
  sync: (r) => current().sync(r),
  balanceFacts: (f) => current().balanceFacts(f),
  analytics: () => current().analytics(),
  setMonthLimit: (l) => current().setMonthLimit(l),
  setSubcategoryLimit: (n, l) => current().setSubcategoryLimit(n, l),
  upsertSubcategory: (n, g) => current().upsertSubcategory(n, g),
  setSubcategoryHidden: (n, h) => current().setSubcategoryHidden(n, h),
  setSubcategoryOneOff: (n, o) => current().setSubcategoryOneOff(n, o),
  upsertRecurring: (r) => current().upsertRecurring(r),
  deleteRecurring: (id) => current().deleteRecurring(id),
  setGroupLimit: (g, l) => current().setGroupLimit(g, l),
  upsertGoal: (g) => current().upsertGoal(g),
  deleteGoal: (id) => current().deleteGoal(id),
  setAccountSettings: (s) => current().setAccountSettings(s),
  balanceHistory: (a) => current().balanceHistory(a),
  debtHistory: () => current().debtHistory(),
  invite: (a) => current().invite(a),
};
export const apiKind = (): 'gas' | 'fake' | 'none' => (getConnection() ? 'gas' : devFake ? 'fake' : 'none');
export const clock: Clock = { now: () => new Date() };

