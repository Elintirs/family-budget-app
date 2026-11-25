import {
  planReminders,
  withTable,
  type Analytics,
  type Bootstrap,
  type Operation,
  type ReminderToggles,
} from '@budget/core';
import Constants from 'expo-constants';
import { kv } from './db';
import { log } from './log';
import { listener } from './notifications';
import { pendingEdits, savedMirror } from './edits';

const TOGGLES: (keyof ReminderToggles)[] = ['limits', 'recurring', 'month', 'update'];

/** Переключатели «Настройки → Уведомления», по умолчанию всё включено. */
export function reminderToggles(): ReminderToggles {
  return Object.fromEntries(
    TOGGLES.map((k) => [k, kv.get(`remind.${k}`) !== '0']),
  ) as unknown as ReminderToggles;
}

export function setReminderToggle(k: keyof ReminderToggles, on: boolean) {
  kv.set(`remind.${k}`, on ? '1' : '0');
}

/**
 * Показать то, что пора напомнить и ещё не показывали (ключи показанных хранятся на телефоне).
 * Вызывается при открытии приложения, после обновления данных и в фоновой задаче.
 */
export function runReminders(
  boot: Bootstrap,
  analytics: Analytics | undefined,
  ops: Operation[],
  now = new Date(),
) {
  if (!listener) return 0;
  const sent = new Set(kv.getJson<string[]>('remind.sent') ?? []);
  const plan = planReminders({
    boot,
    analytics,
    ops,
    now,
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    toggles: reminderToggles(),
  }).filter((r) => !sent.has(r.key));
  for (const r of plan) {
    if (listener.notify(r.key, r.title, r.text, r.url)) sent.add(r.key);
  }
  if (plan.length) {
    // Помним последние 300: ключи с месяцем, старые не нужны.
    kv.setJson('remind.sent', [...sent].slice(-300));
    log.info('reminder', `Напоминаний: ${plan.length}`, { keys: plan.map((r) => r.key) });
  }
  return plan.length;
}

/** Для фоновой задачи: всё из кэша на телефоне, без сети. */
export function runRemindersFromCache(local: Operation[]) {
  const boot = kv.getJson<Bootstrap>('bootstrap');
  if (!boot) return 0;
  const mirror = savedMirror();
  const ops = withTable(local, mirror?.operations, mirror?.from, pendingEdits());
  return runReminders(boot, kv.getJson<Analytics>('analytics') ?? undefined, ops);
}
