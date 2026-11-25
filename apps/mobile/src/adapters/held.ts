import { resolveHeld, type Operation, type TableOperations } from '@budget/core';
import { kv } from './db';
import { log } from './log';
import { sqliteRepo } from './sqliteRepo';

/**
 * Покупки чужой картой ждут здесь, а не во «Входящих»: общий счёт, пуш и SMS про карту Олега приходят
 * и Елене (журнал 17.10). Как только в зеркале таблицы появится та же покупка от владельца карты,
 * отложенная выбрасывается; не появилась за 6 часов, идёт во «Входящие» с пометкой.
 */
export function holdOperations(ops: Operation[]) {
  if (!ops.length) return;
  kv.setJson('heldOps', [...(kv.getJson<Operation[]>('heldOps') ?? []), ...ops]);
}

export async function resolveHeldNow(): Promise<number> {
  const held = kv.getJson<Operation[]>('heldOps') ?? [];
  if (!held.length) return 0;
  const table = kv.getJson<TableOperations>('mirror')?.operations ?? [];
  const mirrorAt = Date.parse(kv.get('mirrorAt') ?? '') || 0;
  const r = resolveHeld(held, table, Date.now(), mirrorAt);
  for (const op of r.release) await sqliteRepo.upsert({ ...op, status: 'new' });
  kv.setJson('heldOps', r.keep);
  if (r.matched.length || r.release.length)
    log.info('held', `Чужая карта: отправил владелец ${r.matched.length}, не дождались ${r.release.length}`, {
      matched: r.matched,
      released: r.release.map((o) => o.id),
      waiting: r.keep.length,
    });
  return r.release.length;
}
