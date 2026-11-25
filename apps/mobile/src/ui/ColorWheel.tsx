import { hsvToHex, moveOnWheel, type Harmony, type ThemeColors, type WheelColors } from '@budget/core';
import { useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from './theme';

type Slot = keyof ThemeColors;
const SLOTS: Slot[] = ['accent', 'hero', 'expense'];
const WEDGES = 72;
const HANDLE = 30;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/**
 * Цветовой круг как в Adobe Color: угол задаёт оттенок, расстояние от центра насыщенность. Три маркера
 * (акцент, карточка, расходы); по правилу гармонии остальные идут следом за тем, который тянут.
 * Нативного круга для Android нет, поэтому свой на react-native-svg.
 */
export function ColorWheel({
  value,
  colors: shown,
  rule,
  active,
  onActive,
  onChange,
}: {
  value: WheelColors;
  /** Итоговые цвета маркеров (уже с яркостью и контрастом). */
  colors: ThemeColors;
  rule: Harmony;
  active: Slot;
  onActive: (s: Slot) => void;
  onChange: (w: WheelColors) => void;
}) {
  const { colors } = useTheme();
  const [size, setSize] = useState(0);
  const r = size / 2 - 4;
  const c = size / 2;
  const pos = (p: { h: number; s: number }) => {
    const a = (p.h * Math.PI) / 180;
    return { x: c + r * p.s * Math.cos(a), y: c + r * p.s * Math.sin(a) };
  };

  const st = useRef({ value, rule, active, size, onChange, onActive, grabbed: active as Slot });
  st.current = { ...st.current, value, rule, active, size, onChange, onActive };

  const toPoint = (x: number, y: number) => {
    const { size: sz } = st.current;
    const cc = sz / 2;
    const rr = sz / 2 - 4;
    const dx = x - cc;
    const dy = y - cc;
    return { h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: clamp(Math.hypot(dx, dy) / rr) };
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        const s = st.current;
        // Берём ближайший маркер в пределах пальца, иначе двигаем активный.
        const cc = s.size / 2;
        const rr = s.size / 2 - 4;
        let best: Slot = s.active;
        let dist = 44;
        for (const k of SLOTS) {
          const a = (s.value[k].h * Math.PI) / 180;
          const d = Math.hypot(
            cc + rr * s.value[k].s * Math.cos(a) - x,
            cc + rr * s.value[k].s * Math.sin(a) - y,
          );
          if (d < dist) {
            dist = d;
            best = k;
          }
        }
        s.grabbed = best;
        if (best !== s.active) s.onActive(best);
        s.onChange(moveOnWheel(s.value, best, toPoint(x, y), s.rule));
      },
      onPanResponderMove: (e) => {
        const s = st.current;
        s.onChange(
          moveOnWheel(s.value, s.grabbed, toPoint(e.nativeEvent.locationX, e.nativeEvent.locationY), s.rule),
        );
      },
    }),
  ).current;

  const wedge = (i: number) => {
    const a0 = ((i - 0.5) / WEDGES) * 2 * Math.PI;
    const a1 = ((i + 0.6) / WEDGES) * 2 * Math.PI;
    return `M${c},${c} L${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 0 1 ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} Z`;
  };
  const onLayout = (e: LayoutChangeEvent) => setSize(Math.min(e.nativeEvent.layout.width, 320));

  return (
    <View onLayout={onLayout} style={{ alignItems: 'center' }}>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Цветовой круг"
        accessibilityHint="Тяните маркер: угол меняет оттенок, расстояние от центра насыщенность"
        accessibilityActions={[
          { name: 'increment', label: 'Следующий оттенок' },
          { name: 'decrement', label: 'Предыдущий оттенок' },
        ]}
        onAccessibilityAction={(e) => {
          const p = value[active];
          onChange(
            moveOnWheel(
              value,
              active,
              { h: p.h + (e.nativeEvent.actionName === 'increment' ? 15 : -15), s: p.s },
              rule,
            ),
          );
        }}
        style={{ width: size, height: size }}
      >
        {size ? (
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="sat" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            {Array.from({ length: WEDGES }, (_, i) => (
              <Path key={i} d={wedge(i)} fill={hsvToHex((i / WEDGES) * 360, 1, 1)} />
            ))}
            <Circle cx={c} cy={c} r={r} fill="url(#sat)" />
            {SLOTS.map((k) => {
              const p = pos(value[k]);
              return (
                <Line
                  key={k}
                  x1={c}
                  y1={c}
                  x2={p.x}
                  y2={p.y}
                  stroke={colors.switchThumb}
                  strokeWidth={k === active ? 2 : 1}
                />
              );
            })}
          </Svg>
        ) : null}
        {size
          ? SLOTS.map((k) => {
              const p = pos(value[k]);
              const big = k === active ? HANDLE + 6 : HANDLE;
              return (
                <View
                  key={k}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: p.x - big / 2,
                    top: p.y - big / 2,
                    width: big,
                    height: big,
                    borderRadius: big / 2,
                    backgroundColor: shown[k],
                    borderWidth: 3,
                    borderColor: colors.switchThumb,
                    shadowColor: colors.scrim,
                    shadowOpacity: 0.35,
                    shadowRadius: 3,
                    elevation: 4,
                  }}
                />
              );
            })
          : null}
      </View>
    </View>
  );
}

/** Яркость активного цвета: от тёмного до границы контраста этого места. */
export function BrightnessSlider({
  value,
  from,
  to,
  label,
  onChange,
}: {
  value: number;
  from: string;
  to: string;
  label: string;
  onChange: (b: number) => void;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const st = useRef({ w, onChange });
  st.current = { w, onChange };
  const set = (x: number) => st.current.w && st.current.onChange(clamp(x / st.current.w, 0.2, 1));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX),
    }),
  ).current;
  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}: яркость`}
      accessibilityValue={{ min: 20, max: 100, now: Math.round(value * 100) }}
      accessibilityActions={[
        { name: 'increment', label: 'Светлее' },
        { name: 'decrement', label: 'Темнее' },
      ]}
      onAccessibilityAction={(e) =>
        onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1), 0.2, 1))
      }
      style={{ height: 44, justifyContent: 'center' }}
    >
      {w ? (
        <Svg width={w} height={20}>
          <Defs>
            <LinearGradient id="br" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={w} height={20} rx="10" fill="url(#br)" />
        </Svg>
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: value * w - 14,
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 3,
          borderColor: colors.switchThumb,
          backgroundColor: to,
          shadowColor: colors.scrim,
          shadowOpacity: 0.3,
          shadowRadius: 3,
          elevation: 3,
        }}
      />
    </View>
  );
}
