import { adjustmentAccount, filterHistory, formatRub, historyMonths, type Operation } from '@budget/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useBootstrap, useAllOperations, usePullRefresh } from '@/hooks/data';
import { dayTitle, monthTitle } from '@/state/format';
import { onPicked } from '@/state/pickBus';
import { AppIcon, MIR_PAY, packageForAccount } from '@/ui/AppIcon';
import { CheckIcon, ClockIcon } from '@/ui/icons';
import { Card, Chip, Chips, Input, PillButton, Screen, ScreenHeader, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';

type Filter = 'all' | 'expense' | 'income' | 'transfer';
const FILTERS: { key: Filter; title: string }[] = [
  { key: 'all', title: 'Все' },
  { key: 'expense', title: 'Расходы' },
  { key: 'income', title: 'Доходы' },
  { key: 'transfer', title: 'Переводы' },
];
const AUTHORS = ['Олег', 'Елена'] as const;
/** Дней на первом экране: остальное по «Показать ещё», чтобы длинная история не рисовалась целиком. */
const DAYS_PAGE = 30;

/**
 * История операций (телефон и таблица): поиск по магазину, комментарию, тексту уведомления, сумме и
 * счёту; фильтры по виду, автору, месяцу и подкатегории; итог найденного. По дням, со статусом.
 */
export default function History() {
  const { colors } = useTheme();
  const ops = useAllOperations();
  const pull = usePullRefresh();
  const boot = useBootstrap().data;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [who, setWho] = useState<(typeof AUTHORS)[number] | undefined>();
  const [shownDays, setShownDays] = useState(DAYS_PAGE);
  // Поиск пересчитывается после ввода, а не на каждом символе посреди набора.
  const query = useDeferredValue(q);

  // С Главной по нажатию на лимит: cat (подкатегория или группа) и месяц уже выставлены.
  const params = useLocalSearchParams<{ cat?: string; month?: string }>();
  const [month, setMonth] = useState<string | undefined>(params.month || undefined);
  const [sub, setSub] = useState<string | undefined>(params.cat || undefined);
  useEffect(() => onPicked((target, value) => target === 'filter' && setSub(value)), []);
  const months = useMemo(() => historyMonths(ops).slice(0, 3), [ops]);

  const { days, totals } = useMemo(() => {
    const kind = filter === 'all' ? undefined : filter;
    // Группа лимита («Обязательные»): все её подкатегории.
    const groupSubs = (boot?.subcategories ?? []).filter((s) => s.group === sub).map((s) => s.name);
    const { list, totals } = filterHistory(ops, {
      kind,
      author: who,
      ...(groupSubs.length ? { subcategories: groupSubs } : { subcategory: sub }),
      month,
      query,
      accountNames: new Map((boot?.accounts ?? []).map((a) => [a.id, a.name])),
    });
    const map = new Map<string, Operation[]>();
    for (const o of list) {
      const k = new Date(o.occurredAt).toDateString();
      const day = map.get(k);
      if (day) day.push(o);
      else map.set(k, [o]);
    }
    return { days: [...map.entries()], totals };
  }, [ops, query, filter, who, month, sub, boot]);
  const adj = useMemo(() => adjustmentAccount(boot?.accounts ?? []), [boot]);
  const filtered = Boolean(q.trim() || filter !== 'all' || who || month || sub);
  const reset = () => {
    setQ('');
    setFilter('all');
    setWho(undefined);
    setMonth(undefined);
    setSub(undefined);
  };

  return (
    <Screen {...pull}>
      <ScreenHeader title="История" onBack={goBack} />
      <Input
        accessibilityLabel="Поиск по операциям"
        value={q}
        onChangeText={setQ}
        placeholder="Магазин, сумма, комментарий"
        round
      />
      {/* Чипы переносятся, как в макете: ничего не прячется за краем (аудит 05.11, п. 11). */}
      <Chips>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.title} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </Chips>
      {/* Автор отдельно от вида: «расходы Елены» выбираются двумя чипами. */}
      <Chips>
        {AUTHORS.map((a) => (
          <Chip key={a} label={a} selected={who === a} onPress={() => setWho(who === a ? undefined : a)} />
        ))}
      </Chips>
      <Chips>
        {months.map((m) => (
          <Chip
            key={m}
            label={monthTitle(m).split(' ')[0]!}
            selected={month === m}
            onPress={() => setMonth(month === m ? undefined : m)}
          />
        ))}
        <Chip
          label={sub ?? 'Подкатегория…'}
          selected={Boolean(sub)}
          tone={sub ? 'default' : 'more'}
          onPress={() =>
            sub
              ? setSub(undefined)
              : router.push({ pathname: '/pick/[id]', params: { id: 'new', target: 'filter' } })
          }
        />
      </Chips>
      {filtered ? (
        // Итог найденного: «куда ушло на транспорт» видно сразу, без сложения в уме.
        <Card
          tone="fill"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label">
              {totals.count
                ? `Найдено ${totals.count}: ${
                    [
                      totals.expense ? `расходы ${formatRub(totals.expense, { whole: true })}` : '',
                      totals.income ? `доходы ${formatRub(totals.income, { whole: true })}` : '',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'только переводы'
                  }`
                : 'Ничего не нашлось'}
            </T>
            {month || sub ? (
              <T v="caption" c="muted">
                {[sub, month ? monthTitle(month) : 'за всё время'].filter(Boolean).join(', ')}
              </T>
            ) : null}
          </View>
          <PillButton kind="ghost" size="md" title="Сбросить" onPress={reset} />
        </Card>
      ) : null}
      {days.length
        ? days.slice(0, shownDays).map(([day, list]) => {
            const total = list.reduce(
              (s, o) => s + (o.kind === 'expense' ? -o.amount : o.kind === 'income' ? o.amount : 0),
              0,
            );
            return (
              <View key={day} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="label" c="muted">
                    {dayTitle(new Date(day))}
                  </T>
                  <T v="label" c="muted">
                    {formatRub(total, { sign: true, whole: true })}
                  </T>
                </View>
                <Card style={{ paddingVertical: 4, gap: 0 }}>
                  {list.map((o, i) => {
                    // Поправка по сверке: перевод с «Поправками», показывается от настоящего счёта и серым.
                    const fix =
                      !!adj && o.kind === 'transfer' && (o.accountId === adj.id || o.toAccountId === adj.id);
                    const accId = fix && o.accountId === adj?.id ? o.toAccountId : o.accountId;
                    const acc = boot?.accounts.find((a) => a.id === accId);
                    const sign = fix
                      ? o.toAccountId === adj?.id
                        ? -1
                        : 1
                      : o.kind === 'expense'
                        ? -1
                        : o.kind === 'income'
                          ? 1
                          : 0;
                    return (
                      <Pressable
                        key={o.id}
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/operation/[id]', params: { id: o.id } })}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 12,
                          borderBottomWidth: i === list.length - 1 ? 0 : 1,
                          borderBottomColor: colors.line,
                        }}
                      >
                        <AppIcon
                          pkg={o.sourceApp ?? packageForAccount(acc?.name)}
                          badgePkg={o.alsoFrom?.includes(MIR_PAY) ? MIR_PAY : undefined}
                          letter={acc?.name[0] ?? '?'}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <T v="body" numberOfLines={1}>
                            {(fix ? `Поправка: ${acc?.name ?? ''}` : undefined) ??
                              o.merchant?.split(/[.,]/)[0] ??
                              o.comment ??
                              (o.kind === 'transfer' ? 'Перевод' : o.kind === 'income' ? 'Доход' : 'Покупка')}
                          </T>
                          <T v="caption" c="muted" numberOfLines={1}>
                            {[
                              (fix ? 'по сверке, не расход' : undefined) ??
                                o.subcategory ??
                                o.incomeCategory ??
                                (o.kind === 'transfer' ? 'перевод' : 'без категории'),
                              // Комментарий в подписи: видно, почему операция нашлась по поиску.
                              o.comment && o.merchant ? o.comment : undefined,
                              o.author,
                            ]
                              // Доход «Елена» от Елены: без «Елена, Елена».
                              .filter((x, i, all) => x && all.indexOf(x) === i)
                              .join(', ')}
                          </T>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <T v="num" c={fix ? 'muted' : sign > 0 ? 'accentInk' : 'ink'}>
                            {sign ? formatRub(sign * o.amount, { sign: true }) : formatRub(o.amount)}
                          </T>
                          {/* Статус словом, не только цветом и значком (WCAG 1.4.1). */}
                          {o.status === 'synced' ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <CheckIcon color={colors.accentInk} size={12} />
                              <T v="caption" c="muted">
                                в таблице
                              </T>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <ClockIcon color={colors.warnInk} />
                              <T v="caption" c="warnInk">
                                ждёт
                              </T>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </Card>
              </View>
            );
          })
        : null}
      {days.length > shownDays ? (
        <PillButton
          kind="secondary"
          title={`Показать ещё (${days.length - shownDays} дн.)`}
          onPress={() => setShownDays(shownDays + DAYS_PAGE)}
        />
      ) : null}
      {days.length ? null : (
        <Card>
          <T v="label" c="muted">
            {filtered ? 'Под эти условия операций нет.' : 'Операций нет.'}
          </T>
        </Card>
      )}
    </Screen>
  );
}
