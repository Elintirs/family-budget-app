import {
  AnalyticsSchema,
  PullSchema,
  BalancePointSchema,
  BootstrapSchema,
  DebtHistorySchema,
  SyncResponseSchema,
  TableOperationsSchema,
  type SheetApi,
} from '@budget/core';
import { z } from 'zod';
import { log } from './log';

/**
 * Apps Script Web App. Адрес и токен пока из .env.local (EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_TOKEN),
 * на этапе 5 придут из онбординга (QR или ссылка).
 */
/**
 * Чтение (GET) можно бросить раньше: экран уже показывает сохранённое, следующая проверка через 2 минуты.
 * Запись (POST) ждём дольше и повторяем чаще: её нельзя терять, повтор безопасен (sync идемпотентен по ID).
 * Журналы 12.10: хвосты чтения 20–150 с были из 30 с ожидания на каждую из трёх попыток.
 */
const LIMITS = {
  read: { timeoutMs: 20_000, retries: 2 },
  write: { timeoutMs: 30_000, retries: 3 },
};
const BACKOFF_MS = [2_000, 6_000];

/** Повторы безопасны: sync идемпотентен по ID операции, остальные запросы только читают или перезаписывают. */
export function createGasApi(url: string, token: string): SheetApi {
  /** Ошибка, после которой есть смысл повторить: сеть, таймаут, страница Google вместо ответа скрипта, 5xx. */
  class Retryable extends Error {}

  async function once(
    action: string,
    body: unknown,
    params: Record<string, string>,
    timeoutMs: number,
  ): Promise<{ data: unknown; ms?: number; reads?: number }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const query = Object.entries(params)
      .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
      .join('');
    let res: Response;
    try {
      res = await fetch(`${url}?action=${action}&token=${encodeURIComponent(token)}${query}`, {
        method: body === undefined ? 'GET' : 'POST',
        // text/plain: Apps Script не отвечает на CORS-preflight, а для него этот тип «простой».
        headers: body === undefined ? undefined : { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new Retryable(ctrl.signal.aborted ? `нет ответа за ${timeoutMs / 1000} с` : `сеть: ${String(e)}`);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let payload: {
      ok: boolean;
      data?: unknown;
      error?: string;
      status?: number;
      ms?: number;
      reads?: number;
    };
    try {
      payload = JSON.parse(text);
    } catch {
      // Google иногда отвечает своей страницей 404/500 вместо скрипта: это лечится повтором.
      log.warn('api', `${action}: ответ не JSON`, { http: res.status, head: text.slice(0, 120) });
      throw new Retryable(`Таблица ответила не JSON (HTTP ${res.status})`);
    }
    if (!payload.ok) {
      log.error('api', `${action}: ошибка таблицы`, { status: payload.status, error: payload.error });
      // Тело запроса потерялось по дороге (сервер получил пустой запрос) или сбой на стороне Google.
      const lostBody = body !== undefined && /received null|expected object/.test(payload.error ?? '');
      if (lostBody || (payload.status ?? 0) >= 500) throw new Retryable(payload.error ?? 'Ошибка таблицы');
      throw new Error(payload.error ?? 'Ошибка таблицы');
    }
    return { data: payload.data, ms: payload.ms, reads: payload.reads };
  }

  async function call<S extends z.ZodTypeAny>(
    action: string,
    schema: S,
    body?: unknown,
    params: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    const { timeoutMs, retries } = body === undefined ? LIMITS.read : LIMITS.write;
    const started = Date.now();
    for (let attempt = 1; ; attempt++) {
      const tried = Date.now();
      try {
        const { data, ms, reads } = await once(action, body, params, timeoutMs);
        // Сервер присылает своё время и число чтений листов: видно, где теряются секунды.
        const server =
          ms !== undefined ? ` (таблица ${ms} мс${reads !== undefined ? `, листов ${reads}` : ''})` : '';
        // С повторами отдельно время удачной попытки: иначе хвост из ожиданий не отличить от медленной таблицы.
        const retried = attempt > 1 ? `, попытка ${attempt}: ${Date.now() - tried} мс` : '';
        log.info('api', `${action}: ${Date.now() - started} мс${server}${retried}`);
        return schema.parse(data);
      } catch (e) {
        if (!(e instanceof Retryable) || attempt >= retries) {
          log.error('api', `${action}: не удалось за ${attempt} попыток`, { error: String(e) });
          throw e;
        }
        log.warn('api', `${action}: повтор ${attempt + 1}`, { error: e.message });
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
      }
    }
  }

  return {
    bootstrap: () => call('bootstrap', BootstrapSchema),
    rev: () => call('rev', z.object({ rev: z.number() })).then((r) => r.rev),
    pull: (rev, from) =>
      call('pull', PullSchema, undefined, { from, ...(rev !== undefined ? { rev: String(rev) } : {}) }),
    sync: (request) => call('sync', SyncResponseSchema, request),
    analytics: () => call('analytics', AnalyticsSchema),
    operations: (from) => call('operations', TableOperationsSchema, { from }),
    invite: (author) =>
      call('invite', z.object({ author: z.string(), tableName: z.string(), link: z.string() }), { author }),
    async setMonthLimit(limit) {
      await call('setMonthLimit', z.unknown(), { limit });
    },
    async upsertGoal(goal) {
      await call('upsertGoal', z.unknown(), goal);
    },
    async deleteGoal(id) {
      await call('deleteGoal', z.unknown(), { id });
    },
    async setAccountSettings(settings) {
      await call('setAccountSettings', z.unknown(), settings);
    },
    balanceHistory: (accountId) =>
      call('balanceHistory', z.object({ points: z.array(BalancePointSchema) }), { accountId }).then(
        (r) => r.points,
      ),
    debtHistory: () => call('debtHistory', DebtHistorySchema, {}),
    async upsertRecurring(rule) {
      await call('upsertRecurring', z.unknown(), rule);
    },
    async deleteRecurring(id) {
      await call('deleteRecurring', z.unknown(), { id });
    },
    async setGroupLimit(group, limit) {
      await call('setGroupLimit', z.unknown(), { group, limit });
    },
    async setSubcategoryHidden(name, hidden) {
      await call('setSubcategoryHidden', z.unknown(), { name, hidden });
    },
    async setSubcategoryOneOff(name, oneOff) {
      await call('setSubcategoryOneOff', z.unknown(), { name, oneOff });
    },
    async upsertSubcategory(name, group) {
      await call('upsertSubcategory', z.unknown(), { name, group });
    },
    async setSubcategoryLimit(name, limit) {
      await call('setSubcategoryLimit', z.unknown(), { name, limit });
    },
    async balanceFacts(facts) {
      await call('balanceFacts', z.unknown(), facts);
    },
  };
}
