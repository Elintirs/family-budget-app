import { Image, View } from 'react-native';
import { listener } from '@/adapters/notifications';
import { Mono } from './kit';
import { useTheme, type Palette } from './theme';

/** Банки по названию счёта -> пакет приложения: иконка счёта на Главной. */
export const BANK_PACKAGES: Record<string, string> = {
  'Т-Банк': 'com.idamob.tinkoff.android',
  Сбер: 'ru.sberbankmobile',
  ВТБ: 'ru.vtb24.mobilebanking.android',
  'Альфа-Банк': 'ru.alfabank.mobile.android',
  'Озон Банк': 'ru.ozon.fintech.finance',
  'Яндекс Банк': 'com.yandex.bank',
  Газпромбанк: 'ru.gazprombank.android.mobilebank.app',
};

export const MIR_PAY = 'ru.nspk.mirpay';

/** Пакет банка для счёта: «Т-Банк кредитка» -> Т-Банк. */
export function packageForAccount(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const bank = Object.keys(BANK_PACKAGES).find((b) => name === b || name.startsWith(`${b} `));
  return bank ? BANK_PACKAGES[bank] : undefined;
}

const cache = new Map<string, string | null>();

function iconUri(pkg: string | undefined): string | null {
  if (!pkg || !listener) return null;
  if (!cache.has(pkg)) {
    try {
      cache.set(pkg, listener.appIcon(pkg));
    } catch {
      cache.set(pkg, null);
    }
  }
  return cache.get(pkg) ?? null;
}

/**
 * Иконка приложения, из которого пришёл пуш (или банка счёта). Нет приложения на телефоне:
 * буква на цветной плашке. badge: маленькая иконка в углу (например, Mir Pay у склеенной покупки).
 */
export function AppIcon({
  pkg,
  letter,
  tone = 'monoGray',
  badgePkg,
  size = 40,
}: {
  pkg?: string;
  letter: string;
  tone?: keyof Palette;
  badgePkg?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const uri = iconUri(pkg);
  const badge = iconUri(badgePkg);
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size * 0.28 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Mono letter={letter} tone={tone} />
      )}
      {badge ? (
        <Image
          source={{ uri: badge }}
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: size * 0.45,
            height: size * 0.45,
            borderRadius: size * 0.14,
            borderWidth: 2,
            borderColor: colors.card,
          }}
        />
      ) : null}
    </View>
  );
}
