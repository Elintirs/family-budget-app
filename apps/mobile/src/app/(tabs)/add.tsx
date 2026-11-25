import {
  availableOn,
  formatAmountInput,
  formatRub,
  parseRub,
  popularSubcategories,
  type Operation,
  type OperationKind,
} from '@budget/core';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { defaultAccountId, log } from '@/adapters';
import { useAuthor, useBootstrap, useHistory, useOperations, useSaveOperation } from '@/hooks/data';
import { onPicked } from '@/state/pickBus';
import { AccountRow } from '@/ui/AccountRow';
import { Card, Chip, Chips, Field, fonts, Input, PillButton, Screen, Segmented, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { WhenPicker } from '@/ui/WhenPicker';

export default function Add() {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const history = useHistory();
  // Подкатегории по популярности (таблица за 90 дней и телефон), остальные следом в порядке «Справочника».
  const subs = useMemo(() => {
    const rank = new Map(popularSubcategories({ history, popular: boot?.popular }).map(([n], i) => [n, i]));
    return (boot?.subcategories ?? [])
      .filter((s) => !s.hidden)
      .sort((a, b) => (rank.get(a.name) ?? 999) - (rank.get(b.name) ?? 999));
  }, [boot, history]);
  const save = useSaveOperation();
  const local = useOperations().data;
  const [author] = useAuthor();
  const [kind, setKind] = useState<OperationKind>('expense');
  const [amountText, setAmountText] = useState('');
  const [subcategory, setSubcategory] = useState<string>();
  const [incomeCategory, setIncomeCategory] = useState<string>();
  const [accountId, setAccountId] = useState<string | undefined>(() => defaultAccountId());
  const [toAccountId, setToAccountId] = useState<string>();
  const [comment, setComment] = useState('');
  // Пока не выбрали: «сейчас» на момент сохранения.
  const [when, setWhen] = useState<Date | null>(null);

  // «Погасить» с кредитки и «Вернули» с «Нам должны»: открывают перевод с уже выбранными счетами.
  const params = useLocalSearchParams<{
    kind?: OperationKind;
    from?: string;
    to?: string;
    /** Копейки: «Добавить пропущенное» со счёта, «Отложить» на цель. */
    amount?: string;
    comment?: string;
  }>();
  useEffect(() => {
    if (!params.kind) return;
    setKind(params.kind);
    if (params.from) setAccountId(params.from);
    if (params.to) setToAccountId(params.to);
    if (params.amount) setAmountText(formatAmountInput(String(Number(params.amount) / 100)));
    if (params.comment) setComment(params.comment);
    router.setParams({
      kind: undefined,
      from: undefined,
      to: undefined,
      amount: undefined,
      comment: undefined,
    });
  }, [params.kind, params.from, params.to, params.amount, params.comment]);

  // Ответы листов «Все категории…» и выбора счёта.
  useEffect(
    () =>
      onPicked((target, value) => {
        if (target === 'subcategory') setSubcategory(value);
        else if (target === 'to') setToAccountId(value);
        else setAccountId(value);
      }),
    [],
  );

  const amount = parseRub(amountText) ?? 0;
  const accounts = (boot?.accounts ?? []).filter((a) => !a.hidden);
  // Доступно на карте или наличных (у кредитки нет): подпись под суммой и «было → станет» у счёта.
  const available = boot ? availableOn(boot.accounts, boot.balances, local ?? [], accountId) : undefined;
  const sign = kind === 'income' ? 1 : -1;
  const after = available !== undefined ? available + sign * amount : undefined;
  const over = kind !== 'income' && available !== undefined && after !== undefined && after < 0 && amount > 0;
  const fromName = accounts.find((a) => a.id === accountId)?.name;
  const toName = accounts.find((a) => a.id === toAccountId)?.name;
  // Пять частых подкатегорий и выбранная, остальное в листе «Все категории…» (аудит 05.11, п. 3).
  const quick = subs.filter((s, i) => i < 5 || s.name === subcategory);

  const reset = () => {
    setAmountText('');
    setSubcategory(undefined);
    setIncomeCategory(undefined);
    setToAccountId(undefined);
    setComment('');
    setWhen(null);
  };

  const onSave = async () => {
    const op: Operation = {
      id: randomUUID(),
      kind,
      amount: Math.abs(amount),
      occurredAt: (when ?? new Date()).toISOString(),
      accountId,
      toAccountId: kind === 'transfer' ? toAccountId : undefined,
      subcategory: kind === 'expense' ? subcategory : undefined,
      incomeCategory: kind === 'income' ? incomeCategory : undefined,
      comment: comment.trim() || undefined,
      source: 'manual',
      author,
      status: 'new',
    };
    if (over)
      log.warn('overdraft', `${fromName} уйдёт в минус, сохранено осознанно`, {
        id: op.id,
        available,
        after,
      });
    save.mutate(op, {
      onSuccess: () => {
        reset();
        router.navigate('/');
      },
    });
  };

  return (
    <Screen
      inTabs
      footer={
        <PillButton
          title="Сохранить"
          disabled={amount <= 0 || save.isPending}
          onPress={() => void onSave()}
        />
      }
    >
      <T v="title">Новая операция</T>
      <Segmented
        label="Тип операции"
        value={kind}
        onChange={setKind}
        options={[
          { key: 'expense', title: 'Расход' },
          { key: 'income', title: 'Доход' },
          { key: 'transfer', title: 'Перевод' },
        ]}
      />
      <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 20 }}>
        <T v="label" c="muted">
          Сумма
        </T>
        {/* Знак рубля рядом с числом, как в макете: «1 355 ₽». */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <TextInput
            accessibilityLabel="Сумма, рублей"
            value={amountText}
            onChangeText={(t) => setAmountText(formatAmountInput(t))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            style={{
              fontFamily: fonts.display,
              fontSize: 44,
              color: over ? colors.warnInk : colors.ink,
              textAlign: 'right',
              minWidth: 40,
              paddingHorizontal: 0,
            }}
          />
          <T
            v="title"
            style={{
              fontFamily: fonts.display,
              fontSize: 44,
              lineHeight: 54,
              color: amountText ? (over ? colors.warnInk : colors.ink) : colors.muted,
            }}
          >
            {' ₽'}
          </T>
        </View>
        {available !== undefined && kind !== 'income' ? (
          over ? (
            // Вариант А: та же строка под суммой меняет тон и даёт выход, без отдельной плашки и окна.
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              <T v="label" c="warnInk">
                Больше остатка на {formatRub(amount - available)}
              </T>
              {kind === 'transfer' && available > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAmountText(formatAmountInput(String(available / 100)))}
                  hitSlop={8}
                >
                  <T v="label" c="accentInk" style={{ textDecorationLine: 'underline' }}>
                    Перевести всё {formatRub(available)}
                  </T>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <T v="label" c="muted">
              Доступно {formatRub(available)}
            </T>
          )
        ) : null}
        <WhenPicker value={when ?? new Date()} onChange={setWhen} />
      </Card>

      {kind === 'expense' ? (
        <Field title="Подкатегория">
          <Chips>
            {quick.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                selected={subcategory === s.name}
                onPress={() => setSubcategory(s.name)}
              />
            ))}
            {subs.length > quick.length ? (
              <Chip
                label="Все категории…"
                tone="more"
                onPress={() =>
                  router.push({ pathname: '/pick/[id]', params: { id: 'new', selected: subcategory ?? '' } })
                }
              />
            ) : null}
          </Chips>
        </Field>
      ) : null}
      {kind === 'income' ? (
        <Field title="Категория дохода">
          <Chips>
            {boot?.incomeCategories.map((c) => (
              <Chip key={c} label={c} selected={incomeCategory === c} onPress={() => setIncomeCategory(c)} />
            ))}
          </Chips>
        </Field>
      ) : null}
      {/* Счёт одной строкой с «было → станет», выбор в листе (аудит 05.11, п. 3). */}
      <AccountRow
        title={kind === 'transfer' ? 'Откуда' : 'Счёт'}
        name={fromName}
        accountId={accountId}
        hint={accountId === defaultAccountId() ? 'по умолчанию' : undefined}
        before={amount > 0 ? available : undefined}
        after={amount > 0 ? after : undefined}
        onPress={() =>
          router.push(
            `/pick-account?target=${kind === 'transfer' ? 'from' : 'account'}&selected=${encodeURIComponent(accountId ?? '')}` as Href,
          )
        }
      />
      {kind === 'transfer' ? (
        <AccountRow
          title="Куда"
          name={toName}
          accountId={toAccountId}
          onPress={() =>
            router.push(
              `/pick-account?target=to&selected=${encodeURIComponent(toAccountId ?? '')}&exclude=${encodeURIComponent(accountId ?? '')}` as Href,
            )
          }
        />
      ) : null}
      <View style={{ gap: 8 }}>
        <T v="h2" style={{ fontSize: 14 }}>
          Комментарий
        </T>
        <Input accessibilityLabel="Комментарий" value={comment} onChangeText={setComment} />
      </View>
    </Screen>
  );
}
