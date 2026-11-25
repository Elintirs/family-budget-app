import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface KnownBank {
  package: string;
  label: string;
  installed: boolean;
  enabled: boolean;
}

interface NativeListener {
  isPermissionGranted(): boolean;
  openPermissionSettings(): void;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): void;
  requestRebind(): void;
  getSources(): string[];
  setSources(packages: string[]): void;
  knownBanks(): KnownBank[];
  appIcon(pkg: string): string | null;
  setQuickActions(enabled: boolean): void;
  /** Подсказки для кнопок в уведомлении: ключ магазина -> подкатегории; плюс частые. */
  setSuggestions(json: string): void;
  /** Состояние для виджетов: JSON с остатком на день, балансами и т.д. */
  setWidgetState(json: string): void;
  captureQuery(sql: string, args: string[]): string;
  captureExec(json: string): void;
  showTestNotification(): boolean;
  /** Напоминание: один key — одно уведомление (повтор заменяет). Нажатие открывает url. */
  notify(key: string, title: string, text: string, url: string): boolean;
  isSmsBanks(): boolean;
  setSmsBanks(on: boolean): void;
  openAutostartSettings(): string;
  setLockStatus(on: boolean): void;
  /** «Держать в памяти»: фоновая служба с закреплённым уведомлением, прошивка не выгружает процесс. */
  setKeepAlive(on: boolean): void;
  isKeepAlive(): boolean;
  isLockStatus(): boolean;
  canPostNotifications(): boolean;
  requestPostNotifications(): void;
  takeQuickChoices(): { capturedId: string; subcategory: string }[];
  deleteQuickChoice(capturedId: string): void;
  addListener(
    event: 'onCaptured',
    cb: (e: { id: string; package: string; tracked: boolean }) => void,
  ): EventSubscription;
}

/** Kotlin-модуль слушателя уведомлений (android/…/BudgetNotificationListener.kt). */
export const NotificationListener = requireNativeModule<NativeListener>('NotificationListener');
