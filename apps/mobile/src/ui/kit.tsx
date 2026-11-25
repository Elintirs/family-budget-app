import { router, usePathname } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronLeftIcon as ChevronLeft } from './icons';
import { radius, space, useTheme, type Palette } from './theme';

/** На Android вес шрифта выбирается семейством, а не fontWeight. */
export const fonts = {
  display: 'Unbounded_600SemiBold',
  regular: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
} as const;

const variants = {
  display: { fontFamily: fonts.display, fontSize: 52, letterSpacing: -1.5, lineHeight: 58 },
  amount: { fontFamily: fonts.display, fontSize: 40, letterSpacing: -1, lineHeight: 48 },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5, lineHeight: 30 },
  h2: { fontFamily: fonts.heavy, fontSize: 17 },
  body: { fontFamily: fonts.bold, fontSize: 15 },
  bodyRegular: { fontFamily: fonts.semibold, fontSize: 15 },
  num: { fontFamily: fonts.heavy, fontSize: 16 },
  label: { fontFamily: fonts.bold, fontSize: 13 },
  caption: { fontFamily: fonts.semibold, fontSize: 12 },
} satisfies Record<string, TextStyle>;

export type Variant = keyof typeof variants;

export function T({
  v = 'body',
  c = 'ink',
  style,
  ...rest
}: TextProps & { v?: Variant; c?: keyof Palette; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text {...rest} style={[variants[v], { color: colors[c], fontVariant: ['tabular-nums'] }, style]} />;
}

const TAB_ORDER = ['/', '/inbox', '/add', '/analytics', '/settings'] as const;

/**
 * Свайп между вкладками: влево следующая, вправо предыдущая. Карточки со своим свайпом (Входящие)
 * и горизонтальные ленты внутри перехватывают жест раньше, им он и достаётся.
 */
function useTabSwipe(enabled: boolean) {
  const path = usePathname();
  const ref = useRef(path);
  ref.current = path;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderRelease: (_, g) => {
        const i = TAB_ORDER.indexOf(ref.current as (typeof TAB_ORDER)[number]);
        if (i < 0) return;
        const to = g.dx < -70 ? TAB_ORDER[i + 1] : g.dx > 70 ? TAB_ORDER[i - 1] : undefined;
        if (to) router.navigate(to);
      },
    }),
  ).current;
  return enabled ? pan.panHandlers : {};
}

export function Screen({
  children,
  footer,
  tone = 'ground',
  inTabs = false,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Потянуть вниз: обновить данные из таблицы. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** hero: тёмный экран (приветствие онбординга). */
  tone?: 'ground' | 'hero';
  /** Внутри вкладок системные кнопки уже учтены панелью вкладок. */
  inTabs?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const swipe = useTabSwipe(inTabs);
  return (
    // Отступ под строку состояния у контейнера: при прокрутке содержимое не уезжает под часы и значки.
    <View style={{ flex: 1, backgroundColor: colors[tone], paddingTop: insets.top }} {...swipe}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: space.screen,
          // Без панели вкладок и футера низ прокрутки не должен уходить под системные кнопки Android.
          paddingBottom: footer ? 140 : 32 + (inTabs ? 0 : insets.bottom),
          gap: space.gap,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.accent]}
              progressBackgroundColor={colors.card}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: space.screen,
            paddingTop: 12,
            // Кнопки навигации Android (три кнопки) не перекрывают футер.
            paddingBottom: (inTabs ? 0 : insets.bottom) + 16,
            backgroundColor: colors[tone],
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = 'card',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: keyof Palette;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: colors[tone], borderRadius: radius.card, padding: 16, gap: 12 },
        // Тёмная главная карточка без обводки сливалась с фоном.
        tone === 'hero' ? { borderWidth: 1, borderColor: colors.heroEdge } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonKind = 'primary' | 'strong' | 'hero' | 'secondary' | 'danger' | 'ghost';
/** Две высоты на всё приложение: lg для главного действия экрана, md для остального. */
export const BUTTON = { lg: 56, md: 44 } as const;

export function PillButton({
  title,
  kind = 'primary',
  size = 'lg',
  icon,
  style,
  loading = false,
  ...rest
}: PressableProps & {
  title: string;
  kind?: ButtonKind;
  size?: keyof typeof BUTTON;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Идёт запрос: крутилка вместо иконки, нажатия игнорируются, цвет кнопки не гаснет. */
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const height = BUTTON[size];
  const off = Boolean(rest.disabled) && !loading;
  // Заливка только у главных кнопок; второстепенные контурные, без белой подложки.
  const bg = {
    primary: colors.accent,
    strong: colors.strong,
    hero: colors.heroAccent,
    secondary: 'transparent',
    danger: 'transparent',
    ghost: 'transparent',
  }[kind];
  const fg = {
    primary: colors.onAccent,
    strong: colors.onStrong,
    hero: colors.hero,
    secondary: colors.ink,
    danger: colors.warnInk,
    ghost: colors.accentInk,
  }[kind];
  const border = {
    primary: colors.accent,
    strong: colors.strong,
    hero: colors.heroAccent,
    secondary: colors.control,
    danger: colors.warnInk,
    ghost: 'transparent',
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      disabled={Boolean(rest.disabled) || loading}
      accessibilityState={{ disabled: Boolean(rest.disabled) || loading, busy: loading }}
      style={({ pressed }) => [
        {
          height,
          borderRadius: height / 2,
          // Неактивная: спокойная заливка без обводки, а не полупрозрачный тёмный блок.
          backgroundColor: off && kind !== 'ghost' ? colors.fill : bg,
          borderWidth: 1.5,
          borderColor: off ? (kind === 'ghost' ? 'transparent' : colors.fill) : border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: size === 'lg' ? 24 : 18,
          opacity: pressed && !off ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <T
        v={size === 'lg' ? 'h2' : 'label'}
        numberOfLines={1}
        // Неактивная: текст muted на fill, а не белый на светлом (было почти не видно).
        style={{ color: off ? colors.muted : fg, textAlign: 'center', textAlignVertical: 'center' }}
      >
        {title}
      </T>
    </Pressable>
  );
}

/** Круглая кнопка «Назад»: контур, без заливки. */
export function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Назад"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: BUTTON.md,
        height: BUTTON.md,
        borderRadius: BUTTON.md / 2,
        borderWidth: 1.5,
        borderColor: colors.control,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <ChevronLeft color={colors.ink} />
    </Pressable>
  );
}

/** Заголовок экрана с кнопкой «Назад». */
/** Экран без данных таблицы (первый запуск без связи): заглушка вместо нулей, которые выглядят как настоящие. */
export function NoTableData({
  title,
  onBack,
  onRefresh,
  refreshing,
}: {
  title: string;
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <ScreenHeader title={title} onBack={onBack} />
      <Card>
        <T v="body">Данных из таблицы пока нет</T>
        <T v="caption" c="muted">
          {onRefresh
            ? 'Они появятся после первой связи с таблицей. Потяни вниз, чтобы повторить.'
            : 'Они появятся после первой связи с таблицей.'}
        </T>
      </Card>
    </Screen>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <T v="title" style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {title}
      </T>
      {right}
    </View>
  );
}

export type ChipTone = 'default' | 'suggested' | 'more';

/** Чип: выбранный (заливка), рекомендованный (мягкий зелёный), «ещё» (пунктир), обычный (контур). */
export function Chip({
  label,
  selected,
  tone = 'default',
  onPress,
}: {
  label: string;
  selected?: boolean;
  tone?: ChipTone;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const bg = selected ? colors.accent : tone === 'suggested' ? colors.accentSoft : 'transparent';
  // Рамка невыбранного чипа: control, 3:1 к карточке (border давал 1,3:1 и почти не виделся).
  const border = selected ? colors.accent : tone === 'suggested' ? colors.accentSoft : colors.control;
  const fg = selected
    ? colors.onAccent
    : tone === 'suggested'
      ? colors.accentSoftInk
      : tone === 'more'
        ? colors.muted
        : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        borderWidth: 1.5,
        borderStyle: tone === 'more' ? 'dashed' : 'solid',
        borderColor: border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {selected ? <CheckIcon color={fg} size={16} /> : null}
      <T v="label" numberOfLines={1} style={{ color: fg, textAlign: 'center' }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; title: string }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', backgroundColor: colors.fill, borderRadius: 24, padding: 4, gap: 4 }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.card : 'transparent',
            }}
          >
            <T
              v="label"
              c={on ? 'ink' : 'muted'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ textAlign: 'center' }}
            >
              {o.title}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Mono({ letter, tone }: { letter: string; tone: keyof Palette }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors[tone],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T v="h2">{letter}</T>
    </View>
  );
}

export function Row({
  left,
  title,
  meta,
  metaTone = 'muted',
  right,
  last,
}: {
  left?: ReactNode;
  title: string;
  meta?: string;
  metaTone?: keyof Palette;
  right?: ReactNode;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        minHeight: 44,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.line,
      }}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" numberOfLines={2}>
          {title}
        </T>
        {meta ? (
          // Две строки: на узких экранах (360 dp) подпись сверки счёта в одну не помещается.
          <T v="caption" c={metaTone} numberOfLines={2}>
            {meta}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <T v="h2">{title}</T>
      {right}
    </View>
  );
}

/** Подпись над полем или группой чипов в формах. */
export function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <T v="h2" style={{ fontSize: 14 }}>
        {title}
      </T>
      {children}
    </View>
  );
}

/**
 * Поле ввода приложения: 48 высотой, рамка control, шрифт как у строк.
 * number: жирные цифры для сумм; round: поиск; bad: рамка ошибки.
 */
export function Input({
  number,
  round,
  bad,
  style,
  ...rest
}: TextInputProps & { number?: boolean; round?: boolean; bad?: boolean }) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...rest}
      style={[
        {
          height: 48,
          borderRadius: round ? 24 : radius.input,
          borderWidth: 1.5,
          borderColor: bad ? colors.warnInk : colors.control,
          paddingHorizontal: round ? 16 : 14,
          color: colors.ink,
          fontFamily: number ? fonts.heavy : fonts.semibold,
          fontSize: number ? 16 : 15,
          backgroundColor: colors.card,
        },
        style,
      ]}
    />
  );
}

/** Переключатель с подписью и пояснением. */
export function Toggle(p: {
  title: string;
  caption: string;
  value: boolean;
  onChange: (on: boolean) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, p.style]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body">{p.title}</T>
        <T v="caption" c="muted">
          {p.caption}
        </T>
      </View>
      <Switch
        accessibilityLabel={p.title}
        value={p.value}
        onValueChange={p.onChange}
        trackColor={{ true: colors.accent, false: colors.toggleOff }}
        thumbColor={colors.switchThumb}
      />
    </View>
  );
}
