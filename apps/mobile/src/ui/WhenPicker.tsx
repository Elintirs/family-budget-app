import DateTimePicker from '@expo/ui/datetimepicker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { humanTime } from '@/state/format';
import { ChevronRightIcon } from './icons';
import { Row, T } from './kit';
import { useTheme } from './theme';

/** Календарь Material 3 работает с днями в UTC: местный день передаём как полночь UTC и так же читаем. */
const utcDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/**
 * «Сегодня, 21:02 · изменить»: дата и время операции. Нажатие открывает системный выбор даты,
 * за ним выбор времени (Material 3 из @expo/ui). Будущее выбрать нельзя.
 */
export function WhenPicker({
  value,
  onChange,
  disabled,
  variant = 'line',
  title = 'Время',
  emptyLabel,
}: {
  value: Date;
  onChange: (d: Date) => void;
  disabled?: boolean;
  /** line: «Сегодня 21:02   изменить» под суммой; row: строка «Время» в списке, как в карточке операции. */
  variant?: 'line' | 'row';
  /** Подпись строки в варианте row. */
  title?: string;
  /** Пока значение не выбрано: показать это вместо даты (например, «не меняем»). */
  emptyLabel?: string;
}) {
  const { colors } = useTheme();
  const [step, setStep] = useState<'idle' | 'date' | 'time'>('idle');
  const [draft, setDraft] = useState(value);
  const label = emptyLabel ?? humanTime(value.toISOString());

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Когда: ${label}. Изменить`}
        disabled={disabled}
        hitSlop={8}
        onPress={() => {
          setDraft(value);
          setStep('date');
        }}
      >
        {variant === 'row' ? (
          <Row
            title={title}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T v="label">{label}</T>
                {disabled ? null : <ChevronRightIcon color={colors.muted} />}
              </View>
            }
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
            <T v="label" c="muted">
              {label[0]!.toUpperCase() + label.slice(1)}
            </T>
            {disabled ? null : (
              <T v="label" c="accentInk" style={{ textDecorationLine: 'underline' }}>
                изменить
              </T>
            )}
          </View>
        )}
      </Pressable>
      {step === 'date' ? (
        <DateTimePicker
          value={utcDay(draft)}
          mode="date"
          presentation="dialog"
          maximumDate={utcDay(new Date())}
          accentColor={colors.accent}
          onValueChange={(_, d) => {
            // Дата из диалога, время пока прежнее: его выберут следующим шагом.
            const next = new Date(draft);
            next.setFullYear(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            setDraft(next);
            setStep('time');
          }}
          onDismiss={() => setStep('idle')}
        />
      ) : null}
      {step === 'time' ? (
        <DateTimePicker
          value={draft}
          mode="time"
          presentation="dialog"
          is24Hour
          accentColor={colors.accent}
          onValueChange={(_, d) => {
            const next = new Date(draft);
            next.setHours(d.getHours(), d.getMinutes(), 0, 0);
            setStep('idle');
            onChange(next > new Date() ? new Date() : next);
          }}
          onDismiss={() => {
            // Время не выбрали: дата всё равно сохраняется.
            setStep('idle');
            onChange(draft > new Date() ? new Date() : draft);
          }}
        />
      ) : null}
    </>
  );
}
