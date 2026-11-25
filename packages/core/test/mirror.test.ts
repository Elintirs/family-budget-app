import { describe, expect, it } from 'vitest';
import { queueEdit, rub, withTable, type Operation } from '../src';

const op = (id: string, day: number, extra: Partial<Operation> = {}): Operation => ({
  id,
  kind: 'expense',
  amount: rub(100),
  occurredAt: new Date(2026, 9, day, 12).toISOString(),
  source: 'manual',
  author: 'Олег',
  status: 'synced',
  subcategory: 'Продукты',
  ...extra,
});
const FROM = new Date(2026, 8, 1).toISOString();

describe('withTable', () => {
  it('строки формы и Елены видны, неотправленное с телефона тоже', () => {
    const list = withTable(
      [op('mine', 5), op('new', 6, { status: 'ready' })],
      [op('mine', 5), op('f:1', 4, { source: 'form', author: 'форма' }), op('elena', 3, { author: 'Елена' })],
      FROM,
    );
    expect(list.map((o) => o.id)).toEqual(['new', 'mine', 'f:1', 'elena']);
  });

  it('таблица главнее: поправленная руками подкатегория видна, иконка Mir Pay с телефона остаётся', () => {
    const [o] = withTable(
      [op('a', 5, { alsoFrom: ['ru.nspk.mirpay'] })],
      [op('a', 5, { subcategory: 'Кафе' })],
      FROM,
    );
    expect(o).toMatchObject({ subcategory: 'Кафе', alsoFrom: ['ru.nspk.mirpay'] });
  });

  it('отправленная, но удалённая в таблице внутри окна пропадает; старше окна остаётся', () => {
    const old = op('old', 1, { occurredAt: new Date(2026, 7, 20).toISOString() });
    const list = withTable([op('gone', 5), old], [], FROM);
    expect(list.map((o) => o.id)).toEqual(['old']);
  });

  it('без зеркала (ещё не загрузилось) показываем телефон как есть', () => {
    expect(withTable([op('a', 5)], undefined, undefined).map((o) => o.id)).toEqual(['a']);
  });

  it('ожидающие правки накладываются, удалённые скрыты', () => {
    const list = withTable([], [op('a', 5), op('b', 4)], FROM, [
      { id: 'a', fields: { subcategory: 'Аптека' } },
      { id: 'b', deleted: true, fields: {} },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', subcategory: 'Аптека' });
  });
});

describe('queueEdit', () => {
  it('поля одной операции складываются, удаление перекрывает', () => {
    let q = queueEdit([], { id: 'a', fields: { subcategory: 'Кафе' } });
    q = queueEdit(q, { id: 'a', fields: { comment: 'обед' } });
    expect(q).toEqual([{ id: 'a', fields: { subcategory: 'Кафе', comment: 'обед' } }]);
    q = queueEdit(q, { id: 'a', deleted: true, fields: {} });
    expect(q).toEqual([{ id: 'a', deleted: true, fields: {} }]);
  });
});
