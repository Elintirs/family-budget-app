import type { ExpoConfig } from 'expo/config';
import { withAppBuildGradle, withGradleProperties, type ConfigPlugin } from 'expo/config-plugins';

/**
 * Релиз: R8 и удаление неиспользуемых ресурсов, чтобы APK помещался в мессенджер.
 * Только arm64: оба телефона и эмулятор на Mac с M-чипом arm64, а все архитектуры раздувают APK до 87 МБ.
 */
const withReleaseShrink: ConfigPlugin = (c) =>
  withGradleProperties(c, (cfg) => {
    const props: Record<string, string> = {
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'true',
      reactNativeArchitectures: 'arm64-v8a',
    };
    for (const [key, value] of Object.entries(props)) {
      cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });

const config: ExpoConfig = {
  name: 'Бюджет',
  slug: 'family-budget',
  scheme: 'budget',
  version: '0.3.21',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  platforms: ['android'],
  android: {
    package: 'ru.familybudget.app',
    // Растёт с каждой выкладкой: Android ставит обновление только поверх версии с меньшим или тем же кодом.
    versionCode: 24,
    adaptiveIcon: {
      backgroundColor: '#14181F',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: ['expo-router', 'expo-sqlite', 'expo-font'],
  experiments: { typedRoutes: true },
};

/**
 * Подпись релиза своим ключом: ~/.config/family-budget/signing.properties (storeFile, storePassword,
 * keyAlias, keyPassword) вне репозитория. Нет файла: релиз подписывается отладочным ключом, как раньше.
 * Ключ терять нельзя: без него обновить установленное приложение не получится.
 */
const withReleaseSigning: ConfigPlugin = (c) =>
  withAppBuildGradle(c, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes('budgetSigning')) return cfg;
    g = g.replace(
      /android \{/,
      `def budgetSigning = new File(System.getProperty('user.home'), '.config/family-budget/signing.properties')
def budgetProps = new Properties()
if (budgetSigning.exists()) budgetSigning.withInputStream { budgetProps.load(it) }

android {`,
    );
    g = g.replace(
      /signingConfigs \{/,
      `signingConfigs {
        if (budgetSigning.exists()) {
            release {
                storeFile file(budgetProps['storeFile'])
                storePassword budgetProps['storePassword']
                keyAlias budgetProps['keyAlias']
                keyPassword budgetProps['keyPassword']
            }
        }`,
    );
    g = g.replace(
      /(release \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig budgetSigning.exists() ? signingConfigs.release : signingConfigs.debug',
    );
    cfg.modResults.contents = g;
    return cfg;
  });

export default withReleaseSigning(withReleaseShrink(config));
