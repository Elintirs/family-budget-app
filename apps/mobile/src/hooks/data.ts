import { merchantKey, popularSubcategories } from '@budget/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ingestPending, listener } from '@/adapters/notifications';
import { allRules, saveRule } from '@/adapters/rules';
import { runReminders } from '@/adapters/reminders';
import { kv, log } from '@/adapters';
import { keys } from './keys';
import { useAnalytics, useBootstrap } from './table';
import { useAllOperations, useHistory, useOperations, usePending, useRemainder } from './operations';
import { pushWidgetState } from '@/adapters/widgetState';

// Хуки по доменам: таблица (сводка, аналитика, версия), операции (зеркало, правки), отправка.
export { keys } from './keys';
export * from './table';
export * from './operations';
export * from './sync';

export type Author = 'Олег' | 'Елена';

export function useAuthor(): [Author, (a: Author) => void] {
  const [author, setState] = useState<Author>(() => (kv.get('author') as Author | null) ?? 'Олег');
  return [
    author,
    (a) => {
      kv.set('author', a);
      setState(a);
    },
  ];
}

/** Разбор пойманных уведомлений: при запуске, при возврате в приложение и на каждый новый пуш. */
export function useNotificationIngest() {
  const qc = useQueryClient();
  const [author] = useAuthor();
  useEffect(() => {
    const run = () =>
      ingestPending(author)
        .then((n) => {
          if (n) void qc.invalidateQueries({ queryKey: keys.operations });
        })
        .catch((e: Error) => log.error('ingest', 'Разбор уведомлений не удался', e));
    run();
    const app = AppState.addEventListener('change', (s) => s === 'active' && run());
    const sub = listener?.addListener('onCaptured', (e) => e.tracked && run());
    return () => {
      app.remove();
      sub?.remove();
    };
  }, [author, qc]);
}

export function useRules() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rules'], queryFn: () => allRules() });
  return {
    rules: q.data ?? [],
    save(rule: Parameters<typeof saveRule>[0]) {
      saveRule(rule);
      log.info('rules', `Правило: ${rule.pattern} -> ${rule.subcategory ?? 'спрашивать'}`);
      void qc.invalidateQueries({ queryKey: ['rules'] });
    },
    refresh: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  };
}

/**
 * Связь с Kotlin: цифры для виджетов и подсказки для кнопок в уведомлении.
 * Вызывается в корне приложения, обновляется при любом изменении данных.
 */
const FALLBACK_QUICK = ['Продукты', 'Рестораны и кафе', 'Транспорт'];

/** Напоминания при открытии и после обновления данных (повторы отсекаются по ключу в runReminders). */
export function useReminders() {
  const boot = useBootstrap().data;
  const analytics = useAnalytics().data;
  const ops = useAllOperations();
  useEffect(() => {
    if (!boot) return;
    // Небольшая пауза: после запуска данные приходят пачкой, считаем один раз на последнем наборе.
    const t = setTimeout(() => runReminders(boot, analytics, ops), 3_000);
    return () => clearTimeout(t);
  }, [boot, analytics, ops]);
}

export function useNativeBridge() {
  const boot = useBootstrap().data;
  const r = useRemainder();
  const { pending } = usePending();
  const ops = useOperations().data ?? [];
  const history = useHistory();
  const { rules } = useRules();

  useEffect(() => {
    if (!listener || !r || !boot) return;
    pushWidgetState(boot, ops);
  }, [boot, r, ops, pending.length]);

  useEffect(() => {
    if (!listener) return;
    const byMerchant: Record<string, string[]> = {};
    for (const rule of rules) {
      const k = merchantKey(rule.pattern);
      if (k && rule.subcategory) byMerchant[k] = [rule.subcategory];
    }
    // По магазину: что ставили чаще всего, по убыванию.
    const perMerchant = new Map<string, Map<string, number>>();
    for (const o of history) {
      const k = merchantKey(o.merchant);
      if (!k || !o.subcategory || byMerchant[k]) continue;
      const m = perMerchant.get(k) ?? new Map<string, number>();
      m.set(o.subcategory, (m.get(o.subcategory) ?? 0) + 1);
      perMerchant.set(k, m);
    }
    for (const [k, m] of perMerchant)
      byMerchant[k] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    // Дальше самые популярные по таблице и телефону; без данных стандартные, чтобы кнопок всегда было три.
    const frequent = [
      ...new Set([
        ...popularSubcategories({ history, popular: boot?.popular }).map(([n]) => n),
        ...FALLBACK_QUICK,
      ]),
    ].slice(0, 5);
    listener.setSuggestions(
      JSON.stringify({
        byMerchant,
        frequent,
      }),
    );
  }, [history, rules, boot?.popular]);
}
