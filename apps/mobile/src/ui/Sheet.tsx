import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '@/state/nav';
import { T } from './kit';
import { useTheme } from './theme';

/**
 * Лист снизу для экранов-выборов (подкатегория, счёт): затемнение, неподвижная шапка с ручкой, за
 * которую лист тянут вниз и закрывают, и прокручиваемое тело.
 */
export function Sheet({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dragY = useRef(new Animated.Value(0)).current;
  const drag = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 1.2) {
          Animated.timing(dragY, { toValue: 800, duration: 160, useNativeDriver: true }).start(goBack);
        } else Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable
        accessibilityLabel="Закрыть"
        onPress={goBack}
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.scrim, opacity: 0.5 }}
      />
      <Animated.View
        style={{
          maxHeight: '88%',
          backgroundColor: colors.ground,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          transform: [{ translateY: dragY }],
        }}
      >
        <View
          {...drag.panHandlers}
          style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, gap: 12 }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.border,
            }}
          />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}
          >
            <T v="h2">{title}</T>
            {caption ? (
              <T v="caption" c="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {caption}
              </T>
            ) : null}
          </View>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 12 }}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
