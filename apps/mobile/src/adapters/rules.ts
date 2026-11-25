import { merchantKey, settleSent, type Bootstrap, type Rule } from '@budget/core';
import { kv } from './db';

/**
 * Правила «всегда так»: из таблицы (лист «Правила», общий для двух телефонов) плюс локальные,
 * ещё не отправленные. Локальное правило перекрывает табличное с тем же магазином.
 */
export function allRules(): Rule[] {
  const fromSheet = kv.getJson<Bootstrap>('bootstrap')?.rules ?? [];
  const local = kv.getJson<Rule[]>('rules.local') ?? [];
  const keys = new Set(local.map((r) => merchantKey(r.pattern)));
  return [...local, ...fromSheet.filter((r) => !keys.has(merchantKey(r.pattern)))];
}

export function saveRule(rule: Rule) {
  const key = merchantKey(rule.pattern);
  const local = (kv.getJson<Rule[]>('rules.local') ?? []).filter((r) => merchantKey(r.pattern) !== key);
  kv.setJson('rules.local', [rule, ...local]);
  const pending = (kv.getJson<Rule[]>('rules.pending') ?? []).filter((r) => merchantKey(r.pattern) !== key);
  kv.setJson('rules.pending', [...pending, rule]);
}

export function deleteRule(pattern: string) {
  // Удаление = правило «спрашивать» (subcategory null): так оно уйдёт и в таблицу.
  saveRule({ pattern, subcategory: null, author: kv.get('author') ?? 'Олег' });
}

export function pendingRules(): Rule[] {
  return kv.getJson<Rule[]>('rules.pending') ?? [];
}

/** Ушедшие правила убираем из очереди, если их не поменяли за время запроса. */
export function clearPendingRules(sent: Rule[]) {
  const key = (r: Rule) => merchantKey(r.pattern) ?? r.pattern;
  const sentKeys = new Set(sent.map(key));
  kv.setJson('rules.pending', settleSent(pendingRules(), sent, (r) => sentKeys.has(key(r)), key));
}
