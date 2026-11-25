import { describe, expect, it } from 'vitest';
import { dayKey, daysLeftInMonth, monthKey, shiftedOperationDate } from '../src';

describe('period', () => {
  const d = new Date(2026, 9, 5, 12, 41);
  it('ключи', () => {
    expect(dayKey(d)).toBe('2026-10-05');
    expect(monthKey(d)).toBe('2026-10');
  });
  it('5 октября: осталось 27 дней, как в таблице', () => expect(daysLeftInMonth(d)).toBe(27));
  it('последний день месяца', () => expect(daysLeftInMonth(new Date(2026, 9, 31))).toBe(1));

  it('бюджетный день начинается в 05:00', () => {
    expect(shiftedOperationDate(new Date(2026, 9, 5, 4, 59))).toEqual(new Date(2026, 9, 4));
    expect(shiftedOperationDate(new Date(2026, 9, 5, 5, 0))).toBeUndefined();
    expect(shiftedOperationDate(new Date(2026, 10, 1, 1, 0))).toEqual(new Date(2026, 9, 31));
  });
});
