import { currentMonthKey, formatRub, limitsBrief, type CategoryLimit } from '@budget/core';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { kv } from '@/adapters';
import { plural } from '@/state/format';
import { Meter } from './charts';
import { ChevronRightIcon } from './icons';
import { Card, T } from './kit';
import { useTheme } from './theme';

const DURATION = 250;

function briefText(over: number, near: number): string {
  const parts = [
    over ? `${over} ${plural(over, 'превышен', 'превышены', 'превышено')}` : '',
    near ? `${near} почти` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'все в пределах';
}

/**
 * Лимиты на Главной: свёрнутая строка со сводкой, по нажатию плавно раскрывается список с полосками.
 * Раскрыт или нет, помнит каждый телефон сам. Высота списка меряется по абсолютному содержимому.
 */
export function LimitsFold({ limits, warn }: { limits: CategoryLimit[]; warn: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(() => kv.get('home.limitsOpen') === '1');
  const [height, setHeight] = useState(0);
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const { over, near } = limitsBrief(limits);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    kv.set('home.limitsOpen', next ? '1' : '0');
    Animated.timing(progress, {
      toValue: next ? 1 : 0,
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  return (
    <Card style={{ paddingVertical: 8, gap: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Лимиты: ${briefText(over, near)}`}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">Лимиты</T>
          <T v="caption" c={warn && (over || near) ? 'warnInk' : 'muted'}>
            {briefText(over, near)}
          </T>
        </View>
        <Animated.View
          style={{
            transform: [
              {
                rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '270deg'] }),
              },
            ],
          }}
        >
          <ChevronRightIcon color={colors.muted} />
        </Animated.View>
      </Pressable>
      <Animated.View
        style={{
          height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
          opacity: progress,
          overflow: 'hidden',
        }}
      >
        <View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: 0, right: 0, paddingTop: 12, paddingBottom: 8, gap: 12 }}
        >
          {limits.map((l) => (
            // Нажатие на лимит: история с этой подкатегорией (или группой) за текущий месяц.
            <Pressable
              key={l.name}
              accessibilityRole="button"
              accessibilityLabel={`${l.name}: операции за месяц`}
              onPress={() =>
                router.push({ pathname: '/history', params: { cat: l.name, month: currentMonthKey() } })
              }
              style={({ pressed }) => ({ gap: 6, opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T v="body" style={{ flexShrink: 1 }}>
                  {l.name}
                </T>
                <T v="caption" c={l.left < 0 ? 'warnInk' : 'muted'}>
                  {l.left < 0
                    ? `превышен на ${formatRub(-l.left, { whole: true })}`
                    : `осталось ${formatRub(l.left, { whole: true })} из ${formatRub(l.limit, { whole: true })}`}
                </T>
              </View>
              <Meter value={l.spent} max={l.limit} tone={l.ratio >= 0.8 ? 'warn' : 'accent'} />
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/limits')}
            hitSlop={8}
            style={{ alignSelf: 'flex-start', paddingVertical: 4 }}
          >
            <T v="label" c="accentInk">
              Все лимиты
            </T>
          </Pressable>
        </View>
      </Animated.View>
    </Card>
  );
}
