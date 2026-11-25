import {
  accountEffect,
  adjustmentAccount,
  adjustmentOperation,
  explainGap,
  formatAmountInput,
  formatRub,
  parseRub,
  type Bootstrap,
} from '@budget/core';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { log } from '@/adapters';
import { useQueryClient } from '@tanstack/react-query';
import { queueFact } from '@/adapters/notifications';
import {
  keys,
  useAllOperations,
  useAuthor,
  useBootstrap,
  useSaveOperation,
  useSending,
  useSync,
} from '@/hooks/data';
import { humanTime, reconciled } from '@/state/format';
import { goBack } from '@/state/nav';
import { Card, PillButton, Screen, ScreenHeader, T, fonts } from '@/ui/kit';
import { radius, useTheme } from '@/ui/theme';

/**
 * Сверка счёта: остаток из банка против таблицы с неотправленными, подсказки, что могло потеряться,
 * и поправка на служебный счёт «Поправки», если причина не нашлась.
 */
export default function ReconcileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const ops = useAllOperations();
  const save = useSaveOperation();
  const sync = useSync();
  const qc = useQueryClient();
  const busy = useSending();
  const [author] = useAuthor();
  const [text, setText] = useState('');
  const acc = boot?.accounts.find((a) => a.id === id);
  const bal = boot?.balances.find((b) => b.accountId === id);
  if (!acc || !boot) {
    return (
      <Screen>
        <ScreenHeader title="Сверка" onBack={goBack} />
      </Screen>
    );
  }
  const credit = acc.type === 'credit';
  const adj = adjustmentAccount(boot.accounts);
  // Таблица плюс то, что ещё на телефоне: иначе неотправленная покупка выглядит как расхождение.
  const unsent = ops.filter((o) => o.status !== 'synced').reduce((s, o) => s + accountEffect(o, acc.id), 0);
  const table = (bal?.computed ?? 0) + unsent;
  const input = parseRub(text);
  // Для кредитки вводится долг: в остатке это минус.
  const bank = input === null ? null : credit ? -Math.abs(input) : input;
  const gap = bank === null ? null : bank - table;
  const hints = gap === null || reconciled(gap) ? null : explainGap(ops, acc.id, gap);
  const shown = (v: number) => formatRub(credit ? Math.abs(v) : v);

  const sendFact = () => {
    if (bank === null) return;
    queueFact({
      accountId: acc.id,
      at: new Date().toISOString(),
      source: 'manual',
      ...(credit && acc.creditLimit !== undefined
        ? { available: acc.creditLimit + bank }
        : { balance: bank }),
    });
  };
  // Не ждём таблицу: остаток и поправка сразу видны на телефоне, отправка идёт сама (до Google бывает
  // 20–30 с без VPN). Не дошло: всё в очереди и уйдёт со следующей отправкой, в том числе фоновой.
  const send = (move: number) => {
    const at = new Date().toISOString();
    qc.setQueryData<Bootstrap>(
      keys.bootstrap,
      (b) =>
        b && {
          ...b,
          balances: b.balances.map((x) =>
            x.accountId === acc.id
              ? {
                  ...x,
                  computed: x.computed + move,
                  computedAtFact: x.computed + move,
                  fact: bank!,
                  factAt: at,
                }
              : adj && x.accountId === adj.id
                ? { ...x, computed: x.computed - move }
                : x,
          ),
        },
    );
    sync.mutate('кнопка');
    goBack();
  };

  const onlyFact = () => {
    sendFact();
    log.info('balance', `Остаток вручную: ${acc.name} ${formatRub(bank ?? 0)}`);
    send(0);
  };
  const writeAdjustment = async () => {
    if (gap === null || !adj) return;
    const now = new Date();
    const day = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    await save.mutateAsync(
      adjustmentOperation({
        id: randomUUID(),
        accountId: acc.id,
        adjustmentId: adj.id,
        gap,
        at: now.toISOString(),
        author,
        comment: `Поправка по сверке ${day}: в банке ${formatRub(bank!)}`,
      }),
    );
    sendFact();
    log.info('balance', `Поправка по сверке: ${acc.name} ${formatRub(gap, { sign: true })}`);
    send(gap);
  };

  return (
    <Screen>
      <ScreenHeader title="Сверка" onBack={goBack} />
      <T v="label" c="muted">
        {acc.name}
      </T>

      <Card style={{ gap: 10 }}>
        <T v="body">{credit ? 'Сколько сейчас должен банку' : 'Сколько сейчас в банке'}</T>
        <T v="caption" c="muted">
          Посмотри в приложении банка и введи как есть, с копейками
        </T>
        <TextInput
          accessibilityLabel="Остаток из банка"
          value={text}
          onChangeText={(t) => setText(formatAmountInput(t))}
          keyboardType="decimal-pad"
          placeholder={credit ? 'Долг' : 'Остаток'}
          placeholderTextColor={colors.muted}
          autoFocus
          style={{
            height: 56,
            borderRadius: radius.input,
            borderWidth: 1.5,
            borderColor: colors.accent,
            paddingHorizontal: 16,
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 24,
          }}
        />
        {bal?.fact !== undefined && bal.factAt ? (
          <T v="caption" c="muted">
            Последний остаток из банка: {shown(bal.fact)}, {humanTime(bal.factAt)}
          </T>
        ) : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption" c="muted">
              По таблице
            </T>
            <T v="num" style={{ fontSize: 20 }}>
              {shown(table)}
            </T>
            {unsent ? (
              <T v="caption" c="muted">
                с неотправленными {formatRub(unsent, { sign: true })}
              </T>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="caption" c="muted">
              В банке
            </T>
            <T v="num" style={{ fontSize: 20 }}>
              {bank === null ? '—' : shown(bank)}
            </T>
          </View>
        </View>
        {gap !== null ? (
          <View
            style={{
              borderRadius: 14,
              padding: 12,
              backgroundColor: reconciled(gap) ? colors.accentSoft : colors.warnSoft,
            }}
          >
            <T v="body" c={reconciled(gap) ? 'accentSoftInk' : 'warnSoftInk'}>
              {reconciled(gap)
                ? '✓ Сходится с банком'
                : `В банке ${gap > 0 ? 'больше' : 'меньше'} на ${formatRub(Math.abs(gap))}`}
            </T>
          </View>
        ) : null}
      </Card>

      {hints && (hints.inbox.length || hints.reversed) ? (
        <>
          <T v="h2">Что могло не попасть в таблицу</T>
          {hints.inbox.length ? (
            <Card style={{ gap: 8 }}>
              <T v="body">
                Во входящих {hints.inbox.length} без категории на {formatRub(Math.abs(hints.inboxEffect))}
              </T>
              <T v="caption" c="muted">
                Пока они не разобраны, остаток расходится с банком. Разбери их, и разница уменьшится.
              </T>
              <PillButton
                kind="secondary"
                size="md"
                title="Разобрать"
                onPress={() => router.navigate('/inbox')}
              />
            </Card>
          ) : null}
          {hints.reversed ? (
            <Card style={{ gap: 8 }}>
              <T v="body">Похоже на перевод в обратную сторону</T>
              <T v="caption" c="muted">
                {formatRub(hints.reversed.amount)} от {humanTime(hints.reversed.occurredAt)}
                {hints.reversed.comment ? ` «${hints.reversed.comment}»` : ''}: если поменять «Откуда» и
                «Куда», разница закроется.
              </T>
              <PillButton
                kind="secondary"
                size="md"
                title="Открыть перевод"
                onPress={() =>
                  router.push({ pathname: '/operation/[id]', params: { id: hints.reversed!.id } })
                }
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {gap !== null && !reconciled(gap) ? (
        <Card tone="fill" style={{ gap: 10 }}>
          <T v="body">Не нашлось? Запиши поправку</T>
          <T v="caption" c="muted">
            Поправка подгоняет остаток под банк. В расходы, доходы и лимиты она не попадает, в истории видна с
            пометкой «Поправка», и её можно удалить, если пропажа найдётся.
          </T>
          {adj ? (
            <PillButton
              kind="strong"
              title={`Записать поправку ${formatRub(gap, { sign: true })}`}
              loading={busy || save.isPending}
              onPress={() => void writeAdjustment()}
            />
          ) : (
            <T v="caption" c="warnInk">
              В таблице нет служебного счёта «Поправки»: заведи его в «Счетах» с типом «Служебный».
            </T>
          )}
        </Card>
      ) : null}

      <PillButton
        kind="secondary"
        title={busy ? 'Отправляем…' : 'Только сохранить остаток'}
        disabled={bank === null}
        loading={busy}
        onPress={onlyFact}
      />
      <T v="caption" c="muted" style={{ textAlign: 'center' }}>
        Остаток уйдёт в «Снимки балансов», расхождение останется видно на счёте
      </T>
    </Screen>
  );
}
