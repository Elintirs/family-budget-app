import { formatAmountInput, formatRub, parseRub, budgetMoment, monthKey } from '@budget/core';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Keyboard, PanResponder, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, log } from '@/adapters';
import { keys, useAnalytics, useBootstrap } from '@/hooks/data';
import { addMonths } from '@/state/format';
import { goBack } from '@/state/nav';
import { Chip, Chips, PillButton, T, fonts } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

type Kind = 'month' | 'group' | 'sub';

/** До 500 ₽ вверх: подсказки читаются как круглые суммы. */
const round500 = (k: number) => Math.ceil(k / 50_000) * 50_000;

/**
 * Лист «Лимит»: одно поле суммы с клавиатурой сразу, подсказки по прошлым месяцам и явные «Сохранить» /
 * «Убрать лимит». В списке лимитов полей ввода нет: свайп по списку больше не ставит фокус в поле.
 */
export default function LimitEdit() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const boot = useBootstrap().data;
  const analytics = useAnalytics().data;
  const { kind = 'sub', name = '' } = useLocalSearchParams<{ kind?: Kind; name?: string }>();

  const current =
    kind === 'month'
      ? boot?.summary.monthLimit
      : kind === 'group'
        ? boot?.groupLimits[name]
        : boot?.subcategories.find((s) => s.name === name)?.monthLimit;
  const [text, setText] = useState(current ? formatAmountInput(String(current / 100)) : '');
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const value = parseRub(text);

  // Сколько уходило раньше: прошлый месяц и среднее за три (повседневные для общего лимита).
  const hints = useMemo(() => {
    const now = monthKey(budgetMoment(new Date()));
    const spentIn = (m: string) => {
      const st = analytics?.months.find((x) => x.month === m);
      if (!st) return undefined;
      if (kind === 'month')
        return (boot?.summary.limitGroups ?? ['Повседневные']).reduce((s, g) => s + (st.groups[g] ?? 0), 0);
      return kind === 'group' ? (st.groups[name] ?? 0) : (st.subcategories[name] ?? 0);
    };
    const prev = spentIn(addMonths(now, -1));
    const last3 = [1, 2, 3]
      .map((i) => spentIn(addMonths(now, -i)))
      .filter((x): x is number => x !== undefined);
    const avg = last3.length ? Math.round(last3.reduce((s, x) => s + x, 0) / last3.length) : undefined;
    const out: { label: string; value: number }[] = [];
    if (prev)
      out.push({
        label: `как в прошлом месяце: ${formatRub(round500(prev), { whole: true })}`,
        value: round500(prev),
      });
    if (avg && last3.length > 1 && round500(avg) !== round500(prev ?? 0))
      out.push({
        label: `в среднем за ${last3.length} мес.: ${formatRub(round500(avg), { whole: true })}`,
        value: round500(avg),
      });
    if (current)
      out.push({
        label: `+10%: ${formatRub(round500(current * 1.1), { whole: true })}`,
        value: round500(current * 1.1),
      });
    return out;
  }, [analytics, boot, kind, name, current]);

  // Клавиатура: лист поднимается над ней (edge-to-edge, окно под клавиатуру не сжимается).
  // Проверено на навигации тремя кнопками: там системная панель высокая.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Свайп вниз за шапку закрывает лист.
  const dragY = useRef(new Animated.Value(0)).current;
  const drag = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90) {
          Keyboard.dismiss();
          Animated.timing(dragY, { toValue: 800, duration: 160, useNativeDriver: true }).start(goBack);
        } else Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const save = async (limit: number | null) => {
    // Enter на клавиатуре и кнопка: один запрос, и без записи той же суммы.
    if (busy || (limit !== null && limit === current)) return;
    setBusy(limit === null ? 'clear' : 'save');
    try {
      if (kind === 'month') {
        if (limit === null) return;
        await api.setMonthLimit(limit);
      } else if (kind === 'group') await api.setGroupLimit(name, limit);
      else await api.setSubcategoryLimit(name, limit);
      log.info(
        'limits',
        `Лимит «${kind === 'month' ? 'месяц' : name}»: ${limit === null ? 'убран' : formatRub(limit)}`,
      );
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
      Keyboard.dismiss();
      goBack();
    } catch (e) {
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const title = kind === 'month' ? 'Лимит на месяц' : name;
  const caption =
    kind === 'month'
      ? 'Повседневные траты, из него считается «Можно потратить сегодня»'
      : kind === 'group'
        ? 'Вне лимита на день: только предупреждение при 80% и 100%'
        : 'Подкатегория: предупреждение при 80% и 100%';

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable
        accessibilityLabel="Закрыть"
        onPress={() => {
          Keyboard.dismiss();
          goBack();
        }}
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.scrim, opacity: 0.5 }}
      />
      <Animated.View
        style={{
          transform: [{ translateY: dragY }],
          backgroundColor: colors.ground,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingHorizontal: 20,
          // RN отдаёт высоту клавиатуры без системной панели (ime − systemBars), а лист лежит под панелью:
          // нужны оба отступа. Плавающая клавиатура даёт 0 или меньше, тогда только панель.
          paddingBottom: Math.max(0, kb) + insets.bottom + 16,
          gap: 14,
        }}
      >
        <View
          {...drag.panHandlers}
          style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4, gap: 12 }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          <View style={{ alignSelf: 'stretch', gap: 2 }}>
            <T v="title" style={{ fontSize: 20 }}>
              {title}
            </T>
            <T v="caption" c="muted">
              {caption}
            </T>
          </View>
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1.5,
            borderColor: colors.accent,
          }}
        >
          <TextInput
            accessibilityLabel={`Лимит: ${title}`}
            value={text}
            onChangeText={(t) => setText(formatAmountInput(t))}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            onSubmitEditing={() => value && value > 0 && void save(value)}
            style={{
              flex: 1,
              fontFamily: fonts.display,
              fontSize: 34,
              color: colors.ink,
              paddingVertical: 0,
              includeFontPadding: false,
            }}
          />
          <T v="title" c="muted" style={{ fontSize: 28 }}>
            ₽
          </T>
        </View>

        {hints.length ? (
          <Chips>
            {hints.map((h) => (
              <Chip
                key={h.label}
                label={h.label}
                selected={value === h.value}
                onPress={() => setText(formatAmountInput(String(h.value / 100)))}
              />
            ))}
          </Chips>
        ) : null}

        <PillButton
          kind="strong"
          title={current ? 'Сохранить' : 'Поставить лимит'}
          disabled={!value || value <= 0 || value === current}
          loading={busy === 'save'}
          onPress={() => value && void save(value)}
        />
        {kind !== 'month' && current ? (
          <PillButton
            kind="danger"
            size="md"
            title="Убрать лимит"
            loading={busy === 'clear'}
            onPress={() => void save(null)}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}
