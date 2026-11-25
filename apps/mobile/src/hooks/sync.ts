import { type Bootstrap, type SyncResult } from '@budget/core';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AUTO_SEND_DELAY_MS, autoSend, sendQueue } from '@/adapters/autoSend';
import { log } from '@/adapters';
import { keys } from './keys';
import { applyPull } from './table';
import { usePending } from './operations';

const SYNC_KEY = keys.sync;

/** Идёт ли отправка где угодно в приложении: кнопка на Главной видит и автоотправку. */
export function useSending() {
  return useIsMutating({ mutationKey: SYNC_KEY }) > 0;
}

export function useSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SYNC_KEY,
    mutationFn: (reason: 'кнопка' | 'авто' = 'кнопка') => sendQueue(reason),
    onSuccess: (r: SyncResult) => {
      qc.setQueryData<LastSync>(keys.lastSync, { result: r });
      // Сервер вернул свежие данные тем же ответом: зеркало и сводку не перечитываем.
      if (r.response.pull) {
        applyPull(qc, r.response.pull);
        return Promise.all([
          qc.invalidateQueries({ queryKey: keys.operations }),
          qc.invalidateQueries({ queryKey: keys.edits }),
        ]);
      }
      qc.setQueryData<Bootstrap>(keys.bootstrap, (b) => {
        if (!b) return b;
        return {
          ...b,
          summary: r.response.summary,
          balances: r.response.balances,
          ...(r.response.rev !== undefined ? { rev: r.response.rev } : {}),
        };
      });
      // Таблица изменилась нашей же записью: зеркало и правки перечитать.
      return Promise.all([
        qc.invalidateQueries({ queryKey: keys.operations }),
        qc.invalidateQueries({ queryKey: keys.edits }),
        qc.invalidateQueries({ queryKey: keys.table }),
      ]);
    },
    onError: (e: Error) => {
      log.error('sync', 'Отправка не удалась', e);
      qc.setQueryData<LastSync>(keys.lastSync, { error: e.message });
    },
  });
}

/**
 * Автоотправка при открытом приложении: размеченное уходит в таблицу через минуту после последнего
 * изменения (успеть поправить категорию). В фоне то же делает задача в adapters/autoSend.
 */
export function useAutoSend() {
  const { ready, edits } = usePending();
  const sync = useSync();
  const key = [
    ...ready.map((o) => `${o.id}:${o.subcategory ?? o.incomeCategory ?? ''}`),
    ...edits.map((e) => `edit:${e.id}:${JSON.stringify(e.fields)}:${e.deleted ? 1 : 0}`),
  ].join(',');
  useEffect(() => {
    void autoSend.sync();
  }, []);
  useEffect(() => {
    if (!key || !autoSend.enabled()) return;
    const t = setTimeout(() => {
      if (!sync.isPending) sync.mutate('авто');
    }, AUTO_SEND_DELAY_MS);
    return () => clearTimeout(t);
    // sync меняется на каждом рендере: перезапускаем таймер только по составу очереди.
  }, [key]);
}

export interface LastSync {
  result?: SyncResult;
  error?: string;
}
