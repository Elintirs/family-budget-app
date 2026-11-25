import { formatRub } from '@budget/core';
import { Pressable, View } from 'react-native';
import { AppIcon, packageForAccount } from './AppIcon';
import { accountTone } from './accountTone';
import { ChevronRightIcon } from './icons';
import { T } from './kit';
import { radius, useTheme } from './theme';

/** Строка счёта: иконка банка, подпись, справа счёт и остаток до и после, оранжевое только минус. */
export function AccountRow(p: {
  title: string;
  name?: string;
  accountId?: string;
  hint?: string;
  before?: number;
  after?: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.title}: ${p.name ?? 'не выбран'}, изменить`}
      onPress={p.onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.card,
        borderRadius: radius.card,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {p.name ? (
        <AppIcon
          pkg={packageForAccount(p.name)}
          letter={p.name[0] ?? '?'}
          tone={accountTone(p.accountId)}
          size={36}
        />
      ) : null}
      <T v="body" style={{ flex: 1 }}>
        {p.title}
      </T>
      <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 1 }}>
        <T v="label" c={p.name ? 'ink' : 'muted'} numberOfLines={1}>
          {p.name ?? 'выбрать'}
        </T>
        {p.before !== undefined && p.after !== undefined ? (
          <T v="label" c="muted">
            {formatRub(p.before, { whole: true })} →{' '}
            <T v="label" c={p.after < 0 ? 'warnInk' : 'muted'}>
              {formatRub(p.after, { whole: true })}
            </T>
          </T>
        ) : p.hint ? (
          <T v="caption" c="muted">
            {p.hint}
          </T>
        ) : null}
      </View>
      <ChevronRightIcon color={colors.muted} />
    </Pressable>
  );
}
