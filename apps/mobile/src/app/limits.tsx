import { budgetNow, currentMonthKey, formatRub, matchOccurrences, monthSpent } from '@budget/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { kv } from '@/adapters';
import { useAllOperations, useAnalytics, useBootstrap, useRemainder } from '@/hooks/data';
import { Meter } from '@/ui/charts';
import { ChevronRightIcon } from '@/ui/icons';
import { Card, NoTableData, Screen, ScreenHeader, T, Toggle } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';
import { plural } from '@/state/format';

/** Группы со своим лимитом на месяц, вне лимита на день. */
const LIMIT_GROUPS = ['Обязательные', 'Крупные'] as const;

type Kind = 'month' | 'group' | 'sub';
const edit = (kind: Kind, name = '') => router.push({ pathname: '/limit-edit', params: { kind, name } });

/**
 * Лимиты: общий на месяц, группы вне лимита на день, подкатегории. В списке полей ввода нет: строка
 * открывает лист «Лимит» (сумма, подсказки по прошлым месяцам, «Сохранить» / «Убрать лимит»).
 */
export default function Limits() {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const r = useRemainder();
  const current = boot?.summary.monthLimit ?? 0;
  const analytics = useAnalytics().data;
  const ops = useAllOperations();
  const [warn, setWarn] = useState(() => kv.get('limits.warn') !== '0');
  const weekly = useMemo(() => {
    const n = budgetNow();
    const rules = (boot?.recurring ?? []).filter(
      (r) => r.schedule?.every === 'week' && (r.kind ?? 'expense') === 'expense',
    );
    return rules.map((r) => {
      const occ = matchOccurrences(
        [r],
        ops,
        new Date(n.getFullYear(), n.getMonth(), 1, 12),
        new Date(n.getFullYear(), n.getMonth() + 1, 0, 12),
        new Date(),
      );
      return {
        id: r.id,
        name: r.name,
        amount: r.amount,
        sub: r.subcategory ?? 'Развлечения',
        word: r.match,
        total: occ.length,
        paid: occ.filter((o) => o.paidBy).length,
        dots: occ.map((o) => ({
          date: new Date(o.dueAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
          paid: Boolean(o.paidBy),
        })),
      };
    });
  }, [boot, ops]);

  // Потрачено за бюджетный месяц: таблица плюс неотправленные этого месяца, одно правило с Главной.
  const { rows, groupRows } = useMemo(() => {
    const now = new Date();
    const month = analytics?.months.find((m) => m.month === currentMonthKey(now));
    const subs = boot?.subcategories ?? [];
    const groupOf = new Map(subs.map((s) => [s.name, s.group]));
    const spent = monthSpent(month, ops, (n) => groupOf.get(n), now);
    const limits = boot?.groupLimits ?? {};
    return {
      // Скрытые не показываем, если в этом месяце по ним ничего не потрачено; сверху где больше потрачено.
      rows: subs
        .filter((s) => !s.hidden || (spent.subcategories.get(s.name) ?? 0) > 0)
        .map((s) => ({
          name: s.name,
          group: s.group,
          limit: s.monthLimit,
          spent: spent.subcategories.get(s.name) ?? 0,
        }))
        .sort((a, b) => b.spent - a.spent),
      // Группы вне лимита на день: свой лимит на месяц.
      groupRows: LIMIT_GROUPS.map((g) => ({ name: g, limit: limits[g], spent: spent.groups.get(g) ?? 0 })),
    };
  }, [boot, analytics, ops]);

  if (!boot) return <NoTableData title="Лимиты" onBack={goBack} />;
  return (
    <Screen>
      <ScreenHeader title="Лимиты" onBack={goBack} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Изменить лимит на месяц"
        onPress={() => edit('month')}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T v="caption" c="muted">
              Лимит на месяц
            </T>
            <T v="label" c="accentInk">
              изменить
            </T>
          </View>
          <T v="amount">{formatRub(current, { whole: true })}</T>
          <T v="label" c="muted">
            ≈ {formatRub(r?.dailyLimit ?? 0, { whole: true })} в день на оставшиеся {r?.daysLeft ?? 0}{' '}
            {plural(r?.daysLeft ?? 0, 'день', 'дня', 'дней')}. В лимит идут только «Повседневные».
          </T>
        </Card>
      </Pressable>

      {/* Регулярные раз в неделю (Pathfinder): игры месяца кружками, закрашен оплаченный. */}
      {weekly.map((g) => (
        <Card key={g.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T v="h2">{g.name}</T>
            <T v="num">
              {g.paid} из {g.total}, {formatRub(g.amount * g.total, { whole: true })}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {g.dots.map((d, i) => (
              <View
                key={i}
                accessibilityLabel={`${d.date}: ${d.paid ? 'оплачено' : 'впереди'}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: colors.accent,
                  backgroundColor: d.paid ? colors.accent : 'transparent',
                }}
              />
            ))}
          </View>
          <T v="caption" c="muted">
            Отмечается само по трате в «{g.sub}» или со словом «{g.word}».
          </T>
        </Card>
      ))}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="h2">Вне лимита на день</T>
        <T v="caption" c="muted">
          свой лимит на месяц
        </T>
      </View>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {groupRows.map((g, i) => (
          <LimitRow
            key={g.name}
            name={g.name}
            hint={g.name === 'Крупные' ? 'ремонт, техника, поездки' : 'аренда, связь, кредиты'}
            spent={g.spent}
            limit={g.limit}
            last={i === groupRows.length - 1}
            onPress={() => edit('group', g.name)}
          />
        ))}
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="h2">По подкатегориям</T>
        <T v="caption" c="muted">
          необязательно
        </T>
      </View>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {rows.map((s, i) => (
          <LimitRow
            key={s.name}
            name={s.name}
            hint={s.group !== 'Повседневные' ? s.group : undefined}
            spent={s.spent}
            limit={s.limit}
            last={i === rows.length - 1}
            onPress={() => edit('sub', s.name)}
          />
        ))}
      </Card>

      <Card>
        <Toggle
          title="Предупреждать на 80%"
          caption="сводка в «Лимитах» на главной выделяется, когда подкатегория или группа подходит к лимиту"
          value={warn}
          onChange={(on) => {
            kv.set('limits.warn', on ? '1' : '0');
            setWarn(on);
          }}
        />
      </Card>
    </Screen>
  );
}

/**
 * Строка лимита: потрачено за месяц, лимит справа текстом (или «без лимита»), полоска. Вся строка
 * нажимается и открывает лист; свайп по списку её не трогает.
 */
function LimitRow(p: {
  name: string;
  /** Подпись перед «потрачено»: группа подкатегории или что в неё входит. */
  hint?: string;
  spent: number;
  limit?: number;
  last: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const over = p.limit !== undefined && p.spent > p.limit;
  const near = p.limit !== undefined && !over && p.spent >= p.limit * 0.8;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.name}: ${p.limit ? `лимит ${formatRub(p.limit, { whole: true })}` : 'без лимита'}. Изменить`}
      onPress={p.onPress}
      style={({ pressed }) => ({
        paddingVertical: 12,
        gap: 8,
        borderBottomWidth: p.last ? 0 : 1,
        borderBottomColor: colors.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">{p.name}</T>
          <T v="caption" c={over ? 'warnInk' : 'muted'}>
            {p.hint ? `${p.hint}, ` : ''}потрачено {formatRub(p.spent, { whole: true })}
            {over ? ', превышен' : ''}
          </T>
        </View>
        <T v={p.limit ? 'num' : 'label'} c={p.limit ? (over ? 'warnInk' : 'ink') : 'muted'}>
          {p.limit ? formatRub(p.limit, { whole: true }) : 'без лимита'}
        </T>
        <ChevronRightIcon color={colors.muted} />
      </View>
      {p.limit !== undefined ? (
        <Meter value={p.spent} max={p.limit} tone={over || near ? 'warn' : 'accent'} />
      ) : null}
    </Pressable>
  );
}
