// Начертания по отдельности: импорт из корня пакета кладёт в APK все веса шрифта.
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded/600SemiBold';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { router, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { apiKind, log } from '@/adapters';
import { installGlobalErrorLogging } from '@/adapters/log';
import { capturedCount, listener } from '@/adapters/notifications';
import { useAutoSend, useNativeBridge, useNotificationIngest, useReminders, useTableRev } from '@/hooks/data';
import { ThemeProvider, useTheme } from '@/ui/theme';

installGlobalErrorLogging();
log.info(
  'app',
  `Запуск ${Constants.expoConfig?.version ?? ''}, таблица: ${{ gas: 'Apps Script', fake: 'заглушка', none: 'не подключена' }[apiKind()]}`,
);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

// React Query в RN не знает, что приложение снова на экране: без этого устаревшие данные не обновлялись
// при возврате в приложение, только кнопкой «Обновить».
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
  return () => sub.remove();
});

/** Всё, что помогает восстановить картину после живого теста: фон, экраны, ссылки, разрешения. */
function useDiagnostics() {
  const path = usePathname();
  useEffect(() => {
    log.info('nav', path);
  }, [path]);

  // Экран открыт по ссылке (виджет, уведомление) и позади пусто: системный «Назад» ведёт на главную,
  // как и кнопка, а не закрывает приложение.
  useEffect(() => {
    const roots = ['/', '/inbox', '/add', '/analytics', '/settings', '/onboarding'];
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (roots.includes(path) || router.canGoBack()) return false;
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [path]);

  useEffect(() => {
    const permissions = (why: string) =>
      log.info('app', why, {
        listener: listener?.isPermissionGranted() ?? null,
        postNotifications: listener?.canPostNotifications() ?? null,
        battery: listener?.isIgnoringBatteryOptimizations() ?? null,
        captured: capturedCount(),
      });
    permissions('Разрешения при запуске');
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') permissions('Приложение открыто');
      else if (state === 'background') log.info('app', 'Приложение свёрнуто');
    });
    void Linking.getInitialURL().then((url) => url && log.info('app', `Открыто по ссылке ${url}`));
    const link = Linking.addEventListener('url', (e) => log.info('app', `Ссылка ${e.url}`));
    return () => {
      sub.remove();
      link.remove();
    };
  }, []);
}

function Root() {
  const { colors, scheme } = useTheme();
  useDiagnostics();
  useNotificationIngest();
  useAutoSend();
  useNativeBridge();
  useTableRev();
  useReminders();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="sync-result"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="pick/[id]"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="pick-account"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="limit-edit"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </>
  );
}

export default function Layout() {
  const [loaded] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Unbounded_600SemiBold,
  });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
