import { z } from 'zod';

/**
 * Контракт между мобилкой и Apps Script. Меняем только здесь:
 * tsc сразу покажет, что разошлось в gas и в apps/mobile.
 */

/**
 * Версия контракта. Растёт, когда сервер начинает отдавать то, без чего старое приложение работает
 * неправильно. Сервер присылает свою в bootstrap: если она больше, приложение просит обновиться.
 * 2: зеркало таблицы (operations), правки отправленных (edits), версия таблицы (rev), лимиты подкатегорий.
 * 3: регулярные платежи вручную (upsertRecurring, deleteRecurring), лимиты групп (setGroupLimit),
 *    скрытие подкатегорий (setSubcategoryHidden).
 * 4: цели (goals), настройки счёта (setAccountSettings), лента снимков (balanceHistory), долги по месяцам
 *    (debtHistory), последняя версия приложения (latestApp).
 * 5: всё одним запросом (pull), в sync остатки из пушей (balanceFacts) и свежие данные (pull),
 *    метки счёта без карты (markers).
 */
export const API_VERSION = 6;

const kopecks = z.number().int();
const iso = z.string().datetime({ offset: true });

/**
 * Массив в ответе сервера, терпимый к новому: элемент, который эта версия приложения не понимает
 * (новое значение enum, новый тип счёта), пропускается, а не роняет весь ответ. Так 0.3.11 упала
 * на счёте типа adjustment. Только для того, что телефон читает; запросы проверяются строго.
 */
export function lenientArray<T extends z.ZodTypeAny>(item: T) {
  return z.array(z.unknown()).transform((xs) =>
    xs.flatMap((x) => {
      const r = item.safeParse(x);
      return r.success ? [r.data as z.infer<T>] : [];
    }),
  );
}

export const OperationSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['expense', 'income', 'transfer']),
  amount: kopecks.positive(),
  occurredAt: iso,
  accountId: z.string().optional(),
  toAccountId: z.string().optional(),
  subcategory: z.string().optional(),
  incomeCategory: z.string().optional(),
  comment: z.string().optional(),
  merchant: z.string().optional(),
  source: z.enum(['manual', 'notification', 'form']),
  sourceApp: z.string().optional(),
  alsoFrom: z.array(z.string()).optional(),
  author: z.string(),
  status: z.enum(['new', 'ready', 'synced']),
  deleted: z.boolean().optional(),
  splitGroupId: z.string().optional(),
  duplicateOf: z.string().optional(),
  heldFor: z.string().optional(),
  cardMask: z.string().optional(),
  sourceText: z.string().optional(),
  notDuplicate: z.boolean().optional(),
  /** Единовременный расход: в аналитике отдельно от регулярных. Не задано: как у подкатегории. */
  oneOff: z.boolean().optional(),
});

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['debit', 'credit', 'cash', 'receivable', 'adjustment']),
  bankPackage: z.string().optional(),
  cardMasks: z.array(z.string()),
  /** Слова из уведомления для счёта без карты («счет RUB»). */
  markers: z.array(z.string()).optional(),
  /** Чья карта: «*1101» -> «Олег». */
  cardOwners: z.record(z.string(), z.string()).optional(),
  creditLimit: kopecks.optional(),
  hidden: z.boolean().optional(),
  /**
   * Служебный счёт «Поправки». По проводу он идёт типом credit (скрытый, без долга): приложение 0.3.11
   * не знает типа adjustment и отказывалось принимать bootstrap (журнал 31.10). Узнаётся по этой отметке.
   */
  adjustment: z.boolean().optional(),
});

export const SubcategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Повседневные / Обязательные / Крупные. */
  group: z.string(),
  monthLimit: kopecks.optional(),
  /** Скрыта из выбора в приложении: строки «Справочника» не удаляем (от порядка зависит Дэшборд, на имя ссылается история). */
  hidden: z.boolean().optional(),
  /** Траты этой подкатегории по умолчанию единовременные (ремонт машины, штрафы). */
  oneOff: z.boolean().optional(),
});

/** Сырые цифры из «Лимитов на месяц»: остаток на день считает ядро (dailyRemainder). */
export const SummarySchema = z.object({
  asOf: iso,
  monthLimit: kopecks,
  /** Потрачено в этом месяце до сегодняшнего дня (не включая сегодня). */
  spentMonthBeforeToday: kopecks,
  spentToday: kopecks,
  /** Какие категории расходов идут в лимит (в таблице только «Повседневные»). Пусто: все. */
  limitGroups: z.array(z.string()).default([]),
});

export const AccountBalanceSchema = z.object({
  accountId: z.string(),
  /** Расчётный остаток по операциям. */
  computed: kopecks,
  /** Последний факт из банка. */
  fact: kopecks.optional(),
  factAt: iso.optional(),
  /** Расчётный остаток на момент снимка factAt: с ним и сравниваем факт, траты после снимка не дают «разницы». */
  computedAtFact: kopecks.optional(),
  /** Для кредитки: долг. */
  debt: kopecks.optional(),
});

export const RuleSchema = z.object({
  pattern: z.string(),
  /** null: «спрашивать», магазин продаёт разное. */
  subcategory: z.string().nullable(),
  author: z.string(),
});

/**
 * Регулярный платёж, заведённый руками (лист «Регулярные»). Оплаченным в месяце считается, если нашлась
 * операция со словом match в комментарии, магазине или подкатегории и с похожей суммой.
 */
export const RecurringRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amount: kopecks.positive(),
  /** Число месяца, когда обычно списывается. */
  day: z.number().int().min(1).max(31),
  match: z.string().min(2),
  /** Расход: подкатегория. Доход: чей он («Олег», «Елена»), чужой доход с теми же словами не засчитывается. */
  subcategory: z.string().optional(),
  accountId: z.string().optional(),
  author: z.string(),
  /**
   * Дальше всё необязательное, с 0.3.16: гибкий повтор и доходы. Нет поля: как раньше (расход раз в
   * месяц day-го числа). Старое приложение эти поля просто не видит; сервер при его правке их не трогает.
   */
  /** Расход, доход (зарплата) или перевод (платёж по кредитке). */
  kind: z.enum(['expense', 'income', 'transfer']).catch('expense').optional(),
  /** Куда перевод: для платежей по кредитке. */
  toAccountId: z.string().optional(),
  /** Сумма «плавает»: верхняя граница, amount тогда нижняя. */
  amountMax: kopecks.positive().optional(),
  /** Ещё слова для узнавания оплаты или прихода, кроме match. */
  keywords: z.array(z.string()).optional(),
  schedule: z
    .object({
      every: z.enum(['day', 'week', 'month', 'year']).catch('month'),
      /** Каждые N дней, недель, месяцев, лет. */
      interval: z.number().int().min(1).max(36).default(1),
      /** Числа месяца (1…31); 32 значит последний день. */
      days: z.array(z.number().int().min(1).max(32)).optional(),
      /** Дни недели: 0 понедельник … 6 воскресенье. */
      weekdays: z.array(z.number().int().min(0).max(6)).optional(),
      /** Выпало на выходной: раньше (пятница), позже (понедельник) или как есть. */
      shift: z.enum(['none', 'before', 'after']).catch('none').default('none'),
      /** С какого дня считать (YYYY-MM-DD), до какого и сколько раз. */
      start: z.string().optional(),
      end: z.string().optional(),
      count: z.number().int().positive().optional(),
    })
    .optional(),
  paused: z.boolean().optional(),
});

/** Цель накоплений (лист «Цели»). Отложено считает сервер по переводам с комментарием «Цель: <название>». */
export const GoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  target: kopecks.positive(),
  /** Срок «2027-06». */
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  /** Счёт-копилка, куда переводим. */
  accountId: z.string().optional(),
  author: z.string(),
  saved: kopecks.default(0),
});

/** Последняя версия приложения: ссылка на APK (Google Диск) и что нового. */
export const LatestAppSchema = z.object({
  version: z.string(),
  // Без z.url(): в Apps Script нет класса URL, проверка падала бы на любой ссылке.
  url: z.string().regex(/^https:\/\/\S+$/),
  notes: z.string().default(''),
});

/** Снимок остатка из банка и расчёт таблицы на тот же момент: лента сверки на экране счёта. */
export const BalancePointSchema = z.object({
  at: iso,
  /** Остаток из банка (для кредитки долг со знаком минус, как расчёт). */
  fact: kopecks,
  computedAt: kopecks,
  source: z.string(),
});

/** Долг кредиток на конец месяцев и что было в этом месяце. */
export const DebtHistorySchema = z.object({
  accounts: z.array(
    z.object({
      accountId: z.string(),
      debt: kopecks,
      months: z.array(z.object({ month: z.string(), debt: kopecks })),
      paidThisMonth: kopecks,
    }),
  ),
  interestThisMonth: kopecks,
});

/** Правка настроек счёта в «Счетах» (поля, которых нет, не трогаем). */
export const AccountSettingsSchema = z.object({
  accountId: z.string().min(1),
  cardMasks: z.array(z.string().regex(/^\d{4}$/)).optional(),
  markers: z.array(z.string().trim().min(2)).optional(),
  /** «*1101» -> «Олег»; пустое имя убирает владельца. */
  cardOwners: z.record(z.string().regex(/^\*\d{4}$/), z.string().trim()).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startBalance: kopecks.optional(),
  startDebt: kopecks.optional(),
  creditLimit: kopecks.optional(),
});

export const BootstrapSchema = z.object({
  tableName: z.string(),
  subcategories: lenientArray(SubcategorySchema),
  incomeCategories: z.array(z.string()),
  accounts: lenientArray(AccountSchema),
  summary: SummarySchema,
  balances: lenientArray(AccountBalanceSchema),
  rules: lenientArray(RuleSchema),
  /** Чей это телефон: автор, к которому привязан ключ устройства. */
  author: z.string().optional(),
  /** Подкатегории по числу расходов за последние 90 дней, по убыванию. */
  popular: z.array(z.object({ name: z.string(), count: z.number().int() })).default([]),
  /** Версия таблицы: растёт на каждой записи. Телефон сверяет её дешёвым запросом rev и не грузит всё зря. */
  rev: z.number().int().optional(),
  /** Версия контракта на сервере (API_VERSION). Нет поля: сервер старше версии 2. */
  apiVersion: z.number().int().optional(),
  /** Регулярные платежи с листа «Регулярные». */
  recurring: lenientArray(RecurringRuleSchema).default([]),
  /** Лимиты групп вне лимита на день («Обязательные», «Крупные») на месяц. */
  groupLimits: z.record(z.string(), kopecks).default({}),
  goals: lenientArray(GoalSchema).default([]),
  latestApp: LatestAppSchema.optional(),
});

/**
 * Правка уже записанной в таблицу операции (своей, чужой или строки формы): поля целиком или удаление.
 * Сервер находит строку по ID, в строке остаётся, кто и когда правил.
 */
export const EditSchema = z.object({
  id: z.string().min(1),
  deleted: z.boolean().optional(),
  fields: OperationSchema.pick({
    kind: true,
    amount: true,
    occurredAt: true,
    accountId: true,
    toAccountId: true,
    subcategory: true,
    incomeCategory: true,
    comment: true,
    oneOff: true,
    merchant: true,
    cardMask: true,
    sourceText: true,
  })
    .partial()
    .default({}),
});

export const BalanceFactSchema = z.object({
  accountId: z.string(),
  at: iso,
  balance: kopecks.optional(),
  /** Кредитка: «Доступно», долг = лимит − доступно. */
  available: kopecks.optional(),
  source: z.enum(['notification', 'manual', 'month-end']),
});

export const SyncRequestSchema = z.object({
  operations: z.array(OperationSchema),
  rules: z.array(RuleSchema).default([]),
  edits: z.array(EditSchema).default([]),
  /** Остатки из пушей тем же запросом (раньше вторым запросом balanceFacts после sync). */
  balanceFacts: z.array(BalanceFactSchema).default([]),
  /** Вернуть свежие данные после записи: телефону не нужен следующий запрос за зеркалом и сводкой. */
  pull: z.object({ from: iso }).optional(),
});

export const SyncResponseSchema = z.object({
  accepted: z.array(z.string()),
  /** Уже были в таблице: повтор после обрыва связи, это не ошибка. */
  duplicates: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string(), reason: z.string() })),
  /** Похоже на ту же покупку с другого телефона: не записано, ждёт решения человека. */
  suspected: z.array(z.object({ id: z.string(), otherAuthor: z.string() })).default([]),
  summary: SummarySchema,
  balances: lenientArray(AccountBalanceSchema),
  /** Версия таблицы после записи: телефон не перезагружает то, что сам только что записал. */
  rev: z.number().int().optional(),
  /** Правки, применённые к таблице. */
  edited: z.array(z.string()).default([]),
  /** Правки, строку которых не нашли (её уже удалили или поменяли руками): телефон их забывает. */
  missing: z.array(z.string()).default([]),
  /** Есть, если сервер принял balanceFacts в теле sync; без него телефон шлёт остатки отдельно. */
  facts: z.object({ written: z.number().int(), duplicates: z.number().int() }).optional(),
  pull: z.lazy(() => PullSchema).optional(),
});

/** Строки «Формы» с даты from: зеркало таблицы на телефоне (история, подсказки, регулярные, счета). */
export const TableOperationsSchema = z.object({
  from: iso,
  operations: lenientArray(OperationSchema),
  rev: z.number().int().optional(),
});

export type Subcategory = z.infer<typeof SubcategorySchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type AccountBalance = z.infer<typeof AccountBalanceSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Bootstrap = z.infer<typeof BootstrapSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
/** Что телефон шлёт: поля со значением по умолчанию можно не передавать. */
export type SyncRequestInput = z.input<typeof SyncRequestSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type BalanceFact = z.infer<typeof BalanceFactSchema>;
export type Edit = z.infer<typeof EditSchema>;
export type RecurringRule = z.infer<typeof RecurringRuleSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type LatestApp = z.infer<typeof LatestAppSchema>;
export type BalancePoint = z.infer<typeof BalancePointSchema>;
export type DebtHistory = z.infer<typeof DebtHistorySchema>;
export type AccountSettings = z.infer<typeof AccountSettingsSchema>;
export type TableOperations = z.infer<typeof TableOperationsSchema>;

/** Аналитика по месяцам из «Обработанных данных» (переводы не считаются ни доходом, ни расходом). */
export const MonthStatsSchema = z.object({
  /** «2026-10» */
  month: z.string(),
  income: kopecks,
  expense: kopecks,
  /** Повседневные / Обязательные / Крупные -> сумма расходов */
  groups: z.record(z.string(), kopecks),
  subcategories: z.record(z.string(), kopecks),
  incomeCategories: z.record(z.string(), kopecks),
  /** Единовременные расходы месяца (входят в expense) и по подкатегориям. */
  oneOff: kopecks.optional(),
  oneOffSubcategories: z.record(z.string(), kopecks).optional(),
});
export const AnalyticsSchema = z.object({ months: z.array(MonthStatsSchema) });

/**
 * Всё, что телефон держит из таблицы, одним ответом: каждый вызов Apps Script стоит ~3 с сам по себе
 * (журналы 12.10: rev 3 с при 40 мс работы таблицы), поэтому три запроса дороже одного большого.
 * unchanged: версия совпала с той, что у телефона, остального в ответе нет.
 */
export const PullSchema = z.object({
  rev: z.number().int(),
  unchanged: z.boolean().optional(),
  bootstrap: BootstrapSchema.optional(),
  analytics: AnalyticsSchema.optional(),
  operations: TableOperationsSchema.optional(),
});
export type Pull = z.infer<typeof PullSchema>;
export type MonthStats = z.infer<typeof MonthStatsSchema>;
export type Analytics = z.infer<typeof AnalyticsSchema>;

/**
 * Доменные типы описаны отдельно от схем (domain/operation.ts, domain/account.ts). Проверка на этапе
 * компиляции: если поле добавили в одном месте и забыли в другом, typecheck упадёт здесь.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const _contractMatchesDomain: [
  Same<z.infer<typeof OperationSchema>, import('./domain/operation').Operation>,
  Same<z.infer<typeof AccountSchema>['type'], import('./domain/account').AccountType>,
] = [true, true];
