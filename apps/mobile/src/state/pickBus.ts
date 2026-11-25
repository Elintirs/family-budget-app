/**
 * Ответ листа выбора экрану, который его открыл: «Новая операция» открывает лист подкатегории или
 * счёта и получает выбор сюда, без записи в базу.
 */
/**
 * Кому ответ: 'subcategory', 'account', 'from', 'to', 'filter' у «Новой операции» и «Истории»,
 * с префиксом 'op:' у карточки операции (обе живут одновременно, ответы не должны путаться).
 */
export type PickTarget = string;
type Listener = (target: PickTarget, value: string) => void;

const listeners = new Set<Listener>();

export function onPicked(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function emitPicked(target: PickTarget, value: string) {
  listeners.forEach((cb) => cb(target, value));
}
