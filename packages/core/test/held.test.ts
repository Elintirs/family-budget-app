import { describe, expect, it } from 'vitest';
import {
  cardOwner,
  HOLD_MS,
  ingestNotifications,
  joinAccountTags,
  resolveHeld,
  rub,
  splitAccountTags,
  type Operation,
  type RawNotification,
} from '../src';

describe('владельцы карт в «Масках карт»', () => {
  it('«*1101 Олег, *3303 Елена, счет RUB» разбирается и собирается обратно', () => {
    const t = splitAccountTags('*1101 Олег, *3303 Елена, 4404, счет RUB');
    expect(t).toEqual({
      cardMasks: ['*1101', '*3303', '*4404'],
      markers: ['счет RUB'],
      owners: { '*1101': 'Олег', '*3303': 'Елена' },
    });
    expect(joinAccountTags(t.cardMasks, t.markers, t.owners)).toBe(
      '*1101 Олег, *3303 Елена, *4404, счет RUB',
    );
    // Старый формат без владельцев не меняется.
    expect(splitAccountTags('*2202 *1234').owners).toEqual({});
    expect(cardOwner([{ cardOwners: t.owners }], '*1101')).toBe('Олег');
  });
});

describe('журнал 17.10: покупка Олега на телефоне Елены', () => {
  const raw = (id: string, pkg: string, title: string, text: string, at: string): RawNotification => ({
    id,
    package: pkg,
    appLabel: 'Т-Банк',
    notificationKey: id,
    postedAt: Date.parse(at),
    title,
    text,
  });
  const owners: Record<string, string> = { '*1101': 'Олег', '*3303': 'Елена' };
  const ctx = (author: string) => ({
    author,
    newId: (() => {
      let i = 0;
      return () => `op${++i}`;
    })(),
    accountFor: () => 'Т-Банк',
    exactAccountFor: () => 'Т-Банк',
    cardOwner: (m: string) => owners[m],
  });
  const kafe = [
    raw(
      'push',
      'com.idamob.tinkoff.android',
      'Кафе',
      'Покупка на 4 584 ₽, кэшбэк 45 ₽, Олег Д., счет карты *1101\nДоступно 22 705,78 ₽',
      '2026-10-17T10:27:36Z',
    ),
    raw(
      'sms',
      'com.android.mms',
      'T-Bank',
      'Покупка, счет карты *1101. 4584 ₽. Кафе. Доступно 22705,78 ₽',
      '2026-10-17T10:32:33Z',
    ),
  ];

  it('у Елены: пуш и SMS склеены в одну, и она отложена до телефона Олега', () => {
    const r = ingestNotifications(kafe, [], ctx('Елена'));
    expect(r.operations).toHaveLength(0);
    expect(r.held).toHaveLength(1);
    expect(r.held[0]).toMatchObject({ amount: rub(4584), merchant: 'Кафе', heldFor: 'Олег' });
    // Остаток из пуша всё равно в снимки.
    expect(r.balances).toHaveLength(1);
  });

  it('у Олега: своя карта, обычная операция', () => {
    const r = ingestNotifications(kafe, [], ctx('Олег'));
    expect(r.operations).toHaveLength(1);
    expect(r.held).toHaveLength(0);
  });

  it('Елена своей картой *3303: обычная операция', () => {
    const r = ingestNotifications(
      [
        raw(
          'spar',
          'com.android.mms',
          'T-Bank',
          'Покупка, счет карты *3303. 189,99 ₽. SPAR. Доступно 34553,58 ₽',
          '2026-10-16T17:50:05Z',
        ),
      ],
      [],
      ctx('Елена'),
    );
    expect(r.operations).toHaveLength(1);
  });
});

describe('resolveHeld', () => {
  const at = Date.parse('2026-10-17T10:27:36Z');
  const held: Operation = {
    id: 'h',
    kind: 'expense',
    amount: rub(4584),
    occurredAt: new Date(at).toISOString(),
    accountId: 'Т-Банк',
    source: 'notification',
    author: 'Елена',
    status: 'new',
    heldFor: 'Олег',
  };
  const row = (extra: Partial<Operation>): Operation => ({
    ...held,
    id: 'row',
    author: 'Олег',
    status: 'synced',
    heldFor: undefined,
    ...extra,
  });

  it('Олег отправил SMS через 5 минут: отложенная выбрасывается', () => {
    const r = resolveHeld([held], [row({ occurredAt: new Date(at + 297_000).toISOString() })], at + 3600_000);
    expect(r.matched).toEqual([{ id: 'h', twinId: 'row' }]);
    expect(r.keep).toHaveLength(0);
  });

  it('внёс руками через 3 часа: тоже совпадение', () => {
    const r = resolveHeld(
      [held],
      [row({ source: 'manual', occurredAt: new Date(at + 3 * 3600_000).toISOString() })],
      at + 4 * 3600_000,
    );
    expect(r.matched).toHaveLength(1);
  });

  it('строка Елены или другая сумма не считается; через 6 часов отложенная идёт во «Входящие»', () => {
    const table = [row({ author: 'Елена' }), row({ id: 'r2', amount: rub(4585) })];
    expect(resolveHeld([held], table, at + 3600_000).keep).toHaveLength(1);
    expect(resolveHeld([held], table, at + HOLD_MS).release).toHaveLength(1);
  });
});

describe('карта в операции', () => {
  it('у склеенной покупки маска банка, а не Mir Pay', () => {
    const r = ingestNotifications(
      [
        {
          id: 'mir',
          package: 'ru.nspk.mirpay',
          postedAt: Date.parse('2026-10-23T12:12:36Z'),
          title: 'Оплата покупки',
          text: 'Сумма 38 ₽. Карта Mir  • • • • 4404',
        },
        {
          id: 'sms',
          package: 'com.google.android.apps.messaging',
          postedAt: Date.parse('2026-10-23T12:18:03Z'),
          title: 'T-Bank',
          text: 'Покупка, счет карты *1101. 38 ₽. Транском. Доступно 98,24 ₽',
        },
      ],
      [],
      { author: 'Олег', newId: () => 'op', accountFor: () => 'Т-Банк' },
    );
    expect(r.operations).toHaveLength(1);
    expect(r.operations[0]).toMatchObject({ cardMask: '*1101', merchant: 'Транском' });
  });
});

describe('resolveHeld со старым зеркалом', () => {
  it('сети не было: не отпускаем, пока зеркало не покроет срок ожидания', () => {
    const at = Date.parse('2026-10-22T11:53:31Z');
    const op: Operation = {
      id: 'h',
      kind: 'expense',
      amount: rub(468),
      occurredAt: new Date(at).toISOString(),
      source: 'notification',
      author: 'Елена',
      status: 'new',
      heldFor: 'Олег',
    };
    const later = at + 30 * 3600_000;
    expect(resolveHeld([op], [], later, at - 5 * 3600_000).keep).toHaveLength(1);
    expect(resolveHeld([op], [], later, at + HOLD_MS).release).toHaveLength(1);
  });
});
