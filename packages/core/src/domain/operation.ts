import type { Kopecks } from './money';

export type OperationKind = 'expense' | 'income' | 'transfer';
/** new: поймана, но не размечена; ready: можно отправлять; synced: уже в таблице. */
export type OperationStatus = 'new' | 'ready' | 'synced';
export type OperationSource = 'manual' | 'notification' | 'form';

export interface Operation {
  /** clientId: генерируется на телефоне, по нему таблица отсекает дубли. */
  id: string;
  kind: OperationKind;
  /** Всегда положительная, направление задаёт kind. */
  amount: Kopecks;
  /** Момент покупки (ISO), уходит в «Отметку времени». */
  occurredAt: string;
  accountId?: string;
  /** Только для перевода: куда. */
  toAccountId?: string;
  subcategory?: string;
  incomeCategory?: string;
  comment?: string;
  merchant?: string;
  source: OperationSource;
  /** Пакет приложения, из уведомления которого создана операция. */
  sourceApp?: string;
  /** Пакеты приложений, чьи пуши склеены с этой операцией (например, Mir Pay к пушу банка). */
  alsoFrom?: string[];
  author: string;
  status: OperationStatus;
  deleted?: boolean;
  /** Части одной разделённой покупки. */
  splitGroupId?: string;
  /** Таблица нашла похожую операцию с другого телефона: чей это дубль. */
  duplicateOf?: string;
  /** Человек подтвердил, что это отдельная покупка: проверку на дубль не делать. */
  notDuplicate?: boolean;
  /** Маска карты из уведомления («*1101», у Mir Pay «*4404»): в таблице колонка «Карта». */
  cardMask?: string;
  /** Исходные тексты уведомлений этой операции: видны на обоих телефонах, в таблице колонка «Уведомление». */
  sourceText?: string;
  /** Покупка картой другого человека: ждали, что её отправит его телефон, а она так и не пришла. */
  heldFor?: string;
  /** Единовременный расход (ремонт, штраф): в аналитике отдельно. Не задано: как у подкатегории. */
  oneOff?: boolean;
}

/** Единовременный ли расход: своя отметка, иначе отметка подкатегории в «Справочнике». */
export function isOneOff(op: Operation, subcategories: { name: string; oneOff?: boolean }[]): boolean {
  if (op.kind !== 'expense') return false;
  return op.oneOff ?? subcategories.find((s) => s.name === op.subcategory)?.oneOff ?? false;
}

/** Хватает ли данных, чтобы отправить операцию в таблицу. */
export function isComplete(op: Operation): boolean {
  if (op.amount <= 0) return false;
  switch (op.kind) {
    case 'expense':
      return Boolean(op.subcategory);
    case 'income':
      return Boolean(op.incomeCategory);
    case 'transfer':
      return Boolean(op.accountId && op.toAccountId && op.accountId !== op.toAccountId);
  }
}

/** Статус после правки: полная операция становится ready, неполная остаётся new. Отправленную не трогаем. */
export function refreshStatus(op: Operation): Operation {
  if (op.status === 'synced') return op;
  return { ...op, status: isComplete(op) ? 'ready' : 'new' };
}

export function isPending(op: Operation): boolean {
  return op.status !== 'synced' && !op.deleted;
}
