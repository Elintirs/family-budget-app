import {
  formatRub,
  merchantKey,
  ruleFor,
  shouldProposeRule,
  suggestCategories,
  unknownCardMask,
  type Operation,
} from '@budget/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, kv, log } from '@/adapters';
import { operationForCaptured } from '@/adapters/notifications';
import {
  keys,
  useAuthor,
  useBootstrap,
  useHistory,
  usePending,
  useRules,
  useSaveOperation,
  useSending,
  useSync,
} from '@/hooks/data';
import { humanTime, shortMerchant } from '@/state/format';
import { AppIcon, MIR_PAY, packageForAccount } from '@/ui/AppIcon';
import { CheckIcon } from '@/ui/icons';
import { Card, Chip, Chips, PillButton, Screen, T } from '@/ui/kit';
import { SwipeRow } from '@/ui/swipe';
import { useTheme } from '@/ui/theme';

const KIND_TITLE = { expense: 'Покупка', income: 'Доход', transfer: 'Перевод' } as const;
// Уведомление не подписываем: это обычный путь во «Входящие», подпись только у ручных и из формы.
const SOURCE = { manual: 'вручную', notification: undefined, form: 'из формы' } as const;

export default function Inbox() {
  const { pending, ready, incomplete, edits } = usePending();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = filter === 'all' ? pending : filter === 'new' ? incomplete : ready;
  const waiting = ready.length + edits.length;
  const { colors } = useTheme();
  const save = useSaveOperation();
  // Удаление свайпом: несколько секунд можно вернуть.
  const [undo, setUndo] = useState<Operation | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);
  const remove = (op: Operation) => {
    log.info('choice', 'Удалено свайпом', {
      operation: op.id,
      merchant: op.merchant ?? null,
      amount: op.amount,
    });
    save.mutate({ ...op, deleted: true });
    setUndo(op);
  };
  // «Все категории…» в уведомлении: budget://inbox?pick=<id уведомления> сразу открывает выбор категории.
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  useEffect(() => {
    if (!pick) return;
    // Уведомление могло ещё не разобраться: ждём, пока появится операция (эффект перезапустится).
    const id = operationForCaptured(pick);
    if (!id) return;
    log.info('choice', 'Все категории из уведомления', { captured: pick, operation: id });
    router.setParams({ pick: undefined });
    router.push({ pathname: '/pick/[id]', params: { id } });
  }, [pick, pending.length]);
  const sync = useSync();
  const sending = useSending();

  const footer = (
    <PillButton
      title={sending ? 'Отправляем в таблицу…' : `Отправить в таблицу · ${waiting}`}
      disabled={!waiting}
      loading={sending}
      onPress={() => sync.mutate('кнопка', { onSettled: () => router.push('/sync-result') })}
    />
  );

  return (
    <Screen
      inTabs
      footer={
        undo || waiting ? (
          <View style={{ gap: 10 }}>
            {undo ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: colors.strong,
                  borderRadius: 18,
                  paddingLeft: 18,
                  paddingRight: 6,
                  paddingVertical: 6,
                }}
              >
                <T v="label" style={{ color: colors.onStrong, flex: 1 }} numberOfLines={1}>
                  Удалено: {shortMerchant(undo.merchant) || formatRub(undo.amount, { whole: true })}
                </T>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{ height: 44, paddingHorizontal: 16, justifyContent: 'center' }}
                  onPress={() => {
                    log.info('choice', 'Удаление отменено', { operation: undo.id });
                    save.mutate({ ...undo, deleted: false });
                    setUndo(null);
                  }}
                >
                  <T v="label" style={{ color: colors.heroAccent }}>
                    Вернуть
                  </T>
                </Pressable>
              </View>
            ) : null}
            {/* Нечего отправлять: кнопку не показываем (блёклая «· 0» только мешала). */}
            {waiting ? footer : null}
          </View>
        ) : undefined
      }
    >
      <View style={{ gap: 2 }}>
        <T v="title">Входящие</T>
        <T v="bodyRegular" c="muted">
          из уведомлений банков и вручную
        </T>
      </View>
      {pending.length ? (
        <>
          {/* Фильтры как в макете: разобрать сначала то, что без категории. */}
          <Chips>
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                label={`${f.title} ${f.key === 'all' ? pending.length : f.key === 'new' ? incomplete.length : ready.length}`}
                selected={filter === f.key}
                onPress={() => setFilter(f.key)}
              />
            ))}
          </Chips>
        </>
      ) : null}
      {pending.length ? (
        shown.length ? (
          shown.map((op) => <OperationCard key={op.id} op={op} onDelete={remove} />)
        ) : (
          <T v="label" c="muted">
            {filter === 'new' ? 'Всё размечено.' : 'Готовых к отправке нет.'}
          </T>
        )
      ) : (
        <Empty />
      )}
    </Screen>
  );
}

type Filter = 'all' | 'new' | 'ready';
const FILTERS: { key: Filter; title: string }[] = [
  { key: 'all', title: 'Все' },
  { key: 'new', title: 'Без категории' },
  { key: 'ready', title: 'Готовы' },
];

function OperationCard({ op, onDelete }: { op: Operation; onDelete: (op: Operation) => void }) {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const save = useSaveOperation();
  const history = useHistory();
  const { rules, save: saveRule } = useRules();
  const [author] = useAuthor();
  const [dismissed, setDismissed] = useState(() =>
    (kv.getJson<string[]>('rules.dismissed') ?? []).includes(op.id),
  );
  const account = boot?.accounts.find((a) => a.id === op.accountId);
  const known = boot?.subcategories.filter((s) => !s.hidden).map((s) => s.name) ?? [];
  const sign = op.kind === 'expense' ? -1 : op.kind === 'income' ? 1 : 0;

  const rule = op.kind === 'expense' ? ruleFor(op.merchant, rules) : undefined;
  const byRule = Boolean(rule?.subcategory && rule.subcategory === op.subcategory);
  const suggestions =
    op.kind === 'expense' ? suggestCategories(op, { rules, history, known, popular: boot?.popular }) : [];
  const propose = !dismissed && !byRule && shouldProposeRule(op, history, rules) && merchantKey(op.merchant);

  const pick = (name: string) => {
    const at = suggestions.findIndex((s) => s.subcategory === name);
    log.info('choice', `Входящие: ${name}`, {
      operation: op.id,
      merchant: op.merchant ?? null,
      amount: op.amount,
      before: op.kind === 'expense' ? (op.subcategory ?? null) : (op.incomeCategory ?? null),
      position: at >= 0 ? at + 1 : null,
      reason: at >= 0 ? suggestions[at]!.reason : 'выбрано ранее',
      shown: suggestions.map((s) => `${s.subcategory} (${s.reason})`),
    });
    save.mutate(op.kind === 'expense' ? { ...op, subcategory: name } : { ...op, incomeCategory: name });
  };
  const dismiss = () => {
    log.info('rules', `Правило отклонено: ${shortMerchant(op.merchant)}`, {
      operation: op.id,
      subcategory: op.subcategory,
    });
    kv.setJson('rules.dismissed', [...(kv.getJson<string[]>('rules.dismissed') ?? []), op.id]);
    setDismissed(true);
  };

  // Выбранная подкатегория всегда видна первой, даже если её нет среди подсказок.
  const chipNames = [
    ...new Set([...(op.subcategory ? [op.subcategory] : []), ...suggestions.map((s) => s.subcategory)]),
  ];

  // Свайп вправо ставит первую подсказку, влево удаляет (с «Вернуть» внизу экрана).
  const first = op.kind === 'expense' && !op.subcategory ? suggestions[0]?.subcategory : undefined;
  return (
    <SwipeRow
      right={first ? { label: `«${first}»`, onAction: () => pick(first) } : undefined}
      left={{ label: 'Удалить', onAction: () => onDelete(op) }}
    >
      <Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть операцию"
          onPress={() => router.push({ pathname: '/operation/[id]', params: { id: op.id } })}
          // Справа место под «⋯», чтобы сумма не уходила под кнопку.
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 32 }}
        >
          <AppIcon
            pkg={op.sourceApp ?? packageForAccount(account?.name)}
            badgePkg={op.alsoFrom?.includes(MIR_PAY) ? MIR_PAY : undefined}
            letter={account?.name[0] ?? (op.source === 'manual' ? '✎' : '?')}
            tone={op.status === 'new' ? 'warnSoft' : 'monoGray'}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="body" numberOfLines={2}>
              {op.merchant ?? op.comment ?? KIND_TITLE[op.kind]}
            </T>
            <T v="caption" c="muted" numberOfLines={1}>
              {[account?.name, SOURCE[op.source]].filter(Boolean).join(', ')}
            </T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, alignSelf: 'flex-start' }}>
            <T v="num" c={sign > 0 ? 'accentInk' : 'ink'}>
              {sign ? formatRub(sign * op.amount, { sign: true }) : formatRub(op.amount)}
            </T>
            <T v="caption" c="muted" numberOfLines={1}>
              {humanTime(op.occurredAt)}
            </T>
          </View>
        </Pressable>
        {/* Действия карточки без свайпа: те же, что у жеста, видны и доступны диктору. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Действия с покупкой"
          hitSlop={8}
          onPress={() =>
            Alert.alert(op.merchant ?? KIND_TITLE[op.kind], undefined, [
              ...(first ? [{ text: `Поставить «${first}»`, onPress: () => pick(first) }] : []),
              { text: 'Удалить', style: 'destructive' as const, onPress: () => onDelete(op) },
              { text: 'Отмена', style: 'cancel' as const },
            ])
          }
          style={{
            position: 'absolute',
            top: 14,
            right: 4,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T v="h2" c="muted">
            ⋯
          </T>
        </Pressable>

        {op.duplicateOf ? (
          <View style={{ backgroundColor: colors.warnSoft, borderRadius: 14, padding: 12, gap: 10 }}>
            <T v="label" c="warnSoftInk">
              Похоже на ту же покупку с телефона {op.duplicateOf === 'Елена' ? 'Елены' : 'Олега'}. В таблицу
              пока не записана.
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PillButton
                kind="strong"
                size="md"
                title="Это дубль"
                style={{ flex: 1 }}
                onPress={() => save.mutate({ ...op, deleted: true, duplicateOf: undefined })}
              />
              <PillButton
                kind="secondary"
                size="md"
                title="Разные покупки"
                style={{ flex: 1 }}
                onPress={() => save.mutate({ ...op, notDuplicate: true, duplicateOf: undefined })}
              />
            </View>
          </View>
        ) : null}

        <UnknownCard op={op} />

        {op.heldFor && !op.duplicateOf ? (
          <View style={{ backgroundColor: colors.warnSoft, borderRadius: 14, padding: 12, gap: 10 }}>
            <T v="label" c="warnSoftInk">
              Покупка картой: {op.heldFor}. С телефона {op.heldFor === 'Елена' ? 'Елены' : 'Олега'} за 6
              часов не пришла. Если её никто не вносил, размечай и отправляй.
            </T>
            <PillButton
              kind="secondary"
              size="md"
              title="Уже внесена, удалить"
              onPress={() => save.mutate({ ...op, deleted: true })}
            />
          </View>
        ) : null}

        {op.kind === 'expense' ? (
          byRule ? (
            <>
              <Chips>
                <Chip label={op.subcategory!} selected />
              </Chips>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexShrink: 1,
                    backgroundColor: colors.accentSoft,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <T v="caption" c="accentSoftInk" numberOfLines={1}>
                    по правилу «{rule!.pattern} → {rule!.subcategory}»
                  </T>
                </View>
                <PillButton
                  kind="ghost"
                  size="md"
                  title="Изменить"
                  onPress={() => router.push({ pathname: '/pick/[id]', params: { id: op.id } })}
                />
              </View>
            </>
          ) : (
            <>
              {!op.subcategory ? (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: colors.warnSoft,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <T v="caption" c="warnSoftInk">
                    Выбери категорию
                  </T>
                </View>
              ) : null}
              <Chips>
                {chipNames.map((name, i) => (
                  <Chip
                    key={name}
                    label={name}
                    selected={op.subcategory === name}
                    tone={!op.subcategory && i === 0 ? 'suggested' : 'default'}
                    onPress={() => pick(name)}
                  />
                ))}
                <Chip
                  label="Все категории…"
                  tone="more"
                  onPress={() => router.push({ pathname: '/pick/[id]', params: { id: op.id } })}
                />
              </Chips>
              {!op.subcategory && suggestions[0] ? (
                <T v="caption" c="muted">
                  {suggestions[0].reason === 'frequent'
                    ? 'Новый магазин: подсказки из твоих частых.'
                    : `Подсказка: ${suggestions[0].why}.`}
                </T>
              ) : null}
            </>
          )
        ) : op.kind === 'income' ? (
          <Chips>
            {(boot?.incomeCategories ?? []).map((name) => (
              <Chip
                key={name}
                label={name}
                selected={op.incomeCategory === name}
                onPress={() => pick(name)}
              />
            ))}
          </Chips>
        ) : null}

        {propose ? (
          <View style={{ backgroundColor: colors.ground, borderRadius: 16, padding: 12, gap: 10 }}>
            <T v="body">
              Всегда «{op.subcategory}» для {shortMerchant(op.merchant)}?
            </T>
            <T v="caption" c="muted">
              Уже второй раз так. Правило появится и на втором телефоне.
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PillButton
                kind="strong"
                size="md"
                title="Всегда так"
                onPress={() => {
                  log.info('rules', `Правило принято: ${shortMerchant(op.merchant)} -> ${op.subcategory}`, {
                    operation: op.id,
                  });
                  saveRule({ pattern: shortMerchant(op.merchant), subcategory: op.subcategory!, author });
                }}
              />
              <PillButton kind="secondary" size="md" title="Только сейчас" onPress={dismiss} />
            </View>
          </View>
        ) : null}
      </Card>
    </SwipeRow>
  );
}

function Empty() {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 72 }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckIcon color={colors.accentInk} size={40} />
      </View>
      <T v="title" style={{ fontSize: 20 }}>
        Всё разобрано
      </T>
      <T v="bodyRegular" c="muted" style={{ textAlign: 'center' }}>
        Новые покупки появятся здесь сами.
      </T>
      <PillButton
        kind="secondary"
        size="md"
        title="История операций"
        onPress={() => router.push('/history')}
      />
    </View>
  );
}

/**
 * Новая карта в уведомлении (чаще Mir Pay со своим номером): с какого она счёта. Ответ пишется маской в
 * «Счета», и дальше покупки с неё сами идут на этот счёт; эта операция тоже переносится.
 */
function UnknownCard({ op }: { op: Operation }) {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const qc = useQueryClient();
  const save = useSaveOperation();
  const [skipped, setSkipped] = useState(() =>
    (kv.getJson<string[]>('cards.skipped') ?? []).includes(op.cardMask ?? ''),
  );
  // Второе нажатие на счёт, пока идёт запрос, писало маску дважды.
  const busy = useRef(false);
  const mask = boot && !skipped ? unknownCardMask(op, boot.accounts) : undefined;
  if (!mask || !boot) return null;
  const digits = mask.replace('*', '');
  const remember = async (accountId: string) => {
    const acc = boot.accounts.find((a) => a.id === accountId);
    if (!acc || busy.current) return;
    busy.current = true;
    try {
      await api.setAccountSettings({
        accountId,
        cardMasks: [...new Set([...acc.cardMasks.map((m) => m.replace('*', '')), digits])],
      });
      log.info('account', `Карта ••${digits} записана на ${acc.name}`, { operation: op.id });
      if (op.accountId !== accountId) save.mutate({ ...op, accountId });
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
    } catch (e) {
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  };
  const skip = () => {
    kv.setJson('cards.skipped', [...(kv.getJson<string[]>('cards.skipped') ?? []), mask]);
    setSkipped(true);
  };
  return (
    <View style={{ backgroundColor: colors.fill, borderRadius: 14, padding: 12, gap: 10 }}>
      <T v="label">Новая карта ••{digits}: с какого она счёта?</T>
      <T v="caption" c="muted">
        Mir Pay показывает свой номер, а не цифры с карты. Запомню, и дальше покупки с ••{digits} пойдут на
        этот счёт сами.
      </T>
      <Chips>
        {boot.accounts
          .filter((a) => !a.hidden && a.type !== 'receivable')
          .map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              selected={a.id === op.accountId}
              onPress={() => void remember(a.id)}
            />
          ))}
      </Chips>
      <PillButton kind="ghost" size="md" title="Не знаю, не спрашивать" onPress={skip} />
    </View>
  );
}
