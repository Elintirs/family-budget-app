import { type Analytics, type Bootstrap, type Pull } from '@budget/core';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api, apiKind, kv, log } from '@/adapters';
import { mirrorFrom } from '@/adapters/edits';
import { savePull } from '@/adapters/pull';
import { keys } from './keys';

/** Справочники и сводка из таблицы. Кэш в SQLite: без сети показываем последнее известное. */
export function useBootstrap() {
  return useQuery({
    queryKey: keys.bootstrap,
    queryFn: async () => {
      const b = await api.bootstrap().catch((e: Error) => {
        log.error('bootstrap', 'Не удалось получить данные таблицы', e);
        throw e;
      });
      log.info(
        'bootstrap',
        `«${b.tableName}»: ${b.subcategories.length} подкатегорий, ${b.accounts.length} счетов`,
        b.summary,
      );
      kv.setJson('bootstrap', b);
      kv.set('bootstrapAt', new Date().toISOString());
      return b;
    },
    initialData: () => kv.getJson<Bootstrap>('bootstrap') ?? undefined,
    initialDataUpdatedAt: () => Date.parse(kv.get('bootstrapAt') ?? '') || 0,
    // Обновляет useTableRev одним запросом pull (при открытии, возврате и раз в 2 минуты). Сам запрос
    // идёт только без сохранённых данных: иначе при открытии было 4 запроса, мешавших друг другу.
    staleTime: Infinity,
  });
}

/** Сервер без pull (API младше 5): до перезапуска ходим по-старому, тремя запросами. */
let pullUnsupported = false;
const isUnknownAction = (e: unknown) => /Неизвестное действие/.test(String(e));

/** Ответ pull в кэш телефона и в кэш экранов: сводка, аналитика и зеркало без отдельных запросов. */
export function applyPull(qc: QueryClient, p: Pull) {
  if (!savePull(p)) return;
  qc.setQueryData(keys.bootstrap, kv.getJson<Bootstrap>('bootstrap'));
  if (p.analytics) qc.setQueryData(keys.analytics, p.analytics);
  if (p.operations) qc.setQueryData(keys.table, p.operations);
}

/** Сводка, аналитика и зеркало заново: одним запросом pull, у старого сервера тремя. */
async function refreshAll(qc: QueryClient, known: number | undefined): Promise<'unchanged' | 'updated'> {
  if (!pullUnsupported) {
    try {
      const p = await api.pull(known, mirrorFrom());
      if (p.unchanged) return 'unchanged';
      applyPull(qc, p);
      return 'updated';
    } catch (e) {
      if (!isUnknownAction(e)) throw e;
      pullUnsupported = true;
      log.warn('pull', 'Сервер без pull: обновление тремя запросами');
    }
  }
  if (known !== undefined && (await api.rev()) === known) return 'unchanged';
  await Promise.all([
    qc.refetchQueries({ queryKey: keys.bootstrap }),
    qc.refetchQueries({ queryKey: keys.analytics }),
    qc.refetchQueries({ queryKey: keys.table }),
  ]);
  return 'updated';
}

/** «Потянуть вниз»: всё из таблицы заново. Крутилка только на жест, не на фоновые обновления. */
export function usePullRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    log.info('refresh', 'Потянули вниз');
    refreshAll(qc, undefined)
      .catch((e) => log.warn('refresh', 'Не удалось обновить', { error: String(e) }))
      .finally(() => setRefreshing(false));
  };
  return { refreshing, onRefresh };
}

/** Как часто сверять версию таблицы, пока приложение открыто. */
const REV_EVERY_MS = 2 * 60_000;

/**
 * Свежие данные без кнопки «Обновить»: при открытии приложения и раз в две минуты спрашиваем версию
 * таблицы (доли секунды). Изменилась (форма, Елена, правка руками) — перезагружаем сводку и аналитику.
 */
export function useTableRev() {
  const qc = useQueryClient();
  useEffect(() => {
    let busy = false;
    let unsupported = false;
    const check = async () => {
      if (busy || unsupported || AppState.currentState !== 'active' || apiKind() !== 'gas') return;
      busy = true;
      try {
        // Отправка сама вернёт свежие данные: параллельная проверка была бы лишним запросом.
        if (qc.isMutating({ mutationKey: keys.sync }) > 0) return;
        const known = qc.getQueryData<Bootstrap>(keys.bootstrap)?.rev;
        // Один запрос: та же версия -> {unchanged}, иначе сразу все данные (раньше rev и ещё три запроса).
        const r = await refreshAll(qc, known);
        if (r === 'updated')
          log.info(
            'rev',
            `Таблица изменилась: ${known ?? 'нет'} -> ${qc.getQueryData<Bootstrap>(keys.bootstrap)?.rev ?? '?'}`,
          );
      } catch (e) {
        // Старый скрипт таблицы без «rev»: не спрашиваем до перезапуска, обновление по старинке.
        if (/Неизвестное действие/.test(String(e))) unsupported = true;
        log.warn('rev', 'Версию таблицы не узнать', { error: String(e) });
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), REV_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [qc]);
}

/** Аналитика по месяцам из таблицы, кэш в SQLite. */
export function useAnalytics() {
  return useQuery({
    queryKey: keys.analytics,
    queryFn: async () => {
      const a = await api.analytics();
      kv.setJson('analytics', a);
      kv.set('analyticsAt', new Date().toISOString());
      return a;
    },
    initialData: () => kv.getJson<Analytics>('analytics') ?? undefined,
    // Без даты кэша запрос считал бы данные с прошлого запуска свежими и не обновлял их.
    initialDataUpdatedAt: () => Date.parse(kv.get('analyticsAt') ?? '') || 0,
    // Как и сводку, обновляет pull (useTableRev).
    staleTime: Infinity,
  });
}
