import { describe, expect, it } from 'vitest';
import { editFromChange, rub, settleSent, syncQueue, type Bootstrap, type Edit, type Operation } from '../src';
import { MemoryOperationRepo, MemorySheetApi } from './fakes/memory';

const boot: Bootstrap = {
  tableName: 'тест',
  popular: [],
  subcategories: [],
  incomeCategories: [],
  accounts: [],
  summary: {
    asOf: new Date().toISOString(),
    monthLimit: rub(80000),
    spentMonthBeforeToday: 0,
    spentToday: 0,
    limitGroups: [],
  },
  balances: [],
  rules: [],
  recurring: [],
  groupLimits: {},
  goals: [],
};

const op = (id: string, status: Operation['status']): Operation => ({
  id,
  kind: 'expense',
  amount: rub(100),
  occurredAt: new Date().toISOString(),
  subcategory: status === 'new' ? undefined : 'Продукты',
  source: 'manual',
  author: 'Олег',
  status,
});

describe('syncQueue', () => {
  it('отправляет только готовые и помечает их отправленными', async () => {
    const repo = new MemoryOperationRepo();
    const api = new MemorySheetApi(boot);
    await repo.upsert(op('ready', 'ready'));
    await repo.upsert(op('new', 'new'));
    const r = await syncQueue(repo, api);
    expect(r.sent).toBe(1);
    expect((await repo.get('ready'))?.status).toBe('synced');
    expect((await repo.get('new'))?.status).toBe('new');
  });

  it('повтор после потерянного ответа не создаёт дубль в таблице', async () => {
    const repo = new MemoryOperationRepo();
    const api = new MemorySheetApi(boot);
    await repo.upsert(op('x', 'ready'));
    await api.sync({ operations: [op('x', 'ready')], rules: [], edits: [] }); // ответ «потерялся»
    const r = await syncQueue(repo, api);
    expect(r.response.duplicates).toEqual(['x']);
    expect(api.rows).toHaveLength(1);
    expect((await repo.get('x'))?.status).toBe('synced');
  });

  it('отклонённая остаётся в очереди', async () => {
    const repo = new MemoryOperationRepo();
    const api = new MemorySheetApi(boot);
    api.rejectIds.add('bad');
    await repo.upsert(op('bad', 'ready'));
    const r = await syncQueue(repo, api);
    expect(r.rejected).toHaveLength(1);
    expect((await repo.get('bad'))?.status).toBe('ready');
  });
});

describe('syncQueue: правка во время отправки', () => {
  it('поменянное за время запроса не теряется: отправлено, отличие уходит правкой', async () => {
    const repo = new MemoryOperationRepo();
    const api = new MemorySheetApi(boot);
    await repo.upsert(op('x', 'ready'));
    const sync = api.sync.bind(api);
    api.sync = async (req) => {
      const res = await sync(req);
      // Человек сменил категорию и комментарий, пока шёл запрос.
      const cur = (await repo.get('x'))!;
      await repo.upsert({ ...cur, subcategory: 'Вкусняшки', comment: 'кола' });
      return res;
    };
    const r = await syncQueue(repo, api);
    const now = await repo.get('x');
    expect(now?.status).toBe('synced');
    expect(now?.subcategory).toBe('Вкусняшки');
    expect(r.followUpEdits).toEqual([{ id: 'x', fields: { subcategory: 'Вкусняшки', comment: 'кола' } }]);
  });

  it('удалённое во время отправки уходит удалением', async () => {
    const repo = new MemoryOperationRepo();
    const api = new MemorySheetApi(boot);
    await repo.upsert(op('x', 'ready'));
    const sync = api.sync.bind(api);
    api.sync = async (req) => {
      const res = await sync(req);
      await repo.upsert({ ...(await repo.get('x'))!, deleted: true });
      return res;
    };
    const r = await syncQueue(repo, api);
    expect(r.followUpEdits).toEqual([{ id: 'x', deleted: true, fields: {} }]);
  });

  it('без правок по ходу followUpEdits пуст', async () => {
    const repo = new MemoryOperationRepo();
    const api = new MemorySheetApi(boot);
    await repo.upsert(op('x', 'ready'));
    const r = await syncQueue(repo, api);
    expect(r.followUpEdits).toEqual([]);
  });

  it('очищенный комментарий уходит пустой строкой, oneOff без значения не уходит', () => {
    // Одна операция до и после: отдельные вызовы op() иногда получают разное время (миллисекунды).
    const a = { ...op('x', 'ready'), comment: 'было', oneOff: true };
    const b = { ...a, comment: undefined, oneOff: undefined };
    expect(editFromChange(a, b)).toEqual({ id: 'x', fields: { comment: '' } });
  });
});

describe('settleSent', () => {
  const key = (e: Edit) => e.id;
  it('убирает ушедшее без изменений и оставляет дополненное за время запроса', () => {
    const sent: Edit[] = [
      { id: 'a', fields: { comment: '1' } },
      { id: 'b', fields: { comment: '1' } },
    ];
    const queue: Edit[] = [
      { id: 'a', fields: { comment: '1' } },
      { id: 'b', fields: { comment: '1', subcategory: 'Продукты' } },
      { id: 'c', fields: { comment: 'новая' } },
    ];
    const left = settleSent(queue, sent, (e) => ['a', 'b'].includes(e.id), key);
    expect(left.map((e) => e.id)).toEqual(['b', 'c']);
  });
});
