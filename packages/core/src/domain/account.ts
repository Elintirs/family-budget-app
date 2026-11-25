import type { Kopecks } from './money';

/**
 * receivable: «Нам должны», не деньги на руках, но входит в чистые деньги.
 * adjustment: служебный счёт «Поправки». Поправка по сверке это перевод на него или с него: остаток
 * настоящего счёта сходится с банком, а в расходы, доходы, лимиты и итоги поправка не попадает.
 */
export type AccountType = 'debit' | 'credit' | 'cash' | 'receivable' | 'adjustment';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Пакет Android-приложения банка, по нему уведомление привязывается к счёту. */
  bankPackage?: string;
  /** Последние цифры карт: «*2202». */
  cardMasks: string[];
  /**
   * Слова из уведомления, по которым узнаётся счёт без карты: у Т-Банка второй счёт приходит
   * как «Перевод на 71 499 ₽, счет RUB.», без маски. Хранятся в той же колонке «Маски карт».
   */
  markers?: string[];
  /**
   * Чья карта: «*1101 Олег» в колонке «Маски карт». Покупку чужой картой (общий счёт, пуш и SMS
   * приходят обоим) телефон не кладёт во «Входящие», а ждёт, пока её отправит телефон владельца.
   */
  cardOwners?: Record<string, string>;
  creditLimit?: Kopecks;
  hidden?: boolean;
  /** Служебный счёт «Поправки» (по проводу тип credit, см. contract.ts). */
  adjustment?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** «*1101 Олег, *3303 Елена, счет RUB» из колонки «Маски карт»: маски, владельцы карт и слова отдельно. */
export function splitAccountTags(raw: string): {
  cardMasks: string[];
  markers: string[];
  owners: Record<string, string>;
} {
  const cardMasks: string[] = [];
  const markers: string[] = [];
  const owners: Record<string, string> = {};
  for (const piece of raw.split(/[,;\n]+/)) {
    const t = piece.trim();
    if (!t) continue;
    // «*2202 *1234» через пробел: старый формат, это несколько масок.
    if (/^(?:\*?\d{4}\s*)+$/.test(t)) {
      cardMasks.push(...t.split(/\s+/).map((m) => `*${m.replace('*', '')}`));
      continue;
    }
    const owned = t.match(/^\*?(\d{4})\s+([^\d*].*)$/);
    if (owned) {
      const mask = `*${owned[1]}`;
      cardMasks.push(mask);
      owners[mask] = owned[2]!.trim();
    } else markers.push(t);
  }
  return { cardMasks, markers, owners };
}

/** Обратно в колонку «Маски карт». */
export const joinAccountTags = (
  cardMasks: string[],
  markers: string[],
  owners: Record<string, string> = {},
) =>
  [
    ...cardMasks.map((m) => {
      const mask = `*${m.replace('*', '')}`;
      return owners[mask] ? `${mask} ${owners[mask]}` : mask;
    }),
    ...markers,
  ].join(', ');

/** Владелец карты по маске («*1101» -> «Олег») среди всех счетов. */
export function cardOwner(
  accounts: Pick<Account, 'cardOwners'>[],
  cardMask: string | undefined,
): string | undefined {
  if (!cardMask) return undefined;
  for (const a of accounts) if (a.cardOwners?.[cardMask]) return a.cardOwners[cardMask];
  return undefined;
}

/**
 * Счёт уведомления: по маске карты, затем по слову из текста («счет RUB»), затем по названию банка.
 * Неузнанное остаётся undefined: дальше решает счёт по умолчанию.
 */
export function accountForNotification(
  accounts: Pick<Account, 'id' | 'name' | 'cardMasks' | 'markers'>[],
  n: { cardMask?: string; text: string; appLabel?: string },
): string | undefined {
  const text = norm(n.text);
  return (
    (n.cardMask ? accounts.find((a) => a.cardMasks.includes(n.cardMask!)) : undefined)?.id ??
    accounts.find((a) => a.markers?.some((m) => text.includes(norm(m))))?.id ??
    accounts.find((a) => a.name === n.appLabel)?.id
  );
}

/**
 * Маска карты из уведомления, которой нет ни у одного счёта: Mir Pay показывает свой номер, не цифры с
 * пластика (журнал 29.10: ••8808 и ••5505 при картах *7707 и ВТБ). Такую карту спрашиваем один раз.
 */
export function unknownCardMask(
  op: { cardMask?: string },
  accounts: Pick<Account, 'cardMasks'>[],
): string | undefined {
  if (!op.cardMask) return undefined;
  const known = accounts.some((a) =>
    a.cardMasks.some((m) => m.replace('*', '') === op.cardMask!.replace('*', '')),
  );
  return known ? undefined : op.cardMask;
}

/**
 * Счёт только по точному признаку: маска карты или слово из текста («счет RUB»). Для снимков остатка:
 * лучше не записать снимок, чем записать его на чужой счёт и получить ложное расхождение.
 */
export function exactAccount(
  accounts: Pick<Account, 'id' | 'cardMasks' | 'markers'>[],
  n: { cardMask?: string; text: string },
): string | undefined {
  const text = norm(n.text);
  return (
    (n.cardMask ? accounts.find((a) => a.cardMasks.includes(n.cardMask!)) : undefined)?.id ??
    accounts.find((a) => a.markers?.some((m) => text.includes(norm(m))))?.id
  );
}

/**
 * Деньги, долг и «нам должны» по сводке: одно правило для Главной и виджета. Скрытые счета
 * (например, служебные «Поправки») не считаются, раньше виджет их учитывал, а Главная нет.
 */
export function netWorth(
  accounts: Pick<Account, 'id' | 'type' | 'hidden'>[],
  balances: { accountId: string; computed: Kopecks; debt?: Kopecks }[],
): { money: Kopecks; debt: Kopecks; owed: Kopecks } {
  const by = new Map(balances.map((b) => [b.accountId, b]));
  let money = 0;
  let debt = 0;
  let owed = 0;
  for (const a of accounts) {
    if (a.hidden) continue;
    const b = by.get(a.id);
    if (a.type === 'debit' || a.type === 'cash') money += b?.computed ?? 0;
    else if (a.type === 'credit') debt += b?.debt ?? 0;
    else if (a.type === 'receivable') owed += b?.computed ?? 0;
  }
  return { money, debt, owed };
}
