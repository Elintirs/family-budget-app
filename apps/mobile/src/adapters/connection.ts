import { kv } from './db';

/** Куда ходит телефон: адрес Apps Script и ключ этого устройства. */
export interface Connection {
  url: string;
  token: string;
}

const KEY = 'connection';
const ENV_URL = process.env.EXPO_PUBLIC_API_URL;
const ENV_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;

/**
 * Подключение из онбординга (ссылка). Для разработки на эмуляторе остаётся запасной вариант из .env.local.
 * В релизной сборке токена в переменных нет: у каждого телефона свой, его приносит ссылка.
 */
export function getConnection(): Connection | null {
  const saved = kv.getJson<Connection>(KEY);
  if (saved?.url && saved.token) return saved;
  if (ENV_URL && ENV_TOKEN) return { url: ENV_URL, token: ENV_TOKEN };
  return null;
}

export function setConnection(c: Connection) {
  kv.setJson(KEY, c);
}

/** Ссылка подключения: budget://connect?u=<адрес>&t=<ключ>. Принимаем её целиком или просто текст сообщения с ней. */
export function parseConnectLink(text: string): Connection | null {
  const m = text.match(/budget:\/\/connect\?[^\s]+/);
  if (!m) return null;
  const params = new URLSearchParams(m[0].slice(m[0].indexOf('?') + 1));
  const token = params.get('t')?.trim();
  const url = params.get('u')?.trim() || ENV_URL;
  if (!token || !url || !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return null;
  return { url, token };
}

/** Ключ для показа: первые и последние символы. */
export const maskToken = (t: string) => (t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)}` : '••••');
