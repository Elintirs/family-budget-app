import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { kv, log } from '@/adapters';
import { maskToken, parseConnectLink, setConnection } from '@/adapters/connection';
import { keys } from '@/hooks/data';

/**
 * Ссылка подключения budget://connect?u=…&t=… открывает этот экран: сохраняем ключ и уходим дальше
 * (в онбординг, если он ещё не пройден).
 */
export default function ConnectLink() {
  const { u, t } = useLocalSearchParams<{ u?: string; t?: string }>();
  const qc = useQueryClient();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const c = parseConnectLink(
      `budget://connect?u=${encodeURIComponent(u ?? '')}&t=${encodeURIComponent(t ?? '')}`,
    );
    if (c) {
      setConnection(c);
      log.info('onboarding', 'Подключено по ссылке (открыта ссылка)', { token: maskToken(c.token) });
      void qc.invalidateQueries({ queryKey: keys.bootstrap });
    } else log.warn('onboarding', 'Ссылка подключения не разобрана');
    setDone(true);
  }, [u, t, qc]);
  if (!done) return null;
  return (
    <Redirect href={kv.get('onboarded') === '1' ? '/' : { pathname: '/onboarding', params: { step: '1' } }} />
  );
}
