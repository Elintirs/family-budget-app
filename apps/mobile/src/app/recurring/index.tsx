import {
  detectRecurring,
  formatRub,
  recurringLeft,
  recurringStatus,
  unmatchedSuggestions,
  type RecurringStatus,
  describeRule,
  currentMonthKey,
} from '@budget/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { kv, log } from '@/adapters';
import { useAllOperations, useBootstrap } from '@/hooks/data';
import { humanTime } from '@/state/format';
import { goBack } from '@/state/nav';
import {
  Card,
  Chip,
  Chips,
  NoTableData,
  PillButton,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  T,
} from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const dayLabel = (iso: string) => humanTime(iso).split(' ').slice(0, 2).join(' ');

/**
 * Регулярные (приходы, платежи, переводы): заведённые руками (лист «Регулярные», общий на двоих) со статусом этого месяца,
 * и найденные по истории, которые можно добавить или скрыть («Не регулярный»).
 */
export default function Recurring() {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const ops = useAllOperations();
  const rules = useMemo(() => boot?.recurring ?? [], [boot]);
  const [hidden, setHidden] = useState(() => new Set(kv.getJson<string[]>('recurring.hidden') ?? []));
  const status = useMemo(() => recurringStatus(rules, ops, new Date()), [rules, ops]);
  const suggestions = useMemo(
    () => unmatchedSuggestions(detectRecurring(ops), rules).filter((r) => !hidden.has(r.key)),
    [ops, rules, hidden],
  );
  // Месячная сумма по датам этого месяца: правило «10 и 25» и игра раз в неделю считаются по разу на дату.
  const out = status
    .filter((s) => (s.rule.kind ?? 'expense') !== 'income')
    .reduce((sum, s) => sum + s.rule.amount, 0);
  const inc = status.filter((s) => s.rule.kind === 'income').reduce((sum, s) => sum + s.rule.amount, 0);
  const left = recurringLeft(status);
  // «в ноябре»: бюджетный месяц.
  const monthName = MONTHS_PREP[Number(currentMonthKey().slice(5)) - 1];
  // Расходы (и переводы на кредитки) отдельно от доходов: в одной ленте зарплата и аренда путали (06.11).
  const [side, setSide] = useState<'out' | 'in'>('out');
  const isIn = (st: RecurringStatus) => st.rule.kind === 'income';
  const shown = status.filter((st) => isIn(st) === (side === 'in'));
  const incLeft = status.filter((st) => isIn(st) && !st.paidBy).reduce((sum, st) => sum + st.rule.amount, 0);
  const groups = new Map((boot?.subcategories ?? []).map((s) => [s.name, s.group]));
  const expected = shown.filter((s) => !s.paidBy);
  const paid = shown.filter((s) => s.paidBy);

  const hide = (key: string, merchant: string) => {
    const next = new Set(hidden).add(key);
    kv.setJson('recurring.hidden', [...next]);
    log.info('recurring', `Не регулярный: ${merchant}`);
    setHidden(next);
  };
  const open = (s: RecurringStatus) =>
    router.push({ pathname: '/recurring/edit', params: { id: s.rule.id } });

  if (!boot) return <NoTableData title="Регулярные" onBack={goBack} />;
  return (
    <Screen>
      <ScreenHeader title="Регулярные" onBack={goBack} />
      <Segmented<'out' | 'in'>
        label="Что показать"
        value={side}
        onChange={setSide}
        options={[
          { key: 'out', title: 'Расходы' },
          { key: 'in', title: 'Доходы' },
        ]}
      />
      <Card tone="hero">
        <T v="caption" style={{ color: colors.heroMuted }}>
          {side === 'in' ? `Придёт в ${monthName}` : `Уйдёт в ${monthName}`}
        </T>
        <T v="amount" style={{ color: side === 'in' ? colors.heroAccent : colors.heroInk }}>
          {side === 'in' && inc ? 'от ' : ''}
          {formatRub(side === 'in' ? inc : out, { whole: true })}
        </T>
        <T v="caption" style={{ color: colors.heroMuted }}>
          {!shown.length
            ? side === 'in'
              ? 'Добавь зарплату: будет видно, что пришло и что ещё впереди.'
              : 'Добавь аренду, связь, подписки: будет видно, что уже списано и что ещё впереди.'
            : side === 'in'
              ? `ещё придёт от ${formatRub(incLeft, { whole: true })}`
              : `ещё спишется ${formatRub(left, { whole: true })}`}
        </T>
      </Card>

      {(side === 'out' ? suggestions : []).map((r) => (
        <Card key={r.key} tone="accentSoft" style={{ gap: 10 }}>
          <T v="body" c="accentSoftInk">
            Похоже на регулярный платёж
          </T>
          <T v="label" c="accentSoftInk">
            «{r.merchant}», {formatRub(r.amount, { whole: true })}, {r.months} мес. подряд около{' '}
            {r.dayOfMonth}-го числа
          </T>
          <Chips>
            <Chip
              label="Добавить"
              selected
              onPress={() =>
                router.push({
                  pathname: '/recurring/edit',
                  params: {
                    name: r.merchant,
                    amount: String(r.amount),
                    day: String(r.dayOfMonth),
                    match: r.merchant.toLowerCase(),
                    subcategory: r.subcategory ?? '',
                  },
                })
              }
            />
            <Chip label="Не регулярный" onPress={() => hide(r.key, r.merchant)} />
          </Chips>
        </Card>
      ))}

      {expected.length ? (
        <>
          <T v="h2">Ожидаются</T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {expected.map((s, i) => (
              <Pressable key={s.rule.id + s.dueAt} accessibilityRole="button" onPress={() => open(s)}>
                <Row
                  title={s.rule.name}
                  meta={[
                    s.late
                      ? `${dayLabel(s.dueAt)}, ${s.rule.kind === 'income' ? 'прихода' : 'оплаты'} не видно`
                      : dayLabel(s.dueAt),
                    describeRule(s.rule),
                    s.rule.subcategory ? (groups.get(s.rule.subcategory) ?? s.rule.subcategory) : undefined,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  metaTone={s.late ? 'warnInk' : 'muted'}
                  right={
                    <T v="num" c={s.rule.kind === 'income' ? 'accentInk' : 'ink'}>
                      {s.rule.kind === 'income' ? '+' : ''}
                      {/* Диапазон коротко, «25–40 тыс. ₽»: полная запись сжимала название в столбик. */}
                      {s.rule.amountMax
                        ? `${thousands(s.rule.amount)}–${thousands(s.rule.amountMax)} тыс. ₽`
                        : formatRub(s.rule.amount, { whole: true })}
                    </T>
                  }
                  last={i === expected.length - 1}
                />
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      {paid.length ? (
        <>
          <T v="h2">Уже прошли</T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {paid.map((s, i) => (
              <Pressable key={s.rule.id + s.dueAt} accessibilityRole="button" onPress={() => open(s)}>
                <Row
                  title={s.rule.name}
                  meta={`${dayLabel(s.paidBy!.occurredAt)}, ${s.paidBy!.comment ?? s.paidBy!.merchant ?? s.paidBy!.subcategory ?? ''}`}
                  right={
                    <T v="num" c="muted">
                      {formatRub(s.paidBy!.amount, { whole: true })}
                    </T>
                  }
                  last={i === paid.length - 1}
                />
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      <View style={{ gap: 6 }}>
        <PillButton
          kind="secondary"
          title={side === 'in' ? 'Добавить доход' : 'Добавить расход'}
          onPress={() =>
            router.push({ pathname: '/recurring/edit', params: side === 'in' ? { kind: 'income' } : {} })
          }
        />
        <T v="caption" c="muted" style={{ textAlign: 'center' }}>
          Узнаём по слову в комментарии, магазине или пуше и сумме рядом с датой.
        </T>
      </View>
    </Screen>
  );
}

const MONTHS_PREP = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];

/** Копейки в тысячи рублей: 2 500 000 -> «25», 2 550 000 -> «25,5». */
function thousands(kop: number): string {
  return String(Math.round(kop / 10000) / 10).replace('.', ',');
}
