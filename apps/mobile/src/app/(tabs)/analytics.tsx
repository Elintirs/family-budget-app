import {
  daysInMonth,
  formatRub,
  spendByAuthor,
  spendStructure,
  type MonthStats,
  currentMonthKey,
  budgetNow,
} from '@budget/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useAllOperations, useAnalytics, useBootstrap, usePullRefresh } from '@/hooks/data';
import {
  addMonths,
  deltaCaption,
  deltaPct,
  monthDative,
  monthShort,
  monthTitle,
  plural,
} from '@/state/format';
import { Bars, Meter } from '@/ui/charts';
import { ChevronLeftIcon, ChevronRightIcon } from '@/ui/icons';
import { Card, Chip, PillButton, Screen, Segmented, T } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

const EMPTY = (month: string): MonthStats => ({
  month,
  income: 0,
  expense: 0,
  groups: {},
  subcategories: {},
  incomeCategories: {},
});

export default function Analytics() {
  const { colors } = useTheme();
  const q = useAnalytics();
  const pull = usePullRefresh();
  const months = q.data?.months ?? [];
  const byKey = useMemo(() => new Map(months.map((m) => [m.month, m])), [months]);
  const current = currentMonthKey();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(current);
  const [year, setYear] = useState(new Date().getFullYear());
  const first = months[0]?.month ?? current;

  if (!q.data) {
    return (
      <Screen inTabs>
        <T v="title">Аналитика</T>
        {q.isError ? (
          <Card tone="warnSoft">
            <T v="body" c="warnSoftInk">
              Не удалось загрузить аналитику
            </T>
            <PillButton
              kind="strong"
              size="md"
              title={q.isFetching ? 'Пробуем…' : 'Повторить'}
              loading={q.isFetching}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => q.refetch()}
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.accentInk} />
        )}
      </Screen>
    );
  }

  return (
    <Screen inTabs {...pull}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <T v="title" numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1 }}>
          Аналитика
        </T>
        <View style={{ width: 150 }}>
          <Segmented
            label="Период"
            value={mode}
            onChange={setMode}
            options={[
              { key: 'month', title: 'Месяц' },
              { key: 'year', title: 'Год' },
            ]}
          />
        </View>
      </View>
      <View style={{ gap: space.gap }}>
        {mode === 'month' ? (
          <MonthView
            month={month}
            setMonth={setMonth}
            stats={byKey.get(month) ?? EMPTY(month)}
            prev={byKey.get(addMonths(month, -1))}
            byKey={byKey}
            canPrev={month > first}
            canNext={month < current}
            isCurrent={month === current}
          />
        ) : (
          <YearView year={year} setYear={setYear} byKey={byKey} firstYear={Number(first.slice(0, 4))} />
        )}
      </View>
    </Screen>
  );
}

function Stepper({
  title,
  sub,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  title: string;
  sub?: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const { colors } = useTheme();
  const btn = (on: boolean, label: string, icon: React.ReactNode, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!on}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: on ? colors.border : colors.line,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: on ? 1 : 0.4,
      }}
    >
      {icon}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {btn(canPrev, 'Предыдущий', <ChevronLeftIcon color={colors.ink} />, onPrev)}
      <View style={{ alignItems: 'center', gap: 2 }}>
        <T v="title" style={{ fontSize: 18 }}>
          {title}
        </T>
        {sub ? (
          <T v="caption" c="muted">
            {sub}
          </T>
        ) : null}
      </View>
      {btn(canNext, 'Следующий', <ChevronRightIcon color={colors.ink} size={20} />, onNext)}
    </View>
  );
}

function Totals({ s, prev }: { s: MonthStats; prev?: MonthStats }) {
  const saldo = s.income - s.expense;
  const rate = s.income ? Math.round((saldo / s.income) * 100) : 0;
  const cell = (
    label: string,
    value: string,
    sub?: string,
    tone: 'ink' | 'accentInk' | 'warnInk' = 'ink',
  ) => (
    <View style={{ width: '50%', gap: 2, paddingVertical: 6 }}>
      <T v="caption" c="muted">
        {label}
      </T>
      <T v="num" c={tone} style={{ fontSize: 19 }}>
        {value}
      </T>
      {sub ? (
        <T v="caption" c="muted">
          {sub}
        </T>
      ) : null}
    </View>
  );
  return (
    <Card style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0 }}>
      {cell(
        'Доходы',
        formatRub(s.income, { whole: true }),
        prev ? `${deltaPct(s.income, prev.income) ?? '—'} к ${monthDative(prev.month)}` : undefined,
      )}
      {cell(
        'Расходы',
        formatRub(s.expense, { whole: true }),
        prev ? `${deltaPct(s.expense, prev.expense) ?? '—'} к ${monthDative(prev.month)}` : undefined,
      )}
      {cell(
        'Свободные деньги',
        formatRub(saldo, { sign: true, whole: true }),
        'на долги и цели',
        saldo >= 0 ? 'accentInk' : 'warnInk',
      )}
      {cell('Норма сбережений', s.income ? `${rate}%` : '—')}
    </Card>
  );
}

function MonthView(p: {
  month: string;
  setMonth: (m: string) => void;
  stats: MonthStats;
  prev?: MonthStats;
  byKey: Map<string, MonthStats>;
  canPrev: boolean;
  canNext: boolean;
  isCurrent: boolean;
}) {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  // Бюджетный день: 1-го до 05:00 темп считается ещё за прошлый месяц, как на Главной.
  const now = budgetNow();
  const s = p.stats;
  const chips = [...p.byKey.keys()];

  // Темп: сколько потрачено «в лимит» против плана к сегодняшнему дню.
  const pace = useMemo(() => {
    if (!p.isCurrent || !boot) return null;
    const spent = boot.summary.spentMonthBeforeToday + boot.summary.spentToday;
    const plan = Math.round((boot.summary.monthLimit * now.getDate()) / daysInMonth(now));
    return { spent, plan, limit: boot.summary.monthLimit };
  }, [p.isCurrent, boot]);

  // Кто сколько потратил: по зеркалу таблицы (прошлый и текущий месяц), у строк формы автора нет.
  const all = useAllOperations();
  const who = useMemo(() => {
    const [y, m] = p.month.split('-').map(Number);
    const r = spendByAuthor(all, new Date(y!, m! - 1, 15, 12));
    return r.authors.length ? r : null;
  }, [all, p.month]);
  const whoTotal = who ? who.authors.reduce((x, a) => x + a.amount, 0) : 0;
  const WHO_COLORS = [colors.accent, colors.expense];

  const subs = Object.entries(s.subcategories).sort((a, b) => b[1] - a[1]);
  const maxSub = subs[0]?.[1] ?? 0;
  const last6 = Array.from({ length: 6 }, (_, i) => addMonths(p.month, i - 5));

  return (
    <>
      <Stepper
        title={monthTitle(p.month)}
        sub={
          p.isCurrent
            ? `прошло ${now.getDate()} из ${daysInMonth(now)} ${plural(daysInMonth(now), 'дня', 'дней', 'дней')}`
            : undefined
        }
        onPrev={() => p.setMonth(addMonths(p.month, -1))}
        onNext={() => p.setMonth(addMonths(p.month, 1))}
        canPrev={p.canPrev}
        canNext={p.canNext}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {chips.map((m) => (
          <Chip
            key={m}
            label={`${monthShort(m)} ${m.slice(2, 4)}`}
            selected={m === p.month}
            onPress={() => p.setMonth(m)}
          />
        ))}
      </ScrollView>

      <Totals s={s} prev={p.prev} />

      {pace ? (
        <Card tone={pace.spent > pace.plan ? 'warnSoft' : 'accentSoft'}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="body" c={pace.spent > pace.plan ? 'warnSoftInk' : 'accentSoftInk'}>
              Темп трат
            </T>
            <T v="label" c={pace.spent > pace.plan ? 'warnSoftInk' : 'accentSoftInk'}>
              {pace.plan
                ? pace.spent > pace.plan
                  ? `в ${(pace.spent / pace.plan).toFixed(1).replace('.', ',')} раза быстрее плана`
                  : 'в пределах плана'
                : ''}
            </T>
          </View>
          <Meter value={pace.spent} max={pace.limit} tone={pace.spent > pace.plan ? 'warn' : 'accent'} />
          <T v="caption" c={pace.spent > pace.plan ? 'warnSoftInk' : 'accentSoftInk'}>
            Потрачено {formatRub(pace.spent, { whole: true })} из {formatRub(pace.limit, { whole: true })} ·
            по плану к сегодня {formatRub(pace.plan, { whole: true })}
          </T>
        </Card>
      ) : null}

      <Structure s={s} prev={p.prev} isCurrent={p.isCurrent} />

      <Card>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <T v="h2">Последние 6 месяцев</T>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Legend color={colors.accent} label="Доходы" />
            <Legend color={colors.expense} label="Расходы" />
          </View>
        </View>
        <Bars
          items={last6.map((m) => {
            const st = p.byKey.get(m);
            return {
              key: m,
              label: monthShort(m),
              values: [st?.income ?? 0, st?.expense ?? 0],
              active: m === p.month,
              onPress: st ? () => p.setMonth(m) : undefined,
            };
          })}
        />
      </Card>

      {who && whoTotal ? (
        <Card style={{ gap: 12 }}>
          <T v="h2">Кто сколько потратил</T>
          <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' }}>
            {who.authors.map((a, i) => (
              <View
                key={a.author}
                style={{ flex: a.amount / whoTotal, backgroundColor: WHO_COLORS[i % WHO_COLORS.length] }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {who.authors.map((a, i) => (
              <View key={a.author} style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: WHO_COLORS[i % WHO_COLORS.length],
                    }}
                  />
                  <T v="label">
                    {a.author} {Math.round((a.amount / whoTotal) * 100)}%
                  </T>
                </View>
                <T v="num" style={{ fontSize: 18 }}>
                  {formatRub(a.amount, { whole: true })}
                </T>
                {a.top.length ? (
                  <T v="caption" c="muted">
                    больше всего: {a.top.join(', ')}
                  </T>
                ) : null}
              </View>
            ))}
          </View>
          {who.unknown ? (
            <T v="caption" c="muted">
              Траты из формы без автора в долю не входят: {formatRub(who.unknown, { whole: true })}
            </T>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="h2">Подкатегории</T>
          <T v="caption" c="muted">
            {p.prev ? `к ${monthDative(p.prev.month)}` : ''}
          </T>
        </View>
        {subs.length ? (
          subs.map(([name, sum]) => {
            const before = p.prev?.subcategories[name] ?? 0;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/category/[name]', params: { name, month: p.month } })
                }
                style={{ gap: 6 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T v="body">{name}</T>
                  <T v="num">{formatRub(sum, { whole: true })}</T>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Meter value={sum} max={maxSub} />
                  </View>
                  <T
                    v="caption"
                    c={!before ? 'muted' : sum > before ? 'warnInk' : 'accentInk'}
                    style={{ minWidth: 90, textAlign: 'right' }}
                  >
                    {deltaCaption(sum, before, (k) => formatRub(k, { whole: true }))}
                  </T>
                </View>
              </Pressable>
            );
          })
        ) : (
          <T v="label" c="muted">
            Расходов нет.
          </T>
        )}
      </Card>

      {Object.keys(s.groups).length ? (
        <Card style={{ gap: 10 }}>
          <T v="h2">По категориям</T>
          {Object.entries(s.groups)
            .sort((a, b) => b[1] - a[1])
            .map(([g, v]) => (
              <View key={g} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T v="body">{g}</T>
                  <T v="num">{formatRub(v, { whole: true })}</T>
                </View>
                <Meter value={v} max={s.expense} />
              </View>
            ))}
        </Card>
      ) : null}
    </>
  );
}

function YearView({
  year,
  setYear,
  byKey,
  firstYear,
}: {
  year: number;
  setYear: (y: number) => void;
  byKey: Map<string, MonthStats>;
  firstYear: number;
}) {
  const { colors } = useTheme();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const stats = months.map((m) => byKey.get(m));
  const total: MonthStats = stats.reduce<MonthStats>(
    (acc, s) => {
      if (!s) return acc;
      acc.income += s.income;
      acc.expense += s.expense;
      for (const [g, v] of Object.entries(s.groups)) acc.groups[g] = (acc.groups[g] ?? 0) + v;
      return acc;
    },
    EMPTY(String(year)),
  );
  const now = new Date().getFullYear();
  return (
    <>
      <Stepper
        title={String(year)}
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
        canPrev={year > firstYear}
        canNext={year < now}
      />
      <Totals s={total} />
      <Card>
        <T v="h2">Расходы по месяцам</T>
        <Bars
          items={months.map((m, i) => ({
            key: m,
            label: monthShort(m).slice(0, 1).toUpperCase(),
            values: [stats[i]?.expense ?? 0],
            active: m === currentMonthKey(),
          }))}
          colors={[colors.expense]}
        />
      </Card>
      <Card style={{ gap: 10 }}>
        <T v="h2">По категориям за год</T>
        {Object.entries(total.groups)
          .sort((a, b) => b[1] - a[1])
          .map(([g, v]) => (
            <View key={g} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="body">{g}</T>
                <T v="num">{formatRub(v, { whole: true })}</T>
              </View>
              <Meter value={v} max={total.expense} />
            </View>
          ))}
      </Card>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <T v="caption" c="muted">
        {label}
      </T>
    </View>
  );
}

/**
 * Регулярные и единовременные расходы (ремонт машины, штрафы): этот месяц и прошлый одной шкалой,
 * единовременные по подкатегориям и прогноз «если так же, но без разовых».
 */
function Structure({ s, prev, isCurrent }: { s: MonthStats; prev?: MonthStats; isCurrent: boolean }) {
  const { colors } = useTheme();
  const cur = spendStructure(s);
  if (!s.expense) return null;
  const rows = [prev, s].filter((m): m is MonthStats => !!m && m.expense > 0);
  const max = Math.max(...rows.map((m) => m.expense));
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <T v="h2" style={{ flexShrink: 1 }}>
          Регулярные и единовременные
        </T>
        <T v="caption" c="muted">
          расходы
        </T>
      </View>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Legend color={colors.accent} label="Регулярные" />
          <Legend color={colors.expense} label="Единовременные" />
        </View>
        {rows.map((m) => {
          const st = spendStructure(m);
          return (
            <View key={m.month} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="label">{monthTitle(m.month).split(' ')[0]}</T>
                <T v="label">{formatRub(m.expense, { whole: true })}</T>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  height: 14,
                  borderRadius: 7,
                  overflow: 'hidden',
                  backgroundColor: colors.line,
                }}
              >
                <View style={{ width: `${(st.regular / max) * 100}%`, backgroundColor: colors.accent }} />
                <View style={{ width: `${(st.oneOff / max) * 100}%`, backgroundColor: colors.expense }} />
              </View>
              <T v="caption" c="muted">
                {formatRub(st.regular, { whole: true })} + {formatRub(st.oneOff, { whole: true })}
              </T>
            </View>
          );
        })}
        {cur.oneOffItems.length ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 8 }}>
            <T v="caption" c="muted">
              Единовременные в {monthDative(s.month).replace(/у$/, 'е')}
            </T>
            {cur.oneOffItems.map((i) => (
              <View key={i.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="body">{i.name}</T>
                <T v="num">{formatRub(i.amount, { whole: true })}</T>
              </View>
            ))}
          </View>
        ) : (
          <T v="caption" c="muted">
            Крупные разовые траты отмечаются в карточке операции переключателем «Единовременный расход», для
            подкатегории можно сделать так по умолчанию.
          </T>
        )}
      </Card>
      {!isCurrent && cur.oneOff ? (
        <Card tone="accentSoft" style={{ gap: 4 }}>
          <T v="body" c="accentSoftInk">
            Прогноз на следующий месяц
          </T>
          <T v="caption" c="accentSoftInk">
            Если регулярные расходы останутся такими же, а единовременных не будет: расходы ~
            {formatRub(cur.regular, { whole: true })}, свободно ~
            {formatRub(cur.forecastFree, { whole: true })}.
          </T>
        </Card>
      ) : null}
    </>
  );
}
