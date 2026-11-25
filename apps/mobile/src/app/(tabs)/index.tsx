import {
  API_VERSION,
  newerVersion,
  budgetMoment,
  categoryLimits,
  groupLimits,
  formatRub,
  monthKey,
  unsentEffect,
  type Account,
  type AccountBalance,
  netWorth,
  monthPace,
} from '@budget/core';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { kv, log } from '@/adapters';
import { listener } from '@/adapters/notifications';
import { useMemo, useState } from 'react';
import { useOnResume } from '@/hooks/useOnResume';
import {
  useAllOperations,
  useAnalytics,
  useBootstrap,
  usePending,
  usePullRefresh,
  useRemainder,
  useSending,
  useSync,
} from '@/hooks/data';
import { backgroundStaleHours, postponeBackgroundHint } from '@/state/background';
import { bankDiff, humanDate, plural, reconciled } from '@/state/format';
import { ChevronRightIcon, ClockIcon, SyncIcon } from '@/ui/icons';
import { AppIcon, packageForAccount } from '@/ui/AppIcon';
import { accountTone } from '@/ui/accountTone';
import { LimitsFold } from '@/ui/LimitsFold';
import { Card, PillButton, Row, Screen, SectionTitle, T } from '@/ui/kit';
import { radius, useTheme } from '@/ui/theme';

export default function Home() {
  const { colors } = useTheme();
  const boot = useBootstrap();
  const pull = usePullRefresh();
  // Новая версия: плашка, пока не нажали «Позже» для этой версии.
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';
  const [later, setLater] = useState(() => kv.get('update.later'));
  const latest = boot.data?.latestApp;
  const update =
    latest && newerVersion(latest.version, appVersion) && later !== latest.version ? latest : null;
  const goals = boot.data?.goals ?? [];
  const analytics = useAnalytics().data;
  const all = useAllOperations();
  // Все заданные лимиты: подкатегории и группы вне лимита на день, сверху самые заполненные.
  const warnOn = kv.get('limits.warn') !== '0';
  const limits = useMemo(() => {
    const now = new Date();
    const month = analytics?.months.find((m) => m.month === monthKey(budgetMoment(now)));
    const subs = boot.data?.subcategories ?? [];
    const groupOf = new Map(subs.map((s) => [s.name, s.group]));
    return [
      ...groupLimits(boot.data?.groupLimits ?? {}, month, all, (n) => groupOf.get(n), now),
      ...categoryLimits(
        subs.filter((s) => !s.hidden),
        month,
        all,
        now,
      ),
    ].sort((a, b) => b.ratio - a.ratio);
  }, [boot.data, analytics, all]);
  const r = useRemainder();
  const { ready, edits } = usePending();
  const waiting = ready.length + edits.length;
  const sync = useSync();
  const sending = useSending();

  // Без доступа к уведомлениям сбор молча стоит: показываем это прямо на Главной.
  const [listening, setListening] = useState(true);
  // Прошивка усыпляет фон (Xiaomi и похожие): пуши копятся до открытия приложения.
  const [bgStale, setBgStale] = useState(() => backgroundStaleHours());
  const [allAlerts, setAllAlerts] = useState(false);
  useOnResume(() => {
    setListening(listener?.isPermissionGranted() ?? true);
    setBgStale(backgroundStaleHours());
  });

  const onSync = () => sync.mutate('кнопка', { onSettled: () => router.push('/sync-result') });

  const accounts = boot.data?.accounts ?? [];
  const balances = new Map((boot.data?.balances ?? []).map((b) => [b.accountId, b]));
  const own = accounts.filter((a) => (a.type === 'debit' || a.type === 'cash') && !a.hidden);
  // Пустые счета без выписки банка не занимают по строке: одна подпись внизу списка, как в макете.
  const isEmpty = (a: Account) => !balances.get(a.id)?.computed && balances.get(a.id)?.fact === undefined;
  const visible = own.filter((a) => !isEmpty(a));
  const empty = own.filter(isEmpty);
  const { money, debt, owed } = netWorth(accounts, boot.data?.balances ?? []);
  // Темп месяца из ядра (0.3.16).
  const pace = boot.data ? monthPace(boot.data.summary, new Date()) : undefined;
  // Карта или наличные в минусе: так не бывает, это ошибка в таблице (журнал 29.10: Т-Банк 2 −98 645).
  const overdrawn = visible.find((a) => (balances.get(a.id)?.computed ?? 0) < 0);
  // Плашки по важности: показываем одну, остальные свёрнуты в строку «Ещё» (аудит 05.11: до пяти
  // одинаковых оранжевых плашек над главной цифрой, и непонятно, какая важнее).
  const oldApi = !update && (boot.data?.apiVersion ?? 0) > API_VERSION;
  const ALERT_TITLES = {
    access: 'нет доступа к уведомлениям',
    offline: 'нет связи с таблицей',
    overdrawn: 'счёт в минусе',
    sleep: 'телефон усыпляет приложение',
    update: update ? `вышла ${update.version}` : 'новая версия',
    oldApi: 'есть новая версия приложения',
  } as const;
  type AlertKey = keyof typeof ALERT_TITLES;
  const alertKeys = (
    [
      !listening && 'access',
      boot.isError && 'offline',
      overdrawn && 'overdrawn',
      bgStale !== undefined && 'sleep',
      update && 'update',
      oldApi && 'oldApi',
    ] as (AlertKey | false | undefined | null)[]
  ).filter((k): k is AlertKey => Boolean(k));
  const show = (k: AlertKey) => allAlerts || alertKeys[0] === k;
  const spentPct = r && r.dailyLimit > 0 ? Math.min(1, Math.max(0, r.spentToday / r.dailyLimit)) : 0;

  return (
    <Screen {...pull} inTabs>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <T v="bodyRegular" c="muted">
            {humanDate(new Date())}
          </T>
          <T v="title">Бюджет</T>
        </View>
        {!waiting && !sending ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Отправить в таблицу, ждут ${waiting}`}
            onPress={onSync}
            disabled={sending}
            accessibilityState={{ busy: sending }}
            style={{
              height: 44,
              paddingHorizontal: 14,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: colors.control,
              backgroundColor: colors.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {sending ? (
              <ActivityIndicator color={colors.accentInk} />
            ) : (
              <SyncIcon color={colors.accentInk} size={18} />
            )}
            <T v="label">Отправить · {waiting}</T>
          </Pressable>
        )}
      </View>

      {!listening && show('access') ? (
        <Card tone="warnSoft">
          <T v="body" c="warnSoftInk">
            Нет доступа к уведомлениям
          </T>
          <T v="label" c="warnSoftInk">
            Покупки из банков не ловятся. Включи «Бюджет» в списке доступа к уведомлениям.
          </T>
          <PillButton
            kind="strong"
            size="md"
            title="Включить"
            style={{ alignSelf: 'flex-start' }}
            onPress={() => listener?.openPermissionSettings()}
          />
        </Card>
      ) : null}
      {boot.isError && show('offline') ? (
        <Card tone="warnSoft">
          <T v="body" c="warnSoftInk">
            {boot.data ? 'Нет связи с таблицей, показаны последние данные' : 'Нет связи с таблицей'}
          </T>
          <T v="caption" c="warnSoftInk">
            {boot.error.message}
          </T>
          <PillButton
            kind="strong"
            size="md"
            title={boot.isFetching ? 'Пробуем…' : 'Повторить'}
            loading={boot.isFetching}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => boot.refetch()}
          />
        </Card>
      ) : null}

      <View style={{ backgroundColor: colors.hero, borderRadius: radius.hero, padding: 24, gap: 18 }}>
        <View style={{ gap: 6 }}>
          <T v="body" style={{ color: colors.heroMuted }}>
            Можно потратить сегодня
          </T>
          {r ? (
            <T v="display" style={{ color: colors.heroInk }} adjustsFontSizeToFit numberOfLines={1}>
              {formatRub(r.remainingToday, { whole: true }).replace(/\s₽$/, '')}
              <T v="display" style={{ color: r.remainingToday < 0 ? colors.warnInk : colors.heroAccent }}>
                {' ₽'}
              </T>
            </T>
          ) : (
            <ActivityIndicator
              color={colors.heroAccent}
              style={{ alignSelf: 'flex-start', marginVertical: 18 }}
            />
          )}
        </View>
        <View style={{ gap: 8 }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.heroTrack, overflow: 'hidden' }}>
            <View
              style={{
                width: `${spentPct * 100}%`,
                height: 8,
                borderRadius: 4,
                backgroundColor: r && r.remainingToday < 0 ? colors.warn : colors.heroAccent,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label" style={{ color: colors.heroMuted }}>
              Потрачено {formatRub(r?.spentToday ?? 0, { whole: true })}
            </T>
            <T v="label" style={{ color: colors.heroMuted }}>
              Лимит на день {formatRub(r?.dailyLimit ?? 0, { whole: true })}
            </T>
          </View>
        </View>
        {r && r.pendingCount > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              alignSelf: 'flex-start',
              backgroundColor: colors.heroChip,
              borderRadius: 12,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
          >
            <ClockIcon color={colors.expense} />
            <T v="label" style={{ color: colors.heroMuted }}>
              с учётом {r.pendingCount}{' '}
              {plural(r.pendingCount, 'неотправленной', 'неотправленных', 'неотправленных')}
            </T>
          </View>
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            borderTopWidth: 1,
            borderTopColor: colors.heroTrack,
            paddingTop: 16,
          }}
        >
          <Stat label="Осталось на месяц" value={formatRub(r?.remainingMonth ?? 0, { whole: true })} />
          <Stat
            label="До конца месяца"
            value={r ? `${r.daysLeft} ${plural(r.daysLeft, 'день', 'дня', 'дней')}` : ''}
          />
        </View>
      </View>

      {pace?.ahead ? (
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T v="body">Темп трат</T>
            <T v="caption" c="warnInk">
              {Math.round(pace.spentShare * 100)}% лимита за {Math.round(pace.monthShare * 100)}% месяца
            </T>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.line }}>
            <View
              style={{
                width: `${Math.min(100, pace.spentShare * 100)}%`,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.warn,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: `${pace.monthShare * 100}%`,
                top: -4,
                width: 2,
                height: 18,
                backgroundColor: colors.ink,
              }}
            />
          </View>
          <T v="label" c="warnInk">
            Так к концу месяца выйдет ≈{' '}
            {formatRub(Math.round(pace.forecast / 10000) * 10000, { whole: true })} из{' '}
            {formatRub(boot.data!.summary.monthLimit, { whole: true })}
          </T>
        </Card>
      ) : null}

      {limits.length ? <LimitsFold limits={limits} warn={warnOn} /> : null}

      {alertKeys.length > 1 && !allAlerts ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ещё ${alertKeys.length - 1} предупреждения, показать`}
          onPress={() => setAllAlerts(true)}
        >
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <Row
              title={`Ещё ${alertKeys.length - 1} ${plural(alertKeys.length - 1, 'предупреждение', 'предупреждения', 'предупреждений')}`}
              meta={alertKeys
                .slice(1)
                .map((k) => ALERT_TITLES[k])
                .join(', ')}
              right={<ChevronRightIcon color={colors.muted} />}
              last
            />
          </Card>
        </Pressable>
      ) : null}

      {update && show('update') ? (
        <Card tone="accentSoft" style={{ gap: 10 }}>
          <T v="body" c="accentSoftInk">
            Вышла версия {update.version}
          </T>
          <T v="label" c="accentSoftInk">
            {update.notes || 'Новая версия приложения.'} У тебя {appVersion}. Данные и подключение сохранятся.
          </T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <PillButton
              size="md"
              title="Скачать и установить"
              onPress={() => {
                log.info('update', `Скачать ${update.version}`);
                void Linking.openURL(update.url);
              }}
            />
            <PillButton
              kind="secondary"
              size="md"
              title="Позже"
              onPress={() => {
                kv.set('update.later', update.version);
                setLater(update.version);
              }}
            />
          </View>
        </Card>
      ) : oldApi && show('oldApi') ? (
        <Card tone="warnSoft">
          <T v="body" c="warnSoftInk">
            Есть новая версия приложения
          </T>
          <T v="label" c="warnSoftInk">
            Таблица уже умеет больше, чем эта версия. Попроси свежий APK, данные не потеряются.
          </T>
        </Card>
      ) : null}
      {bgStale !== undefined && show('sleep') ? (
        <Card tone="warnSoft" style={{ gap: 10 }}>
          <T v="body" c="warnSoftInk">
            Телефон усыпляет приложение
          </T>
          <T v="label" c="warnSoftInk">
            Фоновая отправка не запускалась {bgStale} {plural(bgStale, 'час', 'часа', 'часов')}. Включи
            «Держать в памяти» (в шторке останется «Можно сегодня») и «Автозапуск», иначе покупки ждут, пока
            откроешь приложение.
          </T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {!listener?.isKeepAlive() ? (
              <PillButton
                kind="strong"
                size="md"
                title="Держать в памяти"
                onPress={() => {
                  listener?.setKeepAlive(true);
                  log.info('app', 'Включено «Держать в памяти» с Главной', { staleHours: bgStale });
                  postponeBackgroundHint();
                  setBgStale(undefined);
                }}
              />
            ) : null}
            <PillButton
              kind="secondary"
              size="md"
              title="Открыть автозапуск"
              onPress={() => {
                const where = listener?.openAutostartSettings();
                kv.set('autostartOpened', '1');
                log.info('app', 'Открыт автозапуск с Главной', { where, staleHours: bgStale });
              }}
            />
            <PillButton
              kind="secondary"
              size="md"
              title="Позже"
              onPress={() => {
                postponeBackgroundHint();
                setBgStale(undefined);
              }}
            />
          </View>
        </Card>
      ) : null}
      {overdrawn && show('overdrawn') ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/reconcile/[id]', params: { id: overdrawn.id } })}
        >
          <Card tone="warnSoft" style={{ gap: 4 }}>
            <T v="body" c="warnSoftInk">
              {overdrawn.name} в минусе:{' '}
              {formatRub(balances.get(overdrawn.id)?.computed ?? 0, { whole: true })}
            </T>
            <T v="caption" c="warnSoftInk">
              Карта и наличные в минус не уходят, значит, в таблице ошибка. Чаще всего это перевод, записанный
              в обратную сторону, или покупка не с того счёта.
            </T>
            <T v="label" c="warnSoftInk" style={{ textDecorationLine: 'underline' }}>
              Открыть сверку
            </T>
          </Card>
        </Pressable>
      ) : null}

      <SectionTitle
        title="На счетах"
        right={
          <T v="h2" style={{ fontFamily: 'Unbounded_600SemiBold' }}>
            {formatRub(money, { whole: true })}
          </T>
        }
      />
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {visible.map((a, i) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}
          >
            <AccountRow
              account={a}
              balance={balances.get(a.id)}
              unsent={unsentEffect(all, a.id, balances.get(a.id)?.factAt)}
              last={i === visible.length - 1 && !empty.length}
            />
          </Pressable>
        ))}
        {empty.length ? (
          <T v="caption" c="muted" style={{ paddingVertical: 12 }}>
            {empty.map((a) => a.name).join(', ')}: 0 ₽
          </T>
        ) : null}
      </Card>

      <Pressable accessibilityRole="button" onPress={() => router.push('/history')}>
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <Row title="История операций" right={<ChevronRightIcon color={colors.muted} />} last />
        </Card>
      </Pressable>

      {/* Долг открывает «Долги»: график, прогноз, «Погасить». */}
      <Pressable accessibilityRole="button" accessibilityLabel="Долги" onPress={() => router.push('/debts')}>
        <Card style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption" c="muted">
              Долг по кредиткам
            </T>
            <T v="num" c="warnInk" style={{ fontSize: 18 }}>
              {formatRub(debt, { whole: true })}
            </T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption" c="muted">
              Чистые деньги
            </T>
            <T v="num" style={{ fontSize: 18 }}>
              {formatRub(money + owed - debt, { whole: true })}
            </T>
            {owed ? (
              <T v="caption" c="muted">
                с учётом «нам должны» {formatRub(owed, { whole: true })}
              </T>
            ) : null}
          </View>
        </Card>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => router.push('/goals')}>
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <Row
            title="Цели"
            meta={
              goals.length
                ? goals
                    .map((g) => `${g.name} ${Math.round((Math.max(0, g.saved) / g.target) * 100)}%`)
                    .join(', ')
                : 'подушка, отпуск: сколько откладывать в месяц'
            }
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {goals.length ? (
                  <T v="label">
                    {formatRub(
                      goals.reduce((x, g) => x + Math.max(0, g.saved), 0),
                      { whole: true },
                    )}
                  </T>
                ) : null}
                <ChevronRightIcon color={colors.muted} />
              </View>
            }
            last
          />
        </Card>
      </Pressable>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T v="caption" style={{ color: colors.heroMuted }}>
        {label}
      </T>
      <T v="num" style={{ color: colors.heroInk, fontSize: 18 }}>
        {value}
      </T>
    </View>
  );
}

function AccountRow({
  account,
  balance,
  unsent,
  last,
}: {
  account: Account;
  balance?: AccountBalance;
  /** Неотправленные операции до снимка: банк их уже видит, таблица ещё нет. */
  unsent: number;
  last: boolean;
}) {
  const diff = (balance && bankDiff(balance, unsent)) ?? 0;
  const negative = (balance?.computed ?? 0) < 0;
  const meta = negative
    ? `так не бывает${balance?.fact !== undefined ? `, в банке ${formatRub(balance.fact, { whole: true })}` : ''}`
    : account.type === 'cash'
      ? undefined
      : balance?.fact === undefined
        ? 'нет данных из банка'
        : reconciled(diff)
          ? 'сходится с банком'
          : `разница с банком ${formatRub(Math.abs(diff), { whole: true })}`;
  return (
    <Row
      left={
        <AppIcon
          pkg={packageForAccount(account.name)}
          letter={account.name[0] ?? '?'}
          tone={accountTone(account.id)}
        />
      }
      title={account.name}
      meta={meta}
      metaTone={
        negative
          ? 'warnInk'
          : balance?.fact === undefined
            ? 'muted'
            : reconciled(diff)
              ? 'accentInk'
              : 'warnInk'
      }
      right={
        <T v="num" c={negative ? 'warnInk' : 'ink'} numberOfLines={1}>
          {formatRub(balance?.computed ?? 0, { whole: true })}
        </T>
      }
      last={last}
    />
  );
}
