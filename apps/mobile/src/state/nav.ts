import { router } from 'expo-router';

/**
 * «Назад» для своих кнопок. Экран мог открыться по ссылке (виджет, уведомление), тогда позади пусто
 * и router.back() ничего не делает: в таком случае уходим на главную.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
