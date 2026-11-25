import { z } from 'zod';
import { addAccount, formRows, schema, setAccountStart } from './api/admin';
import { setOperationDate, sortForm } from './setup/form';
import { deleteFormRow, fillDefaultAccount, fillEmptyAccounts, setFormCell } from './setup/formFix';
import { fromLatin1Mojibake, looksMojibake, migrate, monthlyAccounts } from './setup/migrate';
import { renameDictionary } from './setup/rename';
import {
  AccountSettingsSchema,
  API_VERSION,
  LatestAppSchema,
  SyncRequestSchema,
  type LatestApp,
} from '@budget/core';
import { setAccountSettings } from './sheets/accounts';
import { readAccounts } from './sheets/read';
import {
  bootstrap as buildBootstrap,
  profileParts,
  route,
  staticPart,
  touchesStatic,
  HttpError,
  type Ctx,
  type StaticPart,
} from './api/router';
import { cachedSpreadsheet } from './sheets/cache';

/**
 * Точки входа Apps Script. Логика в api/ и sheets/, здесь только окружение:
 * Script Properties, LockService, ContentService.
 *
 * Script Properties:
 *   SPREADSHEET_ID  таблица, с которой работаем (тестовая копия или рабочая)
 *   DEVICES         {"<token>": "Олег", ...}
 */

declare const __SETUP__: {
  spreadsheetId: string;
  devices: Record<string, string>;
  adminToken?: string;
  prodSpreadsheetId?: string;
} | null;

type Event = { parameter?: Record<string, string>; postData?: { contents: string } };

const props = () => PropertiesService.getScriptProperties();

/** С какой даты дозаполнять счёт у строк формы: раньше всё сверено с банком вручную (с 10.10). */
function fillSince(): Date {
  return new Date(props().getProperty('FILL_ACCOUNTS_SINCE') ?? '2026-10-10T00:00:00+03:00');
}

function devices(): Record<string, string> {
  return JSON.parse(props().getProperty('DEVICES') ?? '{}') as Record<string, string>;
}

function json(data: unknown) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Версия таблицы: растёт на каждой записи (sync, остатки, лимит, форма, ручная правка через триггер).
 * Телефон спрашивает её за доли секунды и грузит bootstrap, только если она изменилась.
 */
const revKey = (id: string) => `REV:${id}`;

/** Одна блокировка скрипта на все записи. Вложенный вызов (sync внутри уже взятой) её не ждёт. */
let locked = false;
function withLock<T>(fn: () => T): T {
  if (locked) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(20_000);
  locked = true;
  try {
    return fn();
  } finally {
    locked = false;
    lock.releaseLock();
  }
}
function rev(id: string): number {
  return Number(props().getProperty(revKey(id)) ?? '0');
}
function bumpRev(id: string): number {
  const next = Math.max(rev(id) + 1, Date.now());
  props().setProperty(revKey(id), String(next));
  return next;
}

/**
 * Версия «постоянных» листов (справочник, правила, регулярные, цели: StaticPart). Растёт только от их
 * правок, а не от записи операций: после sync эти листы берутся из кэша, а не читаются заново.
 */
const staticKey = (id: string) => `STATIC:${id}`;
const staticRev = (id: string) => Number(props().getProperty(staticKey(id)) ?? '0');
function bumpStatic(id: string) {
  props().setProperty(staticKey(id), String(Math.max(staticRev(id) + 1, Date.now())));
}
/** Действия, которые меняют постоянные листы. sync тоже, если в нём правила (решается по телу). */
const STATIC_WRITES = new Set([
  'setSubcategoryLimit',
  'upsertSubcategory',
  'setSubcategoryHidden',
  'setSubcategoryOneOff',
  'upsertRecurring',
  'deleteRecurring',
  'upsertGoal',
  'deleteGoal',
]);

/** Ответы, которые зависят от тела запроса (счёт ленты сверки): в ключе кэша ещё и тело. */
const CACHED_BY_BODY = new Set(['balanceHistory', 'debtHistory']);

/** Последняя версия приложения: Script Property LATEST_APP ({version, url, notes}), пишет setLatestApp. */
function latestApp(): { latestApp?: LatestApp } {
  try {
    const raw = props().getProperty('LATEST_APP');
    return raw ? { latestApp: LatestAppSchema.parse(JSON.parse(raw)) } : {};
  } catch {
    return {};
  }
}

/** Действия, которые только читают: их ответ можно взять из кэша, пока версия таблицы та же. */
const CACHED = new Set(['bootstrap', 'analytics']);
/** Действия, после которых версия таблицы растёт. */
const WRITES = new Set([
  'sync',
  'balanceFacts',
  'setMonthLimit',
  'setSubcategoryLimit',
  'upsertSubcategory',
  'upsertRecurring',
  'deleteRecurring',
  'setGroupLimit',
  'setSubcategoryHidden',
  'setSubcategoryOneOff',
  'upsertGoal',
  'deleteGoal',
  'setAccountSettings',
]);

/**
 * Ключ кэша: таблица, версия и календарный день (формулы «Лимитов» зависят от СЕГОДНЯ()).
 * CacheService хранит до 100 КБ на ключ и до 6 часов.
 */
function cacheKey(action: string, id: string): string {
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  // Версия контракта в ключе: после выкладки нового кода старый ответ из кэша не отдаётся.
  return `${action}:${API_VERSION}:${id}:${rev(id)}:${day}`;
}

/** Служебные запросы: отдельный токен ADMIN_TOKEN, явный выбор таблицы test | prod. */
function handleAdmin(e: Event, body: unknown) {
  const p = e.parameter ?? {};
  // Служебная правка (не пробная) пишет в те же листы, что и телефоны: под той же блокировкой.
  // balanceFacts пишет и без dry=0, поэтому тоже под блокировкой.
  const writes = p.dry === '0' || p.action === 'balanceFacts';
  const result = writes ? withLock(() => adminAction(e, body)) : adminAction(e, body);
  // Любая служебная правка (не пробная) меняет версию таблицы: телефоны подтянут новое.
  if (p.dry === '0' || p.action === 'balanceFacts' || p.action === 'setDevice') {
    const id = props().getProperty(p.table === 'prod' ? 'PROD_SPREADSHEET_ID' : 'SPREADSHEET_ID');
    if (id) {
      bumpRev(id);
      // Служебная правка могла задеть любые листы, в том числе постоянные.
      if (p.dry === '0') bumpStatic(id);
    }
  }
  return result;
}

/**
 * «2026-10-12» как день в часовом поясе скрипта (Москва), а не полночь UTC (03:00 по Москве).
 * Дата старта сравнивается с днём операции строго «после»: время в ней сдвигало бы границу.
 */
function dayParam(v: string | undefined): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v ?? '');
}

function adminAction(e: Event, body: unknown) {
  const p = e.parameter ?? {};
  const admin = props().getProperty('ADMIN_TOKEN');
  if (!admin || p.admin !== admin) throw new HttpError(401, 'Нужен ADMIN_TOKEN');
  const table = p.table === 'prod' ? 'PROD_SPREADSHEET_ID' : 'SPREADSHEET_ID';
  const id = props().getProperty(table);
  if (!id) throw new HttpError(500, `Не задан ${table}`);
  const ss = SpreadsheetApp.openById(id);
  switch (p.action) {
    case 'schema':
      return { table: ss.getName(), sheets: schema(ss, Number(p.rows ?? 3)) };
    case 'formRows':
      return { table: ss.getName(), rows: formRows(ss, p.from ?? '', p.to ?? '') };
    case 'migrate':
      return { table: ss.getName(), dry: p.dry !== '0', steps: migrate(ss, p.dry !== '0') };
    case 'renameDictionary': {
      const dry = p.dry !== '0';
      const result = renameDictionary(ss, dry);
      // Имена счетов зашиты в формулы этого листа: новый счёт в «Счетах» требует пересборки.
      return { table: ss.getName(), ...result, monthly: monthlyAccounts(ss, dry) };
    }
    case 'addAccount': {
      // Кириллица в параметрах иногда приходит кракозябрами, как в author у balanceFacts.
      const u = (v: string | undefined) => (v && looksMojibake(v) ? fromLatin1Mojibake(v) : v);
      return {
        table: ss.getName(),
        dry: p.dry !== '0',
        ...addAccount(
          ss,
          {
            name: u(p.name) ?? '',
            type: u(p.type) ?? 'Дебет',
            balance: Number(p.balance ?? 0),
            date: dayParam(p.date),
            ...(p.bank ? { bank: u(p.bank) } : {}),
            ...(p.tags ? { tags: u(p.tags) } : {}),
            ...(p.comment ? { comment: u(p.comment) } : {}),
          },
          p.dry !== '0',
        ),
      };
    }
    case 'accountSettings': {
      // Маски карт с владельцами и прочие настройки счёта, как с экрана счёта; тело AccountSettings.
      const req = AccountSettingsSchema.parse(body);
      if (p.dry === '0') setAccountSettings(ss, req);
      const acc = readAccounts(ss).accounts.find((a) => a.id === req.accountId);
      return { table: ss.getName(), dry: p.dry !== '0', request: req, account: acc };
    }
    case 'setAccountStart':
      return {
        table: ss.getName(),
        dry: p.dry !== '0',
        ...setAccountStart(
          ss,
          p.name ?? '',
          {
            ...(p.balance !== undefined ? { balance: Number(p.balance) } : {}),
            ...(p.debt !== undefined ? { debt: Number(p.debt) } : {}),
            date: dayParam(p.date),
          },
          p.dry !== '0',
        ),
      };
    case 'balanceFacts':
      // Снимок остатков в выбранную таблицу (test | prod) от имени «вручную».
      return {
        table: ss.getName(),
        ...(route(
          {
            ss,
            tableName: ss.getName(),
            author:
              p.author && looksMojibake(p.author) ? fromLatin1Mojibake(p.author) : (p.author ?? 'вручную'),
            now: new Date(),
          },
          'balanceFacts',
          body,
        ) as object),
      };
    case 'sync': {
      // Операции и правки строк от имени автора, как с телефона (тот же sync: ID, дубли, правки по ID).
      // Для разовых исправлений таблицы по журналам; dry только проверяет тело запроса.
      const author =
        p.author && looksMojibake(p.author) ? fromLatin1Mojibake(p.author) : (p.author ?? 'вручную');
      if (p.dry !== '0') return { table: ss.getName(), dry: true, request: SyncRequestSchema.parse(body) };
      return {
        table: ss.getName(),
        ...(route({ ss, tableName: ss.getName(), author, now: new Date() }, 'sync', body) as object),
      };
    }
    case 'limits': {
      // Лимит месяца и лимиты подкатегорий одним запросом, как с экрана «Лимиты»; тело
      // {monthLimit?, subcategories?: {имя: копейки | null}}. dry только проверяет тело.
      const req = z
        .object({
          monthLimit: z.number().int().positive().optional(),
          subcategories: z.record(z.string().min(1), z.number().int().positive().nullable()).optional(),
        })
        .parse(body);
      if (p.dry === '0') {
        const ctx = { ss, tableName: ss.getName(), author: 'вручную', now: new Date() };
        if (req.monthLimit) route(ctx, 'setMonthLimit', { limit: req.monthLimit });
        for (const [name, limit] of Object.entries(req.subcategories ?? {}))
          route(ctx, 'setSubcategoryLimit', { name, limit });
      }
      return { table: ss.getName(), dry: p.dry !== '0', request: req };
    }
    case 'profile': {
      // Только чтение: сколько стоит каждая часть bootstrap, аналитика и зеркало (кэш листов общий, по порядку).
      const cached = cachedSpreadsheet(ss);
      const pctx: Ctx = { ss: cached, tableName: ss.getName(), author: 'замер', now: new Date() };
      const parts: Record<string, { ms: number; reads: number }> = {};
      for (const [name, read] of Object.entries(profileParts)) {
        const t = Date.now();
        const before = cached.reads();
        read(pctx);
        parts[name] = { ms: Date.now() - t, reads: cached.reads() - before };
      }
      return { table: ss.getName(), parts };
    }
    case 'setDevice': {
      // Привязка устройства к автору и таблице без запуска setup: token, author, target=test|prod.
      const all = devices();
      if (!p.token || !all[p.token]) throw new HttpError(404, 'Нет такого устройства');
      all[p.token] = p.target === 'prod' ? `${p.author}|prod` : String(p.author);
      props().setProperty('DEVICES', JSON.stringify(all));
      return { device: all[p.token] };
    }
    case 'fillEmptyAccounts':
      return {
        table: ss.getName(),
        ...fillEmptyAccounts(
          ss,
          props().getProperty('DEFAULT_ACCOUNT') ?? 'Т-Банк',
          p.dry !== '0',
          fillSince(),
        ),
      };
    case 'sortForm':
      return { table: ss.getName(), dry: p.dry !== '0', ...sortForm(ss, p.dry !== '0') };
    case 'setOperationDate':
      return {
        table: ss.getName(),
        dry: p.dry !== '0',
        rows: setOperationDate(
          ss,
          new Date(p.from ?? ''),
          new Date(p.to ?? ''),
          new Date(p.date ?? ''),
          p.dry !== '0',
        ),
      };
    case 'setFormCell':
      return setFormCell(ss, Number(p.row), p.column ?? '', p.value ?? '', p.expectId, p.dry !== '0');
    case 'deleteFormRow':
      return deleteFormRow(ss, Number(p.row), p.expectId ?? '', p.dry !== '0');
    case 'installFormTrigger': {
      // Триггер «при отправке формы» на выбранной таблице: ставит счёт по умолчанию в ответы без счёта.
      if (p.account) props().setProperty('DEFAULT_ACCOUNT', p.account);
      const exists = ScriptApp.getProjectTriggers().some(
        (t) => t.getHandlerFunction() === 'onFormSubmit' && t.getTriggerSourceId() === id,
      );
      if (!exists && p.dry === '0')
        ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(id).onFormSubmit().create();
      return {
        table: ss.getName(),
        exists,
        dry: p.dry !== '0',
        account: props().getProperty('DEFAULT_ACCOUNT') ?? 'Т-Банк',
      };
    }
    case 'setLatestApp': {
      // Новая версия приложения: телефоны увидят плашку «Скачать и установить».
      const app = LatestAppSchema.parse({ version: p.version, url: p.url, notes: p.notes ?? '' });
      if (p.dry === '0') props().setProperty('LATEST_APP', JSON.stringify(app));
      return { dry: p.dry !== '0', app };
    }
    case 'installChangeTrigger': {
      // Триггер «при изменении» на выбранной таблице: ручные правки меняют версию таблицы.
      const exists = ScriptApp.getProjectTriggers().some(
        (t) => t.getHandlerFunction() === 'onTableChange' && t.getTriggerSourceId() === id,
      );
      if (!exists && p.dry === '0')
        ScriptApp.newTrigger('onTableChange').forSpreadsheet(id).onChange().create();
      return { table: ss.getName(), exists, dry: p.dry !== '0', rev: rev(id) };
    }
    default:
      void body;
      throw new HttpError(404, `Неизвестное служебное действие «${p.action}»`);
  }
}

/** Ответ bootstrap или analytics из кэша по версии таблицы (cacheKey), если он там есть. */
function fromCache(action: string, id: string): Record<string, unknown> | null {
  const hit = CacheService.getScriptCache().get(cacheKey(action, id));
  return hit ? (JSON.parse(hit) as Record<string, unknown>) : null;
}

/** JSON в кэш, если влезает (CacheService: до 100 КБ на ключ, до 6 часов). Возвращает разобранную копию. */
function putCache(key: string, data: unknown): Record<string, unknown> {
  const text = JSON.stringify(data);
  if (text.length < 95_000) CacheService.getScriptCache().put(key, text, 6 * 3600);
  return JSON.parse(text) as Record<string, unknown>;
}

/** Постоянные листы: из кэша по своей версии или чтение (StaticPart). */
function cachedStatic(ctx: Ctx, id: string): StaticPart {
  const key = `static:${API_VERSION}:${id}:${staticRev(id)}`;
  const hit = CacheService.getScriptCache().get(key);
  if (hit) return JSON.parse(hit) as StaticPart;
  return putCache(key, staticPart(ctx)) as unknown as StaticPart;
}

/** Собрать bootstrap или analytics и положить в кэш по версии таблицы. */
function buildCached(action: 'bootstrap' | 'analytics', ctx: Ctx, id: string): Record<string, unknown> {
  if (action === 'analytics') return putCache(cacheKey(action, id), route(ctx, action, null));
  return putCache(cacheKey(action, id), { ...buildBootstrap(ctx, cachedStatic(ctx, id)), rev: rev(id) });
}

/**
 * Всё, что телефон держит из таблицы, одним ответом: сводка и аналитика из кэша по версии, зеркало «Формы»
 * с даты from. Каждый вызов Apps Script стоит ~3 с сам по себе, поэтому один большой ответ дешевле трёх.
 */
function pullData(ctx: Ctx, id: string, from: string) {
  const bootstrap = fromCache('bootstrap', id) ?? buildCached('bootstrap', ctx, id);
  bootstrap.author = ctx.author;
  const analytics = fromCache('analytics', id) ?? buildCached('analytics', ctx, id);
  // Зеркало тоже по версии: второй телефон после той же правки берёт готовое.
  const opsKey = `${cacheKey('operations', id)}:${from}`;
  const opsHit = CacheService.getScriptCache().get(opsKey);
  const operations = opsHit
    ? (JSON.parse(opsHit) as unknown)
    : putCache(opsKey, route(ctx, 'operations', { from }));
  return { rev: rev(id), bootstrap, analytics, operations };
}

function handle(e: Event, body: unknown) {
  try {
    if (e.parameter?.admin) return json({ ok: true, data: handleAdmin(e, body) });

    const token = e.parameter?.token ?? '';
    const device = devices()[token];
    if (!device) throw new HttpError(401, 'Неизвестное устройство: нужен токен из «addDevice»');
    // «Олег|prod»: устройство работает с рабочей таблицей, иначе с тестовой (SPREADSHEET_ID).
    const [author = '', table] = device.split('|');
    const id = props().getProperty(table === 'prod' ? 'PROD_SPREADSHEET_ID' : 'SPREADSHEET_ID');
    if (!id) throw new HttpError(500, 'Не задана таблица устройства: запусти setup');
    const action = e.parameter?.action ?? 'ping';
    const started = Date.now();
    // Версия без открытия таблицы: самый частый и самый дешёвый запрос.
    if (action === 'rev') return json({ ok: true, data: { rev: rev(id) }, ms: Date.now() - started });
    // То же для pull: версия у телефона совпала, остальное не нужно и таблицу не открываем.
    if (action === 'pull' && Number(e.parameter?.rev) === rev(id))
      return json({ ok: true, data: { rev: rev(id), unchanged: true }, ms: Date.now() - started });

    if (CACHED.has(action)) {
      const hit = fromCache(action, id);
      if (hit) {
        // Автор не входит в ключ кэша: таблица одна на двоих.
        if (action === 'bootstrap') hit.author = author;
        return json({ ok: true, data: hit, ms: Date.now() - started, reads: 0, cached: true });
      }
    }

    const raw = SpreadsheetApp.openById(id);
    const ss = cachedSpreadsheet(raw);
    const ctx: Ctx = {
      ss,
      tableName: raw.getName(),
      author,
      now: new Date(),
      defaultAccount: props().getProperty('DEFAULT_ACCOUNT') ?? 'Т-Банк',
      ...latestApp(),
    };
    if (action === 'invite') {
      // Приглашение второго телефона: новый ключ для автора в ту же таблицу, что у приглашающего.
      const who = String((body as { author?: unknown } | null)?.author ?? '').trim();
      if (!['Олег', 'Елена'].includes(who)) throw new HttpError(400, 'Укажи автора: Олег или Елена');
      const lock = LockService.getScriptLock();
      lock.waitLock(20_000);
      try {
        const all = devices();
        const newToken = Utilities.getUuid().replace(/-/g, '');
        all[newToken] = table === 'prod' ? `${who}|prod` : who;
        props().setProperty('DEVICES', JSON.stringify(all));
        const url = ScriptApp.getService().getUrl();
        const link = `budget://connect?u=${encodeURIComponent(url)}&t=${newToken}`;
        return json({ ok: true, data: { author: who, tableName: ctx.tableName, link } });
      } finally {
        lock.releaseLock();
      }
    }
    if (action === 'pull') {
      const from = String(e.parameter?.from ?? '');
      return json({ ok: true, data: pullData(ctx, id, from), ms: Date.now() - started, reads: ss.reads() });
    }
    if (action === 'sync') {
      // Два телефона могут отправлять одновременно: строки не должны перемешаться.
      const lock = LockService.getScriptLock();
      lock.waitLock(20_000);
      try {
        const req = SyncRequestSchema.parse(body);
        const data = route(ctx, action, req);
        // Строки из приложения могут быть «в прошлом»: держим «Форму» отсортированной по дате.
        sortForm(ss, false);
        // Подстраховка триггера формы: строки формы без счёта получают счёт по умолчанию.
        fillEmptyAccounts(ss, ctx.defaultAccount ?? 'Т-Банк', false, fillSince());
        const next = bumpRev(id);
        if (touchesStatic(req)) bumpStatic(id);
        // Свежие данные тем же ответом: телефону не нужен следующий запрос за зеркалом и сводкой.
        const pull = req.pull ? pullData(ctx, id, req.pull.from) : undefined;
        return json({
          ok: true,
          data: { ...(data as object), rev: next, ...(pull ? { pull } : {}) },
          ms: Date.now() - started,
          reads: ss.reads(),
        });
      } finally {
        lock.releaseLock();
      }
    }
    if (CACHED.has(action)) {
      const data = buildCached(action as 'bootstrap' | 'analytics', ctx, id);
      return json({ ok: true, data, ms: Date.now() - started, reads: ss.reads() });
    }
    if (CACHED_BY_BODY.has(action)) {
      // Лента сверки и долги по месяцам: тяжёлый расчёт, пока таблица та же, ответ тот же.
      const key = `${cacheKey(action, id)}:${JSON.stringify(body ?? {})}`;
      const hit = CacheService.getScriptCache().get(key);
      if (hit)
        return json({ ok: true, data: JSON.parse(hit), ms: Date.now() - started, reads: 0, cached: true });
      const data = putCache(key, route(ctx, action, body));
      return json({ ok: true, data, ms: Date.now() - started, reads: ss.reads() });
    }
    // Записи с двух телефонов не должны пересечься: дописывание строк и версия таблицы под одной блокировкой.
    const data = WRITES.has(action)
      ? withLock(() => {
          const out = route(ctx, action, body);
          bumpRev(id);
          if (STATIC_WRITES.has(action)) bumpStatic(id);
          return out;
        })
      : route(ctx, action, body);
    return json({ ok: true, data, ms: Date.now() - started, reads: ss.reads() });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    return json({ ok: false, status, error: err instanceof Error ? err.message : String(err) });
  }
}

export function doGet(e: Event) {
  return handle(e, null);
}

export function doPost(e: Event) {
  return handle(e, e.postData?.contents ? JSON.parse(e.postData.contents) : null);
}

/** Запускать из редактора: выдаёт токен для нового телефона. */
export function addDevice(author = 'Олег') {
  const token = Utilities.getUuid().replace(/-/g, '');
  const all = devices();
  all[token] = author;
  props().setProperty('DEVICES', JSON.stringify(all));
  const url = ScriptApp.getService().getUrl();
  Logger.log(`Устройство для «${author}»\nURL: ${url}\nТокен: ${token}`);
  return { url, token, author };
}

export function listDevices() {
  const all = devices();
  Logger.log(
    Object.entries(all)
      .map(([t, a]) => `${a}: ${t.slice(0, 6)}…`)
      .join('\n') || 'нет устройств',
  );
  return all;
}

export function removeDevice(tokenPrefix: string) {
  const all = devices();
  for (const t of Object.keys(all)) if (t.startsWith(tokenPrefix)) delete all[t];
  props().setProperty('DEVICES', JSON.stringify(all));
}

export function setSpreadsheet(id: string) {
  props().setProperty('SPREADSHEET_ID', id);
  Logger.log(`Таблица: ${SpreadsheetApp.openById(id).getName()}`);
}

/** Отладка из редактора: что видит bootstrap. */
export function inspect() {
  const id = props().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Не задан SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(id);
  const data = route({ ss, tableName: ss.getName(), author: 'редактор', now: new Date() }, 'bootstrap', null);
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}

/**
 * Первый запуск из редактора: привязывает таблицу и телефоны из gas/.env.local.
 * Заодно вызывает окно разрешений Google (доступ к таблицам).
 */
export function setup() {
  if (!__SETUP__) throw new Error('Собрано без gas/.env.local: нечего настраивать');
  props().setProperty('SPREADSHEET_ID', __SETUP__.spreadsheetId);
  props().setProperty('DEVICES', JSON.stringify({ ...devices(), ...__SETUP__.devices }));
  if (__SETUP__.adminToken) props().setProperty('ADMIN_TOKEN', __SETUP__.adminToken);
  if (__SETUP__.prodSpreadsheetId) props().setProperty('PROD_SPREADSHEET_ID', __SETUP__.prodSpreadsheetId);
  const ss = SpreadsheetApp.openById(__SETUP__.spreadsheetId);
  Logger.log(`Готово: таблица «${ss.getName()}», устройств ${Object.keys(devices()).length}`);
}

/** Триггер «при отправке формы»: ответ без счёта получает счёт по умолчанию. */
export function onFormSubmit(e: GoogleAppsScript.Events.SheetsOnFormSubmit) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== 'Форма') return;
    const account = props().getProperty('DEFAULT_ACCOUNT') ?? 'Т-Банк';
    fillDefaultAccount(sh, e.range.getRow(), account);
    bumpRev(sh.getParent().getId());
  } finally {
    lock.releaseLock();
  }
  warm(e.range.getSheet().getParent().getId());
}

/** Триггер «при изменении» таблицы: ручная правка в Google Таблицах тоже меняет версию, телефоны обновятся. */
export function onTableChange(e: GoogleAppsScript.Events.SheetsOnChange) {
  const id = e.source.getId();
  bumpRev(id);
  // Ручная правка могла задеть любой лист, в том числе справочник или правила.
  bumpStatic(id);
  warm(id);
}

/**
 * После ручной правки или ответа формы собрать сводку и аналитику в кэш заранее: телефон, который
 * спросит следующим, получит готовое (pull ~1 с работы таблицы вместо ~5 с сборки). Ошибка не мешает.
 */
function warm(id: string) {
  try {
    const raw = SpreadsheetApp.openById(id);
    const ctx: Ctx = {
      ss: cachedSpreadsheet(raw),
      tableName: raw.getName(),
      author: '',
      now: new Date(),
      defaultAccount: props().getProperty('DEFAULT_ACCOUNT') ?? 'Т-Банк',
      ...latestApp(),
    };
    buildCached('bootstrap', ctx, id);
    buildCached('analytics', ctx, id);
  } catch (err) {
    console.warn('Кэш не прогрет', err);
  }
}
