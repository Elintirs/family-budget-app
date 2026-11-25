import type { Summary } from '../contract';
import type { Kopecks } from '../domain/money';
import { isPending, type Operation } from '../domain/operation';
import { budgetMoment, dayKey, daysLeftInMonth, DEFAULT_DAY_START_HOUR, monthKey } from '../domain/period';

export interface DailyRemainder {
  dailyLimit: Kopecks;
  spentToday: Kopecks;
  /** «Можно потратить сегодня». Может быть отрицательным. */
  remainingToday: Kopecks;
  remainingMonth: Kopecks;
  daysLeft: number;
  /** Сколько неотправленных расходов учтено в цифрах. */
  pendingCount: number;
}

/**
 * Остаток на день как в листе «Лимиты на месяц»:
 * лимит на день = (лимит месяца − потрачено до сегодня) / дней до конца месяца, включая сегодня.
 * Поверх цифр таблицы добавляем расходы, которые ещё не отправлены.
 * Если сводка вчерашняя, её «сегодня» переезжает в «до сегодня»; если прошлого месяца, начинаем месяц с нуля.
 */
export function dailyRemainder(
  summary: Summary,
  operations: Operation[],
  now: Date,
  /** Категория подкатегории из «Справочника»: нужна, чтобы не считать в лимит «Обязательные» и «Крупные». */
  groupOf: (subcategory: string) => string | undefined = () => undefined,
  /** День начинается в этот час: ночные покупки относятся к вчера. */
  dayStartHour = DEFAULT_DAY_START_HOUR,
): DailyRemainder {
  const shift = (d: Date) => budgetMoment(d, dayStartHour);
  const asOf = shift(new Date(summary.asOf));
  const bnow = shift(now);
  const today = dayKey(bnow);
  const month = monthKey(bnow);

  let spentBefore = 0;
  let spentToday = 0;
  if (monthKey(asOf) === month) {
    spentBefore = summary.spentMonthBeforeToday;
    if (dayKey(asOf) === today) spentToday = summary.spentToday;
    else spentBefore += summary.spentToday;
  }

  // Старый кэш на телефоне может быть без поля.
  const limitGroups = summary.limitGroups ?? [];
  let pendingCount = 0;
  for (const op of operations) {
    if (op.kind !== 'expense' || !isPending(op)) continue;
    if (limitGroups.length) {
      const group = op.subcategory ? groupOf(op.subcategory) : undefined;
      // Неразмеченную трату считаем в лимит: лучше показать меньше, чем больше.
      if (group && !limitGroups.includes(group)) continue;
    }
    const at = shift(new Date(op.occurredAt));
    if (monthKey(at) !== month) continue;
    pendingCount++;
    if (dayKey(at) === today) spentToday += op.amount;
    else spentBefore += op.amount;
  }

  const daysLeft = daysLeftInMonth(bnow);
  const remainingBefore = summary.monthLimit - spentBefore;
  const dailyLimit = Math.floor(remainingBefore / daysLeft);
  return {
    dailyLimit,
    spentToday,
    remainingToday: dailyLimit - spentToday,
    remainingMonth: remainingBefore - spentToday,
    daysLeft,
    pendingCount,
  };
}
