import { formatRub, monthKey, monthSummary, previousMonth, budgetMoment } from '@budget/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAnalytics, useBootstrap } from '@/hooks/data';
import { goBack } from '@/state/nav';
import { Card, PillButton, Row, Screen, ScreenHeader, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** Итоги месяца (по нажатию на уведомление 1-го числа): траты против лимита, что вышло за лимиты, топ. */
export default function MonthSummaryScreen() {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const analytics = useAnalytics().data;
  const params = useLocalSearchParams<{ month?: string }>();
  const month = params.month ?? previousMonth(monthKey(budgetMoment(new Date())));
  const stats = analytics?.months.find((m) => m.month === month);
  const s = useMemo(
    () =>
      stats && boot
        ? monthSummary(stats, boot.summary.monthLimit, boot.subcategories, boot.summary.limitGroups)
        : null,
    [stats, boot],
  );
  const title = `Итоги ${MONTHS_GEN[Number(month.slice(5, 7)) - 1] ?? ''}`;
  const over = s ? s.everyday - s.limit : 0;

  return (
    <Screen>
      <ScreenHeader title={title} onBack={goBack} />
      {!s ? (
        analytics ? (
          <Card>
            <T v="label" c="muted">
              За этот месяц в таблице нет данных.
            </T>
          </Card>
        ) : (
          <ActivityIndicator color={colors.accentInk} />
        )
      ) : (
        <>
          <Card tone="hero" style={{ gap: 10 }}>
            <T v="caption" style={{ color: colors.heroMuted }}>
              Повседневные траты
            </T>
            <T v="amount" style={{ color: colors.heroInk }}>
              {formatRub(s.everyday, { whole: true })}
            </T>
            <View
              style={{ height: 8, borderRadius: 4, backgroundColor: colors.heroTrack, overflow: 'hidden' }}
            >
              <View
                style={{
                  width: `${Math.min(100, s.limit ? (s.everyday / s.limit) * 100 : 0)}%`,
                  height: 8,
                  backgroundColor: over > 0 ? colors.expense : colors.heroAccent,
                }}
              />
            </View>
            <T v="label" style={{ color: over > 0 ? colors.expense : colors.heroAccent }}>
              {over > 0
                ? `на ${formatRub(over, { whole: true })} больше лимита ${formatRub(s.limit, { whole: true })}`
                : `в лимите ${formatRub(s.limit, { whole: true })}, осталось ${formatRub(-over, { whole: true })}`}
            </T>
            <View
              style={{
                flexDirection: 'row',
                borderTopWidth: 1,
                borderTopColor: colors.heroTrack,
                paddingTop: 12,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <T v="caption" style={{ color: colors.heroMuted }}>
                  Доходы
                </T>
                <T v="num" style={{ color: colors.heroInk, fontSize: 18 }}>
                  {formatRub(s.income, { whole: true })}
                </T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="caption" style={{ color: colors.heroMuted }}>
                  Все расходы
                </T>
                <T v="num" style={{ color: colors.heroInk, fontSize: 18 }}>
                  {formatRub(s.expense, { whole: true })}
                </T>
              </View>
            </View>
          </Card>

          {s.over.length ? (
            <>
              <T v="h2">Вышли за лимит</T>
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {s.over.map((o, i) => (
                  <Row
                    key={o.name}
                    title={o.name}
                    meta={`${formatRub(o.spent, { whole: true })} из ${formatRub(o.limit, { whole: true })}`}
                    metaTone="warnInk"
                    right={
                      <T v="num" c="warnInk">
                        {formatRub(o.spent - o.limit, { sign: true, whole: true })}
                      </T>
                    }
                    last={i === s.over.length - 1}
                  />
                ))}
              </Card>
            </>
          ) : null}

          <T v="h2">Больше всего</T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {s.top.map((t, i) => (
              <Row
                key={t.name}
                title={t.name}
                right={<T v="num">{formatRub(t.spent, { whole: true })}</T>}
                last={i === s.top.length - 1}
              />
            ))}
          </Card>

          <Card tone="accentSoft" style={{ gap: 10 }}>
            <T v="body" c="accentSoftInk">
              Лимит на этот месяц
            </T>
            <T v="label" c="accentSoftInk">
              {over > 0
                ? `В прошлом месяце вышли за лимит. Оставить ${formatRub(s.limit, { whole: true })} или поставить другой?`
                : `Уложились. Оставить ${formatRub(s.limit, { whole: true })}?`}
            </T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <PillButton
                size="md"
                title={`Оставить ${formatRub(s.limit, { whole: true })}`}
                onPress={goBack}
              />
              <PillButton
                kind="secondary"
                size="md"
                title="Изменить"
                onPress={() => router.push('/limits')}
              />
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}
