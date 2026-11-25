import { describe, expect, it } from 'vitest';
import { ingestNotifications, parseBankText, rub, type RawNotification } from '../src';

// Тексты-образцы (синтетические, в духе банковских пушей). Настоящие добавим из журнала после теста на телефоне.
describe('parseBankText', () => {
  it('покупка с магазином и остатком', () => {
    expect(parseBankText('Т-Банк', 'Покупка 523 ₽, PYATEROCHKA. Доступно 70 112 ₽')).toMatchObject({
      amount: rub(523),
      direction: 'debit',
      merchant: 'PYATEROCHKA',
      available: rub(70112),
      confidence: 'high',
    });
  });

  it('копейки, RUB и баланс', () => {
    expect(parseBankText('ВТБ', 'Списание 1 290,00 RUB. Ресторан ВКУС. Баланс 5 000,00 RUB')).toMatchObject({
      amount: rub(1290),
      direction: 'debit',
      balance: rub(5000),
    });
  });

  it('Mir Pay: оплата с картой', () => {
    expect(parseBankText('Mir Pay', 'Оплата 349,80 ₽ Produkty Gagarina 101, карта *2202')).toMatchObject({
      amount: 34980,
      merchant: 'Produkty Gagarina 101, карта *2202',
      cardMask: '*2202',
    });
  });

  it('пополнение и перевод от человека: зачисление', () => {
    expect(parseBankText('Сбер', 'Пополнение 50 000 ₽ зарплата')?.direction).toBe('credit');
    expect(parseBankText('Т-Банк', 'Перевод от Елена Г. +1 600 ₽')?.direction).toBe('credit');
  });

  it('возврат: зачисление с пометкой', () => {
    expect(parseBankText('Т-Банк', 'Возврат 117 ₽, SAMOKAT')).toMatchObject({
      direction: 'credit',
      refund: true,
    });
  });

  it('коды подтверждения и тексты без суммы пропускаем', () => {
    expect(parseBankText('Т-Банк', 'Код подтверждения 1234. Никому не сообщайте')).toBeNull();
    expect(parseBankText('Озон', 'Скидки до 50% на всё')).toBeNull();
  });

  it('непонятное направление: low', () => {
    expect(parseBankText('Банк', '523 ₽')?.confidence).toBe('low');
  });
});

describe('ingestNotifications', () => {
  const T0 = Date.parse('2026-10-05T12:41:00+03:00');
  let n = 0;
  const ctx = {
    author: 'Олег',
    newId: () => `op${++n}`,
    accountFor: (pkg: string) => (pkg === 'com.idamob.tinkoff.android' ? 'Т-Банк' : undefined),
    exactAccountFor: (_mask: string | undefined, text: string) =>
      /Баланс|Доступно/.test(text) ? 'Т-Банк' : undefined,
  };
  const raw = (id: string, pkg: string, text: string, sec = 0): RawNotification => ({
    id,
    package: pkg,
    postedAt: T0 + sec * 1000,
    title: '',
    text,
  });

  it('банк + Mir Pay: одна операция, счёт от банка, мерчант и остаток', () => {
    const r = ingestNotifications(
      [
        raw('mir', 'ru.nspk.mirpay', 'Оплата 523 ₽ Пятёрочка'),
        raw('tb', 'com.idamob.tinkoff.android', 'Покупка 523 ₽, PYATEROCHKA. Баланс 70 112 ₽', 3),
      ],
      [],
      ctx,
    );
    expect(r.operations).toHaveLength(1);
    expect(r.operations[0]).toMatchObject({
      amount: rub(523),
      accountId: 'Т-Банк',
      kind: 'expense',
      status: 'new',
    });
    expect(r.balances).toEqual([
      { accountId: 'Т-Банк', at: new Date(T0 + 3000).toISOString(), balance: rub(70112) },
    ]);
    expect(r.links.map((l) => l.note).sort()).toEqual(['склеено', 'создана']);
  });

  it('поздний пуш Mir Pay прикрепляется к уже созданной операции', () => {
    const first = ingestNotifications(
      [raw('tb', 'com.idamob.tinkoff.android', 'Покупка 150 ₽, Кофе')],
      [],
      ctx,
    );
    const late = ingestNotifications(
      [raw('mir', 'ru.nspk.mirpay', 'Оплата 150 ₽ Кофе', 40)],
      first.operations,
      ctx,
    );
    expect(late.operations).toHaveLength(0);
    expect(late.links[0]).toMatchObject({
      operationId: first.operations[0]!.id,
      note: 'дубль уже созданной операции',
    });
  });

  it('шум не становится операцией', () => {
    const r = ingestNotifications(
      [raw('x', 'com.idamob.tinkoff.android', 'Код подтверждения 1234')],
      [],
      ctx,
    );
    expect(r.operations).toHaveLength(0);
    expect(r.links[0]!.note).toBe('не похоже на операцию');
  });
});

describe('живые пуши', () => {
  it('Mir Pay: сумма, карта, магазина нет', () => {
    const p = parseBankText('Оплата покупки', 'Сумма 364,95 ₽. 05.10.2026, 18:36. Карта Mir  • • • • 4404');
    expect(p).toMatchObject({ amount: 36495, direction: 'debit', cardMask: '*4404' });
    expect(p?.merchant).toBeUndefined();
  });
});

// Синтетические СМС в духе банков: заменим настоящими из журнала, когда придут.
describe('СМС банков', () => {
  it('Сбер: «MIR-4404 18:36 Покупка 364.95р PYATEROCHKA Баланс: 12 345.67р»', () => {
    const p = parseBankText('900', 'MIR-4404 18:36 Покупка 364.95р PYATEROCHKA Баланс: 12 345.67р');
    expect(p).toMatchObject({ amount: 36495, direction: 'debit', cardMask: '*4404', balance: 1234567 });
    expect(p?.merchant).toMatch(/^PYATEROCHKA/);
  });
  it('Т-Банк: «Покупка, карта *4404. 364.95 RUB. PYATEROCHKA. Доступно 12345.67 RUB»', () => {
    const p = parseBankText('T-Bank', 'Покупка, карта *4404. 364.95 RUB. PYATEROCHKA. Доступно 12345.67 RUB');
    expect(p).toMatchObject({ amount: 36495, direction: 'debit', cardMask: '*4404', available: 1234567 });
    expect(p?.merchant).toMatch(/^PYATEROCHKA/);
  });
});

// Настоящие пуши из журнала 10.10 (суммы и имена как есть, номера карт уже маскированы банком).
describe('живые пуши 06–09.10', () => {
  it('Т-Банк, перевод человеку: получатель и карта, без хвоста «Доступно»', () => {
    const p = parseBankText('', 'Перевод на 1 000 ₽, счет карты *1101. Данила М.\nДоступно 36 390,71 ₽');
    expect(p).toMatchObject({ amount: 100000, direction: 'debit', cardMask: '*1101', available: 3639071 });
    expect(p?.merchant).toBe('Данила М.');
  });
  it('Яндекс Go: сумма из заголовка, магазин подставит ingest по приложению', () => {
    const p = parseBankText('Стоимость: 203₽', 'Оцените поездку');
    expect(p).toMatchObject({ amount: 20300, direction: 'debit' });
  });
  it('ingest: пуш Яндекс Go становится операцией «Яндекс Go»', () => {
    const r = ingestNotifications(
      [
        {
          id: 'y1',
          package: 'ru.yandex.taxi',
          postedAt: Date.parse('2026-10-08T11:28:00Z'),
          title: 'Стоимость: 203₽',
          text: 'Оцените поездку',
        },
      ],
      [],
      { author: 'Олег', newId: () => 'op1', accountFor: () => 'Т-Банк' },
    );
    expect(r.operations[0]).toMatchObject({
      amount: 20300,
      merchant: 'Яндекс Go',
      accountId: 'Т-Банк',
      kind: 'expense',
    });
  });
});

describe('журнал 17.10: тексты Т-Банка', () => {
  it('SMS одной строкой: магазин без «Доступно»', () => {
    expect(
      parseBankText('T-Bank', 'Покупка, счет карты *1101. 4584 ₽. Кафе. Доступно 22705,78 ₽'),
    ).toMatchObject({ amount: rub(4584), direction: 'debit', merchant: 'Кафе', cardMask: '*1101' });
  });

  it('пуш приложения: магазин в заголовке, а не «кэшбэк 45 ₽, Олег Д.»', () => {
    expect(
      parseBankText(
        'Кафе',
        'Покупка на 4 584 ₽, кэшбэк 45 ₽, Олег Д., счет карты *1101\nДоступно 22 705,78 ₽',
      ),
    ).toMatchObject({ amount: rub(4584), direction: 'debit', merchant: 'Кафе', available: rub(22705.78) });
  });

  it('перевод: заголовок с банком получателя не магазин', () => {
    expect(
      parseBankText('Сбербанк', 'Перевод на 1 000 ₽, счет карты *3303. Максим Я.\nБаланс 81 142,88 ₽'),
    ).toMatchObject({ merchant: 'Максим Я.' });
  });

  it('«Отмена на» и SMS «Отмена» это возврат', () => {
    expect(
      parseBankText('Додо Пицца', 'Отмена на 2 088 ₽, Олег Д., счет карты *1101\nДоступно 46 142,88 ₽'),
    ).toMatchObject({ amount: rub(2088), direction: 'credit', refund: true, merchant: 'Додо Пицца' });
    expect(
      parseBankText('T-Bank', 'Отмена, счет карты *1101. 2088 ₽. Додо Пицца. Доступно 46142,88 ₽'),
    ).toMatchObject({ direction: 'credit', refund: true, merchant: 'Додо Пицца' });
  });

  it('реклама кредита не трата', () => {
    expect(
      parseBankText(
        'Одобрили до 215 000 ₽',
        'Возьмите кредит под залог авто — оставить заявку можно за пару кликов. Подробности 📲',
      ),
    ).toBeNull();
  });
});

describe('журнал 17.10: Кубышка', () => {
  it('перевод в Кубышку и из неё не операция', () => {
    expect(parseBankText('Т-Банк', 'Перевод в Кубышку 35 000 ₽, счет RUB\nБаланс: 1 542,42 ₽')).toBeNull();
    expect(parseBankText('Т-Банк', 'Перевод из Кубышки 40 000 ₽, счет RUB\nБаланс: 41 542,42 ₽')).toBeNull();
  });
});

describe('журнал 23.10', () => {
  it('Mir Pay «Отказано банком» не списание', () => {
    expect(
      parseBankText('Отказано банком', 'Сумма 319,98 ₽. 20.10.2026, 17:53. Карта Mir  • • • • 5505'),
    ).toBeNull();
  });

  it('реклама НПФ ВТБ с суммой не трата', () => {
    expect(
      parseBankText(
        'Добивайтесь целей с ВТБ',
        'Участвуйте в Программе долгосрочных сбережений от НПФ ВТБ: софинансирование от государства до 36 000 ₽ в год',
      ),
    ).toBeNull();
  });

  it('«с карты МИР7707» даёт маску карты (кириллица без \\b)', () => {
    expect(parseBankText('900', 'Оплата 650р с карты МИР7707 исполнен. Комиссия 0р.')?.cardMask).toBe(
      '*7707',
    );
  });
});

describe('журнал 23.10: опоздавший Mir Pay к SMS трёхдневной давности', () => {
  it('пуш 23.10 про покупку 20.10 привязывается к уже отправленной SMS-операции', () => {
    const sms: import('../src').Operation = {
      id: 'sms',
      kind: 'expense',
      amount: rub(319.98),
      occurredAt: '2026-10-20T15:59:06.000Z',
      accountId: 'Т-Банк',
      source: 'notification',
      sourceApp: 'com.google.android.apps.messaging',
      author: 'Олег',
      status: 'synced',
    };
    const raw: RawNotification = {
      id: 'late',
      package: 'ru.nspk.mirpay',
      notificationKey: 'late',
      // Местное время телефона в тексте; в тесте пояс UTC+2, как в Калининграде.
      postedAt: Date.parse('2026-10-23T11:59:38Z'),
      title: 'Оплата покупки',
      text: `Сумма 319,98 ₽. ${new Date('2026-10-20T15:53:00Z').toLocaleDateString('ru-RU')}, ${String(new Date('2026-10-20T15:53:00Z').getHours()).padStart(2, '0')}:${String(new Date('2026-10-20T15:53:00Z').getMinutes()).padStart(2, '0')}. Карта Mir  • • • • 4404`,
    };
    const r = ingestNotifications([raw], [sms], {
      author: 'Олег',
      newId: () => 'x',
      accountFor: () => 'Т-Банк',
    });
    expect(r.operations).toHaveLength(0);
    expect(r.links[0]).toMatchObject({ operationId: 'sms', note: 'дубль уже созданной операции' });
  });
});
