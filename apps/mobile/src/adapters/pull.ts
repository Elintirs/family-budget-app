import type { Pull } from '@budget/core';
import { kv } from './db';
import { saveMirror } from './edits';
import { log } from './log';

/**
 * Ответ pull (или pull внутри ответа sync) в постоянный кэш телефона: сводка, аналитика, зеркало «Формы».
 * Тот же кэш, из которого экраны и виджет берут данные при запуске (initialData в хуках).
 */
export function savePull(p: Pull): boolean {
  if (p.unchanged || !p.bootstrap) return false;
  const at = new Date().toISOString();
  kv.setJson('bootstrap', { ...p.bootstrap, rev: p.rev });
  kv.set('bootstrapAt', at);
  if (p.analytics) {
    kv.setJson('analytics', p.analytics);
    kv.set('analyticsAt', at);
  }
  if (p.operations) saveMirror(p.operations);
  log.info(
    'pull',
    `Таблица одним запросом: ${p.bootstrap.accounts.length} счетов, строк с ${p.operations?.from.slice(0, 10) ?? '-'}: ${p.operations?.operations.length ?? 0}`,
    { rev: p.rev },
  );
  return true;
}
