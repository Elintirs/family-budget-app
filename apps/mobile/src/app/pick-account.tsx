import { availableOn, formatRub } from '@budget/core';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useBootstrap, useOperations } from '@/hooks/data';
import { goBack } from '@/state/nav';
import { emitPicked, type PickTarget } from '@/state/pickBus';
import { AppIcon, packageForAccount } from '@/ui/AppIcon';
import { CheckIcon } from '@/ui/icons';
import { T } from '@/ui/kit';
import { Sheet } from '@/ui/Sheet';
import { accountTone } from '@/ui/accountTone';
import { useTheme } from '@/ui/theme';

/** Выбор счёта для «Новой операции»: строки с остатком, выбранный с галочкой. */
export default function PickAccount() {
  const { colors } = useTheme();
  const {
    target = 'from',
    selected,
    exclude,
    title,
  } = useLocalSearchParams<{
    target?: PickTarget;
    selected?: string;
    exclude?: string;
    /** Заголовок листа, если не «Счёт» / «Откуда» / «Куда». */
    title?: string;
  }>();
  const boot = useBootstrap().data;
  const local = useOperations().data ?? [];
  const accounts = (boot?.accounts ?? []).filter((a) => !a.hidden && a.id !== exclude);

  return (
    <Sheet title={title || (target === 'to' ? 'Куда' : target === 'from' ? 'Откуда' : 'Счёт')}>
      <View style={{ backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16 }}>
        {accounts.map((a, i) => {
          const on = a.id === selected;
          const left = boot ? availableOn(boot.accounts, boot.balances, local, a.id) : undefined;
          return (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                emitPicked(target, a.id);
                goBack();
              }}
              style={({ pressed }) => ({
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderBottomWidth: i === accounts.length - 1 ? 0 : 1,
                borderBottomColor: colors.line,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <AppIcon
                pkg={packageForAccount(a.name)}
                letter={a.name[0] ?? '?'}
                tone={accountTone(a.id)}
                size={36}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <T v={on ? 'body' : 'bodyRegular'} c={on ? 'accentInk' : 'ink'}>
                  {a.name}
                </T>
                {left !== undefined ? (
                  <T v="caption" c={left < 0 ? 'warnInk' : 'muted'}>
                    доступно {formatRub(left, { whole: true })}
                  </T>
                ) : null}
              </View>
              {on ? <CheckIcon color={colors.accentInk} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
