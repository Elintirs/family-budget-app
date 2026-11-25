const pad = (n: number) => String(n).padStart(2, '0');

/** «2026-10-05» в локальной зоне телефона. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** «2026-10». */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Сколько дней осталось в месяце, включая сегодняшний (как «Остаток дней в месяце» в таблице). */
export function daysLeftInMonth(d: Date): number {
  return daysInMonth(d) - d.getDate() + 1;
}

/**
 * «Бюджетный» день начинается не в полночь, а в dayStartHour (по умолчанию 05:00):
 * покупка в 01:30 относится к предыдущему дню. Возвращает момент, сдвинутый так,
 * чтобы обычные dayKey/monthKey дали бюджетный день.
 */
export const DEFAULT_DAY_START_HOUR = 5;

export function budgetMoment(d: Date, dayStartHour = DEFAULT_DAY_START_HOUR): Date {
  return new Date(d.getTime() - dayStartHour * 3600 * 1000);
}

/** Бюджетная дата операции (00:00 локально), если она отличается от календарной; иначе undefined. */
export function shiftedOperationDate(d: Date, dayStartHour = DEFAULT_DAY_START_HOUR): Date | undefined {
  const b = budgetMoment(d, dayStartHour);
  if (dayKey(b) === dayKey(d)) return undefined;
  return new Date(b.getFullYear(), b.getMonth(), b.getDate());
}

/** Текущий бюджетный месяц «2026-11»: 1-го числа до 05:00 это ещё прошлый месяц, как на Главной и в лимитах. */
export function currentMonthKey(now: Date = new Date(), dayStartHour = DEFAULT_DAY_START_HOUR): string {
  return monthKey(budgetMoment(now, dayStartHour));
}

/** Текущий бюджетный день: сдвинутый момент для daysInMonth, getDate и подобного. */
export function budgetNow(now: Date = new Date(), dayStartHour = DEFAULT_DAY_START_HOUR): Date {
  return budgetMoment(now, dayStartHour);
}
