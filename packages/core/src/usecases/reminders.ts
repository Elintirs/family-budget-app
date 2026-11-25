import type { Analytics, Bootstrap } from '../contract';
import { formatRub } from '../domain/money';
import type { Operation } from '../domain/operation';
import { budgetMoment, monthKey } from '../domain/period';
import { categoryLimits, groupLimits, limitWarnings } from './categoryLimits';
import { monthSummary, previousMonth } from './plans';
import { recurringStatus } from './recurringStatus';

export interface Reminder {
  /** Уникален в пределах события: показанное с этим ключом не повторяем. */
  key: string;
  title: string;
  text: string;
  url: string;
}

export interface ReminderToggles {
  limits: boolean;
  recurring: boolean;
  month: boolean;
  update: boolean;
}

const MONTHS_GEN = [
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
const rub = (k: number) => formatRub(k, { whole: true });

/** «0.10.2» > «0.9.9»: по числам. */
export function newerVersion(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/**
 * Что напомнить сейчас: лимиты на 80% и 100% (по разу в месяц), регулярный платёж накануне срока
 * (с 18:00), итоги прошлого месяца в первые три дня, новая версия приложения. Повторы отсекает
 * вызывающий по key.
 */
export function planReminders(p: {
  boot: Bootstrap;
  analytics?: Analytics;
  ops: Operation[];
  now: Date;
  appVersion: string;
  toggles: ReminderToggles;
}): Reminder[] {
  const { boot, analytics, ops, now, toggles } = p;
  const out: Reminder[] = [];
  const key = monthKey(budgetMoment(now));
  const month = analytics?.months.find((m) => m.month === key);

  if (toggles.limits) {
    const groupOf = new Map(boot.subcategories.map((s) => [s.name, s.group]));
    const list = limitWarnings([
      ...groupLimits(boot.groupLimits, month, ops, (n) => groupOf.get(n), now),
      ...categoryLimits(boot.subcategories, month, ops, now),
    ]);
    for (const l of list) {
      const level = l.ratio >= 1 ? 100 : 80;
      out.push({
        key: `limit:${key}:${l.name}:${level}`,
        title:
          level === 100 ? `${l.name}: лимит превышен` : `${l.name}: ${Math.round(l.ratio * 100)}% лимита`,
        text:
          level === 100
            ? `Потрачено ${rub(l.spent)} из ${rub(l.limit)}, сверху ${rub(-l.left)}.`
            : `Осталось ${rub(l.left)} из ${rub(l.limit)} до конца месяца.`,
        url: 'budget://limits',
      });
    }
  }

  if (toggles.recurring && now.getHours() >= 18) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    for (const s of recurringStatus(boot.recurring, ops, now)) {
      if (s.paidBy) continue;
      const due = new Date(s.dueAt);
      if (due.toDateString() !== tomorrow.toDateString()) continue;
      const from = s.rule.accountId ? ` с ${s.rule.accountId}` : '';
      out.push({
        key: `rec:${key}:${s.rule.id}`,
        title: `Завтра списание: ${s.rule.name}`,
        text: `${rub(s.rule.amount)}${from}.`,
        url: 'budget://recurring',
      });
    }
  }

  if (toggles.month && budgetMoment(now).getDate() <= 3) {
    const prevKey = previousMonth(key);
    const prev = analytics?.months.find((m) => m.month === prevKey);
    if (prev) {
      const s = monthSummary(prev, boot.summary.monthLimit, boot.subcategories, boot.summary.limitGroups);
      const m = Number(prevKey.slice(5, 7)) - 1;
      const over = s.everyday > s.limit ? ` из ${rub(s.limit)} лимита` : `, в лимите ${rub(s.limit)}`;
      const subs = s.over.length ? ` Вышли за лимит: ${s.over.map((o) => o.name).join(', ')}.` : '';
      out.push({
        key: `month:${prevKey}`,
        title: `Итоги ${MONTHS_GEN[m]}`,
        text: `Потрачено ${rub(s.everyday)}${over}.${subs}`,
        url: `budget://month-summary?month=${prevKey}`,
      });
    }
  }

  if (toggles.update && boot.latestApp && newerVersion(boot.latestApp.version, p.appVersion)) {
    out.push({
      key: `update:${boot.latestApp.version}`,
      title: `Вышла версия ${boot.latestApp.version}`,
      text: boot.latestApp.notes || 'Нажми, чтобы скачать и установить.',
      url: 'budget://',
    });
  }
  return out;
}
