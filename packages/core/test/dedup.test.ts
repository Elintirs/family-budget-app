import { describe, expect, it } from 'vitest';
import {
  findCrossDeviceDuplicate,
  findRecaptured,
  mergeAcrossApps,
  mergedMerchant,
  rub,
  type CapturedEvent,
  type Operation,
} from '../src';

const T0 = Date.parse('2026-10-05T12:41:00+03:00');
const TB = 'com.idamob.tinkoff.android';
const MIR = 'ru.nspk.mirpay';
const ev = (
  id: string,
  source: string,
  rubles: number,
  sec: number,
  extra: Partial<CapturedEvent> = {},
): CapturedEvent => ({
  id,
  source,
  notificationKey: id,
  text: `${id}`,
  postedAt: T0 + sec * 1000,
  amount: rub(rubles),
  direction: 'debit',
  ...extra,
});

describe('mergeAcrossApps', () => {
  it('банк + Mir Pay за одну покупку дают одну операцию, главный банк', () => {
    const g = mergeAcrossApps([
      ev('mir', MIR, 523, 0, { merchant: 'Пятёрочка' }),
      ev('tb', TB, 523, 4, { merchant: 'PYATEROCHKA', accountId: 'Т-Банк' }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.primary.id).toBe('tb');
    expect(g[0]!.merged.map((e) => e.id)).toEqual(['mir']);
  });

  it('два кофе по 150 ₽ подряд: 2 пуша банка + 2 Mir Pay -> две покупки, пары 1:1', () => {
    const g = mergeAcrossApps([
      ev('tb1', TB, 150, 0),
      ev('mir1', MIR, 150, 2),
      ev('tb2', TB, 150, 40),
      ev('mir2', MIR, 150, 41),
    ]);
    expect(g).toHaveLength(2);
    expect(g.map((x) => [x.primary.id, x.merged[0]?.id])).toEqual([
      ['tb1', 'mir1'],
      ['tb2', 'mir2'],
    ]);
  });

  it('два пуша одного банка с одной суммой никогда не склеиваются', () => {
    expect(mergeAcrossApps([ev('a', TB, 150, 0), ev('b', TB, 150, 10)])).toHaveLength(2);
  });

  it('повтор того же уведомления (тот же ключ и текст) отбрасывается', () => {
    const e = ev('tb', TB, 523, 0);
    expect(mergeAcrossApps([e, { ...e, id: 'tb-again', postedAt: e.postedAt + 1000 }])).toHaveLength(1);
  });

  it('разные суммы, направление или больше 3 минут не склеиваются', () => {
    expect(mergeAcrossApps([ev('tb', TB, 523, 0), ev('mir', MIR, 524, 1)])).toHaveLength(2);
    expect(
      mergeAcrossApps([ev('tb', TB, 523, 0), ev('mir', MIR, 523, 1, { direction: 'credit' })]),
    ).toHaveLength(2);
    expect(mergeAcrossApps([ev('tb', TB, 523, 0), ev('mir', MIR, 523, 181)])).toHaveLength(2);
  });

  it('мерчант берётся у банка, если есть, иначе у Mir Pay', () => {
    const [g] = mergeAcrossApps([ev('tb', TB, 523, 0), ev('mir', MIR, 523, 1, { merchant: 'Пятёрочка' })]);
    expect(mergedMerchant(g!)).toBe('Пятёрочка');
  });
});

describe('findCrossDeviceDuplicate', () => {
  const op = (id: string, author: string, sec: number, extra: Partial<Operation> = {}): Operation => ({
    id,
    kind: 'expense',
    amount: rub(523),
    occurredAt: new Date(T0 + sec * 1000).toISOString(),
    accountId: 'Т-Банк',
    subcategory: 'Продукты',
    source: 'notification',
    author,
    status: 'ready',
    ...extra,
  });

  it('общий счёт: та же покупка с телефона Елены -> дубль', () => {
    expect(findCrossDeviceDuplicate(op('n', 'Олег', 0), [op('a', 'Елена', 30)])?.id).toBe('a');
  });

  it('тот же автор, другой счёт или далеко по времени -> не дубль', () => {
    expect(findCrossDeviceDuplicate(op('n', 'Олег', 0), [op('n2', 'Олег', 30)])).toBeUndefined();
    expect(
      findCrossDeviceDuplicate(op('n', 'Олег', 0), [op('a', 'Елена', 30, { accountId: 'Сбер' })]),
    ).toBeUndefined();
    expect(findCrossDeviceDuplicate(op('n', 'Олег', 0), [op('a', 'Елена', 700)])).toBeUndefined();
  });
});

describe('повторно пойманный пуш', () => {
  const base = {
    kind: 'expense' as const,
    amount: 36495,
    source: 'notification' as const,
    sourceApp: 'ru.nspk.mirpay',
    author: 'Олег',
    status: 'synced' as const,
  };
  it('findRecaptured находит уже отправленную операцию того же приложения', () => {
    const at = Date.parse('2026-10-05T16:36:06Z');
    const ops = [{ ...base, id: 'old', occurredAt: '2026-10-05T16:36:06.838Z' }];
    expect(findRecaptured(ops, 'ru.nspk.mirpay', 36495, at)?.id).toBe('old');
    expect(findRecaptured(ops, 'com.idamob.tinkoff.android', 36495, at)).toBeUndefined();
    expect(findRecaptured(ops, 'ru.nspk.mirpay', 36495, at + 10 * 60 * 1000)).toBeUndefined();
  });
  it('сервер: тот же автор, обе из уведомлений, другой ID -> подозрение на дубль', () => {
    const a = { ...base, id: 'a', occurredAt: '2026-10-05T16:36:06Z' };
    const b = { ...base, id: 'b', occurredAt: '2026-10-05T16:36:06.838Z' };
    expect(findCrossDeviceDuplicate(b, [a])?.id).toBe('a');
    // Ручная трата того же автора на ту же сумму не дубль: две покупки по 100 ₽ подряд бывают.
    expect(
      findCrossDeviceDuplicate({ ...b, source: 'manual' }, [{ ...a, source: 'manual' }]),
    ).toBeUndefined();
  });
});

describe('журнал 17.10: SMS Т-Банка на 5–6 минут позже', () => {
  const SMS = 'com.android.mms';
  it('Mir Pay + SMS через 5 минут склеиваются, два пуша банка через 5 минут нет', () => {
    expect(mergeAcrossApps([ev('mir', MIR, 4584, 0), ev('sms', SMS, 4584, 317)])).toHaveLength(1);
    expect(mergeAcrossApps([ev('tb', TB, 4584, 0), ev('sms', SMS, 4584, 297)])).toHaveLength(1);
    expect(mergeAcrossApps([ev('tb', TB, 4584, 0), ev('mir', MIR, 4584, 300)])).toHaveLength(2);
    expect(mergeAcrossApps([ev('mir', MIR, 4584, 0), ev('sms', SMS, 4584, 700)])).toHaveLength(2);
  });

  it('между телефонами: пуш у Елены и SMS у Олега через 5 минут -> дубль', () => {
    const op = (id: string, author: string, sec: number): Operation => ({
      id,
      kind: 'expense',
      amount: rub(4584),
      occurredAt: new Date(T0 + sec * 1000).toISOString(),
      accountId: 'Т-Банк',
      source: 'notification',
      author,
      status: 'ready',
    });
    expect(findCrossDeviceDuplicate(op('n', 'Олег', 316), [op('a', 'Елена', 0)])?.id).toBe('a');
  });

  it('«Отмена» на ту же сумму из того же приложения не повтор покупки', () => {
    const at = Date.parse('2026-10-14T10:54:22Z');
    const ops: Operation[] = [
      {
        id: 'buy',
        kind: 'expense',
        amount: rub(2088),
        occurredAt: new Date(at).toISOString(),
        source: 'notification',
        sourceApp: SMS,
        author: 'Олег',
        status: 'new',
      },
    ];
    expect(findRecaptured(ops, SMS, rub(2088), at + 27_000, undefined, 'credit')).toBeUndefined();
    expect(findRecaptured(ops, SMS, rub(2088), at + 1_000, undefined, 'debit')?.id).toBe('buy');
  });
});
