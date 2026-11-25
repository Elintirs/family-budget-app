import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, useWindowDimensions, View } from 'react-native';
import { T } from './kit';
import { useTheme } from './theme';

export interface SwipeAction {
  label: string;
  onAction: () => void;
}

const THRESHOLD = 96;

/**
 * Карточка со свайпом: вправо и влево открывают подложку с действием, за порогом действие срабатывает.
 * Без нативных библиотек жестов: PanResponder и Animated из React Native.
 * Горизонтальный жест забираем, только если он явно горизонтальный: вертикальная прокрутка не страдает.
 */
export function SwipeRow({
  children,
  right,
  left,
}: {
  children: ReactNode;
  /** Свайп вправо (подложка слева). */
  right?: SwipeAction;
  /** Свайп влево (подложка справа), карточка уезжает за край. */
  left?: SwipeAction;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const actions = useRef({ right, left });
  actions.current = { right, left };

  const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();

  const pan = useRef(
    PanResponder.create({
      // На живом телефоне палец редко идёт строго горизонтально: допускаем наклон.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const { right: r, left: l } = actions.current;
        // Без действия в эту сторону карточка лишь чуть пружинит.
        const dx = (g.dx > 0 && !r) || (g.dx < 0 && !l) ? g.dx / 6 : g.dx;
        x.setValue(dx);
      },
      onPanResponderRelease: (_, g) => {
        const { right: r, left: l } = actions.current;
        if (g.dx > THRESHOLD && r) {
          back();
          r.onAction();
        } else if (g.dx < -THRESHOLD && l) {
          Animated.timing(x, { toValue: -width, duration: 180, useNativeDriver: true }).start(() => {
            l.onAction();
            x.setValue(0);
          });
        } else back();
      },
      onPanResponderTerminate: back,
    }),
  ).current;

  const rightOpacity = x.interpolate({
    inputRange: [0, THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const leftOpacity = x.interpolate({
    inputRange: [-THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View>
      {right ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 22,
            backgroundColor: colors.accent,
            justifyContent: 'center',
            paddingHorizontal: 22,
            opacity: rightOpacity,
          }}
        >
          <T v="label" style={{ color: colors.onAccent }} numberOfLines={1}>
            {right.label}
          </T>
        </Animated.View>
      ) : null}
      {left ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 22,
            backgroundColor: colors.warn,
            justifyContent: 'center',
            alignItems: 'flex-end',
            paddingHorizontal: 22,
            opacity: leftOpacity,
          }}
        >
          <T v="label" style={{ color: colors.onAccent }} numberOfLines={1}>
            {left.label}
          </T>
        </Animated.View>
      ) : null}
      <Animated.View
        style={{ transform: [{ translateX: x }] }}
        {...pan.panHandlers}
        // Свайп недоступен экранному диктору: те же действия списком в «Действиях» (аудит 05.11).
        accessibilityActions={[
          ...(right ? [{ name: 'right', label: right.label }] : []),
          ...(left ? [{ name: 'left', label: left.label }] : []),
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'right') right?.onAction();
          if (e.nativeEvent.actionName === 'left') left?.onAction();
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
