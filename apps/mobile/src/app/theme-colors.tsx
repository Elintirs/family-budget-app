import {
  applyHarmony,
  colorsToWheel,
  HARMONIES,
  hsvToHex,
  maxValue,
  COLOR_RULES,
  THEME_PRESETS,
  wheelToColors,
  type Harmony,
  type ThemeColors,
  type WheelColors,
} from '@budget/core';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { log } from '@/adapters';
import { goBack } from '@/state/nav';
import { BrightnessSlider, ColorWheel } from '@/ui/ColorWheel';
import { Chip, PillButton, Screen, ScreenHeader, Segmented, T } from '@/ui/kit';
import { paletteFor, useTheme, type Palette } from '@/ui/theme';

type Slot = keyof ThemeColors;
const SLOTS: { key: Slot; title: string; short: string }[] = [
  { key: 'accent', title: 'Акцент', short: 'Акцент' },
  { key: 'hero', title: 'Главная карточка', short: 'Карточка' },
  { key: 'expense', title: 'Расходы', short: 'Расходы' },
];

/**
 * Свои цвета темы: только на этом телефоне (у Елены и Олега могут быть разные), таблицу не трогают.
 * Готовая палитра или три цвета кружками: в наборах только оттенки, которые проходят контраст, поэтому
 * ни ввода hex, ни предупреждений о плохом цвете. Тёмная тема выводится сама.
 */
export default function ThemeColorsScreen() {
  const { colors, custom, setCustom, scheme } = useTheme();
  const [draft, setDraft] = useState<ThemeColors>(custom ?? THEME_PRESETS[0]!.colors);
  const [preset, setPreset] = useState<string | undefined>(custom?.preset ?? (custom ? undefined : 'green'));
  const [mode, setMode] = useState<'presets' | 'custom'>(custom && !custom.preset ? 'custom' : 'presets');
  const preview = useMemo(() => paletteFor(scheme, draft), [scheme, draft]);
  // Цветовой круг: точки трёх цветов, правило гармонии и активный маркер.
  const [wheel, setWheel] = useState<WheelColors>(() => colorsToWheel(draft));
  const [rule, setRule] = useState<Harmony>('custom');
  const [active, setActive] = useState<Slot>('accent');
  const onWheel = (w: WheelColors) => {
    setWheel(w);
    setPreset(undefined);
    setDraft(wheelToColors(w));
  };

  const pick = (id: string) => {
    const p = THEME_PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setDraft(p.colors);
    setWheel(colorsToWheel(p.colors));
  };
  const save = () => {
    const isDefault = preset === 'green';
    setCustom(isDefault ? null : { ...draft, ...(preset ? { preset } : {}) });
    log.info('theme', isDefault ? 'Цвета: стандартные' : `Цвета: ${preset ?? 'свои'}`, draft);
    goBack();
  };
  const presetName = preset ? THEME_PRESETS.find((p) => p.id === preset)?.name : undefined;

  return (
    <Screen
      footer={
        <PillButton title={presetName ? `Применить «${presetName}»` : 'Сохранить цвета'} onPress={save} />
      }
    >
      <ScreenHeader title="Цвета" onBack={goBack} />
      <T v="label" c="muted">
        Только на этом телефоне: у Елены и Олега могут быть разные. Таблицу и данные не меняет.
      </T>
      <Segmented<'presets' | 'custom'>
        label="Как выбрать"
        value={mode}
        onChange={setMode}
        options={[
          { key: 'presets', title: 'Готовые' },
          { key: 'custom', title: 'Свои' },
        ]}
      />
      {/* Превью рядом с тем, что меняют: в «Своих» компактное, вплотную над кругом (разбор 05.11). */}
      <Preview p={preview} compact={mode === 'custom'} />
      {mode === 'presets' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {THEME_PRESETS.map((p) => {
            const on = p.id === preset;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Тема ${p.name}`}
                onPress={() => pick(p.id)}
                style={{
                  width: '31%',
                  minHeight: 72,
                  borderRadius: 18,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? colors.ink : colors.line,
                  backgroundColor: colors.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Dots c={p.colors} edge={colors.control} />
                <T v="caption" c={on ? 'ink' : 'muted'}>
                  {p.name}
                </T>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <>
          {/* Правило гармонии: одна строка, листается вбок. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {HARMONIES.map((h) => (
              <Chip
                key={h.id}
                label={h.name}
                selected={rule === h.id}
                onPress={() => {
                  setRule(h.id);
                  onWheel(applyHarmony(wheel, h.id));
                }}
              />
            ))}
          </ScrollView>
          {/* Какой цвет двигаем: сегменты с точкой цвета, маркер на круге выделен так же. */}
          <View
            style={{
              flexDirection: 'row',
              gap: 4,
              backgroundColor: colors.fill,
              borderRadius: 24,
              padding: 4,
            }}
          >
            {SLOTS.map((s) => {
              const on = active === s.key;
              return (
                <Pressable
                  key={s.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Двигать ${s.title}`}
                  onPress={() => setActive(s.key)}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: on ? colors.card : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: draft[s.key],
                      borderWidth: 1,
                      borderColor: colors.control,
                    }}
                  />
                  <T v="label" c={on ? 'ink' : 'muted'} numberOfLines={1}>
                    {s.short}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <ColorWheel
            value={wheel}
            colors={draft}
            rule={rule}
            active={active}
            onActive={setActive}
            onChange={onWheel}
          />
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="label">Яркость: {SLOTS.find((x) => x.key === active)!.short}</T>
              <T v="caption" c="muted">
                светлее не пустит граница читаемости
              </T>
            </View>
            <BrightnessSlider
              label={SLOTS.find((x) => x.key === active)!.title}
              value={wheel[active].b}
              from={hsvToHex(
                wheel[active].h,
                wheel[active].s,
                maxValue(wheel[active].h, wheel[active].s, COLOR_RULES[active]) * 0.2,
              )}
              to={hsvToHex(
                wheel[active].h,
                wheel[active].s,
                maxValue(wheel[active].h, wheel[active].s, COLOR_RULES[active]),
              )}
              onChange={(b) => onWheel({ ...wheel, [active]: { ...wheel[active], b } })}
            />
          </View>
        </>
      )}
      <PillButton kind="ghost" size="md" title="Сбросить к «Зелёной»" onPress={() => pick('green')} />
    </Screen>
  );
}

function Dots({ c, edge }: { c: ThemeColors; edge: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[c.accent, c.hero, c.expense].map((x, i) => (
        <View
          key={i}
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: x,
            borderWidth: 1,
            borderColor: edge,
          }}
        />
      ))}
    </View>
  );
}

/** Кусок Главной в выбранных цветах: главная карточка, чипы, графики, кнопка. */
function Preview({ p, compact }: { p: Palette; compact?: boolean }) {
  const bars = [38, 30, 44, 26, 40, 34];
  if (compact)
    // Компактно над кругом: результат виден, пока тянешь маркер.
    return (
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          backgroundColor: p.ground,
          borderRadius: 22,
          padding: 10,
          borderWidth: 1,
          borderColor: p.line,
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: p.hero,
            borderRadius: 16,
            padding: 12,
            gap: 4,
            borderWidth: 1,
            borderColor: p.heroEdge,
            justifyContent: 'center',
          }}
        >
          <T v="caption" style={{ color: p.heroMuted }}>
            Можно сегодня
          </T>
          <T v="title" style={{ color: p.heroInk }}>
            1 588{' '}
            <T v="title" style={{ color: p.heroAccent }}>
              ₽
            </T>
          </T>
        </View>
        <View style={{ width: 128, gap: 8, justifyContent: 'center' }}>
          <View
            style={{
              height: 32,
              borderRadius: 16,
              backgroundColor: p.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T v="label" style={{ color: p.onAccent }}>
              Сохранить
            </T>
          </View>
          <View
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 30 }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {bars.map((h, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: h * 0.65,
                  borderRadius: 3,
                  backgroundColor: i % 2 ? p.expense : p.accent,
                }}
              />
            ))}
          </View>
        </View>
      </View>
    );
  return (
    <View
      style={{
        backgroundColor: p.ground,
        borderRadius: 22,
        padding: 14,
        gap: 12,
        borderWidth: 1,
        borderColor: p.line,
      }}
    >
      <View
        style={{
          backgroundColor: p.hero,
          borderRadius: 20,
          padding: 16,
          gap: 8,
          borderWidth: 1,
          borderColor: p.heroEdge,
        }}
      >
        <T v="label" style={{ color: p.heroMuted }}>
          Можно потратить сегодня
        </T>
        <T v="amount" style={{ color: p.heroInk }}>
          1 588{' '}
          <T v="amount" style={{ color: p.heroAccent }}>
            ₽
          </T>
        </T>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: p.heroTrack }}>
          <View style={{ width: '30%', height: 6, borderRadius: 3, backgroundColor: p.heroAccent }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View
          style={{
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 18,
            backgroundColor: p.accent,
            justifyContent: 'center',
          }}
        >
          <T v="label" style={{ color: p.onAccent }}>
            Продукты
          </T>
        </View>
        <View
          style={{
            height: 36,
            paddingHorizontal: 14,
            borderRadius: 18,
            borderWidth: 1.5,
            borderColor: p.control,
            justifyContent: 'center',
          }}
        >
          <T v="label" style={{ color: p.ink }}>
            Транспорт
          </T>
        </View>
      </View>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 48 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {bars.map((h, i) => (
          <View
            key={i}
            style={{ flex: 1, height: h, borderRadius: 4, backgroundColor: i % 2 ? p.expense : p.accent }}
          />
        ))}
      </View>
    </View>
  );
}
