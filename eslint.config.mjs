import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', 'apps/mobile/android/**', 'design/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Конфиги сборщиков на CommonJS выполняет Node.
    files: ['**/metro.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Ядро не знает о платформе: ни React, ни Expo, ни Apps Script.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-*', 'react-native*', 'expo', 'expo-*', '@expo/*', '@google/*'] },
      ],
    },
  },
);
