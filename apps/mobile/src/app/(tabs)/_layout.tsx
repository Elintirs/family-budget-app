import { Redirect, Tabs } from 'expo-router';
import { kv } from '@/adapters';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePending } from '@/hooks/data';
import { fonts } from '@/ui/kit';
import { ChartIcon, HomeIcon, InboxIcon, PlusCircleIcon, SlidersIcon } from '@/ui/icons';
import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { pending } = usePending();
  const insets = useSafeAreaInsets();
  // Первый запуск: сначала онбординг.
  if (kv.get('onboarded') !== '1') return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentInk,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 68 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
        },
        // 11: на экране 360 dp «Аналитика» и «Настройки» в 12 обрезались.
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 11 },
        tabBarItemStyle: { paddingHorizontal: 0 },
        sceneStyle: { backgroundColor: colors.ground },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Главная', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Входящие',
          tabBarIcon: ({ color }) => <InboxIcon color={color} />,
          tabBarBadge: pending.length || undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.warn,
            color: colors.onWarn,
            fontFamily: fonts.heavy,
            fontSize: 11,
          },
        }}
      />
      <Tabs.Screen
        name="add"
        options={{ title: 'Добавить', tabBarIcon: ({ color }) => <PlusCircleIcon color={color} /> }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ title: 'Аналитика', tabBarIcon: ({ color }) => <ChartIcon color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Настройки', tabBarIcon: ({ color }) => <SlidersIcon color={color} /> }}
      />
    </Tabs>
  );
}
