import { formatRub, goalPace } from '@budget/core';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { defaultAccountId } from '@/adapters';
import { useBootstrap, usePullRefresh } from '@/hooks/data';
import { monthDativeYear } from '@/state/format';
import { goBack } from '@/state/nav';
import { Meter } from '@/ui/charts';
import { Card, NoTableData, PillButton, Screen, ScreenHeader, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/**
 * Цели накоплений (лист «Цели», общие на двоих). Отложено считает таблица по переводам с комментарием
 * «Цель: <название>»; «Отложить» открывает такой перевод на счёт цели.
 */
export default function Goals() {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const pull = usePullRefresh();
  const goals = boot?.goals ?? [];
  const saved = goals.reduce((s, g) => s + Math.max(0, g.saved), 0);
  const now = new Date();

  const put = (name?: string, accountId?: string) =>
    router.navigate({
      pathname: '/add',
      params: {
        kind: 'transfer',
        from: defaultAccountId() ?? '',
        to: accountId ?? '',
        comment: name ? `Цель: ${name}` : 'Цель: ',
      },
    });

  if (!boot) return <NoTableData title="Цели" onBack={goBack} {...pull} />;
  return (
    <Screen {...pull}>
      <ScreenHeader title="Цели" onBack={goBack} />
      <Card tone="hero">
        <T v="caption" style={{ color: colors.heroMuted }}>
          Отложено всего
        </T>
        <T v="amount" style={{ color: colors.heroInk }}>
          {formatRub(saved, { whole: true })}
        </T>
        <T v="caption" style={{ color: colors.heroMuted }}>
          {goals.length
            ? 'по переводам на копилки'
            : 'Заведи цель: подушка, отпуск, ремонт. Будет видно, сколько откладывать в месяц.'}
        </T>
      </Card>

      {goals.map((g) => {
        const pace = goalPace(g, now);
        const ratio = g.target ? Math.min(1, Math.max(0, g.saved) / g.target) : 0;
        return (
          <Pressable
            key={g.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/goals/edit', params: { id: g.id } })}
          >
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T v="body" style={{ flex: 1 }}>
                  {g.name}
                </T>
                <T v="num">{formatRub(Math.max(0, g.saved), { whole: true })}</T>
              </View>
              <Meter value={ratio} max={1} tone={pace.done ? 'accent' : 'ink'} />
              <T v="caption" c="muted">
                из {formatRub(g.target, { whole: true })}
                {g.deadline ? `, к ${monthDativeYear(g.deadline)}` : ''}
                {g.accountId ? `, на «${g.accountId}»` : ''}
              </T>
              <T v="caption" c={pace.done ? 'accentInk' : 'muted'}>
                {pace.done
                  ? 'Собрано!'
                  : pace.perMonth
                    ? `откладывать ~${formatRub(pace.perMonth, { whole: true })} в месяц, чтобы успеть`
                    : `осталось ${formatRub(pace.left, { whole: true })}`}
              </T>
              <PillButton
                kind="secondary"
                size="md"
                title="Отложить"
                style={{ alignSelf: 'flex-start' }}
                onPress={() => put(g.name, g.accountId)}
              />
            </Card>
          </Pressable>
        );
      })}

      <PillButton kind="strong" title="Новая цель" onPress={() => router.push('/goals/edit')} />
      <T v="caption" c="muted" style={{ textAlign: 'center' }}>
        «Отложить»: перевод на копилку, в расходы не идёт.
      </T>
    </Screen>
  );
}
