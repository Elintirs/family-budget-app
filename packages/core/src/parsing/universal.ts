import { parseRub, type Kopecks } from '../domain/money';

/**
 * Универсальный разбор банковского уведомления. Работает для любого банка «примерно»;
 * точные парсеры конкретных банков (этап 7) будут уточнять результат поверх него.
 */
export interface ParsedNotification {
  amount: Kopecks;
  direction: 'debit' | 'credit';
  merchant?: string;
  /** «Баланс 70 112 ₽» / «Остаток …» */
  balance?: Kopecks;
  /** «Доступно 70 112 ₽»: у кредитки это не остаток, а свободный лимит. */
  available?: Kopecks;
  cardMask?: string;
  refund?: boolean;
  /** low: не уверены в направлении или магазине, во «Входящих» будет пометка «проверь». */
  confidence: 'high' | 'low';
}

const MONEY = /(\d[\d\s\u00A0\u202F]*(?:[.,]\d{1,2})?)\s?(?:₽|руб\.?|RUB|р\.|р(?![а-яёa-z]))/gi;
const BALANCE = /(баланс|остаток)[:\s]*$/i;
const AVAILABLE = /(доступно)[:\s]*$/i;

const CREDIT =
  /(пополнени|зачислени|поступлени|перевод от|входящий перевод|возврат|кэшбэк|кешбэк|зарплат|вам перевели|получен)/i;
const DEBIT = /(покупк|оплат|списани|перевод\b|исходящий перевод|снятие|платеж|платёж|выдача)/i;
// «Отмена на 2 088 ₽» (пуш Т-Банка) и «Отмена, счет карты *1101» (SMS): журнал 14.10, Додо Пицца.
// \b с кириллицей в JS не работает, граница слова задаётся явно.
const REFUND = /(возврат|отмена покупки|отмена операции|(?:^|\n)\s*отмена(?=[\s,.:]|$))/i;
const NOISE = /(код подтверждения|никому не сообщайте|одноразовый код|пароль)/i;
/**
 * Реклама банка с суммой: «начните со 100 ₽ ежемесячно — откройте ИнвестКопилку» (Сбер, журнал 12.10)
 * давала трату 100 ₽, «Одобрили до 215 000 ₽, возьмите кредит» (Т-Банк, 16.10) трату 215 000. Призыв без слов настоящей операции не операция; «для любых покупок» не «покупка».
 */
const PROMO =
  /(откройте|начните|оформите|оформить|попробуйте|подключите|присоединяйтесь|успейте|получите до|акци[яиюй]|промокод|розыгрыш|подарок|скидк|одобрил|возьмите|заявк|участвуйте|добивайтесь|софинансирован|годовых)/i;
const REAL = /(покупка|оплата|списани|зачислени|пополнени|поступлени|перевод на|перевод от|снятие|возврат)/i;

export function parseBankText(title: string, text: string): ParsedNotification | null {
  const full = `${title}\n${text}`.replace(/\u00A0|\u202F/g, ' ');
  if (NOISE.test(full) && !DEBIT.test(full)) return null;
  if (PROMO.test(full) && !REAL.test(full)) return null;
  // Отказ банка не списание: «Отказано банком. Сумма 319,98 ₽» (Mir Pay 20.10, на ВТБ не хватило денег).
  if (/(отказано|отклонен|недостаточно средств|операция не выполнена|не прошла)/i.test(full)) return null;
  // Кубышка Т-Банка: деньги внутри того же счёта (журнал 17.10: 35 000 и 40 000 туда-обратно), не операция.
  if (/(?:в|из) кубышк/i.test(full)) return null;

  let amount: Kopecks | undefined;
  let amountEnd = -1;
  let balance: Kopecks | undefined;
  let available: Kopecks | undefined;
  for (const m of full.matchAll(MONEY)) {
    const value = parseRub(m[1]!);
    if (value === null || value === 0) continue;
    const before = full.slice(Math.max(0, m.index! - 20), m.index);
    if (BALANCE.test(before)) balance ??= Math.abs(value);
    else if (AVAILABLE.test(before)) available ??= Math.abs(value);
    else if (amount === undefined) {
      amount = Math.abs(value);
      amountEnd = m.index! + m[0].length;
    }
  }
  if (amount === undefined) return null;

  const refund = REFUND.test(full);
  const credit = refund || (CREDIT.test(full) && !/списани|покупк/i.test(full)) || /^\s*\+/.test(text);
  const knownDirection = refund || CREDIT.test(full) || DEBIT.test(full) || /^\s*[+−-]/.test(text);
  // Пуш Т-Банка «Покупка на 4 584 ₽, кэшбэк 45 ₽, Олег Д., счет карты *1101»: магазин в заголовке.
  const titleMerchant =
    /^\s*(?:покупка|отмена) на\s/i.test(text) && title.trim() && !/банк|bank|сбер/i.test(title)
      ? title.trim()
      : undefined;
  const merchant = titleMerchant ?? extractMerchant(full, amountEnd);
  // «*2202», «карта 2202», «••2202», а у Mir Pay «Карта Mir • • • • 4404» (точки через пробел).
  // В СМС Сбера карта как «MIR-4404» или «VISA1234».
  const card =
    full.match(/(?:[•*·]\s?){2,}(\d{4})\b/) ??
    full.match(/(?:\*|карт[аеыуой]*\s*\*?)(\d{4})\b/i) ??
    // \b перед кириллицей в JS не срабатывает: «с карты МИР7707» (Сбер, 20.10) терялась.
    full.match(/(?<![A-Za-zА-Яа-яЁё])(?:MIR|VISA|ECMC|MC|MAES|МИР)[-\s]?(\d{4})(?!\d)/i);

  return {
    amount,
    direction: credit ? 'credit' : 'debit',
    ...(merchant ? { merchant } : {}),
    ...(balance !== undefined ? { balance } : {}),
    ...(available !== undefined ? { available } : {}),
    ...(card ? { cardMask: `*${card[1]}` } : {}),
    ...(refund ? { refund: true } : {}),
    confidence: knownDirection && merchant ? 'high' : 'low',
  };
}

/**
 * Магазин: текст после суммы до конца строки. По живым пушам (журнал 10.10): на следующей строке
 * идут «Доступно …» / «Баланс …», а перевод Т-Банка начинается с «счет карты *1101.», это не магазин.
 */
function extractMerchant(full: string, amountEnd: number): string | undefined {
  if (amountEnd < 0) return undefined;
  const tail = full
    .slice(amountEnd)
    .replace(/^[\s,.:;–—-]+/, '')
    .split('\n')[0]!
    // «счет RUB.» у второго счёта Т-Банка тоже не магазин: после него идёт отправитель («Олег Д.»).
    .replace(/^(?:сч[её]т\s+)?(?:карт[аыу]?\s*\*?\d{4}|RUB)\.?\s*/i, '')
    // SMS Т-Банка одной строкой: «… 4584 ₽. Кафе. Доступно 22705,78 ₽».
    .replace(/[.,]?\s*(?:доступно|баланс|остаток)[\s:].*$/i, '')
    .trim();
  if (!tail || /^\d/.test(tail)) return undefined;
  return tail;
}
