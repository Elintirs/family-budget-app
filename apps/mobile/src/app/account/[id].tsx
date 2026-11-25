import {
  accountMonth,
  enteredAfterSnapshot,
  formatAmountInput,
  joinAccountTags,
  splitAccountTags,
  unsentEffect,
  formatRub,
  parseRub,
  type Account,
  type AccountSettings,
  budgetNow,
  accountEffect,
} from '@budget/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, TextInput, View } from 'react-native';
import { api, defaultAccountId, log } from '@/adapters';
import { WhenPicker } from '@/ui/WhenPicker';
import {
  keys,
  useAllOperations,
  useBootstrap,
  usePullRefresh,
  useSync,
  useUpdateOperation,
} from '@/hooks/data';
import { bankDiff, humanTime, monthTitle, reconciled } from '@/state/format';
import { AppIcon, packageForAccount } from '@/ui/AppIcon';
import { ChevronRightIcon } from '@/ui/icons';
import { Card, PillButton, Row, Screen, ScreenHeader, T, fonts } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';

/** Счёт: расчёт по таблице, последний остаток из банка, статус сверки, ручной ввод остатка. */
export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const ops = useAllOperations();
  const pull = usePullRefresh();
  const acc = boot?.accounts.find((a) => a.id === id);
  const bal = boot?.balances.find((b) => b.accountId === id);
  if (!acc) {
    return (
      <Screen>
        <ScreenHeader title="Счёт" onBack={goBack} />
        <Card>
          {boot ? (
            <T v="label" c="muted">
              Счёт «{id}» не найден в таблице: его переименовали или удалили на листе «Счета».
            </T>
          ) : (
            <ActivityIndicator color={colors.muted} accessibilityLabel="Загружаем счёт" />
          )}
        </Card>
      </Screen>
    );
  }
  const credit = acc.type === 'credit';
  const diff = bal && bankDiff(bal, unsentEffect(ops, acc.id, bal.factAt));
  // После снимка были операции: сверяем с расчётом на момент снимка, его и показываем рядом.
  const afterFact =
    bal?.fact !== undefined &&
    bal.computedAtFact !== undefined &&
    Math.abs(bal.computedAtFact - bal.computed) >= 100;
  // Неотправленные и со счёта, и на счёт: перевод на кредитку тоже меняет её остаток.
  const pending = ops.filter((o) => (o.accountId === id || o.toAccountId === id) && o.status !== 'synced');
  const now = budgetNow();
  const month = accountMonth(ops, acc.id, bal?.computed ?? 0, now);
  // Последние операции по счёту, включая переводы на него: из таблицы и с телефона.
  const recent = ops
    .filter((o) => o.status === 'synced' && (o.accountId === id || o.toAccountId === id))
    .slice(0, 8);
  const monthName = monthTitle(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split(
    ' ',
  )[0];

  return (
    <Screen {...pull}>
      <ScreenHeader
        title={acc.name}
        onBack={goBack}
        right={<AppIcon pkg={packageForAccount(acc.name)} letter={acc.name[0] ?? '?'} />}
      />
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption" c="muted">
              {credit ? 'Долг по таблице' : 'По таблице'}
            </T>
            <T v="num" style={{ fontSize: 20 }}>
              {formatRub(credit ? Math.abs(bal?.computed ?? 0) : (bal?.computed ?? 0), { whole: true })}
            </T>
            <T v="caption" c="muted">
              {afterFact
                ? `сейчас; на момент снимка ${formatRub(credit ? Math.abs(bal!.computedAtFact!) : bal!.computedAtFact!, { whole: true })}`
                : 'по операциям в таблице'}
            </T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption" c="muted">
              В банке
            </T>
            <T v="num" style={{ fontSize: 20 }}>
              {bal?.fact !== undefined
                ? formatRub(credit ? Math.abs(bal.fact) : bal.fact, { whole: true })
                : '—'}
            </T>
            <T v="caption" c="muted">
              {bal?.factAt ? humanTime(bal.factAt) : 'остатка из банка ещё нет'}
            </T>
          </View>
        </View>
        <View
          style={{
            borderRadius: 14,
            padding: 12,
            backgroundColor:
              diff === undefined ? colors.fill : reconciled(diff) ? colors.accentSoft : colors.warnSoft,
          }}
        >
          <T v="body" c={diff === undefined ? 'muted' : reconciled(diff) ? 'accentSoftInk' : 'warnSoftInk'}>
            {diff === undefined
              ? 'Нет сверки'
              : reconciled(diff)
                ? '✓ Сходится с банком'
                : `Расхождение ${formatRub(diff, { sign: true, whole: true })}`}
          </T>
          {diff !== undefined && !reconciled(diff) ? (
            <T v="caption" c="warnSoftInk">
              {/* Шапка сравнивает с банком на момент снимка: операции после него в разницу не входят. */}
              {afterFact && bal?.factAt ? `Сравниваем с остатком из банка от ${humanTime(bal.factAt)}. ` : ''}
              Ниже сверка подскажет вероятную причину. Не нашлось: скорее всего, трата без счёта или не
              внесена.
            </T>
          ) : null}
        </View>
      </Card>

      <BalanceTimeline accountId={acc.id} credit={credit} />

      {/* Долг гасится переводом на этот счёт; деньги «Нам должны» возвращаются переводом с него. */}
      {credit ? (
        <PillButton
          kind="strong"
          title="Погасить"
          onPress={() =>
            router.navigate({
              pathname: '/add',
              params: { kind: 'transfer', from: defaultAccountId() ?? '', to: acc.id },
            })
          }
        />
      ) : acc.type === 'receivable' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PillButton
            kind="strong"
            size="md"
            title="Вернули"
            style={{ flex: 1 }}
            onPress={() =>
              router.navigate({
                pathname: '/add',
                params: { kind: 'transfer', from: acc.id, to: defaultAccountId() ?? '' },
              })
            }
          />
          <PillButton
            kind="secondary"
            size="md"
            title="Дали в долг"
            style={{ flex: 1 }}
            onPress={() =>
              router.navigate({
                pathname: '/add',
                params: { kind: 'transfer', from: defaultAccountId() ?? '', to: acc.id },
              })
            }
          />
        </View>
      ) : null}

      <PillButton
        kind={diff !== undefined && !reconciled(diff) ? 'strong' : 'secondary'}
        title="Сверить с банком"
        onPress={() => router.push({ pathname: '/reconcile/[id]', params: { id: acc.id } })}
      />

      {credit ? (
        <>
          <T v="h2">Долг за {(monthName ?? '').toLowerCase()}</T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <Row
              title="На начало месяца"
              right={<T v="num">{formatRub(Math.max(0, -month.start), { whole: true })}</T>}
            />
            <Row
              title="Покупки и проценты"
              meta="расходы с этой кредитки"
              right={<T v="num">{formatRub(month.expense, { sign: true, whole: true })}</T>}
            />
            <Row
              title="Погашено"
              meta="переводы на кредитку"
              right={
                <T v="num" c="accentInk">
                  {formatRub(-Math.max(0, month.transfers), { sign: true, whole: true })}
                </T>
              }
              last
            />
          </Card>
        </>
      ) : (
        <>
          <T v="h2">{monthName} по счёту</T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <Row title="На начало" right={<T v="num">{formatRub(month.start, { whole: true })}</T>} />
            <Row
              title="Приход"
              right={<T v="num">{formatRub(month.income, { sign: true, whole: true })}</T>}
            />
            <Row
              title="Уход"
              right={<T v="num">{formatRub(-month.expense, { sign: true, whole: true })}</T>}
            />
            <Row
              title="Переводы"
              right={<T v="num">{formatRub(month.transfers, { sign: true, whole: true })}</T>}
              last
            />
          </Card>
        </>
      )}

      {recent.length ? (
        <>
          <T v="h2">Последние операции</T>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            {recent.map((o, i) => {
              const title =
                o.merchant?.split(/[.,]/)[0] ?? o.comment ?? o.subcategory ?? o.incomeCategory ?? 'Перевод';
              const category = o.subcategory ?? o.incomeCategory;
              return (
                <Pressable
                  key={o.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/operation/[id]', params: { id: o.id } })}
                >
                  <Row
                    title={title}
                    meta={[category !== title ? category : undefined, o.author].filter(Boolean).join(', ')}
                    right={
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <T v="num">{formatRub(accountEffect(o, id), { sign: true })}</T>
                        <T v="caption" c="muted">
                          {humanTime(o.occurredAt)}
                        </T>
                      </View>
                    }
                    last={i === recent.length - 1}
                  />
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}

      {pending.length ? (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {pending.map((o, i) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/operation/[id]', params: { id: o.id } })}
            >
              <Row
                title={
                  o.merchant?.split(/[.,]/)[0] ??
                  o.comment ??
                  (o.kind === 'transfer' ? 'Перевод' : o.kind === 'income' ? 'Доход' : 'Трата')
                }
                meta="ещё не в таблице"
                // Знак по этому счёту: перевод со счёта минус, на счёт плюс (раньше любой перевод был с плюсом).
                right={<T v="num">{formatRub(accountEffect(o, id), { sign: true })}</T>}
                last={i === pending.length - 1}
              />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {/* Разовые настройки (карты, старт, лимит) отдельным экраном: ежедневный вид счёта стал короче. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/account-settings/[id]', params: { id: acc.id } } as never)}
      >
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          <Row
            title="Настройки счёта"
            meta="карты, остаток на старт, лимит"
            right={<ChevronRightIcon color={colors.muted} />}
            last
          />
        </Card>
      </Pressable>
    </Screen>
  );
}

/**
 * Лента сверки: снимки остатка из банка (новые сверху) и расчёт таблицы на тот же момент. Где разница
 * выросла между двумя снимками, там не хватает операции: «Добавить пропущенное» открывает трату на эту сумму.
 */
function BalanceTimeline({ accountId, credit }: { accountId: string; credit: boolean }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const ops = useAllOperations();
  const edit = useUpdateOperation();
  const sync = useSync();
  const q = useQuery({
    queryKey: ['balanceHistory', accountId],
    queryFn: () => api.balanceHistory(accountId),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const points = q.data ?? [];
  if (!points.length) return null;
  const shown = (k: number) => formatRub(credit ? Math.abs(k) : k, { whole: true });
  // Разница между снимками, которую объясняет операция, внесённая руками сразу после снимка.
  const late = enteredAfterSnapshot(points, ops, accountId);
  const moveBefore = async (opId: string, at: string) => {
    const op = ops.find((o) => o.id === opId);
    if (!op) return;
    await edit(op, { occurredAt: new Date(Date.parse(at) - 60_000).toISOString() });
    log.info('balance', 'Операция поставлена до снимка', { operation: op.id, snapshot: at });
    sync.mutate('кнопка', {
      // Сводку обновит ответ отправки (useSync), ленту сверки перечитываем.
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['balanceHistory', accountId] }),
    });
  };
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="h2">Сверка</T>
        <T v="caption" c="muted">
          снимки из банка
        </T>
      </View>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {points.map((pt, i) => {
          // Неотправленные до снимка: банк их уже видит, таблица ещё нет.
          const unsentAt = (at: string) => unsentEffect(ops, accountId, at);
          const diff = pt.fact - pt.computedAt - unsentAt(pt.at);
          const older = points[i + 1];
          // Сколько разницы появилось между прошлым снимком и этим: это и есть пропущенная операция.
          const gap = older ? diff - (older.fact - older.computedAt - unsentAt(older.at)) : 0;
          const ok = reconciled(diff);
          const moved = late.get(pt.at);
          return (
            <View key={pt.at}>
              {!reconciled(gap) && older ? (
                <View
                  style={{
                    backgroundColor: colors.warnSoft,
                    borderRadius: 14,
                    padding: 12,
                    marginVertical: 6,
                    gap: 8,
                  }}
                >
                  <T v="label" c="warnSoftInk">
                    Между {humanTime(older.at)} и {humanTime(pt.at)} {gap < 0 ? 'не хватает' : 'лишние'}{' '}
                    {formatRub(Math.abs(gap), { whole: true })}
                  </T>
                  <T v="caption" c="warnSoftInk">
                    {moved
                      ? `Похоже, «${moved.comment || moved.merchant || moved.subcategory || (moved.kind === 'transfer' ? 'перевод' : moved.kind === 'income' ? 'доход' : 'трата')}» на ${formatRub(moved.amount, { whole: true })} внесено в ${humanTime(moved.occurredAt)}, уже после снимка, а деньги прошли до него.`
                      : gap < 0
                        ? 'Банк списал больше, чем записано. Скорее всего, одна трата не поймалась.'
                        : 'В таблице больше трат, чем списал банк. Возможно, дубль или не тот счёт.'}
                  </T>
                  {moved ? (
                    <PillButton
                      kind="strong"
                      size="md"
                      title="Поставить время до снимка"
                      style={{ alignSelf: 'flex-start' }}
                      onPress={() => void moveBefore(moved.id, pt.at)}
                    />
                  ) : gap < 0 ? (
                    <PillButton
                      kind="strong"
                      size="md"
                      title="Добавить пропущенное"
                      style={{ alignSelf: 'flex-start' }}
                      onPress={() =>
                        router.navigate({
                          pathname: '/add',
                          params: { kind: 'expense', from: accountId, amount: String(Math.abs(gap)) },
                        })
                      }
                    />
                  ) : null}
                </View>
              ) : null}
              <Row
                left={
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: ok ? colors.accent : colors.warn,
                    }}
                  />
                }
                title={humanTime(pt.at)}
                meta={pt.source === 'уведомление' ? 'уведомление банка' : pt.source}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <T v="num">{shown(pt.fact)}</T>
                    <T v="caption" c={ok ? 'accentInk' : 'warnInk'}>
                      {ok ? 'сходится' : `разница ${formatRub(Math.abs(diff), { whole: true })}`}
                    </T>
                  </View>
                }
                last={i === points.length - 1}
              />
            </View>
          );
        })}
      </Card>
    </>
  );
}

/**
 * Настройки счёта в «Счетах»: маски карт и слова из уведомления (по ним пуш понимает, чей это счёт),
 * старт, кредитный лимит.
 */
export function AccountSettingsCard({ account }: { account: Account }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const credit = account.type === 'credit';
  const [masks, setMasks] = useState(
    joinAccountTags(account.cardMasks, account.markers ?? [], account.cardOwners),
  );
  const [start, setStart] = useState<Date | null>(null);
  const [startSum, setStartSum] = useState('');
  const [limit, setLimit] = useState(
    account.creditLimit ? formatAmountInput(String(account.creditLimit / 100)) : '',
  );
  const [busy, setBusy] = useState(false);
  // «*3303, счет RUB»: четыре цифры это карта, остальное слова из текста уведомления.
  const tags = splitAccountTags(masks);
  const maskList = tags.cardMasks.map((m) => m.replace('*', ''));
  const masksChanged =
    tags.cardMasks.join(',') !== account.cardMasks.map((m) => `*${m.replace('*', '')}`).join(',');
  const markersChanged = tags.markers.join(',') !== (account.markers ?? []).join(',');
  const ownersKey = (o: Record<string, string> = {}) =>
    Object.entries(o)
      .sort()
      .map(([m, n]) => `${m}=${n}`)
      .join(',');
  const ownersChanged = ownersKey(tags.owners) !== ownersKey(account.cardOwners);
  const changed =
    masksChanged ||
    markersChanged ||
    ownersChanged ||
    start !== null ||
    parseRub(startSum) !== null ||
    (credit && (parseRub(limit) ?? undefined) !== account.creditLimit);

  const save = async () => {
    const sum = parseRub(startSum);
    const lim = parseRub(limit);
    const settings: AccountSettings = {
      accountId: account.id,
      ...(masksChanged ? { cardMasks: maskList } : {}),
      ...(markersChanged ? { markers: tags.markers } : {}),
      // Убранный владелец уходит пустым именем: сервер его сотрёт.
      ...(ownersChanged
        ? {
            cardOwners: {
              ...Object.fromEntries(Object.keys(account.cardOwners ?? {}).map((m) => [m, ''])),
              ...tags.owners,
            },
          }
        : {}),
      ...(start
        ? {
            startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
          }
        : {}),
      ...(sum !== null ? (credit ? { startDebt: Math.abs(sum) } : { startBalance: sum }) : {}),
      ...(credit && lim !== null && lim !== account.creditLimit ? { creditLimit: lim } : {}),
    };
    setBusy(true);
    try {
      await api.setAccountSettings(settings);
      log.info('account', `Настройки счёта ${account.name}`, settings);
      setStart(null);
      setStartSum('');
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
    } catch (e) {
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const input = {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.control,
    paddingHorizontal: 12,
    paddingVertical: 0,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 15,
    includeFontPadding: false,
  } as const;

  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="h2">Настройки счёта</T>
        <T v="caption" c="muted">
          пишутся в «Счета»
        </T>
      </View>
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 6 }}>
          <T v="body">Карты и слова из уведомления</T>
          <TextInput
            accessibilityLabel="Маски карт и слова из уведомления"
            value={masks}
            onChangeText={setMasks}
            autoCapitalize="none"
            placeholder="1101 Олег, 3303 Елена, счет RUB"
            placeholderTextColor={colors.muted}
            style={input}
          />
          <T v="caption" c="muted">
            через запятую: последние 4 цифры карт и слова, которые банк пишет про этот счёт без карты («счет
            RUB»). По ним пуш понимает, что это этот счёт. Имя после карты: чья она, покупку этой картой
            отправит телефон владельца
          </T>
        </View>
        <View style={{ gap: 6 }}>
          <T v="body">{credit ? 'Долг на старт' : 'Остаток на старт'}</T>
          <TextInput
            accessibilityLabel={credit ? 'Долг на старт' : 'Остаток на старт'}
            value={startSum}
            onChangeText={(t) => setStartSum(formatAmountInput(t))}
            keyboardType="decimal-pad"
            placeholder="не меняем"
            placeholderTextColor={colors.muted}
            style={input}
          />
          <WhenPicker
            variant="row"
            title="Дата старта"
            value={start ?? new Date()}
            emptyLabel={start ? undefined : 'не меняем'}
            onChange={setStart}
          />
          <T v="caption" c="muted">
            с какого дня считать остаток по операциям; остаток на старт на конец этого дня
          </T>
        </View>
        {credit ? (
          <View style={{ gap: 6 }}>
            <T v="body">Кредитный лимит</T>
            <TextInput
              accessibilityLabel="Кредитный лимит"
              value={limit}
              onChangeText={(t) => setLimit(formatAmountInput(t))}
              keyboardType="decimal-pad"
              placeholder="200 000"
              placeholderTextColor={colors.muted}
              style={input}
            />
          </View>
        ) : null}
        <PillButton
          size="md"
          title="Сохранить в таблицу"
          disabled={!changed}
          loading={busy}
          onPress={() => void save()}
        />
      </Card>
    </>
  );
}
