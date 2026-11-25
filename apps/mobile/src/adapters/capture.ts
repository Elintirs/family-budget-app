import { Platform } from 'react-native';
import { NotificationListener } from '../../modules/notification-listener/src';

/**
 * База Kotlin-слушателя (filesDir/capture.db): пойманные уведомления, выбор кнопками, журнал сервиса.
 * Открывать её через expo-sqlite нельзя: две копии SQLite в одном процессе на одном файле портят базу.
 * Поэтому SQL отсюда выполняет сам Kotlin, а сюда приходят готовые строки.
 */
const native = Platform.OS === 'android' ? NotificationListener : null;

type Arg = string | number | null;

export const capture = {
  all<T>(sql: string, ...args: Arg[]): T[] {
    if (!native) return [];
    return JSON.parse(
      native.captureQuery(
        sql,
        args.map((a) => (a === null ? '' : String(a))),
      ),
    ) as T[];
  },
  first<T>(sql: string, ...args: Arg[]): T | null {
    return capture.all<T>(sql, ...args)[0] ?? null;
  },
  /** Несколько изменений одной транзакцией. */
  run(...statements: [string, Arg[]?][]) {
    if (!native || !statements.length) return;
    native.captureExec(JSON.stringify(statements.map(([sql, args]) => [sql, args ?? []])));
  },
};
