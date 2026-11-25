import type { Operation, OperationRepo } from '@budget/core';
import { db } from './db';

type Row = { json: string };

export const sqliteRepo: OperationRepo = {
  async list(filter = {}) {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.status?.length) {
      where.push(`status IN (${filter.status.map(() => '?').join(',')})`);
      params.push(...filter.status);
    }
    if (!filter.includeDeleted) where.push('deleted = 0');
    const sql = `SELECT json FROM operations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY occurred_at DESC`;
    const rows = await db.getAllAsync<Row>(sql, params);
    return rows.map((r) => JSON.parse(r.json) as Operation);
  },
  async get(id) {
    const row = await db.getFirstAsync<Row>('SELECT json FROM operations WHERE id = ?', id);
    return row ? (JSON.parse(row.json) as Operation) : undefined;
  },
  async upsert(op) {
    await db.runAsync(
      `INSERT INTO operations (id, json, status, occurred_at, deleted, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, status = excluded.status,
         occurred_at = excluded.occurred_at, deleted = excluded.deleted, updated_at = excluded.updated_at`,
      op.id,
      JSON.stringify(op),
      op.status,
      op.occurredAt,
      op.deleted ? 1 : 0,
      new Date().toISOString(),
    );
  },
  async markSynced(ids) {
    await db.withTransactionAsync(async () => {
      for (const id of ids) {
        const op = await sqliteRepo.get(id);
        if (op) await sqliteRepo.upsert({ ...op, status: 'synced' });
      }
    });
  },
};
