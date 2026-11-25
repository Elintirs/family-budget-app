import {
  budgetNow,
  currentMonthKey,
  debtForecast,
  debtSchedule,
  formatRub,
  matchOccurrences,
  payoffWith,
  type RecurringRule,
} from '@budget/core';
import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api, defaultAccountId } from '@/adapters';
import { useAllOperations, usePullRefresh, useBootstrap } from '@/hooks/data';
import { debtTerms } from '@/state/debtTerms';
import { addMonths, monthDativeYear, monthShort } from '@/state/format';
import { goBack } from '@/state/nav';
import { AppIcon, packageForAccount } from '@/ui/AppIcon';
import { ChevronRightIcon } from '@/ui/icons';
import { Card, NoTableData, PillButton, Row, Screen, ScreenHeader, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/** «2028-06» -> «июню 2028»: «закроете к июню 2028». */

/**
 * Долги: сколько по кредиткам сейчас, как менялось по месяцам, когда закроется при текущем темпе
 * и при чуть большем платеже. Погашение = перевод на кредитку, «Нам должны» = перевод с него.
 */
export default function Debts() {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const pull = usePullRefresh();
  const q = useQuery({ queryKey: ['debts'], queryFn: () => api.debtHistory(), staleTime: 5 * 60_000 });
  const h = q.data;

  // Общий долг по месяцам: сумма кредиток (у каждой свои месяцы с её даты старта).
  const total = useMemo(() => {
    const by = new Map<string, number>();
    for (const a of h?.accounts ?? [])
      for (const m of a.months) by.set(m.month, (by.get(m.month) ?? 0) + m.debt);
    return [...by.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, debt]) => ({ month, debt }));
  }, [h]);
  const now = total.at(-1);
  const forecast = debtForecast(total);
  const paidMonth = (h?.accounts ?? []).reduce((s, a) => s + a.paidThisMonth, 0);
  const prev = total.at(-2);
  // Шаг «если гасить больше»: темп плюс 40%, округлённо до 5 000 ₽.
  const faster = Math.max(5_000_00, Math.ceil(((forecast.paydown || 25_000_00) * 1.4) / 5_000_00) * 5_000_00);
  const chart = [
    ...total.slice(-3).map((p) => ({ ...p, future: false })),
    ...(now && forecast.paydown
      ? [1, 2].map((i) => ({
          month: addMonths(now.month, i),
          debt: Math.max(0, now.debt - forecast.paydown * i),
          future: true,
        }))
      : []),
  ];
  const max = Math.max(1, ...chart.map((p) => p.debt));
  const receivable = (boot?.accounts ?? []).filter((a) => a.type === 'receivable');
  const balances = new Map((boot?.balances ?? []).map((b) => [b.accountId, b]));

  if (!boot) return <NoTableData title="Долги" onBack={goBack} {...pull} />;
  return (
    <Screen {...pull}>
      <ScreenHeader title="Долги" onBack={goBack} />
      {!h ? (
        <ActivityIndicator color={colors.accentInk} />
      ) : (
        <>
          <Card tone="hero">
            <T v="caption" style={{ color: colors.heroMuted }}>
              По кредиткам сейчас
            </T>
            <T v="amount" style={{ color: colors.heroInk }}>
              {formatRub(now?.debt ?? 0, { whole: true })}
            </T>
            <T v="label" style={{ color: colors.heroAccent }}>
              {prev
                ? `${formatRub(now!.debt - prev.debt, { sign: true, whole: true })} с конца прошлого месяца`
                : ''}
              {paidMonth ? `, погашено ${formatRub(paidMonth, { whole: true })}` : ''}
            </T>
          </Card>

          {h.accounts
            .filter((a) => a.debt > 0)
            .map((a) => (
              <PlanCard
                key={a.accountId}
                accountId={a.accountId}
                name={boot?.accounts.find((x) => x.id === a.accountId)?.name ?? a.accountId}
                debt={a.debt}
                paid={a.paidThisMonth}
                rules={boot?.recurring ?? []}
              />
            ))}

          {chart.length > 1 ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <T v="h2">Долг по месяцам</T>
                <T v="caption" c="muted">
                  конец месяца
                </T>
              </View>
              <View
                accessibilityRole="image"
                accessibilityLabel={chart
                  .map((p) => `${monthShort(p.month)} ${formatRub(p.debt, { whole: true })}`)
                  .join(', ')}
                style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 150 }}
              >
                {chart.map((p, i) => (
                  <View key={p.month} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <View
                      style={{
                        width: '100%',
                        maxWidth: 56,
                        height: Math.max(6, (p.debt / max) * 120),
                        borderRadius: 8,
                        backgroundColor: p.future
                          ? 'transparent'
                          : i === total.slice(-3).length - 1
                            ? colors.accent
                            : colors.strong,
                        borderWidth: p.future ? 2 : 0,
                        borderStyle: 'dashed',
                        borderColor: colors.muted,
                      }}
                    />
                    <T v="caption" c={p.future ? 'muted' : 'ink'}>
                      {monthShort(p.month)}
                    </T>
                  </View>
                ))}
              </View>
              {forecast.paydown ? (
                <T v="caption" c="muted">
                  Пунктиром прогноз, если гасить как в последние месяцы.
                </T>
              ) : null}
            </Card>
          ) : null}

          {now && now.debt > 0 ? (
            <Card tone={forecast.payoffMonth ? 'accentSoft' : 'warnSoft'} style={{ gap: 6 }}>
              <T v="body" c={forecast.payoffMonth ? 'accentSoftInk' : 'warnSoftInk'}>
                {forecast.payoffMonth
                  ? `При ~${formatRub(forecast.paydown, { whole: true })} в месяц закроете к ${monthDativeYear(forecast.payoffMonth)}`
                  : 'Долг пока не уменьшается'}
              </T>
              <T v="label" c={forecast.payoffMonth ? 'accentSoftInk' : 'warnSoftInk'}>
                Если гасить {formatRub(faster, { whole: true })}, к{' '}
                {monthDativeYear(payoffWith(now.debt, faster, now.month)!)}.
                {h.interestThisMonth
                  ? ` Проценты в этом месяце: ${formatRub(h.interestThisMonth, { whole: true })}.`
                  : ''}
              </T>
            </Card>
          ) : null}

          <T v="h2">Кредитки</T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {h.accounts.map((a, i) => {
              const acc = boot?.accounts.find((x) => x.id === a.accountId);
              return (
                <Row
                  key={a.accountId}
                  left={
                    <AppIcon
                      pkg={packageForAccount(acc?.name)}
                      letter={(acc?.name ?? a.accountId)[0] ?? '?'}
                    />
                  }
                  title={acc?.name ?? a.accountId}
                  meta={`${formatRub(a.debt, { whole: true })}${a.paidThisMonth ? `, погашено ${formatRub(a.paidThisMonth, { whole: true })}` : ''}`}
                  right={
                    <PillButton
                      kind="strong"
                      size="md"
                      title="Погасить"
                      onPress={() =>
                        router.navigate({
                          pathname: '/add',
                          params: { kind: 'transfer', from: defaultAccountId() ?? '', to: a.accountId },
                        })
                      }
                    />
                  }
                  last={i === h.accounts.length - 1}
                />
              );
            })}
          </Card>

          {receivable.length ? (
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {receivable.map((a, i) => (
                <Row
                  key={a.id}
                  left={<AppIcon pkg={undefined} letter={a.name[0] ?? '?'} />}
                  title={a.name}
                  meta={formatRub(balances.get(a.id)?.computed ?? 0, { whole: true })}
                  right={
                    <PillButton
                      kind="secondary"
                      size="md"
                      title="Вернули"
                      onPress={() =>
                        router.navigate({
                          pathname: '/add',
                          params: { kind: 'transfer', from: a.id, to: defaultAccountId() ?? '' },
                        })
                      }
                    />
                  }
                  last={i === receivable.length - 1}
                />
              ))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** «2027-08» -> «августе 2027». */
const inMonth = (key: string) => {
  const m = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
  });
  return `${m.replace(/ь$/, 'е').replace(/й$/, 'е').replace(/т$/, 'те')} ${key.slice(0, 4)}`;
};

/**
 * План погашения одной кредитки: сколько внесено за месяц из плана (регулярные переводы на неё),
 * шаги месяца, когда закроется при плановом платеже с процентами и страховкой из условий.
 */
function PlanCard({
  accountId,
  name,
  debt,
  paid,
  rules,
}: {
  accountId: string;
  name: string;
  debt: number;
  paid: number;
  rules: RecurringRule[];
}) {
  const { colors } = useTheme();
  const ops = useAllOperations();
  const mine = rules.filter((r) => r.kind === 'transfer' && r.toAccountId === accountId);
  const now = budgetNow();
  const occ = matchOccurrences(
    mine,
    ops,
    new Date(now.getFullYear(), now.getMonth(), 1, 12),
    new Date(now.getFullYear(), now.getMonth() + 1, 0, 12),
    new Date(),
  );
  const planned = occ.reduce((s, o) => s + o.rule.amount, 0);
  const terms = debtTerms(accountId);
  const ins = terms.insurance === 'yes' ? (terms.insurancePct ?? 0) : 0;
  const next = currentMonthKey();
  const plan = planned && terms.rate ? debtSchedule(debt, terms.rate, planned, next, ins) : undefined;
  const alt = (k: number) =>
    terms.rate ? debtSchedule(debt, terms.rate, k, next, ins).payoffMonth : undefined;
  const openTerms = () => router.push(`/debt-terms/${encodeURIComponent(accountId)}` as Href);
  const addRule = () =>
    router.push({
      pathname: '/recurring/edit',
      params: { kind: 'transfer', name: `Платёж: ${name}` },
    } as Href);
  return (
    <Card style={{ gap: 10 }}>
      <T v="h2">
        {name}, {now.toLocaleDateString('ru-RU', { month: 'long' })}
      </T>
      {planned ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="caption" c="muted">
              Внесено за месяц
            </T>
            <T v="num">
              {formatRub(paid, { whole: true })} из {formatRub(planned, { whole: true })}
            </T>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line }}>
            <View
              style={{
                width: `${Math.min(100, (paid / planned) * 100)}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.accent,
              }}
            />
          </View>
          {occ.map((o) => (
            // Сумму и даты плана правят в форме регулярного: строка ведёт туда.
            <Pressable
              key={o.dueAt + o.rule.id}
              accessibilityRole="button"
              accessibilityLabel={`${o.rule.name}, ${formatRub(o.rule.amount, { whole: true })}. Изменить`}
              onPress={() => router.push({ pathname: '/recurring/edit', params: { id: o.rule.id } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <T v="label" c={o.paidBy ? 'accentInk' : o.late ? 'warnInk' : 'ink'} style={{ flex: 1 }}>
                {o.paidBy ? '✓ ' : ''}
                {new Date(o.dueAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} ·{' '}
                {o.rule.name}
              </T>
              <T v="label" c={o.paidBy ? 'muted' : 'ink'}>
                {formatRub(o.rule.amount, { whole: true })}
              </T>
              <ChevronRightIcon color={colors.muted} />
            </Pressable>
          ))}
        </>
      ) : (
        <PillButton
          kind="secondary"
          size="md"
          title="Завести платёж по плану"
          style={{ alignSelf: 'flex-start' }}
          onPress={addRule}
        />
      )}
      {plan ? (
        <Card tone={plan.payoffMonth ? 'accentSoft' : 'warnSoft'} style={{ gap: 4 }}>
          <T v="body" c={plan.payoffMonth ? 'accentSoftInk' : 'warnSoftInk'}>
            {plan.payoffMonth
              ? `Закроем в ${inMonth(plan.payoffMonth)}`
              : 'При таком платеже долг не закроется'}
          </T>
          <T v="caption" c={plan.payoffMonth ? 'accentSoftInk' : 'warnSoftInk'}>
            {`проценты${ins ? ' и страховка' : ''} за всё время ≈ ${formatRub(Math.round(plan.interest / 100000) * 100000, { whole: true })}`}
            {[-10000_00, 10000_00]
              .map((d) => planned + d)
              .filter((k) => k > 0)
              .map((k) => {
                const m = alt(k);
                return m ? `, ${formatRub(k, { whole: true })}: ${inMonth(m)}` : '';
              })
              .join('')}
          </T>
        </Card>
      ) : null}
      <Pressable accessibilityRole="button" onPress={openTerms}>
        <Row
          title="Условия долга"
          meta={
            terms.rate
              ? `${String(terms.rate).replace('.', ',')}%, страховка ${terms.insurance === 'yes' ? 'списывается' : terms.insurance === 'no' ? 'отключена' : 'не проверена'}`
              : 'укажи ставку, чтобы посчитать срок'
          }
          metaTone={terms.rate ? 'muted' : 'warnInk'}
          last
        />
      </Pressable>
    </Card>
  );
}
