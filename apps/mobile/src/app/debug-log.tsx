import { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exportLogFile } from '@/adapters/exportLog';
import { clearLogs, logCounts, logsPage, pullNativeLogs, type LogRow } from '@/adapters/log';
import { Card, PillButton, ScreenHeader, T } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';

/**
 * Настройки -> «Журнал для разработчика». Хранится и выгружается вся история;
 * на экране список листается до самого начала, подгружаясь по 200 записей.
 */
export default function DebugLog() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<LogRow[]>(() => {
    pullNativeLogs();
    return logsPage(null);
  });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState(logCounts);

  const more = useCallback(() => {
    if (done || !rows.length) return;
    const next = logsPage(rows[rows.length - 1]!);
    if (!next.length) setDone(true);
    else setRows((r) => [...r, ...next]);
  }, [done, rows]);

  const share = async () => {
    setBusy(true);
    try {
      await exportLogFile();
    } catch (e) {
      Alert.alert('Не получилось выгрузить', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = () =>
    Alert.alert('Очистить журнал?', 'Операции и уведомления останутся, удалятся только записи журнала.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Очистить',
        style: 'destructive',
        onPress: () => {
          clearLogs();
          setRows([]);
          setDone(true);
          setCounts(logCounts());
        },
      },
    ]);

  const header = (
    <View style={{ gap: space.gap, paddingBottom: 12 }}>
      <ScreenHeader title="Журнал" onBack={goBack} />
      <Card>
        <T v="bodyRegular" c="muted">
          В файл попадает вся история: записи журнала, уведомления банков и операции на телефоне. Номера карт
          скрыты до последних 4 цифр. Отправь файл разработчику после теста на живых покупках.
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <Stat label="записей" value={counts.logs} />
          <Stat label="ошибок" value={counts.errors} warn={counts.errors > 0} />
          <Stat label="уведомлений" value={counts.notifications} />
          <Stat label="операций" value={counts.operations} />
        </View>
      </Card>
      <T v="h2">Все записи, новые сверху</T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={({ item }) => <LogLine row={item} />}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <T v="label" c="muted">
            Пусто
          </T>
        }
        ListFooterComponent={
          rows.length ? (
            <T v="caption" c="muted" style={{ textAlign: 'center', paddingVertical: 16 }}>
              {done ? 'Это начало журнала' : 'Листай дальше, подгрузятся старые'}
            </T>
          ) : null
        }
        onEndReached={more}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: space.screen,
          paddingBottom: 24,
        }}
      />
      <View
        style={{
          paddingHorizontal: space.screen,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          gap: 8,
          backgroundColor: colors.ground,
        }}
      >
        <PillButton title={busy ? 'Готовим файл…' : 'Поделиться журналом'} loading={busy} onPress={share} />
        <PillButton kind="danger" size="md" title="Очистить журнал" onPress={clear} />
      </View>
    </View>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <View>
      <T v="num" c={warn ? 'warnInk' : 'ink'}>
        {value}
      </T>
      <T v="caption" c="muted">
        {label}
      </T>
    </View>
  );
}

function LogLine({ row }: { row: LogRow }) {
  const d = new Date(row.ts);
  const time = `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  return (
    <View style={{ gap: 2 }}>
      <T v="caption" c={row.level === 'error' ? 'warnInk' : 'muted'}>
        {time} · {row.tag}
        {row.level !== 'info' ? ` · ${row.level}` : ''}
      </T>
      <T v="label">{row.message}</T>
      {row.data ? (
        <T v="caption" c="muted" numberOfLines={3}>
          {row.data}
        </T>
      ) : null}
    </View>
  );
}
