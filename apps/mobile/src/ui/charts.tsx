import { Pressable, View } from 'react-native';
import { T } from './kit';
import { useTheme } from './theme';

export interface BarItem {
  key: string;
  label: string;
  /** Одна или две серии (доходы и расходы). */
  values: number[];
  active?: boolean;
  onPress?: () => void;
}

/** Столбцы без библиотек: две серии рядом, активный столбец подсвечен, пустые месяцы штрихом. */
export function Bars({
  items,
  height = 140,
  colors: series,
}: {
  items: BarItem[];
  height?: number;
  colors?: string[];
}) {
  const { colors } = useTheme();
  const palette = series ?? [colors.accent, colors.expense];
  const max = Math.max(1, ...items.flatMap((i) => i.values));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {items.map((it) => {
        const empty = it.values.every((v) => !v);
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={it.label}
            disabled={!it.onPress}
            onPress={it.onPress}
            style={{ flex: 1, alignItems: 'center', gap: 6 }}
          >
            <View
              style={{
                height,
                width: '100%',
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: 3,
                borderRadius: 10,
                backgroundColor: it.active ? colors.fill : 'transparent',
                paddingBottom: 4,
              }}
            >
              {empty ? (
                <View style={{ width: '60%', height: 2, backgroundColor: colors.border }} />
              ) : (
                it.values.map((v, i) => (
                  <View
                    key={i}
                    style={{
                      width: it.values.length > 1 ? 12 : 18,
                      height: Math.max(2, (v / max) * (height - 12)),
                      borderRadius: 5,
                      backgroundColor: palette[i],
                    }}
                  />
                ))
              )}
            </View>
            <T v="caption" c={it.active ? 'ink' : 'muted'}>
              {it.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Горизонтальная полоса доли. */
export function Meter({
  value,
  max,
  tone = 'ink',
}: {
  value: number;
  max: number;
  tone?: 'ink' | 'accent' | 'warn';
}) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.accent : tone === 'warn' ? colors.warn : colors.strong;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.min(100, max ? (value / max) * 100 : 0)}%`,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
