import { kv } from '@/adapters/db';

/** Условия кредитки, которые знает только человек (из договора): ставка, страховка, день платежа. */
export interface DebtTerms {
  /** Годовая ставка, %. */
  rate?: number;
  /** Страховка по карте: списывается, отключена или неизвестно. */
  insurance?: 'yes' | 'no' | 'unknown';
  /** Сколько страховка берёт от долга в месяц, %: у Сбера 2,3. */
  insurancePct?: number;
  /** Платить до (число месяца). */
  payDay?: number;
}

/** На телефоне: у Олега и Елены могут быть заполнены разные, это справочные данные для плана. */
export function debtTerms(accountId: string): DebtTerms {
  return kv.getJson<Record<string, DebtTerms>>('debtTerms')?.[accountId] ?? {};
}

export function saveDebtTerms(accountId: string, t: DebtTerms) {
  const all = kv.getJson<Record<string, DebtTerms>>('debtTerms') ?? {};
  kv.setJson('debtTerms', { ...all, [accountId]: t });
}
