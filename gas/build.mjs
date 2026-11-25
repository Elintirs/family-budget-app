import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

// Apps Script не знает модулей: собираем всё в один IIFE и вешаем точки входа на глобальные функции.
const ENTRY = [
  'setup',
  'doGet',
  'doPost',
  'addDevice',
  'listDevices',
  'removeDevice',
  'setSpreadsheet',
  'inspect',
  'onFormSubmit',
  'onTableChange',
];

// Настройки для setup() берём из gas/.env.local (не в git): id таблицы и токены телефонов.
const env = existsSync('.env.local')
  ? Object.fromEntries(
      readFileSync('.env.local', 'utf8')
        .split('\n')
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {};
const setupConfig = env.SPREADSHEET_ID
  ? {
      spreadsheetId: env.SPREADSHEET_ID,
      devices: JSON.parse(env.DEVICES ?? '{}'),
      adminToken: env.ADMIN_TOKEN,
      prodSpreadsheetId: env.PROD_SPREADSHEET_ID,
    }
  : null;

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  define: { __SETUP__: JSON.stringify(setupConfig) },
  globalName: 'Budget',
  target: 'es2019',
  outfile: 'dist/Code.js',
  footer: { js: ENTRY.map((n) => `function ${n}(a, b) { return Budget.${n}(a, b); }`).join('\n') },
  logLevel: 'info',
});
copyFileSync('appsscript.json', 'dist/appsscript.json');
