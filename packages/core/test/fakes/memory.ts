import type {
  Bootstrap,
  Operation,
  OperationRepo,
  Rule,
  RuleRepo,
  SheetApi,
  SyncRequestInput,
  SyncResponse,
} from '../../src';

export class MemoryOperationRepo implements OperationRepo {
  readonly items = new Map<string, Operation>();
  async list(filter: { status?: Operation['status'][]; includeDeleted?: boolean } = {}) {
    return [...this.items.values()].filter(
      (op) => (!filter.status || filter.status.includes(op.status)) && (filter.includeDeleted || !op.deleted),
    );
  }
  async get(id: string) {
    return this.items.get(id);
  }
  async upsert(op: Operation) {
    this.items.set(op.id, op);
  }
  async markSynced(ids: string[]) {
    for (const id of ids) {
      const op = this.items.get(id);
      if (op) this.items.set(id, { ...op, status: 'synced' });
    }
  }
}

export class MemoryRuleRepo implements RuleRepo {
  readonly items: Rule[] = [];
  async all() {
    return this.items;
  }
  async upsert(rule: Rule) {
    const i = this.items.findIndex((r) => r.pattern === rule.pattern);
    if (i >= 0) this.items[i] = rule;
    else this.items.push(rule);
  }
}

/** Таблица в памяти: помнит принятые ID, как служебная колонка «ID» в «Форме». */
export class MemorySheetApi implements SheetApi {
  readonly rows: Operation[] = [];
  readonly seen = new Set<string>();
  rejectIds = new Set<string>();
  constructor(private readonly boot: Bootstrap) {}
  async bootstrap() {
    return this.boot;
  }
  async setSubcategoryLimit() {}
  async upsertSubcategory() {}
  async setSubcategoryHidden() {}
  async setSubcategoryOneOff() {}
  async upsertRecurring() {}
  async deleteRecurring() {}
  async setGroupLimit() {}
  async upsertGoal() {}
  async deleteGoal() {}
  async setAccountSettings() {}
  async balanceHistory() {
    return [];
  }
  async debtHistory() {
    return { accounts: [], interestThisMonth: 0 };
  }
  async rev() {
    return this.boot.rev ?? 0;
  }
  async operations(from: string) {
    return { from, operations: this.rows.filter((o) => o.occurredAt >= from) };
  }
  async pull(rev: number | undefined, from: string) {
    const now = this.boot.rev ?? 0;
    if (rev === now) return { rev: now, unchanged: true };
    return {
      rev: now,
      bootstrap: this.boot,
      analytics: { months: [] },
      operations: await this.operations(from),
    };
  }
  async sync(req: SyncRequestInput): Promise<SyncResponse> {
    const res: SyncResponse = {
      accepted: [],
      duplicates: [],
      rejected: [],
      suspected: [],
      summary: this.boot.summary,
      balances: this.boot.balances,
      edited: [],
      missing: [],
    };
    for (const op of req.operations) {
      if (this.rejectIds.has(op.id)) res.rejected.push({ id: op.id, reason: 'test' });
      else if (this.seen.has(op.id)) res.duplicates.push(op.id);
      else {
        this.seen.add(op.id);
        this.rows.push(op);
        res.accepted.push(op.id);
      }
    }
    return res;
  }
  async balanceFacts() {}
  async setMonthLimit() {}
  async invite(author: string) {
    return { author, tableName: 'память', link: 'budget://connect?t=mem' };
  }
  async analytics() {
    return { months: [] };
  }
}
