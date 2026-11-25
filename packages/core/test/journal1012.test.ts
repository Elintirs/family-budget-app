import { describe, expect, it } from 'vitest';
import {
  accountForNotification,
  exactAccount,
  limitsBrief,
  unsentEffect,
  ingestNotifications,
  joinAccountTags,
  splitAccountTags,
  type Operation,
  type RawNotification,
} from '../src';

/** Пуши из журнала Елены 12.10: второй счёт Т-Банка, ожидание такси, повтор старой покупки Mir Pay. */
const accounts = [
  { id: 'Т-Банк', name: 'Т-Банк', cardMasks: ['*3303', '*4404', '*9915'], markers: [] },
  { id: 'Т-Банк 2', name: 'Т-Банк 2', cardMasks: [], markers: ['счет RUB'] },
];
const ctx = {
  author: 'Елена',
  newId: () => 'op',
  accountFor: (_pkg: string, label: string | undefined, cardMask: string | undefined, text: string) =>
    accountForNotification(accounts, { cardMask, text, appLabel: label }) ?? 'Т-Банк',
  exactAccountFor: (cardMask: string | undefined, text: string) => exactAccount(accounts, { cardMask, text }),
};
const manualOp = (id: string, amount: number, at: string): Operation => ({
  id,
  kind: 'expense',
  amount,
  occurredAt: at,
  accountId: 'Т-Банк',
  source: 'manual',
  author: 'Елена',
  status: 'synced',
});
const raw = (package_: string, title: string, text: string, at: string): RawNotification => ({
  id: `${package_}:${title}:${text}`,
  package: package_,
  postedAt: Date.parse(at),
  title,
  text,
});

describe('счёт по уведомлению', () => {
  it('«счет RUB» без карты уходит на второй счёт вместе с остатком', () => {
    const r = ingestNotifications(
      [
        raw(
          'com.idamob.tinkoff.android',
          'ВТБ',
          'Пополнение на 73 499 ₽, счет RUB. Олег Д.\nДоступно 74 360,32 ₽',
          '2026-10-12T16:42:00Z',
        ),
      ],
      [],
      ctx,
    );
    expect(r.operations[0]).toMatchObject({ kind: 'income', amount: 7349900, accountId: 'Т-Банк 2' });
    expect(r.balances[0]).toMatchObject({ accountId: 'Т-Банк 2', available: 7436032 });
  });

  it('карта *3303 остаётся на совместном, хотя в тексте «счет карты»', () => {
    const r = ingestNotifications(
      [
        raw(
          'com.idamob.tinkoff.android',
          'Сбербанк',
          'Перевод на 25 000 ₽, счет карты *3303. Ольга И.\nБаланс 21 200,15 ₽',
          '2026-10-11T13:06:37Z',
        ),
      ],
      [],
      ctx,
    );
    expect(r.operations[0]).toMatchObject({ accountId: 'Т-Банк' });
  });

  it('ё и регистр не мешают узнать счёт', () => {
    expect(accountForNotification(accounts, { text: 'Перевод на 10 ₽, СЧЁТ RUB.' })).toBe('Т-Банк 2');
  });

  it('колонка «Маски карт»: маски и слова', () => {
    expect(splitAccountTags('*3303 *4404, 9915; счет RUB')).toEqual({
      cardMasks: ['*3303', '*4404', '*9915'],
      markers: ['счет RUB'],
      owners: {},
    });
    expect(joinAccountTags(['3303'], ['счет RUB'])).toBe('*3303, счет RUB');
  });
});

describe('не операции', () => {
  it('«Платное ожидание» Яндекс Go не трата, «Стоимость» трата', () => {
    const r = ingestNotifications(
      [
        raw('ru.yandex.taxi', 'Платное ожидание 19₽', '', '2026-10-12T06:09:08Z'),
        raw('ru.yandex.taxi', 'Стоимость: 591₽', 'Оцените поездку', '2026-10-12T06:21:51Z'),
      ],
      [],
      ctx,
    );
    expect(r.operations).toHaveLength(1);
    expect(r.operations[0]).toMatchObject({ amount: 59100, merchant: 'Яндекс Go' });
    expect(r.links.map((l) => l.note)).toContain('не списание (сервис)');
  });

  it('Mir Pay показал покупку двухдневной давности: время из текста, внесённая руками её забирает', () => {
    const late = [
      raw(
        'ru.nspk.mirpay',
        'Оплата покупки',
        'Сумма 507 ₽. 10.10.2026, 17:55. Карта Mir  • • • • 9915',
        '2026-10-12T16:45:41Z',
      ),
      raw(
        'ru.nspk.mirpay',
        'Оплата покупки',
        'Сумма 59,99 ₽. 12.10.2026, 18:45. Карта Mir  • • • • 9915',
        '2026-10-12T16:45:41Z',
      ),
    ];
    // Никто не вносил: операция создаётся, но на 10.10, а не на день пуша.
    const alone = ingestNotifications(late, [], ctx);
    expect(alone.operations.map((o) => o.amount)).toEqual([50700, 5999]);
    expect(new Date(alone.operations[0]!.occurredAt).getDate()).toBe(10);
    expect(alone.links[0]!.note).toBe('создана по дате из текста, проверь');

    // Елена внесла «Дядя Вампир» 507 ₽ руками 10.10 в 19:16: пуш привязывается к ней.
    const manual507 = manualOp('m507', 50700, '2026-10-10T16:16:00Z');
    const r = ingestNotifications(late, [manual507], ctx);
    expect(r.operations.map((o) => o.amount)).toEqual([5999]);
    expect(r.links.find((l) => l.operationId === 'm507')?.note).toBe('уже внесено руками');
  });
});

describe('пуш и внесённое руками', () => {
  it('«Аренда» руками, через час пуш Т-Банка: одна операция', () => {
    const rent = manualOp('rent', 2500000, '2026-10-11T12:54:29Z');
    const push = raw(
      'com.idamob.tinkoff.android',
      'Сбербанк',
      'Перевод на 25 000 ₽, счет карты *3303. Ольга И.\nБаланс 21 200,15 ₽',
      '2026-10-11T13:06:37Z',
    );
    const r = ingestNotifications([push], [rent], ctx);
    expect(r.operations).toHaveLength(0);
    expect(r.links[0]).toMatchObject({ operationId: 'rent', note: 'уже внесено руками' });
  });

  it('ручная забирает один пуш: вторая такая же покупка остаётся операцией', () => {
    const coffee = manualOp('coffee', 15000, '2026-10-12T08:00:00Z');
    const r = ingestNotifications(
      [
        raw(
          'com.idamob.tinkoff.android',
          'Кофейня',
          'Покупка на 150 ₽, счет карты *3303',
          '2026-10-12T08:01:00Z',
        ),
        raw(
          'com.idamob.tinkoff.android',
          'Кофейня',
          'Покупка на 150 ₽, счет карты *3303 ',
          '2026-10-12T08:20:00Z',
        ),
      ],
      [coffee],
      ctx,
    );
    expect(r.operations).toHaveLength(1);
  });

  it('другой счёт или прошло больше 12 часов: не склеиваем', () => {
    const r = ingestNotifications(
      [raw('com.idamob.tinkoff.android', 'Т', 'Покупка на 150 ₽, счет карты *3303', '2026-10-12T21:00:00Z')],
      [
        manualOp('a', 15000, '2026-10-12T08:00:00Z'),
        { ...manualOp('b', 15000, '2026-10-12T20:00:00Z'), accountId: 'Т-Банк 2' },
      ],
      ctx,
    );
    expect(r.operations).toHaveLength(1);
  });
});

describe('реклама и «счет RUB.»', () => {
  it('реклама Сбера с суммой и реклама ВТБ не операции', () => {
    const r = ingestNotifications(
      [
        raw(
          'ru.sberbankmobile',
          '🚀 Полезная привычка — копить!',
          'Олег, начните со 100 ₽ ежемесячно — откройте ИнвестКопилку и откладывайте на желания, не отвлекаясь от дел.',
          '2026-10-12T07:01:19Z',
        ),
        raw(
          'ru.vtb24.mobilebanking.android',
          'Попробуйте и вы😉',
          'Тысячи клиентов уже пользуются кредитной картой ВТБ для любых покупок. Оформить можно за 1 минуту, лимит до 1 000 000 ₽',
          '2026-10-11T13:10:00Z',
        ),
      ],
      [],
      ctx,
    );
    expect(r.operations).toHaveLength(0);
  });

  it('«счет RUB.» не магазин: остаётся отправитель', () => {
    const r = ingestNotifications(
      [
        raw(
          'com.idamob.tinkoff.android',
          'ВТБ',
          'Пополнение на 73 499 ₽, счет RUB. Олег Д.',
          '2026-10-12T16:42:00Z',
        ),
        raw(
          'com.idamob.tinkoff.android',
          '',
          'Перевод на 71 499 ₽, счет RUB.\nБаланс 2 861,32 ₽',
          '2026-10-12T16:43:28Z',
        ),
      ],
      [],
      ctx,
    );
    expect(r.operations.map((o) => o.merchant ?? null)).toEqual(['Олег Д.', null]);
    expect(r.operations.map((o) => o.accountId)).toEqual(['Т-Банк 2', 'Т-Банк 2']);
  });
});

describe('снимки и дополнение из дублей', () => {
  const push = raw(
    'com.idamob.tinkoff.android',
    'Покупка',
    'Покупка на 500 ₽, счет карты *3303\nДоступно 10 000 ₽',
    '2026-11-04T10:00:00Z',
  );

  it('без карты и слова снимок не пишется, даже если счёт нашёлся по умолчанию', () => {
    const r = ingestNotifications(
      [
        raw(
          'com.idamob.tinkoff.android',
          'Покупка',
          'Покупка на 500 ₽\nДоступно 10 000 ₽',
          '2026-11-04T10:00:00Z',
        ),
      ],
      [],
      ctx,
    );
    expect(r.operations[0]).toMatchObject({ accountId: 'Т-Банк' });
    expect(r.balances).toEqual([]);
  });

  it('поздняя SMS: снимок пишется, в операцию идут магазин, карта, счёт и текст', () => {
    const mirPay = ingestNotifications(
      [
        raw(
          'ru.nspk.mirpay',
          'Оплата покупки',
          'Сумма 500 ₽. 04.11.2026, 13:00. Карта Mir  • • • • 7777',
          '2026-11-04T10:00:00Z',
        ),
      ],
      [],
      ctx,
    ).operations[0]!;
    const op = { ...mirPay, accountId: 'Т-Банк', status: 'synced' as const };
    const sms = raw(
      'com.android.mms',
      'T-Bank',
      'Покупка 500 ₽. Кафе. счет RUB. Доступно 1 240 ₽',
      '2026-11-04T10:05:00Z',
    );
    const r = ingestNotifications([sms], [op], ctx);
    expect(r.operations).toEqual([]);
    expect(r.balances).toEqual([
      { accountId: 'Т-Банк 2', at: '2026-11-04T10:05:00.000Z', available: 124000 },
    ]);
    expect(r.enrich[0]).toMatchObject({ operationId: op.id, patch: { accountId: 'Т-Банк 2' } });
    expect(r.enrich[0]!.patch.merchant).toBeTruthy();
    expect(r.enrich[0]!.patch.sourceText).toContain('Сумма 500');
    expect(r.enrich[0]!.patch.sourceText).toContain('Кафе');
  });

  it('точно определённый счёт и готовый магазин дубль не перезаписывает', () => {
    const first = ingestNotifications([push], [], ctx).operations[0]!;
    const op = { ...first, merchant: 'Пятёрочка' };
    const sms = raw('com.android.mms', 'T-Bank', 'Покупка 500 ₽. Кафе. счет RUB', '2026-11-04T10:05:00Z');
    const patch = ingestNotifications([sms], [op], ctx).enrich[0]!.patch;
    expect(patch.merchant).toBeUndefined();
    expect(patch.accountId).toBeUndefined();
    expect(patch.sourceText).toContain('Кафе');
  });

  it('ручная операция: счёт человека не меняется, остаток из пуша пишется', () => {
    const manual = {
      id: 'm1',
      kind: 'expense' as const,
      amount: 50000,
      occurredAt: '2026-11-04T09:50:00.000Z',
      accountId: 'Наличные',
      source: 'manual' as const,
      author: 'Елена',
      status: 'ready' as const,
    };
    const r = ingestNotifications(
      [
        raw(
          'com.idamob.tinkoff.android',
          'Покупка',
          'Покупка на 500 ₽, Кафе. Доступно 10 000 ₽',
          '2026-11-04T10:00:00Z',
        ),
      ],
      [{ ...manual, accountId: undefined }],
      ctx,
    );
    expect(r.operations).toEqual([]);
    const withAccount = ingestNotifications([push], [manual], { ...ctx });
    expect(withAccount.balances[0]).toMatchObject({ accountId: 'Т-Банк', available: 1000000 });
    expect(r.enrich[0]!.patch.sourceText).toContain('Кафе');
  });

  it('неотправленные операции входят в расчёт на момент снимка, более поздние нет', () => {
    const base = {
      kind: 'expense' as const,
      amount: 50000,
      accountId: 'Т-Банк',
      source: 'notification' as const,
      author: 'А',
    };
    const ops = [
      { ...base, id: '1', occurredAt: '2026-11-04T09:00:00Z', status: 'new' as const },
      { ...base, id: '2', occurredAt: '2026-11-04T11:00:00Z', status: 'ready' as const },
      { ...base, id: '3', occurredAt: '2026-11-04T08:00:00Z', status: 'synced' as const },
    ];
    expect(unsentEffect(ops, 'Т-Банк', '2026-11-04T10:00:00Z')).toBe(-50000);
    expect(unsentEffect(ops, 'Т-Банк')).toBe(-100000);
  });

  it('сводка лимитов для свёрнутого списка', () => {
    const l = (spent: number) => ({ name: 'x', limit: 100, spent, left: 100 - spent, ratio: spent / 100 });
    expect(limitsBrief([l(110), l(90), l(10)])).toEqual({ over: 1, near: 1 });
  });
});
