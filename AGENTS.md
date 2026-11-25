# Правила для агентов

- Отвечать и писать тексты по-русски. Без длинных тире в коммитах и комментариях к MR.
- Архитектура «ядро + адаптеры»: вся логика в `packages/core` (чистые функции, тесты на vitest),
  `apps/mobile` и `gas` только подключают её через порты из `ports.ts`. Ядро не импортирует React/Expo/Apps Script.
- Контракт между мобилкой и Apps Script меняется только в `packages/core/src/contract.ts`.
- Деньги только в копейках (`Kopecks`), форматирование через `formatRub`.
- UI: сначала готовые компоненты и @expo/ui, своё только если не попадает в макет. Цвета только из `src/ui/theme.ts`.
- Таблицу меняем только миграцией `gas/src/setup`, сначала на копии.
- Перед коммитом: `npm run typecheck && npm run lint && npm test`.
- Раздача APK: собрать релиз, поднять `version`/`versionCode` в `apps/mobile/app.config.ts` и
  `android/app/build.gradle`, скопировать в `release/budget.apk`, затем `scripts/publish-apk.sh "что нового"`
  (rclone на Google Диск в папку «Бюджет», ссылка «всем по ссылке», `setLatestApp` в рабочий деплой).
