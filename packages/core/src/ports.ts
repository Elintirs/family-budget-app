import type {
  Analytics,
  RecurringRule,
  AccountSettings,
  BalancePoint,
  DebtHistory,
  Goal,
  BalanceFact,
  Bootstrap,
  Pull,
  Rule,
  SyncRequestInput,
  SyncResponse,
  TableOperations,
} from './contract';
import type { Operation, OperationStatus } from './domain/operation';

/** Порты: что ядру нужно от окружения. Реализуют адаптеры в apps/mobile и gas. */

export interface Clock {
  now(): Date;
}

export interface OperationRepo {
  list(filter?: { status?: OperationStatus[]; includeDeleted?: boolean }): Promise<Operation[]>;
  get(id: string): Promise<Operation | undefined>;
  upsert(op: Operation): Promise<void>;
  markSynced(ids: string[]): Promise<void>;
}

export interface RuleRepo {
  all(): Promise<Rule[]>;
  upsert(rule: Rule): Promise<void>;
}

export interface SheetApi {
  bootstrap(): Promise<Bootstrap>;
  /** Версия таблицы (быстро, без чтения листов): изменилась, значит пора обновить данные. */
  rev(): Promise<number>;
  /**
   * Сводка, аналитика и зеркало одним запросом; при той же версии таблицы только {rev, unchanged}.
   * Нет у сервера старше API 5: тогда телефон ходит по-старому (rev, bootstrap, analytics, operations).
   */
  pull(rev: number | undefined, from: string): Promise<Pull>;
  /** Строки «Формы» с даты from (ISO): зеркало таблицы. */
  operations(from: string): Promise<TableOperations>;
  sync(request: SyncRequestInput): Promise<SyncResponse>;
  balanceFacts(facts: BalanceFact[]): Promise<void>;
  analytics(): Promise<Analytics>;
  /** Лимит месяца в «Лимитах на месяц» (B4). */
  setMonthLimit(limit: number): Promise<void>;
  /** Лимит подкатегории на месяц в «Справочнике»; null убирает. */
  setSubcategoryLimit(name: string, limit: number | null): Promise<void>;
  /** Новая подкатегория в конец «Справочника» или смена группы у существующей. */
  upsertSubcategory(name: string, group: string): Promise<void>;
  /** Скрыть подкатегорию из выбора (или вернуть). */
  setSubcategoryHidden(name: string, hidden: boolean): Promise<void>;
  /** Траты подкатегории по умолчанию единовременные (или нет). */
  setSubcategoryOneOff(name: string, oneOff: boolean): Promise<void>;
  /** Регулярный платёж на лист «Регулярные» (новый или правка по id). */
  upsertRecurring(rule: RecurringRule): Promise<void>;
  deleteRecurring(id: string): Promise<void>;
  /** Лимит группы («Обязательные», «Крупные») на месяц; null убирает. */
  setGroupLimit(group: string, limit: number | null): Promise<void>;
  /** Цель на лист «Цели» (новая или правка по id); saved считает сервер. */
  upsertGoal(goal: Omit<Goal, 'saved'>): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  /** Маски карт, дата и остаток на старт, кредитный лимит в «Счетах». */
  setAccountSettings(settings: AccountSettings): Promise<void>;
  /** Снимки остатка счёта из банка с расчётом таблицы на тот же момент, новые сверху. */
  balanceHistory(accountId: string): Promise<BalancePoint[]>;
  /** Долг кредиток по месяцам. */
  debtHistory(): Promise<DebtHistory>;
  /** Ссылка подключения для второго телефона (новый ключ в ту же таблицу). */
  invite(author: string): Promise<{ author: string; tableName: string; link: string }>;
}
