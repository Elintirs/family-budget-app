import type { Kopecks } from '../domain/money';
import type { Operation } from '../domain/operation';

/**
 * Одна покупка часто даёт несколько уведомлений. Источники дублей:
 *  1. Один телефон, разные приложения: банк + Mir Pay (+ SMS банка).
 *  2. Одно приложение перевыпускает то же уведомление (обновление, группировка, перезапуск сервиса).
 *  3. Разные телефоны: общий счёт или карта, банк шлёт пуш и Олегу, и Елене.
 * И есть обратный риск: две настоящие одинаковые покупки подряд (два кофе по 150 ₽).
 *
 * Правила:
 *  - (2) отсекаем по ключу уведомления Android + тексту: тот же ключ и тот же текст = то же событие.
 *  - (1) склеиваем только события из РАЗНЫХ приложений с той же суммой и направлением в окне ±3 мин
 *    (с SMS ±10 мин: журнал 17.10, SMS Т-Банка приходит на 5–6 минут позже пуша и Mir Pay),
 *    пары 1:1. Два пуша одного банка никогда не склеиваются: это две покупки.
 *    Главным остаётся банк (у него счёт и остаток), Mir Pay дополняет мерчантом.
 *  - (3) решает таблица при отправке: та же сумма, тот же счёт, ±10 мин, другой автор
 *    (у одного SMS, у другого пуш или Mir Pay: разница те же 5–6 минут)
 *    -> операция не пишется, а возвращается как «похоже на дубль», человек подтверждает.
 */

export const DEDUP_WINDOW_MS = 3 * 60 * 1000;
/** Окно, если одно из событий SMS, и окно дублей между телефонами. */
export const SMS_WINDOW_MS = 10 * 60 * 1000;

/** SMS банка приходит через приложение сообщений (com.android.mms, com.google.android.apps.messaging). */
export const isSmsApp = (pkg: string | undefined) => /\bmms\b|messaging|\bsms\b/i.test(pkg ?? '');

/** Окно склейки пары событий: SMS доставляется с задержкой. */
export const pairWindow = (a: string | undefined, b: string | undefined) =>
  isSmsApp(a) || isSmsApp(b) ? SMS_WINDOW_MS : DEDUP_WINDOW_MS;

export interface CapturedEvent {
  id: string;
  /** Пакет Android-приложения: ru.nspk.mirpay, com.idamob.tinkoff.android ... */
  source: string;
  /** Ключ уведомления Android (StatusBarNotification.key). */
  notificationKey?: string;
  text: string;
  postedAt: number;
  amount: Kopecks;
  direction: 'debit' | 'credit';
  merchant?: string;
  accountId?: string;
  balance?: Kopecks;
}

export interface MergedPurchase {
  primary: CapturedEvent;
  /** Склеенные с ним события других приложений. */
  merged: CapturedEvent[];
}

/** Платёжные приложения-посредники: их событие подчинённое, если есть пуш банка. */
const WALLETS = new Set(['ru.nspk.mirpay']);

const rank = (e: CapturedEvent) => (WALLETS.has(e.source) ? 1 : 0);

/** Шаг 2: повторы одного и того же уведомления. */
export function dropRepeats(events: CapturedEvent[]): CapturedEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.source}|${e.notificationKey ?? e.postedAt}|${e.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Шаг 1: склейка событий разных приложений одной покупки, пары 1:1 по ближайшему времени. */
export function mergeAcrossApps(events: CapturedEvent[], windowMs?: number): MergedPurchase[] {
  const sorted = dropRepeats(events).sort((a, b) => rank(a) - rank(b) || a.postedAt - b.postedAt);
  const groups: MergedPurchase[] = [];
  for (const e of sorted) {
    let best: MergedPurchase | undefined;
    let bestDelta = Infinity;
    for (const g of groups) {
      const sameApp = g.primary.source === e.source || g.merged.some((m) => m.source === e.source);
      if (sameApp) continue; // из одного приложения не склеиваем никогда
      if (g.primary.amount !== e.amount || g.primary.direction !== e.direction) continue;
      const delta = Math.abs(g.primary.postedAt - e.postedAt);
      if (delta <= (windowMs ?? pairWindow(g.primary.source, e.source)) && delta < bestDelta) {
        best = g;
        bestDelta = delta;
      }
    }
    if (best) best.merged.push(e);
    else groups.push({ primary: e, merged: [] });
  }
  return groups.sort((a, b) => a.primary.postedAt - b.primary.postedAt);
}

/** Мерчант: у банка часто латиница из терминала, у Mir Pay понятнее, берём первый непустой по рангу. */
export function mergedMerchant(p: MergedPurchase): string | undefined {
  return [p.primary, ...p.merged].map((e) => e.merchant).find(Boolean);
}

/** Шаг 3: есть ли в таблице похожая операция от другого автора. */
export function findCrossDeviceDuplicate(
  op: Operation,
  existing: Operation[],
  windowMs = SMS_WINDOW_MS,
): Operation | undefined {
  const t = Date.parse(op.occurredAt);
  return existing.find((x) => {
    if (x.id === op.id || x.deleted || x.kind !== op.kind || x.amount !== op.amount) return false;
    // Переводы не сравниваем: в таблице это две стороны одного движения, их сводит человек.
    if (op.kind === 'transfer') return false;
    if (x.accountId && op.accountId && x.accountId !== op.accountId) return false;
    const dt = Math.abs(Date.parse(x.occurredAt) - t);
    // Другой телефон: та же покупка с общего счёта в пределах окна.
    if (x.author !== op.author) return dt <= windowMs;
    // Тот же телефон: тот же пуш, пойманный повторно, у него то же время до секунд.
    // Две настоящие покупки подряд на ту же сумму отличаются хотя бы на десятки секунд.
    return x.source === 'notification' && op.source === 'notification' && dt <= 5000;
  });
}

/**
 * Тот же пуш, пойманный повторно (догрузка из шторки после переустановки): уже есть операция
 * из того же приложения с той же суммой и временем ±2 мин, в том числе отправленная.
 */
export function findRecaptured(
  existing: Operation[],
  sourceApp: string,
  amount: number,
  postedAt: number,
  windowMs = 2 * 60 * 1000,
  direction?: 'debit' | 'credit',
): Operation | undefined {
  return existing.find(
    (x) =>
      !x.deleted &&
      // «Отмена» на ту же сумму через полминуты (Додо 14.10) не повтор покупки.
      (direction === undefined || (x.kind === 'income') === (direction === 'credit')) &&
      x.source === 'notification' &&
      (x.sourceApp === sourceApp || x.alsoFrom?.includes(sourceApp)) &&
      x.amount === amount &&
      Math.abs(Date.parse(x.occurredAt) - postedAt) <= windowMs,
  );
}
