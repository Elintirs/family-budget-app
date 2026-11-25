import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { db, kv } from './db';
import { capture } from './capture';
import { log, mask, pullNativeLogs } from './log';
import { listener } from './notifications';

/**
 * Собирает один JSON-файл для разработчика, всю историю целиком: журнал, сырые уведомления банков, операции на телефоне,
 * версия и модель телефона. Отправляется через системное «Поделиться» (Telegram, почта, Диск).
 */
export async function exportLogFile(): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
  pullNativeLogs();
  const rows = <T>(sql: string) => db.getAllSync<T>(sql);
  const report = {
    exportedAt: now.toISOString(),
    app: { version: Application.nativeApplicationVersion, build: Application.nativeBuildVersion },
    device: { model: Device.modelName, os: `${Device.osName} ${Device.osVersion}` },
    settings: { author: kv.get('author'), theme: kv.get('themePref'), bootstrapAt: kv.get('bootstrapAt') },
    // Все пойманные уведомления, включая кандидатов и пуши банков без суммы: по ним настраиваем разбор.
    notifications: capture
      .all<Record<string, unknown>>('SELECT * FROM captured_notifications ORDER BY posted_at DESC')
      .map((r) => ({
        ...r,
        postedAt: new Date(Number(r.posted_at)).toISOString(),
        title: mask(String(r.title ?? '')),
        text: mask(String(r.text ?? '')),
      })),
    sources: listener?.getSources() ?? [],
    operations: rows<{ json: string }>('SELECT json FROM operations ORDER BY occurred_at DESC').map((r) =>
      JSON.parse(mask(r.json)),
    ),
    logs: rows('SELECT ts, level, tag, message, data FROM logs ORDER BY ts DESC, id DESC'),
  };
  const file = new File(Paths.cache, `budget-log-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(report, null, 2));
  log.info('log', 'Журнал выгружен', {
    logs: report.logs.length,
    notifications: report.notifications.length,
  });
  await shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Журнал бюджета' });
}
