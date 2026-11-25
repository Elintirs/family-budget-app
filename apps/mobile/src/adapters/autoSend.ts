import { syncQueue, type Bootstrap, type SyncResult } from '@budget/core';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { api, kv, log, repo } from './index';
import { clearPendingFacts, ingestPending, takePendingFacts } from './notifications';
import { clearPendingRules, pendingRules } from './rules';
import { addEdit, mirrorFrom, pendingEdits, settleEdits } from './edits';
import { savePull } from './pull';
import { runRemindersFromCache } from './reminders';
import { pushWidgetState } from './widgetState';

/**
 * Отправка очереди в таблицу: одна функция и для кнопки, и для автоотправки, и для фоновой задачи.
 * Обновляет кэш сводки, чтобы главная и виджет сразу видели новые цифры.
 */
let inFlight: Promise<SyncResult> | null = null;

/** Отправка уже идёт (кнопка, автотаймер или фон): второй вызов ждёт ту же, а не шлёт параллельно. */
export function sendQueue(reason: 'кнопка' | 'авто' | 'фон'): Promise<SyncResult> {
  inFlight ??= send(reason).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function send(reason: 'кнопка' | 'авто' | 'фон'): Promise<SyncResult> {
  const rules = pendingRules();
  const edits = pendingEdits();
  // Остатки из пушей и свежие данные таблицы тем же запросом: раньше было ещё два запроса после отправки.
  const facts = takePendingFacts();
  const r = await syncQueue(repo, api, rules, edits, { balanceFacts: facts, pullFrom: mirrorFrom() });
  clearPendingRules(rules);
  settleEdits(edits, [...(r.response.edited ?? []), ...(r.response.missing ?? [])]);
  // Поменяли, пока шёл запрос: в таблицу ушла старая версия, отличие уйдёт следующей отправкой.
  for (const e of r.followUpEdits) addEdit(e);
  if (r.followUpEdits.length) log.info('sync', 'Правки во время отправки ушли в очередь', { ids: r.followUpEdits.map((e) => e.id) });
  if (r.response.missing?.length)
    log.warn('sync', 'Правки без строки в таблице (её удалили или поменяли руками)', {
      missing: r.response.missing,
    });
  kv.setJson('lastSyncAt', new Date().toISOString());
  // Остатки из пушей -> «Снимки балансов» (таблица отсекает повторы). Старый сервер их в sync не берёт.
  if (facts.length) {
    if (!r.response.facts) await api.balanceFacts(facts);
    clearPendingFacts(facts.length);
    log.info('sync', `Остатков из уведомлений отправлено: ${facts.length}`, r.response.facts);
  }
  const boot = kv.getJson<Bootstrap>('bootstrap');
  if (r.response.pull) savePull(r.response.pull);
  else if (boot)
    kv.setJson('bootstrap', {
      ...boot,
      summary: r.response.summary,
      balances: r.response.balances,
      ...(r.response.rev !== undefined ? { rev: r.response.rev } : {}),
    });
  log.info('sync', `отправлено ${r.sent} (${reason})`, {
    accepted: r.response.accepted.length,
    duplicates: r.response.duplicates.length,
    rejected: r.rejected,
    suspected: r.suspected,
  });
  return r;
}

/** Как часто фон сам скачивает таблицу, если отправлять нечего. */
const PULL_EVERY_MS = 30 * 60 * 1000;

/**
 * Свежая таблица в фоне: изменения второго телефона и правки руками. Раньше фон таблицу не читал, и без
 * открытия приложения сводка, остатки и виджет отставали на 15–24 часа (журналы 23–29.10). Совпала
 * версия: короткий ответ без данных.
 */
async function backgroundPull() {
  const last = Date.parse(kv.get('bg.pullAt') ?? '') || 0;
  if (Date.now() - last < PULL_EVERY_MS) {
    log.info('sync', 'Фон: размеченных нет');
    return;
  }
  kv.set('bg.pullAt', new Date().toISOString());
  const boot = kv.getJson<Bootstrap>('bootstrap');
  try {
    const p = await api.pull(boot?.rev, mirrorFrom());
    if (!savePull(p)) log.info('sync', 'Фон: таблица без изменений');
  } catch (e) {
    log.warn('sync', 'Фон: таблицу не скачать', e);
  }
}

const TASK = 'budget-auto-send';

/** Через сколько после последней разметки отправлять при открытом приложении: успеть поправить категорию. */
export const AUTO_SEND_DELAY_MS = 60_000;

// Фоновая задача: Android (WorkManager) запускает её примерно раз в 15 минут, когда есть сеть.
// Объявляется при загрузке модуля, поэтому модуль импортируется в корневом _layout.
// Отправка только при включённой автоотправке; напоминания (лимиты, регулярные, итоги) всегда.
TaskManager.defineTask(TASK, async () => {
  // Отметка запуска: по разрыву Главная видит, что прошивка усыпляет фон (state/background.ts).
  kv.set('bg.lastRun', new Date().toISOString());
  try {
    if (autoSend.enabled()) {
      await ingestPending(kv.get('author') ?? 'Олег');
      const ready = (await repo.list()).filter((o) => o.status === 'ready');
      // Остатки из пушей тоже повод отправить: раньше они ждали следующей размеченной операции.
      if (ready.length || pendingEdits().length || takePendingFacts().length) await sendQueue('фон');
      else await backgroundPull();
    }
    const ops = await repo.list();
    const boot = kv.getJson<Bootstrap>('bootstrap');
    if (boot) pushWidgetState(boot, ops);
    runRemindersFromCache(ops);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    log.error('sync', 'Фоновая отправка не удалась', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export const autoSend = {
  enabled: () => kv.get('autoSend') === '1',
  async set(on: boolean) {
    kv.set('autoSend', on ? '1' : '0');
    log.info('sync', on ? 'Автоотправка включена' : 'Автоотправка выключена');
    await autoSend.sync();
  },
  /** Привести регистрацию фоновой задачи в соответствие с настройкой (при запуске и при переключении). */
  async sync() {
    try {
      // Задача нужна всегда (напоминания), а отправляет она только при включённой автоотправке.
      const registered = await TaskManager.isTaskRegisteredAsync(TASK);
      if (!registered) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    } catch (e) {
      log.error('sync', 'Не удалось настроить фоновую отправку', e);
    }
  },
};
