import { rub, type Operation } from '@budget/core';
import { describe, expect, it } from 'vitest';
import { bootstrap, route, touchesStatic } from '../src/api/router';
import { kop, movementAfter } from '../src/sheets/read';
import { FakeSheet, FakeSpreadsheet, realisticSpreadsheet } from './fakeSheet';
import { fillEmptyAccounts } from '../src/setup/formFix';
import { sortForm } from '../src/setup/form';
import { renameDictionary } from '../src/setup/rename';
import { Table } from '../src/sheets/table';
import { cachedSpreadsheet } from '../src/sheets/cache';

const now = new Date(2026, 9, 5, 12, 45);
const ctx = (author = 'Олег', ss = realisticSpreadsheet()) => ({ ss, tableName: 'тест', author, now });

const op = (id: string, extra: Partial<Operation> = {}): Operation => ({
  id,
  kind: 'expense',
  amount: rub(523),
  occurredAt: new Date(2026, 9, 5, 12, 41).toISOString(),
  accountId: 'Т-Банк',
  subcategory: 'Продукты',
  merchant: 'PYATEROCHKA',
  source: 'notification',
  author: 'Олег',
  status: 'ready',
  ...extra,
});

describe('kop', () => {
  it.each([
    [1355, 135500],
    ['1 500,00р.', 150000],
    ['46 494,00 ₽', 4649400],
    ['1355.5', 135550],
  ])('%s', (v, k) => expect(kop(v)).toBe(k));
});

describe('bootstrap', () => {
  const b = bootstrap(ctx());
  it('справочник и категории доходов', () => {
    expect(b.subcategories.map((s) => [s.name, s.group])).toContainEqual(['Аренда', 'Обязательные']);
    expect(b.incomeCategories).toEqual(['Елена', 'Олег']);
  });
  it('сводка из «Лимитов на месяц»', () => {
    expect(b.summary).toMatchObject({
      monthLimit: rub(80000),
      spentMonthBeforeToday: rub(33506),
      spentToday: 0,
    });
  });
  it('счета до пустой строки, факт и долг кредитки', () => {
    expect(b.accounts.map((a) => [a.name, a.type])).toEqual([
      ['Т-Банк', 'debit'],
      ['Сбер', 'debit'],
      ['Сбер кредитка', 'credit'],
      ['Наличные', 'cash'],
      ['Нам должны', 'receivable'],
    ]);
    expect(b.balances[0]).toMatchObject({ computed: rub(70654), fact: rub(70112) });
    expect(b.balances[2]!.debt).toBe(rub(700000 - 79064));
  });
});

describe('sync', () => {
  it('пишет строку в «Форму» в формате формы + служебные колонки', () => {
    const c = ctx();
    const res = route(c, 'sync', { operations: [op('a1')] }) as { accepted: string[] };
    expect(res.accepted).toEqual(['a1']);
    const form = c.ss.sheets['Форма']!.cells;
    const header = form[0]!;
    const row = form[form.length - 1]!;
    const get = (h: string) => row[header.indexOf(h)];
    expect(get('Сумма')).toBe(523);
    expect(get('Это доход или расход?')).toBe('Расход');
    expect(get('Подкатегория')).toBe('Продукты');
    expect(get('Карта/счёт')).toBe('Т-Банк');
    expect(get('ID')).toBe('a1');
    expect(get('Автор')).toBe('Олег');
    expect(get('Источник')).toBe('уведомление');
    expect((get('Отметка времени') as Date).getHours()).toBe(12);
  });

  it('операция без счёта получает счёт по умолчанию', () => {
    const c = { ...ctx(), defaultAccount: 'Т-Банк' };
    route(c, 'sync', { operations: [op('m1', { accountId: undefined, merchant: undefined })] });
    const form = c.ss.sheets['Форма']!.cells;
    const row = form.find((r) => r.includes('m1'))!;
    expect(row[form[0]!.indexOf('Карта/счёт')]).toBe('Т-Банк');
  });

  it('повтор той же операции не создаёт вторую строку', () => {
    const c = ctx();
    route(c, 'sync', { operations: [op('a1')] });
    const res = route(c, 'sync', { operations: [op('a1')] }) as { duplicates: string[] };
    expect(res.duplicates).toEqual(['a1']);
    expect(c.ss.sheets['Форма']!.cells.filter((r) => r.includes('a1'))).toHaveLength(1);
  });

  it('та же покупка с телефона Елены: не пишется, возвращается как подозрение', () => {
    const ss = realisticSpreadsheet();
    route(ctx('Олег', ss), 'sync', { operations: [op('n1')] });
    const res = route(ctx('Елена', ss), 'sync', { operations: [op('a1', { author: 'Елена' })] }) as {
      suspected: { id: string; otherAuthor: string }[];
    };
    expect(res.suspected).toEqual([{ id: 'a1', otherAuthor: 'Олег' }]);
    const again = route(ctx('Елена', ss), 'sync', {
      operations: [op('a1', { author: 'Елена', notDuplicate: true })],
    }) as {
      accepted: string[];
    };
    expect(again.accepted).toEqual(['a1']);
  });

  it('перевод пишется типом «Перевод» с «Куда перевели», без второго счёта отклоняется', () => {
    const c = ctx();
    const res = route(c, 'sync', {
      operations: [
        op('t1', { kind: 'transfer', toAccountId: 'Сбер', subcategory: undefined }),
        op('t2', { kind: 'transfer', subcategory: undefined }),
      ],
    }) as { accepted: string[]; rejected: { id: string; reason: string }[] };
    expect(res.accepted).toEqual(['t1']);
    expect(res.rejected).toEqual([{ id: 't2', reason: expect.stringMatching(/два разных счёта/) }]);
    const row = new Table(c.ss.getSheetByName('Форма')!).rows().find((r) => r['ID'] === 't1')!;
    expect(row['Это доход или расход?']).toBe('Перевод');
    expect(row['Карта/счёт']).toBe('Т-Банк');
    expect(row['Куда перевели']).toBe('Сбер');
    expect(row['Подкатегория']).toBe('');
  });

  it('удаление уже отправленной убирает строку целиком (формулы не знают «Удалено»)', () => {
    const c = ctx();
    route(c, 'sync', {
      operations: [op('a1'), op('a2', { occurredAt: new Date(2026, 9, 5, 18).toISOString() })],
    });
    const res = route(c, 'sync', { operations: [op('a1', { deleted: true })] }) as { edited: string[] };
    expect(res.edited).toEqual(['a1']);
    const form = c.ss.sheets['Форма']!.cells;
    expect(form.some((r) => r.includes('a1'))).toBe(false);
    expect(form.some((r) => r.includes('a2'))).toBe(true);
  });

  it('правка отправленной: ячейки по ID, кто правил; строка формы находится по времени и сумме', () => {
    const c = ctx('Елена');
    route(c, 'sync', { operations: [op('a1')] });
    const formOps = route(c, 'operations', { from: new Date(2026, 9, 1).toISOString() }) as {
      operations: Operation[];
    };
    const fromForm = formOps.operations.find((o) => o.source === 'form')!;
    expect(fromForm.id).toMatch(/^f:\d+:\d+$/);
    const res = route(c, 'sync', {
      operations: [],
      edits: [
        { id: 'a1', fields: { subcategory: 'Транспорт', amount: rub(600) } },
        { id: fromForm.id, fields: { comment: 'поправила' } },
        { id: 'нет-такой', fields: { comment: 'x' } },
      ],
    }) as { edited: string[]; missing: string[] };
    expect(res.edited).toEqual(['a1', fromForm.id]);
    expect(res.missing).toEqual(['нет-такой']);
    const rows = new Table(c.ss.getSheetByName('Форма')!).rows();
    const a1 = rows.find((r) => r['ID'] === 'a1')!;
    expect(a1['Подкатегория']).toBe('Транспорт');
    expect(a1['Сумма']).toBe(600);
    expect(String(a1['Правка'])).toMatch(/^Елена, /);
    const after = route(c, 'operations', { from: new Date(2026, 9, 1).toISOString() }) as {
      operations: Operation[];
    };
    expect(after.operations.find((o) => o.id === fromForm.id)?.comment).toBe('поправила');
    // ID закреплён: правка суммы строки формы не меняет её ID.
    route(c, 'sync', { operations: [], edits: [{ id: fromForm.id, fields: { amount: rub(999) } }] });
    const again = route(c, 'operations', { from: new Date(2026, 9, 1).toISOString() }) as {
      operations: Operation[];
    };
    expect(again.operations.find((o) => o.id === fromForm.id)?.amount).toBe(rub(999));
  });

  it('строки формы для зеркала: тип, счёт, автор, источник; раньше from не отдаются', () => {
    const c = ctx();
    route(c, 'sync', { operations: [op('a1', { comment: 'с телефона' })] });
    const all = (
      route(c, 'operations', { from: new Date(2026, 0, 1).toISOString() }) as { operations: Operation[] }
    ).operations;
    const mine = all.find((o) => o.id === 'a1')!;
    expect(mine).toMatchObject({
      kind: 'expense',
      accountId: 'Т-Банк',
      author: 'Олег',
      source: 'notification',
      status: 'synced',
    });
    const later = (
      route(c, 'operations', { from: new Date(2026, 11, 1).toISOString() }) as { operations: Operation[] }
    ).operations;
    expect(later).toEqual([]);
  });

  it('правила: новое дописывается, существующее обновляется, bootstrap их отдаёт', () => {
    const c = ctx();
    route(c, 'sync', {
      operations: [],
      rules: [{ pattern: 'SAMOKAT', subcategory: 'Доставка еды', author: 'Елена' }],
    });
    route(c, 'sync', {
      operations: [],
      rules: [{ pattern: 'samokat', subcategory: 'Продукты', author: 'Олег' }],
    });
    expect(bootstrap(c).rules).toEqual([{ pattern: 'SAMOKAT', subcategory: 'Продукты', author: 'Елена' }]);
  });

  it('аналитика по месяцам: переводы не считаются, категории и подкатегории', () => {
    const a = route(ctx(), 'analytics', null) as {
      months: { month: string; income: number; expense: number; groups: Record<string, number> }[];
    };
    expect(a.months.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(a.months[1]).toMatchObject({
      income: rub(50000),
      expense: rub(5375),
      groups: { Повседневные: rub(1355), Обязательные: rub(4020) },
    });
  });

  it('лимит месяца пишется в «Лимиты на месяц»', () => {
    const c = ctx();
    route(c, 'setMonthLimit', { limit: rub(90000) });
    expect(bootstrap(c).summary.monthLimit).toBe(rub(90000));
  });
});

describe('popular', () => {
  it('bootstrap отдаёт подкатегории по числу расходов за 90 дней, по убыванию', () => {
    const b = bootstrap(ctx());
    expect(b.popular.map((p) => p.name)).toEqual(['Продукты', 'Рестораны и кафе', 'Взыскания']);
    expect(b.popular.every((p) => p.count === 1)).toBe(true);
  });
});

describe('movementAfter', () => {
  it('считает только операции счёта после снимка', () => {
    const c = ctx();
    const at = (h: number) => new Date(2026, 9, 6, h).toISOString();
    route(c, 'sync', {
      operations: [
        op('before', { occurredAt: at(9), amount: rub(80) }),
        op('after1', { occurredAt: at(18), amount: rub(180) }),
        op('after2', { occurredAt: at(20), amount: rub(325), merchant: 'TAXI' }),
        op('other', { occurredAt: at(19), amount: rub(50), accountId: 'Сбер', merchant: 'X' }),
      ],
    });
    expect(movementAfter(c.ss, 'Т-Банк', new Date(2026, 9, 6, 12))).toBe(-rub(505));
  });
});

describe('fillEmptyAccounts', () => {
  it('ставит счёт по умолчанию строкам после старта счетов, старые и с выбранным счётом не трогает', () => {
    const header = [
      'Отметка времени',
      'Сумма',
      'Это доход или расход?',
      'Дата операции (если не сегодня)',
      'Карта/счёт',
    ];
    const ss = new FakeSpreadsheet({
      Счета: new FakeSheet([
        ['Счёт', 'Тип', 'Дата старта'],
        ['Сбер', 'Дебет', new Date(2026, 8, 27)], // ранний старт другого счёта не должен влиять
        ['Т-Банк', 'Дебет', new Date(2026, 9, 4)],
      ]),
      Форма: new FakeSheet([
        header,
        [new Date(2026, 9, 3, 12), 100, 'Расход', '', ''], // до старта
        [new Date(2026, 9, 7, 9, 34), 100, 'Расход', '', ''], // Носочки 07.10: без счёта
        [new Date(2026, 9, 7, 10), 200, 'Расход', '', 'ВТБ'], // счёт выбран
        [new Date(2026, 9, 7, 11), 300, 'Перевод', '', ''], // перевод не трогаем
      ]),
    });
    expect(fillEmptyAccounts(ss, 'Т-Банк', true).filled).toEqual([3]);
    fillEmptyAccounts(ss, 'Т-Банк');
    const rows = ss
      .getSheetByName('Форма')!
      .getRange(2, 5, 4, 1)
      .getValues()
      .map((r) => r[0]);
    expect(rows).toEqual(['', 'Т-Банк', 'ВТБ', '']);
  });
});

describe('кэш чтения на запрос', () => {
  it('bootstrap через кэш тот же, а листов читается по одному разу', () => {
    const plain = bootstrap(ctx());
    const ss = cachedSpreadsheet(realisticSpreadsheet());
    const cached = bootstrap(ctx('Олег', ss as never));
    expect(cached).toEqual(plain);
    // «Форма», «Справочник», «Лимиты», «Балансы», «Счета», «Правила», «Обработанные данные», не больше
    expect(ss.reads()).toBeLessThanOrEqual(7);
  });

  it('после записи следующее чтение видит новые строки', () => {
    const ss = cachedSpreadsheet(realisticSpreadsheet());
    const c = ctx('Олег', ss as never);
    const before = new Table(c.ss.getSheetByName('Форма')!).rows().length;
    route(c, 'sync', { operations: [op('fresh-1')] });
    const rows = new Table(c.ss.getSheetByName('Форма')!).rows();
    expect(rows.length).toBe(before + 1);
    expect(rows.some((r) => r['ID'] === 'fresh-1')).toBe(true);
  });
});

describe('лимиты подкатегорий', () => {
  it('пишутся в «Справочник» колонкой «Лимит в месяц», bootstrap их отдаёт, null убирает', () => {
    const c = ctx();
    route(c, 'setSubcategoryLimit', { name: 'Продукты', limit: rub(15_000) });
    expect(bootstrap(c).subcategories.find((s) => s.name === 'Продукты')?.monthLimit).toBe(rub(15_000));
    route(c, 'setSubcategoryLimit', { name: 'Продукты', limit: null });
    expect(bootstrap(c).subcategories.find((s) => s.name === 'Продукты')?.monthLimit).toBeUndefined();
    expect(() => route(c, 'setSubcategoryLimit', { name: 'Нет такой', limit: 100 })).toThrow(
      /Нет подкатегории/,
    );
  });
});

describe('подкатегории из приложения', () => {
  it('новая в конец «Справочника», у существующей меняется группа, имя не меняется', () => {
    const c = ctx();
    expect(route(c, 'upsertSubcategory', { name: 'Спорт', group: 'Повседневные' })).toEqual({
      result: 'added',
    });
    expect(route(c, 'upsertSubcategory', { name: 'Аптека', group: 'Обязательные' })).toEqual({
      result: 'updated',
    });
    const subs = bootstrap(c).subcategories;
    expect(subs.at(-1)).toMatchObject({ name: 'Спорт', group: 'Повседневные' });
    expect(subs.find((s) => s.name === 'Аптека')?.group).toBe('Обязательные');
    expect(() => route(c, 'upsertSubcategory', { name: 'X', group: 'Повседневные' })).toThrow();
  });
});

describe('регулярные платежи и лимиты групп', () => {
  const rule = {
    id: 'r1',
    name: 'Аренда',
    amount: rub(35_000),
    day: 1,
    match: 'аренда',
    subcategory: 'Аренда',
    author: 'Олег',
  };

  it('лист «Регулярные» создаётся при первой записи, правка по ID, удаление', () => {
    const c = ctx('Олег', cachedSpreadsheet(realisticSpreadsheet()) as never);
    expect(bootstrap(c).recurring).toEqual([]);
    expect(route(c, 'upsertRecurring', rule)).toEqual({ result: 'added' });
    expect(route(c, 'upsertRecurring', { ...rule, amount: rub(36_000) })).toEqual({ result: 'updated' });
    expect(bootstrap(c).recurring).toEqual([{ ...rule, amount: rub(36_000) }]);
    expect(route(c, 'deleteRecurring', { id: 'r1' })).toEqual({ deleted: true });
    expect(bootstrap(c).recurring).toEqual([]);
  });

  it('правка регулярного по заголовкам: вставленная руками колонка не сдвигает данные', () => {
    const ss = realisticSpreadsheet();
    const c = ctx('Олег', ss as never);
    route(c, 'upsertRecurring', rule);
    // Человек вставил колонку «Заметка» между «Названием» и «Суммой».
    const sh = ss.sheets['Регулярные']!;
    sh.cells = sh.cells.map((r, i) => [r[0], r[1], i === 0 ? 'Заметка' : 'моя заметка', ...r.slice(2)]);
    expect(route(c, 'upsertRecurring', { ...rule, amount: rub(37_000) })).toEqual({ result: 'updated' });
    expect(sh.cells[1]![2]).toBe('моя заметка');
    expect(bootstrap(c).recurring).toEqual([{ ...rule, amount: rub(37_000) }]);
  });

  it('гибкий повтор и доход пишутся и читаются; правка старым приложением их не стирает', () => {
    const ss = realisticSpreadsheet();
    const c = ctx('Олег', ss as never);
    const salary = {
      ...rule,
      id: 'z1',
      name: 'Зарплата',
      kind: 'income' as const,
      amount: rub(20_000),
      amountMax: rub(40_000),
      keywords: ['зп', 'зарплата'],
      schedule: { every: 'month' as const, interval: 1, days: [10, 25], shift: 'before' as const },
    };
    route(c, 'upsertRecurring', salary);
    expect(bootstrap(c).recurring.find((r) => r.id === 'z1')).toMatchObject({
      kind: 'income',
      amountMax: rub(40_000),
      keywords: ['зп', 'зарплата'],
      schedule: { every: 'month', days: [10, 25], shift: 'before' },
    });
    // Старое приложение правит название и сумму без новых полей.
    const old = { ...rule, id: 'z1', amount: rub(20_000) };
    route(c, 'upsertRecurring', { ...old, name: 'ЗП Олега' });
    const back = bootstrap(c).recurring.find((r) => r.id === 'z1')!;
    expect(back.name).toBe('ЗП Олега');
    expect(back.schedule?.days).toEqual([10, 25]);
    expect(back.kind).toBe('income');
  });

  it('лимит группы дописывается в «Лимиты на месяц», меняется, null очищает; сводка цела', () => {
    const c = ctx();
    const summary = bootstrap(c).summary;
    route(c, 'setGroupLimit', { group: 'Крупные', limit: rub(30_000) });
    route(c, 'setGroupLimit', { group: 'Крупные', limit: rub(40_000) });
    expect(bootstrap(c).groupLimits).toEqual({ Крупные: rub(40_000) });
    route(c, 'setGroupLimit', { group: 'Крупные', limit: null });
    expect(bootstrap(c).groupLimits).toEqual({});
    expect(bootstrap(c).summary.monthLimit).toBe(summary.monthLimit);
    expect(() => route(c, 'setGroupLimit', { group: 'Повседневные', limit: 100 })).toThrow();
  });
});

describe('служебный счёт «Поправки»', () => {
  it('уходит скрытой кредиткой без долга с отметкой adjustment: 0.3.11 не знает типа adjustment', () => {
    const ss = realisticSpreadsheet();
    const sh = ss.getSheetByName('Балансы')!;
    const rows = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const at = rows.findIndex((r) => r[0] === '');
    rows.splice(at, 0, ['Поправки', 'Служебный', 0, 0, 0, -1000, '', '', '', '']);
    sh.getRange(1, 1, rows.length, rows[0]!.length).setValues(rows);
    const b = bootstrap(ctx('Олег', ss));
    for (const a of b.accounts) expect(['debit', 'credit', 'cash', 'receivable']).toContain(a.type);
    expect(b.accounts.find((a) => a.id === 'Поправки')).toMatchObject({
      type: 'credit',
      hidden: true,
      adjustment: true,
    });
    // Минус на «Поправках» не долг: в «Долг по кредиткам» старого приложения не попадает.
    expect(b.balances.find((x) => x.accountId === 'Поправки')?.debt).toBeUndefined();
  });
});

describe('единовременные расходы', () => {
  it('своя отметка строки, иначе отметка подкатегории; «нет» перебивает подкатегорию; аналитика считает отдельно', () => {
    const c = ctx();
    route(c, 'sync', {
      operations: [
        op('one', { amount: rub(1000), oneOff: true, merchant: 'A' }),
        op('rent', { amount: rub(25000), subcategory: 'Аренда', merchant: 'B' }),
        op('no', { amount: rub(300), subcategory: 'Аренда', oneOff: false, merchant: 'C' }),
      ],
    });
    type M = { month: string; oneOff?: number; oneOffSubcategories?: Record<string, number> };
    const oct = () =>
      (route(c, 'analytics', null) as { months: M[] }).months.find((m) => m.month === '2026-10')!;
    expect(oct()).toMatchObject({ oneOff: rub(1000), oneOffSubcategories: { Продукты: rub(1000) } });
    route(c, 'setSubcategoryOneOff', { name: 'Аренда', oneOff: true });
    expect(bootstrap(c).subcategories.find((s) => s.name === 'Аренда')?.oneOff).toBe(true);
    expect(oct().oneOffSubcategories).toEqual({ Продукты: rub(1000), Аренда: rub(25000) });
    // Зеркало отдаёт отметку обратно, правка её меняет.
    route(c, 'sync', { operations: [], edits: [{ id: 'one', fields: { oneOff: false } }] });
    expect(oct().oneOff).toBe(rub(25000));
  });
});

describe('скрытие подкатегорий', () => {
  it('строка остаётся, bootstrap отдаёт hidden, вернуть можно', () => {
    const c = ctx();
    const before = bootstrap(c).subcategories.length;
    route(c, 'setSubcategoryHidden', { name: 'Аптека', hidden: true });
    const subs = bootstrap(c).subcategories;
    expect(subs).toHaveLength(before);
    expect(subs.find((s) => s.name === 'Аптека')?.hidden).toBe(true);
    route(c, 'setSubcategoryHidden', { name: 'Аптека', hidden: false });
    expect(bootstrap(c).subcategories.find((s) => s.name === 'Аптека')?.hidden).toBeUndefined();
  });
});

describe('цели, настройки счёта, снимки, долги', () => {
  const withAccounts = () => {
    const ss = realisticSpreadsheet();
    ss.sheets['Счета'] = new FakeSheet([
      [
        'Счёт',
        'Тип',
        'Остаток на старт',
        'Долг на старт',
        'Дата старта',
        'Кредитный лимит',
        'Банк',
        'Маски карт',
      ],
      ['Т-Банк', 'Дебет', 70654, '', new Date(2026, 8, 27), '', 'Т-Банк', ''],
      ['Сбер кредитка', 'Кредит', '', 620936, new Date(2026, 7, 1), 700000, '', ''],
    ]);
    ss.sheets['Снимки балансов'] = new FakeSheet([
      ['Дата', 'Счёт', 'Остаток', 'Долг', 'Источник', 'Комментарий'],
      [new Date(2026, 9, 3, 9, 12), 'Т-Банк', 72980, '', 'уведомление', 'Олег'],
      [new Date(2026, 9, 5, 12, 41), 'Т-Банк', 70112, '', 'уведомление', 'Олег'],
    ]);
    return ss;
  };

  it('sync пишет остатки из пушей тем же запросом, повтор не дублирует', () => {
    const c = ctx('Елена', withAccounts());
    const fact = {
      accountId: 'Т-Банк',
      at: '2026-10-05T10:00:00.000Z',
      balance: rub(69_000),
      source: 'notification',
    };
    const first = route(c, 'sync', { operations: [op('f1')], balanceFacts: [fact] }) as {
      accepted: string[];
      facts: { written: number; duplicates: number };
    };
    expect(first.accepted).toEqual(['f1']);
    expect(first.facts).toEqual({ written: 1, duplicates: 0 });
    const again = route(c, 'sync', { operations: [], balanceFacts: [fact] }) as { facts: unknown };
    expect(again.facts).toEqual({ written: 0, duplicates: 1 });
    const snaps = new Table(c.ss.getSheetByName('Снимки балансов')!).rows();
    expect(snaps.filter((r) => r['Остаток'] === 69000)).toHaveLength(1);
    // Старый телефон без поля: как раньше, остатки не трогаем.
    expect((route(c, 'sync', { operations: [] }) as { facts: unknown }).facts).toEqual({
      written: 0,
      duplicates: 0,
    });
  });

  it('колонка «Карта»: маска и владелец из «Масок карт»', () => {
    const ss = withAccounts();
    const acc = ss.sheets['Счета']!;
    const rows = acc.getRange(1, 1, acc.getLastRow(), acc.getLastColumn()).getValues();
    rows[1]![7] = '*1101 Олег';
    acc.getRange(1, 1, rows.length, rows[0]!.length).setValues(rows);
    const c = ctx('Олег', ss);
    route(c, 'sync', {
      operations: [op('card1', { cardMask: '*1101' }), op('card2', { cardMask: '*5505', amount: rub(220) })],
    });
    const form = new Table(c.ss.getSheetByName('Форма')!).rows();
    expect(form.find((r) => r['ID'] === 'card1')?.['Карта']).toBe('*1101 Олег');
    expect(form.find((r) => r['ID'] === 'card2')?.['Карта']).toBe('*5505');
  });

  it('«Доступно» у дебетовой карты пишется остатком, у кредитки долгом, пустые снимки не пишутся', () => {
    const c = ctx('Елена', withAccounts());
    const at = '2026-10-17T10:32:33.000Z';
    const r = route(c, 'balanceFacts', [
      { accountId: 'Т-Банк', at, available: rub(22_705.78), source: 'notification' },
      { accountId: 'Т-Банк', at: '2026-10-17T10:40:00.000Z', source: 'notification' },
    ]) as { written: number };
    expect(r.written).toBe(1);
    const snaps = new Table(c.ss.getSheetByName('Снимки балансов')!).rows();
    expect(snaps.at(-1)).toMatchObject({ Счёт: 'Т-Банк', Остаток: 22705.78, Долг: '' });
    // Кредитка: «Баланс» из пуша Сбера даёт чистый долг по лимиту 700 000.
    route(c, 'balanceFacts', [
      { accountId: 'Сбер кредитка', at, balance: rub(129_004), source: 'notification' },
    ]);
    expect(new Table(c.ss.getSheetByName('Снимки балансов')!).rows().at(-1)).toMatchObject({
      Счёт: 'Сбер кредитка',
      Остаток: '',
      Долг: 570996,
    });
  });

  it('цель: лист создаётся, отложено = переводы с «Цель: <название>», взяли из копилки уменьшает', () => {
    const c = ctx('Олег', withAccounts());
    route(c, 'upsertGoal', {
      id: 'g1',
      name: 'Отпуск',
      target: rub(120_000),
      deadline: '2027-06',
      accountId: 'Сбер',
      author: 'Олег',
    });
    route(c, 'sync', {
      operations: [
        op('t1', {
          kind: 'transfer',
          toAccountId: 'Сбер',
          subcategory: undefined,
          amount: rub(10_000),
          comment: 'Цель: Отпуск',
          source: 'manual',
        }),
        op('t2', {
          kind: 'transfer',
          accountId: 'Сбер',
          toAccountId: 'Т-Банк',
          subcategory: undefined,
          amount: rub(2_000),
          comment: 'цель: отпуск, билеты',
          source: 'manual',
          occurredAt: new Date(2026, 9, 6).toISOString(),
        }),
      ],
    });
    expect(bootstrap(c).goals).toEqual([
      {
        id: 'g1',
        name: 'Отпуск',
        target: rub(120_000),
        deadline: '2027-06',
        accountId: 'Сбер',
        author: 'Олег',
        saved: rub(8_000),
      },
    ]);
    expect(route(c, 'deleteGoal', { id: 'g1' })).toEqual({ deleted: true });
    expect(bootstrap(c).goals).toEqual([]);
  });

  it('настройки счёта пишутся в «Счета», маски видны в bootstrap', () => {
    const c = ctx('Олег', withAccounts());
    route(c, 'setAccountSettings', {
      accountId: 'Т-Банк',
      cardMasks: ['2202', '4404'],
      startDate: '2026-10-04',
      startBalance: rub(68_684),
    });
    const row = new Table(c.ss.getSheetByName('Счета')!).rows()[0]!;
    expect(row['Маски карт']).toBe('*2202, *4404');
    route(c, 'setAccountSettings', { accountId: 'Т-Банк', markers: ['счет RUB'] });
    expect(new Table(c.ss.getSheetByName('Счета')!).rows()[0]!['Маски карт']).toBe('*2202, *4404, счет RUB');
    expect(bootstrap(c).accounts.find((a) => a.id === 'Т-Банк')).toMatchObject({
      cardMasks: ['*2202', '*4404'],
      markers: ['счет RUB'],
    });
    expect(row['Остаток на старт']).toBe(68684);
    expect((row['Дата старта'] as Date).getDate()).toBe(4);
    expect(() => route(c, 'setAccountSettings', { accountId: 'Нет', startBalance: 1 })).toThrow(/Нет счёта/);
  });

  it('лента снимков: новые сверху, расчёт на момент снимка', () => {
    const c = ctx('Олег', withAccounts());
    const { points } = route(c, 'balanceHistory', { accountId: 'Т-Банк' }) as {
      points: { fact: number; computedAt: number }[];
    };
    expect(points.map((p) => p.fact)).toEqual([rub(70_112), rub(72_980)]);
    // В «Форме» у Т-Банка движений нет: расчёт на любой момент равен текущему.
    expect(points.every((p) => p.computedAt === rub(70_654))).toBe(true);
  });

  it('долг кредиток по месяцам с даты старта, погашено в этом месяце', () => {
    const c = ctx('Олег', withAccounts());
    route(c, 'sync', {
      operations: [
        op('p1', {
          kind: 'transfer',
          toAccountId: 'Сбер кредитка',
          subcategory: undefined,
          amount: rub(15_000),
          source: 'manual',
        }),
      ],
    });
    const h = route(c, 'debtHistory', {}) as {
      accounts: { accountId: string; months: { month: string }[]; paidThisMonth: number }[];
    };
    const sber = h.accounts.find((a) => a.accountId === 'Сбер кредитка')!;
    expect(sber.paidThisMonth).toBe(rub(15_000));
    expect(sber.months.at(-1)!.month).toBe('2026-10');
  });
});

describe('переименование справочника', () => {
  const table = () => {
    const ss = realisticSpreadsheet();
    ss.sheets['Справочник'] = new FakeSheet([
      ['Подкатегория', 'Категория по умолчанию', 'Лимит в месяц'],
      ['Аптека', 'Повседневные', 1000],
      ['Свадьба', 'Повседневные', ''],
      ['Развлечения', 'Повседневные', 4000],
      ['Гинекология', 'Крупные', ''],
      ['Одежда и обувь', 'Повседневные', ''],
    ]);
    ss.sheets['Счета'] = new FakeSheet([
      ['Счёт', 'Тип'],
      ['Т-Банк 2', 'Дебет'],
    ]);
    ss.sheets['Снимки балансов'] = new FakeSheet([
      ['Дата', 'Счёт', 'Остаток'],
      [new Date(2026, 9, 1), 'Т-Банк 2', 100],
    ]);
    ss.sheets['Правила'] = new FakeSheet([
      ['Шаблон мерчанта', 'Подкатегория'],
      ['Здравсити', 'Аптека'],
    ]);
    new Table(ss.sheets['Форма']!).append([
      { Подкатегория: 'Аптека', 'Карта/счёт': 'Т-Банк 2', 'Куда перевели': '' },
      { Подкатегория: 'Свадьба', 'Карта/счёт': 'Т-Банк', 'Куда перевели': 'Т-Банк 2' },
      { Подкатегория: 'Продукты', 'Карта/счёт': 'Т-Банк', 'Куда перевели': '' },
    ]);
    return ss;
  };

  it('пробный прогон считает и не пишет, запись повторно ничего не меняет', () => {
    const ss = table();
    const dry = renameDictionary(ss, true);
    expect(dry.changes).toMatchObject({ 'Справочник: переименовано': 1, 'Справочник: скрыто': 2, Счета: 1 });
    expect(new Table(ss.sheets['Счета']!).column('Счёт')).toEqual(['Т-Банк 2']);

    renameDictionary(ss, false);
    const form = new Table(ss.sheets['Форма']!);
    expect(form.column('Подкатегория').slice(-3)).toEqual(['Здоровье', 'Развлечения', 'Продукты']);
    expect(form.column('Куда перевели').slice(-3)).toEqual(['', 'Т-Банк Елена', '']);
    const ref = new Table(ss.sheets['Справочник']!).rows();
    expect(ref.map((r) => r['Подкатегория'])).toEqual([
      'Аптека',
      'Свадьба',
      'Развлечения',
      'Здоровье',
      'Одежда и обувь',
    ]);
    expect(ref[4]).toMatchObject({ 'Категория по умолчанию': 'Крупные' });
    expect(ref[0]).toMatchObject({ Скрыта: 'да', 'Лимит в месяц': '' });
    expect(new Table(ss.sheets['Правила']!).column('Подкатегория')).toEqual(['Здоровье']);
    expect(new Table(ss.sheets['Снимки балансов']!).column('Счёт')).toEqual(['Т-Банк Елена']);
    expect(renameDictionary(ss, false).changes).toEqual({});
  });

  it('очередь телефона со старыми названиями пишется уже с новыми', () => {
    const c = ctx('Елена', table());
    route(c, 'sync', {
      operations: [op('alias1', { subcategory: 'Аптека', accountId: 'Т-Банк 2', amount: rub(100) })],
    });
    const rows = new Table(c.ss.sheets['Форма']!).rows();
    expect(rows.at(-1)).toMatchObject({ Подкатегория: 'Здоровье', 'Карта/счёт': 'Т-Банк Елена' });
  });
});

describe('текст уведомления в таблице', () => {
  it('пишется в «Уведомление», виден в зеркале, правка дополняет магазин и карту', () => {
    const c = ctx();
    route(c, 'sync', {
      operations: [op('n1', { sourceText: 'Покупка 523 ₽', merchant: undefined, cardMask: undefined })],
    });
    route(c, 'sync', {
      operations: [],
      edits: [
        { id: 'n1', fields: { merchant: 'Кафе', cardMask: '*1234', sourceText: 'Покупка 523 ₽\n---\nSMS' } },
      ],
    });
    const row = new Table(c.ss.sheets['Форма']!).rows().at(-1)!;
    expect(row).toMatchObject({ Мерчант: 'Кафе', Карта: '*1234', Уведомление: 'Покупка 523 ₽\n---\nSMS' });
    const mirror = route(c, 'operations', { from: new Date(2026, 9, 1).toISOString() }) as {
      operations: Operation[];
    };
    expect(mirror.operations.find((o) => o.id === 'n1')?.sourceText).toContain('SMS');
  });
});

describe('touchesStatic: какие отправки сбрасывают кэш постоянных листов', () => {
  const op = (kind: 'expense' | 'income' | 'transfer') => ({
    id: kind, kind, amount: 100, occurredAt: new Date().toISOString(), source: 'manual' as const, author: 'Олег', status: 'ready' as const,
  });
  it('расход без правил и правок не трогает', () => {
    expect(touchesStatic({ operations: [op('expense')], rules: [], edits: [] })).toBe(false);
  });
  it('доход и перевод трогают: категории доходов и «отложено» по целям считаются по «Форме»', () => {
    expect(touchesStatic({ operations: [op('income')], rules: [], edits: [] })).toBe(true);
    expect(touchesStatic({ operations: [op('transfer')], rules: [], edits: [] })).toBe(true);
  });
  it('правило или правка строки трогают', () => {
    expect(touchesStatic({ operations: [], rules: [{ pattern: 'x', subcategory: 'Продукты', author: 'Олег' }], edits: [] })).toBe(true);
    expect(touchesStatic({ operations: [], rules: [], edits: [{ id: 'a', fields: { comment: 'Цель: Отпуск' } }] })).toBe(true);
  });
});

describe('sortForm', () => {
  it('сортирует по дате и переписывает только сдвинутый кусок', () => {
    const d = (day: number) => new Date(2026, 9, day, 12);
    const sh = new FakeSheet([
      ['Отметка времени', 'Сумма', 'Дата операции (если не сегодня)'],
      [d(1), 1, ''],
      [d(2), 2, ''],
      [d(5), 5, ''],
      [d(6), 3, d(3)],
    ]);
    const writes: number[] = [];
    const getRange = sh.getRange.bind(sh);
    sh.getRange = (row, col, n, w) => {
      const r = getRange(row, col, n, w);
      return { ...r, setValues: (v) => (writes.push(row), r.setValues(v)) };
    };
    expect(sortForm(new FakeSpreadsheet({ Форма: sh }), false)).toEqual({ rows: 4, moved: 2 });
    expect(sh.cells.slice(1).map((r) => r[1])).toEqual([1, 2, 3, 5]);
    expect(writes).toEqual([4]);
  });
});
