import { capture } from './capture';
import { db } from './db';

/**
 * Журнал приложения в SQLite. Его можно выгрузить файлом из «Настройки → Журнал для разработчика»
 * и передать разработчику после теста на живых покупках.
 * Номера карт маскируются до последних 4 цифр, токены и ссылки с токеном не пишутся.
 */

type Level = 'info' | 'warn' | 'error';

/** Длинные номера (карты, счета) -> «•••• 1234». */
export function mask(text: string): string {
  return text
    .replace(/\b(?:\d[ -]?){12,19}\b/g, (m) => `•••• ${m.replace(/\D/g, '').slice(-4)}`)
    .replace(/token=[^&\s"]+/g, 'token=•••');
}

function write(level: Level, tag: string, message: string, data?: unknown) {
  const ts = new Date().toISOString();
  const json = data === undefined ? null : mask(safeJson(data));
  try {
    db.runSync(
      'INSERT INTO logs (ts, level, tag, message, data) VALUES (?, ?, ?, ?, ?)',
      ts,
      level,
      tag,
      mask(message),
      json,
    );
  } catch {
    // журнал не должен ронять приложение
  }
  // console.log, а не warn/error: иначе в dev-сборке всплывают плашки LogBox поверх кнопок.
  if (__DEV__) console.log(`[${level}] [${tag}] ${message}`, data ?? '');
}

function safeJson(data: unknown): string {
  if (data instanceof Error)
    return JSON.stringify({ name: data.name, message: data.message, stack: data.stack });
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export const log = {
  info: (tag: string, message: string, data?: unknown) => write('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => write('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => write('error', tag, message, data),
};

export interface LogRow {
  id: number;
  ts: string;
  level: Level;
  tag: string;
  message: string;
  data: string | null;
}

/**
 * Журнал хранится целиком, без обрезки. На экране читаем страницами, от новых к старым.
 * Порядок по времени, а не по id: записи Kotlin-сервиса переносятся сюда пачками позже.
 */
export function logsPage(before: LogRow | null, limit = 200): LogRow[] {
  return before === null
    ? db.getAllSync<LogRow>('SELECT * FROM logs ORDER BY ts DESC, id DESC LIMIT ?', limit)
    : db.getAllSync<LogRow>(
        'SELECT * FROM logs WHERE ts < ? OR (ts = ? AND id < ?) ORDER BY ts DESC, id DESC LIMIT ?',
        before.ts,
        before.ts,
        before.id,
        limit,
      );
}

/** Записи Kotlin-сервиса (его база capture.db) переносим в общий журнал приложения. */
export function pullNativeLogs() {
  try {
    const rows = capture.all<Omit<LogRow, 'id'> & { id: number }>(
      'SELECT * FROM logs ORDER BY id LIMIT 2000',
    );
    if (!rows.length) return;
    db.withTransactionSync(() => {
      for (const r of rows)
        db.runSync(
          'INSERT INTO logs (ts, level, tag, message, data) VALUES (?, ?, ?, ?, ?)',
          r.ts,
          r.level,
          r.tag,
          r.message,
          r.data,
        );
    });
    capture.run(['DELETE FROM logs WHERE id <= ?', [rows[rows.length - 1]!.id]]);
  } catch {
    // журнал не должен ронять приложение
  }
  trimOld();
}

const DAY_MS = 24 * 3600 * 1000;

/** Журнал за 30 дней, разобранные пуши и чужие кандидаты за 90: иначе базы растут без конца. */
function trimOld(now = Date.now()) {
  try {
    db.runSync('DELETE FROM logs WHERE ts < ?', new Date(now - 30 * DAY_MS).toISOString());
    capture.run([
      'DELETE FROM captured_notifications WHERE (processed = 1 OR tracked = 0) AND posted_at < ?',
      [now - 90 * DAY_MS],
    ]);
  } catch {
    // чистка не должна ронять приложение
  }
}

export function logCounts() {
  const one = (sql: string) => db.getFirstSync<{ n: number }>(sql)?.n ?? 0;
  return {
    logs: one('SELECT COUNT(*) AS n FROM logs'),
    errors: one("SELECT COUNT(*) AS n FROM logs WHERE level = 'error'"),
    notifications: capture.first<{ n: number }>('SELECT COUNT(*) AS n FROM captured_notifications')?.n ?? 0,
    operations: one('SELECT COUNT(*) AS n FROM operations'),
  };
}

export function clearLogs() {
  db.runSync('DELETE FROM logs');
}

/** Ловим необработанные ошибки JS, чтобы они попали в журнал. */
export function installGlobalErrorLogging() {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler(): (e: unknown, fatal?: boolean) => void;
      setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void;
    };
  };
  const prev = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    log.error('crash', fatal ? 'Падение приложения' : 'Необработанная ошибка', e);
    prev?.(e, fatal);
  });
}
