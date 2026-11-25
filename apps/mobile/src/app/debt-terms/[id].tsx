import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { log } from '@/adapters';
import { useBootstrap } from '@/hooks/data';
import { debtTerms, saveDebtTerms, type DebtTerms } from '@/state/debtTerms';
import { goBack } from '@/state/nav';
import { Card, Input, PillButton, Screen, ScreenHeader, Segmented, T } from '@/ui/kit';

/** Условия кредитки для плана: ставка, страховка (три состояния), день платежа. */
export default function DebtTermsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const acc = useBootstrap().data?.accounts.find((a) => a.id === id);
  const cur = debtTerms(id);
  const [rate, setRate] = useState(cur.rate ? String(cur.rate).replace('.', ',') : '');
  const [ins, setIns] = useState<NonNullable<DebtTerms['insurance']>>(cur.insurance ?? 'unknown');
  const [insPct, setInsPct] = useState(cur.insurancePct ? String(cur.insurancePct).replace('.', ',') : '2,3');
  const [payDay, setPayDay] = useState(cur.payDay ? String(cur.payDay) : '');
  const num = (s: string) => Number(s.replace(',', '.'));
  const save = () => {
    const t: DebtTerms = {
      ...(num(rate) > 0 ? { rate: num(rate) } : {}),
      insurance: ins,
      ...(num(insPct) > 0 ? { insurancePct: num(insPct) } : {}),
      ...(Number(payDay) >= 1 && Number(payDay) <= 31 ? { payDay: Number(payDay) } : {}),
    };
    saveDebtTerms(id, t);
    log.info('debts', `Условия ${acc?.name ?? id}`, t);
    goBack();
  };
  return (
    <Screen footer={<PillButton title="Сохранить" onPress={save} />}>
      <ScreenHeader title="Условия долга" onBack={goBack} />
      <T v="label" c="muted">
        {acc?.name ?? id}, из договора, хранится на этом телефоне
      </T>
      <Card style={{ gap: 8 }}>
        <T v="body">Ставка, % годовых</T>
        <Input
          accessibilityLabel="Ставка, процентов годовых"
          value={rate}
          onChangeText={setRate}
          keyboardType="decimal-pad"
          placeholder="25,4"
          number
        />
      </Card>
      <Card style={{ gap: 8 }}>
        <T v="body">Платить до</T>
        <Input
          accessibilityLabel="Платить до, число месяца"
          value={payDay}
          onChangeText={(t) => setPayDay(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          placeholder="число месяца"
          number
        />
      </Card>
      <Card style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <T v="body">Страховка по карте</T>
          <T v="caption" c="muted">
            процент от долга в месяц, у Сбера 2,3
          </T>
        </View>
        <Segmented<NonNullable<DebtTerms['insurance']>>
          label="Страховка"
          value={ins}
          onChange={setIns}
          options={[
            { key: 'yes', title: 'Списывается' },
            { key: 'no', title: 'Отключена' },
            { key: 'unknown', title: 'Не знаю' },
          ]}
        />
        {ins === 'yes' ? (
          <Input
            accessibilityLabel="Страховка, процентов от долга в месяц"
            value={insPct}
            onChangeText={setInsPct}
            keyboardType="decimal-pad"
            number
          />
        ) : null}
        {ins === 'unknown' ? (
          <Card tone="warnSoft" style={{ gap: 4 }}>
            <T v="body" c="warnSoftInk">
              Проверь выписку за 15-е число
            </T>
            <T v="caption" c="warnSoftInk">
              Ищи «Плата за участие в программе страхования». Пока не отмечено, план считает без страховки.
            </T>
          </Card>
        ) : null}
      </Card>
    </Screen>
  );
}
