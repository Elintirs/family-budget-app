import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { useBootstrap } from '@/hooks/data';
import { goBack } from '@/state/nav';
import { Card, Screen, ScreenHeader, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { AccountSettingsCard } from '../account/[id]';

/** Настройки счёта отдельно от ежедневного вида: карты и слова из уведомления, старт, кредитный лимит. */
export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const acc = boot?.accounts.find((a) => a.id === id);
  return (
    <Screen>
      <ScreenHeader title="Настройки счёта" onBack={goBack} />
      {acc ? (
        <>
          <T v="label" c="muted">
            {acc.name}: меняются редко, пишутся в лист «Счета»
          </T>
          <AccountSettingsCard account={acc} />
        </>
      ) : (
        <Card>
          {boot ? (
            <T v="label" c="muted">
              Счёт не найден.
            </T>
          ) : (
            <ActivityIndicator color={colors.muted} />
          )}
        </Card>
      )}
    </Screen>
  );
}
