import { applyAliases } from '../setup/rename';
import {
  API_VERSION,
  AccountSettingsSchema,
  BalanceFactSchema,
  GoalSchema,
  type LatestApp,
  RecurringRuleSchema,
  SyncRequestSchema,
  type Bootstrap,
  type SyncRequest,
  type TableOperations,
} from '@budget/core';
import { z } from 'zod';
import {
  readAccounts,
  readAnalytics,
  readIncomeCategories,
  readPopular,
  readRules,
  readSubcategories,
  readSummary,
} from '../sheets/read';
import type { SpreadsheetLike } from '../sheets/table';
import {
  setSubcategoryHidden,
  setSubcategoryOneOff,
  sync,
  upsertSubcategory,
  writeMonthLimit,
  writeSubcategoryLimit,
} from '../sheets/write';
import { readFormOperations } from '../sheets/operations';
import {
  balanceHistory,
  debtHistory,
  deleteGoal,
  readGoals,
  setAccountSettings,
  upsertGoal,
} from '../sheets/accounts';
import {
  deleteRecurring,
  LIMIT_GROUPS,
  readGroupLimits,
  readRecurring,
  upsertRecurring,
  writeGroupLimit,
} from '../sheets/recurring';
import { Table } from '../sheets/table';
import type { BalanceFact } from '@budget/core';

export interface Ctx {
  ss: SpreadsheetLike;
  tableName: string;
  author: string;
  now: Date;
  /** Счёт для операций без счёта (Mir Pay, ручные траты без выбора). Script Property DEFAULT_ACCOUNT. */
  defaultAccount?: string;
  /** Последняя версия приложения (Script Property LATEST_APP), отдаётся в bootstrap. */
  latestApp?: LatestApp;
}

/**
 * Части bootstrap, аналитика и зеркало по отдельности: для служебного замера (admin profile), где
 * теряются секунды холодной сборки. Тот же порядок, что в bootstrap.
 */
export const profileParts: Record<string, (ctx: Ctx) => unknown> = {
  accounts: (c) => readAccounts(c.ss),
  subcategories: (c) => readSubcategories(c.ss),
  incomeCategories: (c) => readIncomeCategories(c.ss),
  summary: (c) => readSummary(c.ss, c.now),
  rules: (c) => readRules(c.ss),
  popular: (c) => readPopular(c.ss, c.now),
  recurring: (c) => readRecurring(c.ss),
  groupLimits: (c) => readGroupLimits(c.ss),
  goals: (c) => readGoals(c.ss),
  analytics: (c) => readAnalytics(c.ss),
  operations: (c) => readFormOperations(c.ss, new Date(c.now.getFullYear(), c.now.getMonth() - 1, 1)),
};

/**
 * Листы, которые меняются только настройками (справочник, правила, регулярные, цели), а не записью
 * операций. Замер 12.10: каждый лист ~0,4–0,9 с, вместе ~2,7 с из ~5 с сборки. main.ts держит их
 * в отдельном кэше со своей версией, и после отправки операций они не перечитываются.
 */
export type StaticPart = Pick<
  Bootstrap,
  'subcategories' | 'incomeCategories' | 'rules' | 'recurring' | 'goals'
>;

export function staticPart(ctx: Ctx): StaticPart {
  return {
    subcategories: readSubcategories(ctx.ss),
    incomeCategories: readIncomeCategories(ctx.ss),
    rules: readRules(ctx.ss),
    recurring: readRecurring(ctx.ss),
    goals: readGoals(ctx.ss),
  };
}

/**
 * Меняет ли отправка постоянные листы. Правила пишутся в «Правила», а «отложено» по целям и
 * категории доходов считаются по строкам «Формы», хоть и лежат в StaticPart: перевод с «Цель: …»,
 * доход и любая правка строки тоже их меняют. Без этого цели и категории доходов застревали в кэше.
 */
export function touchesStatic(req: Pick<SyncRequest, 'operations' | 'rules' | 'edits'>): boolean {
  return (
    req.rules.length > 0 ||
    req.edits.length > 0 ||
    req.operations.some((o) => o.kind === 'income' || o.kind === 'transfer')
  );
}

export function bootstrap(ctx: Ctx, stat: StaticPart = staticPart(ctx)): Bootstrap {
  const { accounts, balances } = readAccounts(ctx.ss);
  return {
    tableName: ctx.tableName,
    subcategories: stat.subcategories,
    incomeCategories: stat.incomeCategories,
    accounts,
    summary: readSummary(ctx.ss, ctx.now),
    balances,
    rules: stat.rules,
    popular: readPopular(ctx.ss, ctx.now),
    author: ctx.author,
    apiVersion: API_VERSION,
    recurring: stat.recurring,
    groupLimits: readGroupLimits(ctx.ss),
    goals: stat.goals,
    ...(ctx.latestApp ? { latestApp: ctx.latestApp } : {}),
  };
}

/** Маршрутизация без знания об Apps Script: на вход action и тело, на выход JSON-объект. */
export function route(ctx: Ctx, action: string, body: unknown): unknown {
  switch (action) {
    case 'bootstrap':
      return bootstrap(ctx);
    case 'sync': {
      const req = applyAliases(SyncRequestSchema.parse(body));
      // Остатки из пушей до операций: сводка и балансы в ответе уже с ними. Раньше шли вторым запросом.
      const facts = req.balanceFacts.length
        ? writeBalanceFacts(ctx, req.balanceFacts)
        : { written: 0, duplicates: 0 };
      return { ...sync(ctx.ss, req, ctx.author, ctx.now, ctx.defaultAccount), facts };
    }
    case 'balanceFacts':
      return writeBalanceFacts(
        ctx,
        applyAliases({
          operations: [],
          rules: [],
          edits: [],
          balanceFacts: z.array(BalanceFactSchema).parse(body),
        }).balanceFacts,
      );
    case 'setMonthLimit': {
      const { limit } = z.object({ limit: z.number().int().positive() }).parse(body);
      writeMonthLimit(ctx.ss, limit);
      return { ok: true };
    }
    case 'setSubcategoryLimit': {
      const { name, limit } = z
        .object({ name: z.string().min(1), limit: z.number().int().positive().nullable() })
        .parse(body);
      writeSubcategoryLimit(ctx.ss, name, limit);
      return { ok: true };
    }
    case 'upsertSubcategory': {
      const { name, group } = z
        .object({
          name: z.string().trim().min(2).max(40),
          group: z.enum(['Повседневные', 'Обязательные', 'Крупные']),
        })
        .parse(body);
      return { result: upsertSubcategory(ctx.ss, name, group) };
    }
    case 'setSubcategoryHidden': {
      const { name, hidden } = z.object({ name: z.string().min(1), hidden: z.boolean() }).parse(body);
      setSubcategoryHidden(ctx.ss, name, hidden);
      return { ok: true };
    }
    case 'setSubcategoryOneOff': {
      const { name, oneOff } = z.object({ name: z.string().min(1), oneOff: z.boolean() }).parse(body);
      setSubcategoryOneOff(ctx.ss, name, oneOff);
      return { ok: true };
    }
    case 'upsertGoal':
      return { result: upsertGoal(ctx.ss, GoalSchema.omit({ saved: true }).parse(body), ctx.now) };
    case 'deleteGoal': {
      const { id } = z.object({ id: z.string().min(1) }).parse(body);
      return { deleted: deleteGoal(ctx.ss, id) };
    }
    case 'setAccountSettings':
      setAccountSettings(ctx.ss, AccountSettingsSchema.parse(body));
      return { ok: true };
    case 'balanceHistory': {
      const { accountId } = z.object({ accountId: z.string().min(1) }).parse(body);
      return { points: balanceHistory(ctx.ss, accountId) };
    }
    case 'debtHistory':
      return debtHistory(ctx.ss, ctx.now);
    case 'upsertRecurring':
      return { result: upsertRecurring(ctx.ss, RecurringRuleSchema.parse(body), ctx.now) };
    case 'deleteRecurring': {
      const { id } = z.object({ id: z.string().min(1) }).parse(body);
      return { deleted: deleteRecurring(ctx.ss, id) };
    }
    case 'setGroupLimit': {
      const { group, limit } = z
        .object({ group: z.enum(LIMIT_GROUPS), limit: z.number().int().positive().nullable() })
        .parse(body);
      writeGroupLimit(ctx.ss, group, limit);
      return { ok: true };
    }
    case 'analytics':
      return readAnalytics(ctx.ss);
    case 'operations': {
      const { from } = z.object({ from: z.string().datetime({ offset: true }) }).parse(body);
      return { from, operations: readFormOperations(ctx.ss, new Date(from)) } satisfies TableOperations;
    }
    case 'ping':
      return { ok: true, author: ctx.author, at: ctx.now.toISOString() };
    default:
      throw new HttpError(404, `Неизвестное действие «${action}»`);
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const FACT_SOURCE = { notification: 'уведомление', manual: 'вручную', 'month-end': 'конец месяца' } as const;

/** Остатки из банка -> «Снимки балансов». Для кредитки «Доступно» переводим в долг по лимиту из «Счетов». */
function writeBalanceFacts(ctx: Ctx, facts: BalanceFact[]) {
  const sh = ctx.ss.getSheetByName('Снимки балансов');
  if (!sh) throw new HttpError(409, 'Нет листа «Снимки балансов»: нужна миграция таблицы');
  const { accounts } = readAccounts(ctx.ss);
  const table = new Table(sh);
  // Идемпотентно: тот же счёт, момент и сумма второй раз не пишутся (повтор после потерянного ответа).
  const seen = new Set(
    table
      .rows()
      .map(
        (r) =>
          `${r['Счёт']}|${r['Дата'] instanceof Date ? r['Дата'].getTime() : ''}|${r['Остаток']}|${r['Долг']}`,
      ),
  );
  const rows = facts
    .map((f) => {
      const acc = accounts.find((a) => a.id === f.accountId);
      const credit = acc?.type === 'credit';
      // У кредитки долг = лимит минус «Доступно» или «Баланс» из пуша. У Сбер кредитки «Баланс» включает
      // свои деньги на карте, и выходит чистый долг (меньше «Вся задолженность» на эти деньги, 23.10 на
      // 3 441,65). Олег: пуш Сбера источник истины, в таблице ведём чистый долг.
      const free = credit ? (f.available ?? f.balance) : undefined;
      const debt = free !== undefined && acc?.creditLimit !== undefined ? (acc.creditLimit - free) / 100 : '';
      // У дебетовой карты «Доступно» и есть остаток (SMS и пуши Т-Банка шлют только его).
      // Раньше такие снимки писались пустыми и у Т-Банка висело «нет сверки».
      const balance = credit ? undefined : (f.balance ?? f.available);
      return {
        Дата: new Date(f.at),
        Счёт: f.accountId,
        Остаток: balance !== undefined ? balance / 100 : '',
        Долг: debt,
        Источник: FACT_SOURCE[f.source],
        Комментарий: ctx.author,
      };
    })
    // Пустой снимок сверке ничего не даёт, а последний по строке перекрывал настоящий.
    .filter((r) => r.Остаток !== '' || r.Долг !== '');
  const fresh = rows.filter((r) => !seen.has(`${r.Счёт}|${r.Дата.getTime()}|${r.Остаток}|${r.Долг}`));
  table.append(fresh);
  return { written: fresh.length, duplicates: rows.length - fresh.length };
}
