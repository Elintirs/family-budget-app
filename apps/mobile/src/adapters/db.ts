import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { capture } from './capture';

/**
 * База приложения. Kotlin-слушатель в неё НЕ пишет: у него своя capture.db (см. adapters/capture.ts),
 * потому что две копии SQLite в одном процессе на одном файле портят базу.
 */
const NAME = 'budget.db';

/** Если база всё же повреждена (старые версии писали в неё из Kotlin), откладываем её в сторону и начинаем с чистой. */
function openChecked(): { db: SQLiteDatabase; recovered: string | null } {
  try {
    const d = openDatabaseSync(NAME);
    d.execSync('PRAGMA journal_mode = WAL');
    const check = d.getFirstSync<{ quick_check: string }>('PRAGMA quick_check');
    if (check?.quick_check === 'ok') return { db: d, recovered: null };
    d.closeSync();
  } catch {
    // не открылась: тоже откладываем
  }
  const dir = new Directory(Paths.document, 'SQLite');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const suffix of ['', '-wal', '-shm']) {
    const f = new File(dir, NAME + suffix);
    if (f.exists) f.move(new File(dir, `budget.corrupt-${stamp}.db${suffix}`));
  }
  return { db: openDatabaseSync(NAME), recovered: stamp };
}

const opened = openChecked();
export const db = opened.db;
db.execSync('PRAGMA journal_mode = WAL');

// Только IF NOT EXISTS: так безопасно повторять на старых базах.
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS operations (
     id TEXT PRIMARY KEY NOT NULL,
     json TEXT NOT NULL,
     status TEXT NOT NULL,
     occurred_at TEXT NOT NULL,
     deleted INTEGER NOT NULL DEFAULT 0,
     updated_at TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS operations_status ON operations(status);
   CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
  // Журнал для выгрузки разработчику и сырые уведомления банков (их будет писать Kotlin-сервис, этап 6).
  `CREATE TABLE IF NOT EXISTS logs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL,
     level TEXT NOT NULL,
     tag TEXT NOT NULL,
     message TEXT NOT NULL,
     data TEXT
   );
   CREATE TABLE IF NOT EXISTS raw_notifications (
     id TEXT PRIMARY KEY NOT NULL,
     package TEXT NOT NULL,
     notification_key TEXT,
     posted_at INTEGER NOT NULL,
     title TEXT,
     text TEXT,
     operation_id TEXT
   );`,
  // Уведомления, пойманные Kotlin-сервисом. Схема совпадает с Store.kt (там тоже IF NOT EXISTS).
  `CREATE TABLE IF NOT EXISTS captured_notifications (
     id TEXT PRIMARY KEY NOT NULL,
     package TEXT NOT NULL,
     app_label TEXT,
     notification_key TEXT,
     posted_at INTEGER NOT NULL,
     title TEXT,
     text TEXT,
     tracked INTEGER NOT NULL DEFAULT 0,
     processed INTEGER NOT NULL DEFAULT 0,
     operation_id TEXT
   );
   CREATE INDEX IF NOT EXISTS captured_pending ON captured_notifications(tracked, processed);`,
];

function migrate() {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]!);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

migrate();

/** Мелкие настройки и кэш: тема, автор, последний bootstrap. */
export const kv = {
  get(key: string): string | null {
    return db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)?.value ?? null;
  },
  set(key: string, value: string) {
    db.runSync(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  },
  getJson<T>(key: string): T | null {
    const raw = kv.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  setJson(key: string, value: unknown) {
    kv.set(key, JSON.stringify(value));
  },
  delete(key: string) {
    db.runSync('DELETE FROM kv WHERE key = ?', key);
  },
};

if (opened.recovered) kv.set('recoveredAt', opened.recovered);

/**
 * Разовый перенос: старые версии держали пойманные уведомления в этой базе, теперь они в capture.db.
 * INSERT OR IGNORE: повтор ничего не испортит.
 */
if (kv.get('captureMoved') !== '1') {
  try {
    const old = db.getAllSync<Record<string, string | number | null>>('SELECT * FROM captured_notifications');
    const cols = [
      'id',
      'package',
      'app_label',
      'notification_key',
      'posted_at',
      'title',
      'text',
      'tracked',
      'processed',
      'operation_id',
    ];
    for (let i = 0; i < old.length; i += 200)
      capture.run(
        ...old
          .slice(i, i + 200)
          .map(
            (r) =>
              [
                `INSERT OR IGNORE INTO captured_notifications (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
                cols.map((c) => r[c] ?? null),
              ] as [string, (string | number | null)[]],
          ),
      );
    kv.set('captureMoved', '1');
  } catch {
    // перенесём при следующем запуске
  }
}
