import { formatAmountInput, parseRub } from '@budget/core';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, log } from '@/adapters';
import { keys, useAuthor, useBootstrap } from '@/hooks/data';
import { goBack } from '@/state/nav';
import { Card, Chip, Chips, Input, PillButton, Screen, ScreenHeader, T } from '@/ui/kit';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Новая цель или правка по id: название, сумма, срок (месяц), счёт-копилка. */
export default function GoalEdit() {
  const qc = useQueryClient();
  const boot = useBootstrap().data;
  const [author] = useAuthor();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = boot?.goals.find((g) => g.id === id);
  const now = new Date();
  const [name, setName] = useState(existing?.name ?? '');
  const [target, setTarget] = useState(existing ? formatAmountInput(String(existing.target / 100)) : '');
  const [year, setYear] = useState(Number(existing?.deadline?.slice(0, 4) ?? now.getFullYear() + 1));
  const [month, setMonth] = useState<number | null>(
    existing?.deadline ? Number(existing.deadline.slice(5, 7)) : null,
  );
  const [accountId, setAccountId] = useState<string | undefined>(existing?.accountId);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const kop = parseRub(target) ?? 0;
  const valid = name.trim().length >= 2 && kop > 0;

  const run = async (what: 'save' | 'delete') => {
    setBusy(what);
    try {
      if (what === 'delete' && existing) await api.deleteGoal(existing.id);
      else
        await api.upsertGoal({
          id: existing?.id ?? randomUUID(),
          name: name.trim(),
          target: kop,
          ...(month ? { deadline: `${year}-${String(month).padStart(2, '0')}` } : {}),
          ...(accountId ? { accountId } : {}),
          author,
        });
      log.info(
        'goals',
        `${what === 'delete' ? 'Удалена' : existing ? 'Изменена' : 'Добавлена'} цель «${name}»`,
      );
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
      goBack();
    } catch (e) {
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      footer={
        <PillButton
          kind="strong"
          title={existing ? 'Сохранить' : 'Добавить цель'}
          disabled={!valid}
          loading={busy === 'save'}
          onPress={() => void run('save')}
        />
      }
    >
      <ScreenHeader title={existing ? 'Цель' : 'Новая цель'} onBack={goBack} />
      <Card style={{ gap: 8 }}>
        <T v="body">Название</T>
        <Input
          accessibilityLabel="Название цели"
          value={name}
          onChangeText={setName}
          placeholder="Подушка, отпуск, ремонт"
        />
        <T v="caption" c="muted">
          Переводы с комментарием «Цель: {name.trim() || 'название'}» считаются в эту цель.
        </T>
      </Card>
      <Card style={{ gap: 8 }}>
        <T v="body">Сколько собрать</T>
        <Input
          accessibilityLabel="Сумма цели"
          value={target}
          onChangeText={(t) => setTarget(formatAmountInput(t))}
          keyboardType="decimal-pad"
          placeholder="300 000"
          number
        />
      </Card>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T v="body">К какому сроку</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2].map((y) => (
              <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(y)} />
            ))}
          </View>
        </View>
        <Chips>
          {MONTHS.map((m, i) => (
            <Chip
              key={m}
              label={m}
              selected={month === i + 1}
              onPress={() => setMonth(month === i + 1 ? null : i + 1)}
            />
          ))}
        </Chips>
        <T v="caption" c="muted">
          {month ? 'по сроку посчитаем, сколько откладывать в месяц' : 'без срока: просто копим'}
        </T>
      </Card>
      <Card style={{ gap: 10 }}>
        <T v="body">Счёт-копилка</T>
        <Chips>
          {(boot?.accounts ?? [])
            .filter((a) => !a.hidden && (a.type === 'debit' || a.type === 'cash'))
            .map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={accountId === a.id}
                onPress={() => setAccountId(accountId === a.id ? undefined : a.id)}
              />
            ))}
        </Chips>
        <T v="caption" c="muted">
          куда переводить; если отдельного счёта нет, можно не выбирать
        </T>
      </Card>
      {existing ? (
        <PillButton
          kind="danger"
          title="Удалить цель"
          loading={busy === 'delete'}
          onPress={() =>
            Alert.alert('Удалить цель?', 'Переводы останутся в таблице, пропадёт только сама цель.', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => void run('delete') },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}
