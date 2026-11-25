import { describe, expect, it } from 'vitest';
import { formatAmountInput, formatRub, parseRub, rub } from '../src';

describe('parseRub', () => {
  it.each([
    ['1 355,00', 135500],
    ['1355.5', 135550],
    ['−523 ₽', -52300],
    ['Списание 1 290,00 RUB', 129000],
    ['50 000р.', 5000000],
  ])('%s', (text, expected) => expect(parseRub(text)).toBe(expected));

  it('нет суммы', () => expect(parseRub('Код подтверждения')).toBeNull());
});

describe('formatRub', () => {
  it('целые рубли с разрядами', () => expect(formatRub(rub(70654))).toBe('70 654 ₽'));
  it('копейки', () => expect(formatRub(135550)).toBe('1 355,50 ₽'));
  it('минус', () => expect(formatRub(-rub(523))).toBe('−523 ₽'));
  it('итоговая цифра без копеек', () =>
    expect(formatRub(62093606, { whole: true })).toBe('620\u00A0936\u00A0₽'));
  it('плюс по запросу', () => expect(formatRub(rub(50000), { sign: true })).toBe('+50 000 ₽'));
});

describe('formatAmountInput', () => {
  const nb = (s: string) => s.replace(/\u00A0/g, ' ');
  it('разбивает тысячи пробелами по мере ввода', () => {
    expect(nb(formatAmountInput('1355'))).toBe('1 355');
    expect(nb(formatAmountInput('1 3555'))).toBe('13 555');
    expect(nb(formatAmountInput('1000000'))).toBe('1 000 000');
  });
  it('копейки через запятую, точка становится запятой, не больше двух знаков', () => {
    expect(nb(formatAmountInput('1355.5'))).toBe('1 355,5');
    expect(nb(formatAmountInput('1355,567'))).toBe('1 355,56');
    expect(formatAmountInput(',5')).toBe('0,5');
    expect(formatAmountInput('12,')).toBe('12,');
  });
  it('мусор и ведущие нули убирает, обратно разбирается parseRub', () => {
    expect(formatAmountInput('007')).toBe('7');
    expect(formatAmountInput('12a3₽')).toBe('123');
    expect(formatAmountInput('')).toBe('');
    expect(parseRub(formatAmountInput('1355,5'))).toBe(135550);
    expect(parseRub(formatAmountInput('-1500'))).toBe(-150000);
  });
});
