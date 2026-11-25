import type { Operation } from '../domain/operation';
import { SMS_WINDOW_MS } from './dedup';
import { MANUAL_TWIN_MS } from './ingest';

/** Сколько ждать, пока покупку чужой картой отправит телефон владельца. */
export const HOLD_MS = 6 * 3600 * 1000;

export interface HeldResolution {
  /** Ещё ждём. */
  keep: Operation[];
  /** Не дождались: во «Входящие» с пометкой heldFor. */
  release: Operation[];
  /** Владелец отправил: отложенную выбрасываем. */
  matched: { id: string; twinId: string }[];
}

/**
 * Покупки чужой картой против строк таблицы (зеркало «Формы»). Пара 1:1: та же сумма и направление,
 * совместимый счёт, автор строки = владелец карты; время ±10 минут (его пуш или SMS) или ±12 часов,
 * если он внёс руками.
 */
export function resolveHeld(
  held: Operation[],
  table: Operation[],
  now: number,
  /** Когда зеркало таблицы последний раз скачано: старое зеркало не видит, что владелец уже отправил. */
  mirrorAt = now,
): HeldResolution {
  const out: HeldResolution = { keep: [], release: [], matched: [] };
  const taken = new Set<string>();
  for (const op of held) {
    const t = Date.parse(op.occurredAt);
    const twin = table.find((x) => {
      if (taken.has(x.id) || x.deleted || x.author !== op.heldFor) return false;
      if (x.kind !== op.kind || x.amount !== op.amount) return false;
      if (x.accountId && op.accountId && x.accountId !== op.accountId) return false;
      return (
        Math.abs(Date.parse(x.occurredAt) - t) <=
        (x.source === 'notification' ? SMS_WINDOW_MS : MANUAL_TWIN_MS)
      );
    });
    if (twin) {
      taken.add(twin.id);
      out.matched.push({ id: op.id, twinId: twin.id });
      // Отпускаем, только если зеркало свежее покупки на весь срок ожидания (журнал Елены 23.10: сети
      // не было сутки, и покупка Олега, уже отправленная им, вылезла во «Входящие»).
    } else if (now - t >= HOLD_MS && mirrorAt - t >= HOLD_MS) out.release.push(op);
    else out.keep.push(op);
  }
  return out;
}
