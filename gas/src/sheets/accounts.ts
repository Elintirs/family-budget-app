import { joinAccountTags, splitAccountTags } from '@budget/core';
import type { AccountSettings, BalancePoint, DebtHistory, Goal } from '@budget/core';
import { kop, movementAfter, readAccounts, SHEETS } from './read';
import { sheet, Table, type SheetLike, type SpreadsheetLike } from './table';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** Последний момент месяца «2026-09» (23:59:59 последнего дня). */
function monthEnd(year: number, month0: number): Date {
  return new Date(year, month0 + 1, 0, 23, 59, 59);
}

const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Лента сверки счёта: снимки из «Снимков балансов» (новые сверху) и расчёт таблицы на тот же момент
 * (расчёт сейчас минус движение после снимка). Для кредитки снимок хранит долг: отдаём его со знаком минус,
 * как расчёт, чтобы разница считалась одинаково.
 */
export function balanceHistory(ss: SpreadsheetLike, accountId: string, limit = 12): BalancePoint[] {
  const sh = ss.getSheetByName('Снимки балансов');
  if (!sh) return [];
  const computed = readAccounts(ss).balances.find((b) => b.accountId === accountId)?.computed ?? 0;
  const points: BalancePoint[] = [];
  for (const r of new Table(sh).rows()) {
    if (text(r['Счёт']) !== accountId) continue;
    const at = r['Дата'];
    if (!(at instanceof Date)) continue;
    const hasBalance = text(r['Остаток']) !== '';
    const hasDebt = text(r['Долг']) !== '';
    if (!hasBalance && !hasDebt) continue;
    points.push({
      at: at.toISOString(),
      fact: hasBalance ? kop(r['Остаток']) : -kop(r['Долг']),
      computedAt: computed - movementAfter(ss, accountId, at),
      source: text(r['Источник']) || 'вручную',
    });
  }
  return points.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/**
 * Долг кредиток на конец последних месяцев (с даты старта счёта), погашено в этом месяце (переводы на
 * кредитку) и проценты в этом месяце (подкатегория «Проценты и комиссии» на кредитках).
 */
export function debtHistory(ss: SpreadsheetLike, now: Date, months = 6): DebtHistory {
  const { accounts, balances } = readAccounts(ss);
  const settings = ss.getSheetByName('Счета');
  const starts = new Map(
    (settings ? new Table(settings).rows() : []).map((r) => [text(r['Счёт']), r['Дата старта']]),
  );
  const credit = accounts.filter((a) => a.type === 'credit' && !a.adjustment);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const form = new Table(sheet(ss, SHEETS.form)).rows();
  let interestThisMonth = 0;
  const paid = new Map<string, number>();
  for (const r of form) {
    const at = r['Отметка времени'];
    if (!(at instanceof Date) || at < monthStart) continue;
    const kind = text(r['Это доход или расход?']);
    const from = text(r['Карта/счёт']);
    const to = text(r['Куда перевели']);
    if (kind === 'Перевод' && credit.some((a) => a.id === to))
      paid.set(to, (paid.get(to) ?? 0) + kop(r['Сумма']));
    if (
      kind === 'Расход' &&
      text(r['Подкатегория']) === 'Проценты и комиссии' &&
      credit.some((a) => a.id === from)
    )
      interestThisMonth += kop(r['Сумма']);
  }
  return {
    accounts: credit.map((a) => {
      const computed = balances.find((b) => b.accountId === a.id)?.computed ?? 0;
      const start = starts.get(a.id);
      const list: { month: string; debt: number }[] = [];
      for (let i = months - 1; i >= 1; i--) {
        const end = monthEnd(now.getFullYear(), now.getMonth() - i);
        if (start instanceof Date && end < start) continue;
        list.push({ month: monthKeyOf(end), debt: Math.max(0, -(computed - movementAfter(ss, a.id, end))) });
      }
      list.push({ month: monthKeyOf(now), debt: Math.max(0, -computed) });
      return {
        accountId: a.id,
        debt: Math.max(0, -computed),
        months: list,
        paidThisMonth: paid.get(a.id) ?? 0,
      };
    }),
    interestThisMonth,
  };
}

/** Настройки счёта в «Счетах»: только переданные поля; маски через запятую, суммы в рублях. */
export function setAccountSettings(ss: SpreadsheetLike, s: AccountSettings): void {
  const t = new Table(sheet(ss, 'Счета'));
  const key = 'Счёт';
  const set = (column: string, value: unknown) => {
    if (!t.update(key, s.accountId, column, value)) throw new Error(`Нет счёта «${s.accountId}» в «Счетах»`);
  };
  if (s.cardMasks || s.markers || s.cardOwners) {
    // Пришло не всё: остальное берём из ячейки, чтобы правка масок не стёрла слова и владельцев.
    const row = t.rows().find((r) => text(r[key]) === s.accountId);
    if (!row) throw new Error(`Нет счёта «${s.accountId}» в «Счетах»`);
    const now = splitAccountTags(text(row['Маски карт']));
    const masks = (s.cardMasks ?? now.cardMasks).map((m) => `*${m.replace('*', '')}`);
    const owners: Record<string, string> = { ...now.owners, ...s.cardOwners };
    for (const m of Object.keys(owners)) if (!masks.includes(m) || !owners[m]) delete owners[m];
    set('Маски карт', joinAccountTags(masks, s.markers ?? now.markers, owners));
  }
  if (s.startDate) {
    const [y, m, d] = s.startDate.split('-').map(Number);
    set('Дата старта', new Date(y!, m! - 1, d!));
  }
  if (s.startBalance !== undefined) set('Остаток на старт', s.startBalance / 100);
  if (s.startDebt !== undefined) set('Долг на старт', s.startDebt / 100);
  if (s.creditLimit !== undefined) set('Кредитный лимит', s.creditLimit / 100);
}

export const GOALS_SHEET = 'Цели';
const GOAL_HEADERS = ['ID', 'Название', 'Сумма', 'Срок', 'Счёт', 'Автор', 'Создано'];

/** Пометка цели в комментарии перевода: «Цель: Отпуск». */
export const goalMarker = (name: string) => `Цель: ${name}`;

/**
 * Цели с листа «Цели». Отложено: переводы с комментарием «Цель: <название>» за всё время
 * (перевод со счёта-копилки с той же пометкой уменьшает, это «взяли из копилки»).
 */
export function readGoals(ss: SpreadsheetLike): Goal[] {
  const sh = ss.getSheetByName(GOALS_SHEET);
  if (!sh) return [];
  const goals = new Table(sh)
    .rows()
    .filter((r) => text(r['ID']) && text(r['Название']) && kop(r['Сумма']) > 0)
    .map((r) => {
      const deadline = r['Срок'];
      const dl =
        deadline instanceof Date
          ? monthKeyOf(deadline)
          : /^\d{4}-\d{2}$/.test(text(deadline))
            ? text(deadline)
            : undefined;
      return {
        id: text(r['ID']),
        name: text(r['Название']),
        target: kop(r['Сумма']),
        ...(dl ? { deadline: dl } : {}),
        ...(text(r['Счёт']) ? { accountId: text(r['Счёт']) } : {}),
        author: text(r['Автор']),
        saved: 0,
      };
    });
  if (!goals.length) return goals;
  const form = ss.getSheetByName(SHEETS.form);
  for (const r of form ? new Table(form).rows() : []) {
    if (text(r['Это доход или расход?']) !== 'Перевод') continue;
    const comment = text(r['Комментарий']).toLowerCase();
    for (const g of goals) {
      if (!comment.startsWith(goalMarker(g.name).toLowerCase())) continue;
      const out = g.accountId && text(r['Карта/счёт']) === g.accountId;
      g.saved += (out ? -1 : 1) * kop(r['Сумма']);
    }
  }
  return goals;
}

function goalsSheet(ss: SpreadsheetLike): SheetLike {
  const found = ss.getSheetByName(GOALS_SHEET);
  if (found) return found;
  if (!ss.insertSheet) throw new Error(`Нет листа «${GOALS_SHEET}»`);
  const sh = ss.insertSheet(GOALS_SHEET);
  sh.getRange(1, 1, 1, GOAL_HEADERS.length).setValues([GOAL_HEADERS]);
  return sh;
}

export function upsertGoal(ss: SpreadsheetLike, g: Omit<Goal, 'saved'>, now: Date): 'added' | 'updated' {
  const sh = goalsSheet(ss);
  const t = new Table(sh);
  const row = [g.id, g.name, g.target / 100, g.deadline ?? '', g.accountId ?? '', g.author];
  const i = t
    .column('ID')
    .map((v) => text(v))
    .indexOf(g.id);
  const record = Object.fromEntries(GOAL_HEADERS.slice(0, 6).map((h, j) => [h, row[j]]));
  if (i >= 0 && t.updateRow('ID', g.id, record)) return 'updated';
  t.append([Object.fromEntries([...GOAL_HEADERS.slice(0, 6).map((h, j) => [h, row[j]]), ['Создано', now]])]);
  return 'added';
}

export function deleteGoal(ss: SpreadsheetLike, id: string): boolean {
  const sh = ss.getSheetByName(GOALS_SHEET);
  if (!sh) return false;
  const i = new Table(sh)
    .column('ID')
    .map((v) => text(v))
    .indexOf(id);
  if (i < 0) return false;
  if (!sh.deleteRow) throw new Error('Лист не умеет удалять строки');
  sh.deleteRow(i + 2);
  return true;
}
