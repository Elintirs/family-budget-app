import { formatRub } from '@budget/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { keys, useRemainder, useSync, type LastSync } from '@/hooks/data';
import { CheckIcon, SyncIcon } from '@/ui/icons';
import { Card, PillButton, Row, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';

export default function SyncResultSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const sync = useSync();
  const r = useRemainder();
  const last = qc.getQueryData<LastSync>(keys.lastSync);
  // Повтор отсюда: показываем его результат, пока он есть.
  const result = sync.data ?? (sync.isError ? undefined : last?.result);
  const failed = !result;

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable
        accessibilityLabel="Закрыть"
        onPress={goBack}
        style={{ position: 'absolute', inset: 0, backgroundColor: colors.scrim, opacity: 0.5 }}
      />
      <View
        style={{
          backgroundColor: colors.ground,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          paddingBottom: insets.bottom + 20,
          gap: 14,
        }}
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
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: failed ? colors.warnSoft : colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SyncIcon color={failed ? colors.warnInk : colors.accentInk} />
          </View>
          <T v="title" style={{ fontSize: 20 }}>
            {failed
              ? 'Не отправлено'
              : result.sent || result.response.edited?.length
                ? 'Отправлено в таблицу'
                : 'Нечего отправлять'}
          </T>
        </View>
        {failed ? (
          <Card tone="warnSoft">
            <T v="body" c="warnSoftInk">
              Таблица не ответила
            </T>
            {last?.error ? (
              <T v="caption" c="warnSoftInk">
                {last.error}
              </T>
            ) : null}
            <T v="label" c="warnSoftInk">
              Операции остались во «Входящих». Повтор безопасен: дубля не будет.
            </T>
            <PillButton
              kind="strong"
              size="md"
              title={sync.isPending ? 'Отправляем…' : 'Повторить'}
              loading={sync.isPending}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => sync.mutate('кнопка')}
            />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <Row
              left={<CheckIcon color={colors.accentInk} />}
              title="Операции"
              meta="записаны в «Форму»"
              right={<T v="num">{result.sent}</T>}
            />
            {result.response.edited?.length ? (
              <Row
                left={<CheckIcon color={colors.accentInk} />}
                title="Правки"
                meta="применены в таблице"
                right={<T v="num">{result.response.edited.length}</T>}
              />
            ) : null}
            {result.response.missing?.length ? (
              <Row
                title="Не нашлось в таблице"
                meta="строку удалили или поменяли руками, правка не применилась"
                metaTone="warnInk"
                right={<T v="num">{result.response.missing.length}</T>}
              />
            ) : null}
            {result.suspected.length ? (
              <Row
                title="Похожи на дубли"
                meta="остались во «Входящих»"
                metaTone="warnInk"
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <T v="num">{result.suspected.length}</T>
                    <PillButton
                      kind="secondary"
                      size="md"
                      title="Разобрать"
                      onPress={() => router.replace('/(tabs)/inbox')}
                    />
                  </View>
                }
              />
            ) : null}
            {result.rejected.length ? (
              <Row
                title="Отклонены"
                meta={result.rejected.map((x) => x.reason).join(', ')}
                metaTone="warnInk"
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <T v="num">{result.rejected.length}</T>
                    <PillButton
                      kind="secondary"
                      size="md"
                      title="Разобрать"
                      onPress={() => router.replace('/(tabs)/inbox')}
                    />
                  </View>
                }
              />
            ) : null}
            <Row
              left={<CheckIcon color={colors.accentInk} />}
              title="Остаток на день"
              meta="обновлён из «Сводки»"
              right={<T v="num">{formatRub(r?.remainingToday ?? 0)}</T>}
              last
            />
          </Card>
        )}
        <PillButton title="Готово" onPress={goBack} />
      </View>
    </View>
  );
}
