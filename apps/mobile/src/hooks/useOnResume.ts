import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Вызывает cb при показе экрана и при каждом возвращении в приложение. Нужен для разрешений:
 * пользователь уходит в системные настройки, выдаёт доступ и возвращается на тот же экран,
 * а фокус экрана при этом не меняется.
 */
export function useOnResume(cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useFocusEffect(useCallback(() => ref.current(), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && ref.current());
    return () => sub.remove();
  }, []);
}
