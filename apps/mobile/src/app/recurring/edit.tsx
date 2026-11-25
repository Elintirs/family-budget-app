import { describeRule, formatAmountInput, occurrences, parseRub, type RecurringRule } from '@budget/core';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { api, log } from '@/adapters';
import { keys, useAuthor, useBootstrap } from '@/hooks/data';
import { goBack } from '@/state/nav';
import {
  Card,
  Chip,
  Chips,
  Field,
  Input,
  PillButton,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  T,
} from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/**
 * Регулярный платёж: новый, из подсказки (параметры name, amount, day, match, subcategory) или правка по id.
 * Сохраняется на лист «Регулярные», его видят оба телефона.
 */
export default function RecurringEdit() {
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Правка по id до загрузки сводки: форма с пустыми полями и сохранение создавали дубль с новым UUID.
  if (id && !boot)
    return (
      <Screen>
        <ScreenHeader title="Регулярное" onBack={goBack} />
        <ActivityIndicator color={colors.muted} accessibilityLabel="Загружаем платёж" />
      </Screen>
    );
  return <RecurringForm key={id ?? 'new'} />;
}

type Kind = NonNullable<RecurringRule['kind']>;
type Every = NonNullable<RecurringRule['schedule']>['every'];
type Shift = NonNullable<RecurringRule['schedule']>['shift'];
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const PRESETS: { key: string; title: string; every: Every; interval: number }[] = [
  { key: 'month', title: 'Каждый месяц', every: 'month', interval: 1 },
  { key: 'week', title: 'Каждую неделю', every: 'week', interval: 1 },
  { key: 'week2', title: 'Каждые 2 недели', every: 'week', interval: 2 },
  { key: 'year', title: 'Каждый год', every: 'year', interval: 1 },
];
const UNITS: { key: Every; title: string }[] = [
  { key: 'day', title: 'дней' },
  { key: 'week', title: 'недель' },
  { key: 'month', title: 'месяцев' },
  { key: 'year', title: 'лет' },
];
const rub = (k?: number) => (k ? formatAmountInput(String(Math.round(k / 100))) : '');

/**
 * Регулярное правило с гибким повтором (0.3.16): расход, доход (зарплата) или перевод (платёж по
 * кредитке); сумма точная или «плавает»; повтор каждые N дней, недель, месяцев, лет, по числам или
 * дням недели, перенос с выходных, срок. Сверху фраза-итог, редкое свёрнуто в «Ещё настройки».
 */
function RecurringForm() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const boot = useBootstrap().data;
  const [author] = useAuthor();
  const p = useLocalSearchParams<{
    id?: string;
    name?: string;
    amount?: string;
    day?: string;
    match?: string;
    subcategory?: string;
    kind?: Kind;
  }>();
  const existing = boot?.recurring.find((r) => r.id === p.id);
  const sch = existing?.schedule;
  const [kind, setKind] = useState<Kind>(existing?.kind ?? p.kind ?? 'expense');
  const [name, setName] = useState(existing?.name ?? p.name ?? '');
  const [ranged, setRanged] = useState(Boolean(existing?.amountMax));
  const [amount, setAmount] = useState(() => rub(existing?.amount ?? Number(p.amount ?? 0)));
  const [amountMax, setAmountMax] = useState(() => rub(existing?.amountMax));
  const [every, setEvery] = useState<Every>(sch?.every ?? 'month');
  const [interval, setIntervalN] = useState(sch?.interval ?? 1);
  const [days, setDays] = useState<number[]>(
    sch?.days ?? [Number(existing?.day ?? p.day ?? 0)].filter(Boolean),
  );
  const [weekdays, setWeekdays] = useState<number[]>(sch?.weekdays ?? []);
  const [shift, setShift] = useState<Shift>(sch?.shift ?? 'none');
  const [count, setCount] = useState(sch?.count ? String(sch.count) : '');
  const [paused, setPaused] = useState(Boolean(existing?.paused));
  const [words, setWords] = useState(
    [existing?.match ?? p.match ?? '', ...(existing?.keywords ?? [])].filter(Boolean).join(', '),
  );
  const [subcategory, setSubcategory] = useState<string | undefined>(
    existing?.subcategory ?? (p.subcategory || undefined),
  );
  const [accountId, setAccountId] = useState<string | undefined>(existing?.accountId);
  const [toAccountId, setToAccountId] = useState<string | undefined>(existing?.toAccountId);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const low = parseRub(amount) ?? 0;
  const high = ranged ? (parseRub(amountMax) ?? 0) : 0;
  const list = words
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2);
  const word = list[0] ?? name.trim().toLowerCase();
  const firstDay = every === 'month' ? Math.min(31, days[0] ?? 1) : new Date().getDate();
  const draft: RecurringRule = {
    id: existing?.id ?? p.id ?? 'draft',
    name: name.trim() || 'Платёж',
    amount: Math.max(1, low),
    day: firstDay,
    match: word.length >= 2 ? word : 'платёж',
    author,
    kind,
    ...(kind === 'transfer' && toAccountId ? { toAccountId } : {}),
    ...(ranged && high > low ? { amountMax: high } : {}),
    ...(list.length > 1 ? { keywords: list.slice(1) } : {}),
    schedule: {
      every,
      interval,
      ...(every === 'month' ? { days: days.length ? days : [firstDay] } : {}),
      ...(every === 'week' ? { weekdays } : {}),
      shift,
      ...(every === 'year' ? { start: new Date().toISOString().slice(0, 10) } : {}),
      ...(Number(count) > 0
        ? { count: Number(count), start: sch?.start ?? new Date().toISOString().slice(0, 10) }
        : {}),
    },
    ...(paused ? { paused: true } : {}),
    ...(kind !== 'transfer' && subcategory ? { subcategory } : {}),
    ...(accountId ? { accountId } : {}),
  };
  const valid =
    name.trim().length >= 2 &&
    low > 0 &&
    (!ranged || high > low) &&
    word.length >= 2 &&
    (every !== 'week' || weekdays.length > 0) &&
    (every !== 'month' || days.length > 0) &&
    (kind !== 'transfer' || Boolean(toAccountId));
  const upcoming = valid
    ? occurrences(draft, new Date(), new Date(Date.now() + 120 * 24 * 3600 * 1000)).slice(0, 4)
    : [];
  const preset = PRESETS.find((x) => x.every === every && x.interval === interval)?.key ?? 'custom';

  const run = async (what: 'save' | 'delete') => {
    // Второе нажатие, пока идёт запрос, не создаёт второй платёж.
    if (busy) return;
    setBusy(what);
    try {
      if (what === 'delete' && existing) {
        await api.deleteRecurring(existing.id);
        log.info('recurring', `Удалён регулярный «${existing.name}»`);
      } else {
        // Правка по ссылке, даже если строки ещё нет в сводке: тот же id, не новый платёж.
        const rule: RecurringRule = { ...draft, id: existing?.id ?? p.id ?? randomUUID() };
        await api.upsertRecurring(rule);
        log.info('recurring', `${existing ? 'Изменён' : 'Добавлен'} регулярный «${rule.name}»`, rule);
      }
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
      goBack();
    } catch (e) {
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const accounts = (boot?.accounts ?? []).filter((a) => !a.hidden);
  const toggle = (xs: number[], x: number) =>
    xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x].sort((a, b) => a - b);

  return (
    <Screen
      footer={
        <PillButton
          title={existing ? 'Сохранить' : 'Добавить'}
          disabled={!valid}
          loading={busy === 'save'}
          onPress={() => void run('save')}
        />
      }
    >
      <ScreenHeader title={existing ? existing.name : 'Регулярное'} onBack={goBack} />
      {valid ? (
        <Card tone="accentSoft" style={{ gap: 4 }}>
          <T v="body" c="accentSoftInk">
            {describeRule(draft)}
          </T>
          <T v="caption" c="accentSoftInk">
            Узнаём по {list.length > 1 ? 'словам' : 'слову'} «{(list.length ? list : [word]).join('», «')}» и
            сумме
          </T>
        </Card>
      ) : null}
      <Segmented<Kind>
        label="Вид"
        value={kind}
        onChange={setKind}
        options={[
          { key: 'expense', title: 'Расход' },
          { key: 'income', title: 'Доход' },
          { key: 'transfer', title: 'Перевод' },
        ]}
      />
      <Field title="Название">
        <Input
          accessibilityLabel="Название"
          value={name}
          onChangeText={setName}
          placeholder="Аренда, зарплата, Pathfinder"
        />
      </Field>
      <Field title="Сумма">
        <Segmented<'exact' | 'range'>
          label="Сумма"
          value={ranged ? 'range' : 'exact'}
          onChange={(v) => setRanged(v === 'range')}
          options={[
            { key: 'exact', title: 'Точная' },
            { key: 'range', title: 'Плавает' },
          ]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Input
            accessibilityLabel={ranged ? 'Сумма от' : 'Сумма'}
            value={amount}
            onChangeText={(t) => setAmount(formatAmountInput(t))}
            keyboardType="decimal-pad"
            placeholder={ranged ? 'от' : '35 000'}
            number
            style={{ flex: 1 }}
          />
          {ranged ? (
            <>
              <T v="h2" c="muted">
                –
              </T>
              <Input
                accessibilityLabel="Сумма до"
                value={amountMax}
                onChangeText={(t) => setAmountMax(formatAmountInput(t))}
                keyboardType="decimal-pad"
                placeholder="до"
                number
                style={{ flex: 1 }}
              />
            </>
          ) : null}
        </View>
        {ranged && kind === 'income' ? (
          <T v="caption" c="muted">
            Для «До зарплаты» берём нижнюю границу, чтобы не обещать лишнего.
          </T>
        ) : null}
      </Field>
      <Field title="Повтор">
        <Chips>
          {PRESETS.map((x) => (
            <Chip
              key={x.key}
              label={x.title}
              selected={preset === x.key}
              onPress={() => {
                setEvery(x.every);
                setIntervalN(x.interval);
              }}
            />
          ))}
          <Chip
            label="Свой"
            tone={preset === 'custom' ? 'default' : 'more'}
            selected={preset === 'custom'}
            onPress={() => setMore(true)}
          />
        </Chips>
        {every === 'month' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[...Array.from({ length: 31 }, (_, i) => i + 1), 32].map((d) => {
              const on = days.includes(d);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={d === 32 ? 'Последний день месяца' : `${d} число`}
                  onPress={() => setDays(toggle(days, d))}
                  style={{
                    width: d === 32 ? 94 : 44,
                    height: 44,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: on ? colors.accent : colors.control,
                    backgroundColor: on ? colors.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <T v="label" style={{ color: on ? colors.onAccent : colors.ink }}>
                    {d === 32 ? 'посл.' : d}
                  </T>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {every === 'week' ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {WEEKDAYS.map((w, i) => {
              const on = weekdays.includes(i);
              return (
                <Pressable
                  key={w}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={w}
                  onPress={() => setWeekdays(toggle(weekdays, i))}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    borderWidth: 1.5,
                    borderColor: on ? colors.accent : colors.control,
                    backgroundColor: on ? colors.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <T v="label" style={{ color: on ? colors.onAccent : colors.ink }}>
                    {w}
                  </T>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Field>
      {kind === 'transfer' ? (
        <Field title="Куда">
          <Chips>
            {accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={toAccountId === a.id}
                onPress={() => setToAccountId(a.id)}
              />
            ))}
          </Chips>
        </Field>
      ) : null}
      <Field title={kind === 'income' ? 'Как узнать приход' : 'Как узнать оплату'}>
        <Input
          accessibilityLabel="Слова для узнавания через запятую"
          value={words}
          onChangeText={setWords}
          placeholder="слова через запятую: зп, зарплата"
        />
        <T v="caption" c="muted">
          Ищем в комментарии, магазине и тексте пуша, сумма в границах выше.
        </T>
      </Field>
      {kind === 'expense' ? (
        <Field title="Подкатегория">
          <Chips>
            {(boot?.subcategories ?? [])
              .filter((s) => !s.hidden || s.name === subcategory)
              .map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={subcategory === s.name}
                  onPress={() => setSubcategory(subcategory === s.name ? undefined : s.name)}
                />
              ))}
          </Chips>
        </Field>
      ) : null}
      {kind === 'income' && boot?.incomeCategories.length ? (
        <Field title="Чей доход">
          <Chips>
            {boot.incomeCategories.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={subcategory === c}
                onPress={() => setSubcategory(subcategory === c ? undefined : c)}
              />
            ))}
          </Chips>
        </Field>
      ) : null}
      <Field title={kind === 'transfer' ? 'Откуда' : 'Счёт'}>
        <Chips>
          {accounts.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              selected={accountId === a.id}
              onPress={() => setAccountId(accountId === a.id ? undefined : a.id)}
            />
          ))}
        </Chips>
      </Field>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: more }}
          onPress={() => setMore(!more)}
        >
          <Row
            title="Ещё настройки"
            meta={[
              shift === 'before'
                ? 'в выходной раньше'
                : shift === 'after'
                  ? 'в выходной позже'
                  : 'выходные как есть',
              interval > 1 ? `каждые ${interval}` : '',
              count ? `${count} раз` : 'всегда',
              paused ? 'на паузе' : '',
            ]
              .filter(Boolean)
              .join(', ')}
            right={
              <T v="label" c="accentInk">
                {more ? 'Свернуть' : 'Открыть'}
              </T>
            }
            last
          />
        </Pressable>
      </Card>
      {more ? (
        <>
          <Field title="Каждые">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PillButton
                kind="secondary"
                size="md"
                title="−"
                onPress={() => setIntervalN(Math.max(1, interval - 1))}
              />
              <T v="title" style={{ minWidth: 28, textAlign: 'center' }}>
                {interval}
              </T>
              <PillButton
                kind="secondary"
                size="md"
                title="+"
                onPress={() => setIntervalN(Math.min(36, interval + 1))}
              />
            </View>
            <Segmented<Every> label="Единица повтора" value={every} onChange={setEvery} options={UNITS} />
          </Field>
          <Field title="Если выпадает на выходной">
            <Segmented<Shift>
              label="Выходной"
              value={shift}
              onChange={setShift}
              options={[
                { key: 'before', title: 'Раньше' },
                { key: 'after', title: 'Позже' },
                { key: 'none', title: 'Как есть' },
              ]}
            />
          </Field>
          <Field title="Сколько раз">
            <Input
              accessibilityLabel="Сколько раз, пусто: всегда"
              value={count}
              onChangeText={(t) => setCount(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="всегда"
            />
          </Field>
          <Card style={{ paddingVertical: 4, gap: 0 }}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: paused }}
              onPress={() => setPaused(!paused)}
            >
              <Row
                title="Пауза"
                meta="правило не учитывается, пока не снимешь"
                right={
                  <T v="label" c={paused ? 'warnInk' : 'muted'}>
                    {paused ? 'вкл' : 'выкл'}
                  </T>
                }
                last
              />
            </Pressable>
          </Card>
        </>
      ) : null}
      {upcoming.length ? (
        <Card tone="accentSoft" style={{ gap: 6 }}>
          <T v="label" c="accentSoftInk">
            Ближайшие
          </T>
          {upcoming.map((d) => (
            <T key={d.toISOString()} v="caption" c="accentSoftInk">
              {d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}
            </T>
          ))}
        </Card>
      ) : null}
      {existing ? (
        <PillButton
          kind="danger"
          title="Удалить"
          loading={busy === 'delete'}
          onPress={() =>
            Alert.alert(
              `Удалить «${existing.name}»?`,
              'Прошлые операции останутся в таблице, пропадёт только платёж.',
              [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: () => void run('delete') },
              ],
            )
          }
        />
      ) : null}
    </Screen>
  );
}
