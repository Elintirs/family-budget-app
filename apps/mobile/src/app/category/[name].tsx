import { formatRub, monthKey, currentMonthKey } from '@budget/core';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useAnalytics, useAllOperations } from '@/hooks/data';
import { addMonths, deltaPct, humanTime, monthShort, monthTitle } from '@/state/format';
import { Bars } from '@/ui/charts';
import { Card, Row, Screen, ScreenHeader, T } from '@/ui/kit';
import { goBack } from '@/state/nav';

/** Подкатегория: сумма за месяц, изменение, 6 месяцев, операции на телефоне. */
export default function CategoryScreen() {
  const { name, month = currentMonthKey() } = useLocalSearchParams<{ name: string; month?: string }>();
  const months = useAnalytics().data?.months ?? [];
  const ops = useAllOperations();
  const by = new Map(months.map((m) => [m.month, m.subcategories[name] ?? 0]));
  const now = by.get(month) ?? 0;
  const prev = by.get(addMonths(month, -1)) ?? 0;
  const last6 = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const list = ops.filter((o) => o.subcategory === name && monthKey(new Date(o.occurredAt)) === month);
  return (
    <Screen>
      <ScreenHeader title={name} onBack={goBack} />
      <Card>
        <T v="caption" c="muted">
          {monthTitle(month)}
        </T>
        <T v="amount">{formatRub(now, { whole: true })}</T>
        <T v="label" c={!prev ? 'muted' : now > prev ? 'warnInk' : 'accentInk'}>
          {prev
            ? `${deltaPct(now, prev)} к прошлому месяцу (${formatRub(prev, { whole: true })})`
            : 'в прошлом месяце не было'}
        </T>
      </Card>
      <Card>
        <T v="h2">6 месяцев</T>
        <Bars
          items={last6.map((m) => ({
            key: m,
            label: monthShort(m),
            values: [by.get(m) ?? 0],
            active: m === month,
          }))}
        />
      </Card>
      <T v="h2">Операции на телефоне</T>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {list.length ? (
          list.map((o, i) => (
            <Row
              key={o.id}
              title={o.merchant?.split(/[.,]/)[0] ?? o.comment ?? 'Покупка'}
              meta={humanTime(o.occurredAt)}
              right={<T v="num">{formatRub(-o.amount)}</T>}
              last={i === list.length - 1}
            />
          ))
        ) : (
          <View style={{ paddingVertical: 12 }}>
            <T v="label" c="muted">
              Здесь только операции, прошедшие через приложение. Полная история в таблице.
            </T>
          </View>
        )}
      </Card>
    </Screen>
  );
}
