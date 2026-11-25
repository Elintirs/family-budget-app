import { findCrossDeviceDuplicate, type Operation, type SyncRequest, type SyncResponse } from '@budget/core';
import { kop } from './read';
import { HIDDEN_COLUMN, LIMIT_COLUMN, ONE_OFF_COLUMN, readAccounts, readSummary, SHEETS } from './read';
import type { Rule } from '@budget/core';
import { sheet, Table, type SpreadsheetLike } from './table';
import { applyEdits } from './operations';

/** Служебные колонки справа от колонок формы. Форма их не трогает. */
export const SERVICE_COLUMNS = [
  'ID',
  'Автор',
  'Источник',
  'Мерчант',
  'Удалено',
  'Синхронизировано',
  'Карта',
  'Единовременный',
  'Уведомление',
] as const;

/** «да» / «нет» / пусто (как у подкатегории в «Справочнике»). */
export const oneOffCell = (v: boolean | undefined) => (v === undefined ? '' : v ? 'да' : 'нет');

const SOURCE = { manual: 'приложение', notification: 'уведомление', form: 'форма' } as const;

/** Строка «Формы» в том же виде, в каком её пишет Google Form. */
export function toFormRow(
  op: Operation,
  author: string,
  now: Date,
  owners: Record<string, string> = {},
): Record<string, unknown> {
  return {
    'Отметка времени': new Date(op.occurredAt),
    Сумма: op.amount / 100,
    'Это доход или расход?': op.kind === 'income' ? 'Доход' : op.kind === 'transfer' ? 'Перевод' : 'Расход',
    'Категория дохода': op.kind === 'income' ? (op.incomeCategory ?? '') : '',
    Подкатегория: op.kind === 'expense' ? (op.subcategory ?? '') : '',
    Комментарий: op.comment ?? '',
    'Карта/счёт': op.accountId ?? '',
    // Колонку пишем только для перевода: в таблице без неё обычная трата не должна её создавать.
    ...(op.kind === 'transfer' ? { 'Куда перевели': op.toAccountId ?? '' } : {}),
    ID: op.id,
    Автор: author,
    Источник: SOURCE[op.source],
    Мерчант: op.merchant ?? '',
    Удалено: op.deleted ? true : '',
    Синхронизировано: now,
    // С какой карты оплачено: «*1101 Олег» (владелец из «Масок карт»).
    Карта: op.cardMask ? [op.cardMask, owners[op.cardMask]].filter(Boolean).join(' ') : '',
    Единовременный: op.kind === 'expense' ? oneOffCell(op.oneOff) : '',
    Уведомление: op.sourceText ?? '',
  };
}

/**
 * Пишет операции в «Форму». Идемпотентно по ID: повтор после обрыва связи даёт duplicates, а не вторую строку.
 * Перевод пишется типом «Перевод» с «Куда перевели»: остатки его учитывают, лимиты и аналитика нет.
 */
export function sync(
  ss: SpreadsheetLike,
  req: SyncRequest,
  author: string,
  now: Date,
  defaultAccount?: string,
): SyncResponse {
  const form = new Table(sheet(ss, SHEETS.form));
  form.ensure([...SERVICE_COLUMNS]);
  const known = new Set(form.column('ID').map(String).filter(Boolean));
  const recent = recentOperations(form, now);
  const owners = Object.assign({}, ...readAccounts(ss).accounts.map((a) => a.cardOwners ?? {})) as Record<
    string,
    string
  >;

  const res: Pick<SyncResponse, 'accepted' | 'duplicates' | 'rejected' | 'suspected' | 'edited' | 'missing'> =
    {
      accepted: [],
      duplicates: [],
      rejected: [],
      suspected: [],
      edited: [],
      missing: [],
    };
  const rows: Record<string, unknown>[] = [];
  // Удаление уже отправленной: строку убираем целиком (формулы не знают пометку «Удалено»).
  const removals: string[] = [];
  for (const op of req.operations) {
    if (known.has(op.id)) {
      if (op.deleted) removals.push(op.id);
      res.duplicates.push(op.id);
      continue;
    }
    if (
      op.kind === 'transfer' &&
      !op.deleted &&
      (!op.accountId || !op.toAccountId || op.accountId === op.toAccountId)
    ) {
      res.rejected.push({ id: op.id, reason: 'У перевода должны быть два разных счёта: откуда и куда' });
      continue;
    }
    if (op.deleted) {
      res.accepted.push(op.id); // удалили до отправки: в таблицу не пишем
      continue;
    }
    const mine = { ...op, author };
    const twin = op.notDuplicate ? undefined : findCrossDeviceDuplicate(mine, recent);
    if (twin) {
      res.suspected.push({ id: op.id, otherAuthor: twin.author });
      continue;
    }
    // Без счёта строка не двигает остаток и сверка с банком расходится (Mir Pay не называет карту).
    rows.push(
      toFormRow(
        op.accountId || !defaultAccount || op.kind === 'transfer' ? op : { ...op, accountId: defaultAccount },
        author,
        now,
        owners,
      ),
    );
    recent.push(mine);
    known.add(op.id);
    res.accepted.push(op.id);
  }
  form.append(rows);
  const edits = [...(req.edits ?? []), ...removals.map((id) => ({ id, deleted: true, fields: {} }))];
  const done = applyEdits(ss, edits, author, now, owners);
  res.edited = done.edited;
  res.missing = done.missing;
  writeRules(ss, req.rules ?? [], now);
  return { ...res, summary: readSummary(ss, now), balances: readAccounts(ss).balances };
}

/** Операции «Формы» за последние двое суток в виде, понятном проверке дублей. */
function recentOperations(form: Table, now: Date): Operation[] {
  const since = now.getTime() - 2 * 24 * 3600 * 1000;
  const out: Operation[] = [];
  for (const r of form.rows()) {
    const at = r['Отметка времени'];
    if (!(at instanceof Date) || at.getTime() < since) continue;
    out.push({
      id: String(r['ID'] ?? ''),
      kind:
        r['Это доход или расход?'] === 'Доход'
          ? 'income'
          : r['Это доход или расход?'] === 'Перевод'
            ? 'transfer'
            : 'expense',
      amount: kop(r['Сумма']),
      occurredAt: at.toISOString(),
      accountId: String(r['Карта/счёт'] ?? '') || undefined,
      // Из «Источника»: повторно пойманный пуш узнаётся только среди строк из уведомлений.
      source:
        r['Источник'] === 'уведомление' ? 'notification' : r['Источник'] === 'приложение' ? 'manual' : 'form',
      author: String(r['Автор'] ?? ''),
      status: 'synced',
      deleted: r['Удалено'] === true,
    });
  }
  return out;
}

/** Правила «всегда так» с телефонов: новый шаблон дописывается, существующий обновляется. */
export function writeRules(ss: SpreadsheetLike, rules: Rule[], now: Date): void {
  const sh = ss.getSheetByName('Правила');
  if (!sh || !rules.length) return;
  const t = new Table(sh);
  const existing = t.column('Шаблон мерчанта').map((v) => String(v).trim().toLowerCase());
  const fresh: Record<string, unknown>[] = [];
  for (const r of rules) {
    const i = existing.indexOf(r.pattern.trim().toLowerCase());
    if (i >= 0)
      t.update(
        'Шаблон мерчанта',
        String(t.column('Шаблон мерчанта')[i]),
        'Подкатегория',
        r.subcategory ?? '',
      );
    else {
      fresh.push({
        'Шаблон мерчанта': r.pattern,
        Подкатегория: r.subcategory ?? '',
        Автор: r.author,
        Создано: now,
      });
      existing.push(r.pattern.trim().toLowerCase());
    }
  }
  t.append(fresh);
}

/**
 * Подкатегория из приложения: новая дописывается в конец «Справочника» (от порядка зависит Дэшборд),
 * у существующей меняется только группа («Категория по умолчанию»). Переименования нет: на имя ссылаются строки.
 */
export function upsertSubcategory(ss: SpreadsheetLike, name: string, group: string): 'added' | 'updated' {
  const t = new Table(sheet(ss, SHEETS.reference));
  const exists = t.column('Подкатегория').some((v) => String(v).trim().toLowerCase() === name.toLowerCase());
  if (exists) {
    t.update('Подкатегория', name, 'Категория по умолчанию', group);
    return 'updated';
  }
  t.append([{ Подкатегория: name, 'Категория по умолчанию': group }]);
  return 'added';
}

/** Скрыть подкатегорию из выбора в приложении (колонка «Скрыта» = «да») или вернуть. Строка остаётся. */
export function setSubcategoryHidden(ss: SpreadsheetLike, name: string, hidden: boolean): void {
  const t = new Table(sheet(ss, SHEETS.reference));
  if (!t.update('Подкатегория', name, HIDDEN_COLUMN, hidden ? 'да' : ''))
    throw new Error(`Нет подкатегории «${name}» в «Справочнике»`);
}

/** Траты подкатегории по умолчанию единовременные (колонка «Единовременная» = «да») или нет. */
export function setSubcategoryOneOff(ss: SpreadsheetLike, name: string, oneOff: boolean): void {
  const t = new Table(sheet(ss, SHEETS.reference));
  if (!t.update('Подкатегория', name, ONE_OFF_COLUMN, oneOff ? 'да' : ''))
    throw new Error(`Нет подкатегории «${name}» в «Справочнике»`);
}

/** Лимит подкатегории в «Справочнике» (колонка «Лимит в месяц»); null убирает лимит. */
export function writeSubcategoryLimit(ss: SpreadsheetLike, name: string, limitKopecks: number | null): void {
  const t = new Table(sheet(ss, SHEETS.reference));
  if (!t.update('Подкатегория', name, LIMIT_COLUMN, limitKopecks === null ? '' : limitKopecks / 100))
    throw new Error(`Нет подкатегории «${name}» в «Справочнике»`);
}

/** Лимит месяца: строка «Выставляем лимит» в «Лимитах на месяц», значение в рублях. */
export function writeMonthLimit(ss: SpreadsheetLike, limitKopecks: number): void {
  const sh = sheet(ss, 'Лимиты на месяц');
  const col = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  const row = col.findIndex((r) => String(r[0]).trim() === 'Выставляем лимит');
  if (row < 0) throw new Error('Нет строки «Выставляем лимит»');
  sh.getRange(row + 1, 2, 1, 1).setValues([[limitKopecks / 100]]);
}
