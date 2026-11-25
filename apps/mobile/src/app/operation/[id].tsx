import {
  formatAmountInput,
  formatRub,
  isAdjustment,
  isOneOff,
  parseRub,
  type Operation,
  type OperationKind,
} from '@budget/core';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { api, log } from '@/adapters';
import { notificationsFor } from '@/adapters/notifications';
import {
  keys,
  useAllOperations,
  useAuthor,
  useBootstrap,
  useEdits,
  useOperations,
  useRules,
  useTableOperations,
  useOverdraftGuard,
  useSaveOperation,
  useUpdateOperation,
} from '@/hooks/data';
import { humanTime, shortMerchant } from '@/state/format';
import { WhenPicker } from '@/ui/WhenPicker';
import { AppIcon, MIR_PAY, packageForAccount } from '@/ui/AppIcon';
import {
  Card,
  Chip,
  Chips,
  fonts,
  Input,
  PillButton,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  T,
  Toggle,
} from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';
import { onPicked } from '@/state/pickBus';
import { AccountRow } from '@/ui/AccountRow';

/** Карточка операции: правка подкатегории, счёта, комментария; правило; разделение; удаление; исходный пуш. */
export default function OperationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const ops = useAllOperations();
  const boot = useBootstrap().data;
  const edit = useUpdateOperation();
  const guard = useOverdraftGuard();
  const pendingEdit = (useEdits().data ?? []).some((e) => e.id === id);
  const { rules, save: saveRule } = useRules();
  const [author] = useAuthor();
  const op = ops.find((o) => o.id === id);
  // Пока операции телефона и зеркало таблицы грузятся, «не найдена» показывать рано.
  const loading = useOperations().isLoading || useTableOperations().isLoading;
  const [comment, setComment] = useState(op?.comment ?? '');
  // Операция могла загрузиться после первого рендера: поле берёт её комментарий, пока человек не начал печатать.
  // Иначе пустое поле и уход с экрана отправляли «комментарий стёрт».
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setComment(op?.comment ?? '');
  }, [op?.id, op?.comment]);
  // Правка суммы: null, пока не нажали на сумму.
  const [amountText, setAmountText] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [kindDraft, setKindDraft] = useState<OperationKind>();
  const [incomingDraft, setIncomingDraft] = useState<boolean | null>(null);
  // Ответ листа выбора счёта. Подписка до раннего выхода (правило хуков), обработчик со свежей операцией ниже.
  const onPick = useRef<(target: string, value: string) => void>(undefined);
  useEffect(() => onPicked((t, v) => onPick.current?.(t, v)), []);

  if (!op) {
    return (
      <Screen>
        <ScreenHeader title="Операция" onBack={goBack} />
        <Card>
          {loading ? (
            <ActivityIndicator color={colors.muted} accessibilityLabel="Загружаем операцию" />
          ) : (
            <T v="label" c="muted">
              Операция не найдена: её удалили или она старше двух месяцев.
            </T>
          )}
        </Card>
      </Screen>
    );
  }

  const account = boot?.accounts.find((a) => a.id === op.accountId);
  const synced = op.status === 'synced';
  // Поправка по сверке: тип и счета не правятся, только комментарий и удаление.
  const fix = isAdjustment(op, boot?.accounts ?? []);
  const sign = op.kind === 'expense' ? -1 : op.kind === 'income' ? 1 : 0;
  const pushes = notificationsFor(op.id);
  const hasRule = rules.some(
    (r) =>
      r.subcategory === op.subcategory &&
      shortMerchant(op.merchant).toLowerCase().startsWith(r.pattern.toLowerCase()),
  );
  // Карта или наличные уходят в минус: спросить перед правкой (обычно не тот счёт или направление).
  const update = (patch: Partial<Operation>) =>
    void guard(op, { ...op, ...patch }).then((ok) => {
      if (ok) void edit(op, patch);
    });
  // Перевод записываем только когда выбрано «Куда»: без второго счёта строка в таблице потеряла бы деньги.
  const shown: OperationKind = kindDraft ?? op.kind;
  // Доход в перевод (журнал Елены 29.10: «Пополнение, счет RUB, Олег Д.» +49 334): деньги пришли на счёт
  // операции, второй счёт это «Откуда», а не «Куда». Раньше счёт пуша оставался «Откуда», и перевод
  // записывался в обратную сторону.
  const incoming = (incomingDraft ?? op.kind === 'income') && shown === 'transfer';
  /** Счёт, на который пришли деньги: до выбора это счёт дохода, после него «Куда» перевода. */
  const landed = op.kind === 'transfer' ? op.toAccountId : op.accountId;
  const accName = (accId?: string) => boot?.accounts.find((a) => a.id === accId)?.name;
  const pickAccount = (target: string, title: string, selected?: string, exclude?: string) =>
    router.push(
      `/pick-account?target=${target}&title=${encodeURIComponent(title)}&selected=${encodeURIComponent(selected ?? '')}&exclude=${encodeURIComponent(exclude ?? '')}` as Href,
    );
  onPick.current = (target, value) => {
    if (target === 'op:account')
      update(incoming && op.kind === 'transfer' ? { toAccountId: value } : { accountId: value });
    else if (target === 'op:other')
      update(
        incoming
          ? { kind: 'transfer', accountId: value, toAccountId: landed, subcategory: '', incomeCategory: '' }
          : { kind: 'transfer', toAccountId: value, subcategory: '', incomeCategory: '' },
      );
  };
  const changeKind = (k: OperationKind) => {
    if (k === 'transfer' && op.kind === 'income') setIncomingDraft(true);
    setKindDraft(k);
    if (k === op.kind || k === 'transfer') return;
    update({
      kind: k,
      subcategory: k === 'expense' ? (op.subcategory ?? '') : '',
      incomeCategory: k === 'income' ? (op.incomeCategory ?? '') : '',
      toAccountId: '',
    });
  };

  const remove = () =>
    Alert.alert(
      'Удалить операцию?',
      synced
        ? 'Строка удалится из таблицы при следующей отправке, остатки пересчитаются.'
        : 'Она ещё не отправлена в таблицу.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => void edit(op, {}, { deleted: true }).then(goBack),
        },
      ],
    );

  return (
    <Screen>
      <ScreenHeader title="Операция" onBack={goBack} />
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
        <AppIcon
          pkg={op.sourceApp ?? packageForAccount(account?.name)}
          badgePkg={op.alsoFrom?.includes(MIR_PAY) ? MIR_PAY : undefined}
          letter={account?.name[0] ?? '?'}
          size={48}
        />
        <T v="body" style={{ textAlign: 'center' }}>
          {op.merchant ??
            op.comment ??
            (op.kind === 'income' ? 'Доход' : op.kind === 'transfer' ? 'Перевод' : 'Покупка')}
        </T>
        {amountText === null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Изменить сумму"
            onPress={() => setAmountText(formatAmountInput(String(op.amount / 100)))}
          >
            <T v="amount" c={sign > 0 ? 'accentInk' : 'ink'}>
              {sign ? formatRub(sign * op.amount, { sign: true }) : formatRub(op.amount)}
            </T>
            <T v="caption" c="muted" style={{ textAlign: 'center' }}>
              нажми, чтобы изменить сумму
            </T>
          </Pressable>
        ) : (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <TextInput
              accessibilityLabel="Сумма"
              value={amountText}
              onChangeText={(t) => setAmountText(formatAmountInput(t))}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
              style={{
                fontFamily: fonts.display,
                fontSize: 36,
                color: colors.ink,
                textAlign: 'center',
                minWidth: 180,
                borderBottomWidth: 2,
                borderBottomColor: colors.accent,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PillButton kind="ghost" size="md" title="Отмена" onPress={() => setAmountText(null)} />
              <PillButton
                size="md"
                title="Сохранить сумму"
                disabled={!parseRub(amountText) || parseRub(amountText) === op.amount}
                onPress={() => {
                  const v = parseRub(amountText);
                  if (v && v > 0) update({ amount: Math.abs(v) });
                  setAmountText(null);
                }}
              />
            </View>
          </View>
        )}
        <T v="caption" c="muted">
          {/* Время есть в строке «Время» ниже, здесь только статус. */}
          {pendingEdit
            ? 'правка ждёт отправки'
            : synced
              ? 'в таблице'
              : op.status === 'ready'
                ? 'ждёт отправки'
                : 'нужна категория'}
        </T>
      </View>

      {fix ? (
        <Card tone="fill" style={{ gap: 6 }}>
          <T v="body">Поправка по сверке</T>
          <T v="caption" c="muted">
            Подгоняет остаток счёта под банк. В расходы, доходы и лимиты не попадает. Если пропажа нашлась,
            удали поправку.
          </T>
        </Card>
      ) : (
        <>
          <Segmented<OperationKind>
            label="Тип операции"
            value={shown}
            onChange={changeKind}
            options={[
              { key: 'expense', title: 'Расход' },
              { key: 'income', title: 'Доход' },
              { key: 'transfer', title: 'Перевод' },
            ]}
          />

          {shown === 'expense' ? (
            <Card>
              <T v="body">Подкатегория</T>
              <Chips>
                {op.subcategory ? <Chip label={op.subcategory} selected /> : null}
                <Chip
                  label={op.subcategory ? 'Изменить…' : 'Выбрать…'}
                  tone="more"
                  onPress={() => router.push({ pathname: '/pick/[id]', params: { id: op.id } })}
                />
              </Chips>
              {op.subcategory && op.merchant && !hasRule ? (
                <PillButton
                  kind="secondary"
                  size="md"
                  title={`Всегда так для ${shortMerchant(op.merchant)}`}
                  onPress={() =>
                    saveRule({ pattern: shortMerchant(op.merchant), subcategory: op.subcategory!, author })
                  }
                />
              ) : null}
            </Card>
          ) : null}
          {shown === 'expense' && op.kind === 'expense' ? (
            <OneOffCard op={op} onChange={(oneOff) => update({ oneOff })} />
          ) : shown === 'income' ? (
            <Card>
              <T v="body">Категория дохода</T>
              <Chips>
                {(boot?.incomeCategories ?? []).map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    selected={op.incomeCategory === c}
                    onPress={() => update({ incomeCategory: c })}
                  />
                ))}
              </Chips>
            </Card>
          ) : null}

          {/* Перевод: сначала откуда, потом куда (для прихода «Откуда» это второй счёт). */}
          {shown === 'transfer' && incoming ? (
            <AccountRow
              title={incoming ? 'Откуда' : 'Куда'}
              name={accName(op.kind === 'transfer' ? (incoming ? op.accountId : op.toAccountId) : undefined)}
              accountId={op.kind === 'transfer' ? (incoming ? op.accountId : op.toAccountId) : undefined}
              onPress={() =>
                pickAccount(
                  'op:other',
                  incoming ? 'Откуда пришли' : 'Куда',
                  op.kind === 'transfer' ? (incoming ? op.accountId : op.toAccountId) : undefined,
                  incoming ? landed : op.accountId,
                )
              }
            />
          ) : null}
          {/* Счёт одной строкой с выбором в листе, как в «Новой операции». */}
          <AccountRow
            title={shown === 'transfer' ? (incoming ? 'Куда пришли' : 'Откуда') : 'Счёт'}
            name={accName(incoming ? landed : op.accountId)}
            accountId={incoming ? landed : op.accountId}
            onPress={() =>
              pickAccount(
                'op:account',
                shown === 'transfer' ? (incoming ? 'Куда пришли' : 'Откуда') : 'Счёт',
                incoming ? landed : op.accountId,
              )
            }
          />
          {shown === 'transfer' && !incoming ? (
            <AccountRow
              title={incoming ? 'Откуда' : 'Куда'}
              name={accName(op.kind === 'transfer' ? (incoming ? op.accountId : op.toAccountId) : undefined)}
              accountId={op.kind === 'transfer' ? (incoming ? op.accountId : op.toAccountId) : undefined}
              onPress={() =>
                pickAccount(
                  'op:other',
                  incoming ? 'Откуда пришли' : 'Куда',
                  op.kind === 'transfer' ? (incoming ? op.accountId : op.toAccountId) : undefined,
                  incoming ? landed : op.accountId,
                )
              }
            />
          ) : null}
        </>
      )}

      <Card style={{ gap: 8 }}>
        <T v="body">Комментарий</T>
        <Input
          accessibilityLabel="Комментарий"
          value={comment}
          onChangeText={(t) => {
            touched.current = true;
            setComment(t);
          }}
          onEndEditing={() =>
            touched.current &&
            comment !== (op.comment ?? '') &&
            update({ comment: comment.trim() || undefined })
          }
          placeholder="Например: подарок маме"
        />
      </Card>

      {op.kind === 'expense' && !synced ? (
        splitting ? (
          <SplitEditor op={op} onDone={() => setSplitting(false)} />
        ) : (
          <PillButton kind="secondary" title="Разделить покупку" onPress={() => setSplitting(true)} />
        )
      ) : null}

      {pushes.length ? (
        <Card tone="fill" style={{ gap: 8 }}>
          {pushes.map((p, i) => (
            <View key={i} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <T v="caption" c="muted" style={{ flexShrink: 1 }}>
                  Уведомление {p.appLabel}
                </T>
                <T v="caption" c="muted">
                  {humanTime(new Date(p.postedAt).toISOString())}
                </T>
              </View>
              <T v="label" style={{ fontFamily: fonts.semibold }}>
                {[p.title, p.text].filter(Boolean).join('\n')}
              </T>
            </View>
          ))}
        </Card>
      ) : null}

      {!pushes.length && op.sourceText ? (
        <Card tone="fill" style={{ gap: 4 }}>
          <T v="caption" c="muted">
            Уведомление
          </T>
          <T v="label" style={{ fontFamily: fonts.semibold }}>
            {op.sourceText.replace(/\n---\n/g, '\n\n')}
          </T>
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <WhenPicker
          variant="row"
          value={new Date(op.occurredAt)}
          onChange={(d) => update({ occurredAt: d.toISOString() })}
        />
        <Row title="Автор" right={<T v="label">{op.author}</T>} />
        <Row
          title="Источник"
          right={
            <T v="label">
              {op.source === 'notification' ? 'уведомление' : op.source === 'manual' ? 'вручную' : 'форма'}
            </T>
          }
          last={!op.cardMask}
        />
        {op.cardMask ? <Row title="Карта" right={<T v="label">{op.cardMask}</T>} last /> : null}
      </Card>

      <PillButton kind="danger" title="Удалить операцию" onPress={remove} />
    </Screen>
  );
}

/** Разделение покупки на части: одна строка «Формы» на часть, общий splitGroupId. */
function SplitEditor({ op, onDone }: { op: Operation; onDone: () => void }) {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const save = useSaveOperation();
  const [parts, setParts] = useState<{ subcategory?: string; text: string }[]>([
    { subcategory: op.subcategory, text: String(op.amount / 100) },
    { text: '' },
  ]);
  const amounts = parts.map((p) => parseRub(p.text) ?? 0);
  const rest = op.amount - amounts.reduce((s, a) => s + a, 0);
  const valid = rest === 0 && parts.every((p, i) => p.subcategory && amounts[i]! > 0) && parts.length > 1;

  const [busy, setBusy] = useState(false);
  const apply = async () => {
    // Двойное нажатие давало вторую пару частей.
    if (busy) return;
    setBusy(true);
    const group = op.splitGroupId ?? randomUUID();
    // Сначала новые части, исходная покупка последней: оборвалось посередине, и исходная сумма цела.
    const ordered = [...parts.entries()].sort(([a], [b]) => (a === 0 ? 1 : 0) - (b === 0 ? 1 : 0));
    try {
      for (const [i, p] of ordered) {
        const part: Operation =
          i === 0
            ? { ...op, amount: amounts[i]!, subcategory: p.subcategory, splitGroupId: group }
            : {
                ...op,
                id: randomUUID(),
                amount: amounts[i]!,
                subcategory: p.subcategory,
                splitGroupId: group,
                alsoFrom: undefined,
              };
        await save.mutateAsync(part);
      }
      onDone();
    } catch (e) {
      Alert.alert('Не разделилось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <T v="body">Разделить покупку</T>
      {parts.map((p, i) => (
        <View
          key={i}
          style={{ gap: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}
        >
          {/* Одна строка категорий, листается вбок: полная сетка под каждой частью делала экран длинным. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(boot?.subcategories ?? [])
              .filter((s) => !s.hidden)
              .map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={p.subcategory === s.name}
                  onPress={() => setParts(parts.map((x, j) => (j === i ? { ...x, subcategory: s.name } : x)))}
                />
              ))}
          </ScrollView>
          <Input
            accessibilityLabel={`Сумма части ${i + 1}`}
            value={p.text}
            onChangeText={(t) =>
              setParts(parts.map((x, j) => (j === i ? { ...x, text: formatAmountInput(t) } : x)))
            }
            keyboardType="decimal-pad"
            placeholder="Сумма, ₽"
            number
          />
        </View>
      ))}
      <T v="label" c={rest === 0 ? 'accentInk' : 'warnInk'}>
        Осталось распределить: {formatRub(rest)}
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PillButton
          kind="secondary"
          size="md"
          title="+ Ещё часть"
          onPress={() => setParts([...parts, { text: '' }])}
        />
        <PillButton kind="ghost" size="md" title="Отмена" onPress={onDone} />
      </View>
      {/* Главное действие во всю ширину, как везде (было маленькой кнопкой слева). */}
      <PillButton
        title={`Сохранить ${parts.length} ${parts.length < 5 ? 'части' : 'частей'}`}
        disabled={!valid}
        loading={busy}
        onPress={() => void apply()}
      />
    </Card>
  );
}

/** Единовременный расход: в аналитике отдельно от регулярных, по умолчанию как у подкатегории. */
function OneOffCard({ op, onChange }: { op: Operation; onChange: (oneOff: boolean) => void }) {
  const boot = useBootstrap().data;
  const qc = useQueryClient();
  const sub = boot?.subcategories.find((s) => s.name === op.subcategory);
  const value = isOneOff(op, boot?.subcategories ?? []);
  const [busy, setBusy] = useState(false);
  const toggleDefault = async () => {
    if (!sub || busy) return;
    setBusy(true);
    try {
      await api.setSubcategoryOneOff(sub.name, !sub.oneOff);
      log.info('subcategories', `${sub.name}: единовременная ${!sub.oneOff ? 'да' : 'нет'}`);
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
    } catch (e) {
      // Без сети запрос падал необработанным исключением.
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Toggle
        title="Единовременный расход"
        caption="Крупная трата не каждый месяц: ремонт, штраф, техника"
        value={value}
        onChange={onChange}
      />
      <T v="caption" c="muted">
        В аналитике идёт в «Единовременные расходы» и не завышает регулярные траты и прогноз. В лимит месяца и
        остатки входит как обычно.
      </T>
      {sub && value !== !!sub.oneOff ? (
        <PillButton
          kind="secondary"
          size="md"
          title={value ? `Всегда так для «${sub.name}»` : `Для «${sub.name}» не по умолчанию`}
          onPress={() => void toggleDefault()}
        />
      ) : null}
    </Card>
  );
}
