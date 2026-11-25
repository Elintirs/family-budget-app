import {
  dailyRemainder,
  findOverdraft,
  formatRub,
  refreshStatus,
  withTable,
  type Operation,
} from '@budget/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Alert } from 'react-native';
import { addEdit, mirrorFrom, pendingEdits, saveMirror, savedMirror } from '@/adapters/edits';
import { api, clock, kv, log, repo } from '@/adapters';
import { keys } from './keys';
import { useBootstrap } from './table';

/** Операции на телефоне, кроме удалённых. */
export function useOperations() {
  return useQuery({ queryKey: keys.operations, queryFn: () => repo.list() });
}

/** Строки «Формы» за прошлый и текущий месяц: зеркало таблицы (форма, второй телефон, правки руками). */
export function useTableOperations() {
  return useQuery({
    queryKey: keys.table,
    queryFn: async () => {
      const m = await api.operations(mirrorFrom());
      log.info('table', `Строк таблицы с ${m.from.slice(0, 10)}: ${m.operations.length}`);
      saveMirror(m);
      return m;
    },
    initialData: () => savedMirror(),
    initialDataUpdatedAt: () => Date.parse(kv.get('mirrorAt') ?? '') || 0,
    // Как и сводку, обновляет pull (useTableRev) и ответ отправки.
    staleTime: Infinity,
    // Старый скрипт таблицы без «operations»: живём на операциях телефона, без повторов.
    retry: false,
  });
}

export function useEdits() {
  return useQuery({ queryKey: keys.edits, queryFn: () => pendingEdits() });
}

/**
 * Всё, что видно в истории и подсказках: таблица (с правками, ждущими отправки) плюс телефон.
 * Без зеркала (нет сети, старый скрипт) только операции телефона, как раньше.
 */
export function useAllOperations(): Operation[] {
  const local = useOperations().data;
  const table = useTableOperations().data;
  const edits = useEdits().data;
  return useMemo(() => mergedOperations(local, table, edits), [local, table, edits]);
}

type Table = ReturnType<typeof useTableOperations>['data'];
type Edits = ReturnType<typeof useEdits>['data'];
let lastMerge: { local?: Operation[]; table?: Table; edits?: Edits; result: Operation[] } | undefined;

/**
 * Склейка одна на изменение данных: хук держат корень (виджеты, напоминания) и открытые вкладки,
 * и раньше каждый считал withTable заново. Данные запросов общие, поэтому сравнения ссылок хватает.
 */
function mergedOperations(local?: Operation[], table?: Table, edits?: Edits): Operation[] {
  if (lastMerge && lastMerge.local === local && lastMerge.table === table && lastMerge.edits === edits)
    return lastMerge.result;
  const result = withTable(local ?? [], table?.operations, table?.from, edits ?? []);
  lastMerge = { local, table, edits, result };
  return result;
}

/**
 * Правка операции. Неотправленная правится на телефоне. Отправленная (в том числе чужая или строка
 * формы) уходит правкой в таблицу, а до отправки видна поверх зеркала.
 */
export function useUpdateOperation() {
  const qc = useQueryClient();
  const save = useSaveOperation();
  return async (op: Operation, patch: Partial<Operation>, opts: { deleted?: boolean } = {}) => {
    if (op.status !== 'synced') {
      await save.mutateAsync(opts.deleted ? { ...op, deleted: true } : { ...op, ...patch });
      return;
    }
    const { kind, amount, occurredAt, accountId, toAccountId, subcategory, incomeCategory, comment, oneOff } =
      patch;
    const fields = Object.fromEntries(
      Object.entries({
        kind,
        amount,
        occurredAt,
        accountId,
        toAccountId,
        subcategory,
        incomeCategory,
        comment,
        oneOff,
      }).filter(([, v]) => v !== undefined),
    );
    addEdit(opts.deleted ? { id: op.id, deleted: true, fields: {} } : { id: op.id, fields });
    log.info('edit', opts.deleted ? 'Удаление отправленной' : 'Правка отправленной', { id: op.id, fields });
    // Своя копия на телефоне тоже меняется, чтобы не спорила с правкой до отправки.
    const mine = await repo.get(op.id);
    if (mine)
      await repo.upsert(opts.deleted ? { ...mine, deleted: true } : { ...mine, ...patch, status: 'synced' });
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.edits }),
      qc.invalidateQueries({ queryKey: keys.operations }),
    ]);
  };
}

export function usePending() {
  const ops = useOperations().data ?? [];
  const edits = useEdits().data ?? [];
  return useMemo(() => {
    const pending = ops.filter((o) => o.status !== 'synced');
    return {
      pending,
      ready: pending.filter((o) => o.status === 'ready'),
      incomplete: pending.filter((o) => o.status === 'new'),
      /** Правки отправленных: тоже ждут отправки, считаются на кнопке. */
      edits,
    };
  }, [ops, edits]);
}

export function useRemainder() {
  const boot = useBootstrap().data;
  const ops = useOperations().data ?? [];
  return useMemo(() => {
    if (!boot) return null;
    const groups = new Map(boot.subcategories.map((s) => [s.name, s.group]));
    return dailyRemainder(boot.summary, ops, clock.now(), (name) => groups.get(name));
  }, [boot, ops]);
}

export function useSaveOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (op: Operation) => {
      const next = refreshStatus(op);
      await repo.upsert(next);
      log.info('operation', `${next.kind} ${next.amount / 100} ₽ -> ${next.status}`, {
        id: next.id,
        source: next.source,
        subcategory: next.subcategory,
        accountId: next.accountId,
        deleted: next.deleted,
        notDuplicate: next.notDuplicate,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.operations }),
  });
}

/** Операции с подкатегорией за 60 дней: история для подсказок и «частых» (с таблицей: и Елены, и формы). */
export function useHistory() {
  const ops = useAllOperations();
  return useMemo(() => {
    const since = Date.now() - 60 * 24 * 3600 * 1000;
    return ops.filter((o) => o.kind === 'expense' && o.subcategory && Date.parse(o.occurredAt) >= since);
  }, [ops]);
}

/**
 * Перед ручной операцией или правкой: не уводит ли она карту или наличные в минус. Если уводит,
 * спрашивает, а не запрещает: остаток на телефоне с последнего скачивания таблицы и может отставать.
 * Пуши банков не проверяются: раз банк провёл, деньги были, а минус значит ошибку в другой строке.
 */
export function useOverdraftGuard() {
  const boot = useBootstrap().data;
  const local = useOperations().data;
  return (before: Operation | undefined, after: Operation): Promise<boolean> => {
    const hit = boot && findOverdraft(boot.accounts, boot.balances, local ?? [], before, after);
    if (!hit) return Promise.resolve(true);
    const name = boot.accounts.find((a) => a.id === hit.accountId)?.name ?? hit.accountId;
    log.warn('overdraft', `${name} уйдёт в минус`, { id: after.id, ...hit });
    return new Promise((resolve) =>
      Alert.alert(
        `«${name}» уйдёт в минус`,
        `Сейчас по таблице ${formatRub(hit.now)}, после операции будет ${formatRub(hit.after)}. ` +
          'Карта и наличные в минус не уходят: проверь счёт и направление перевода.',
        [
          { text: 'Исправить', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Всё равно сохранить', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      ),
    );
  };
}
