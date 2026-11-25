// Заглушка expo-symbols: expo-router тянет его только ради иконок нативных вкладок, которых у нас нет,
// а вместе с ним в APK попадают 7 шрифтов Material Symbols (~7 МБ). Подключается в metro.config.js.
export const SymbolView = () => null;
export const unstable_getMaterialSymbolSourceAsync = () =>
  Promise.reject(new Error('expo-symbols отключён в этом приложении'));
