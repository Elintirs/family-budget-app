import { popularSubcategories, suggestCategories } from '@budget/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAllOperations, useBootstrap, useHistory, useRules, useUpdateOperation } from '@/hooks/data';
import { log } from '@/adapters';
import { formatRub } from '@budget/core';
import { shortMerchant } from '@/state/format';
import { CheckIcon } from '@/ui/icons';
import { Chip, Chips, Input, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';
import { Sheet } from '@/ui/Sheet';
import { emitPicked } from '@/state/pickBus';

const GROUP_ORDER = ['Повседневные', 'Обязательные', 'Крупные'];

/** Выбор подкатегории: поиск, подсказки, недавние, группы из «Справочника». */
export default function PickCategory() {
  // id 'new': выбор для «Новой операции», ответ уходит в pickBus, а не в операцию.
  const { id, selected, target } = useLocalSearchParams<{
    id: string;
    selected?: string;
    /** Кому ответить: «Новой операции» (по умолчанию) или фильтру «Истории». */
    target?: 'subcategory' | 'filter';
  }>();
  const draft = id === 'new';
  const { colors } = useTheme();
  const boot = useBootstrap().data;
  const ops = useAllOperations();
  const history = useHistory();
  const { rules } = useRules();
  const update = useUpdateOperation();
  const [query, setQuery] = useState('');
  const op = draft ? undefined : ops.find((o) => o.id === id);
  const current = draft ? selected : op?.subcategory;

  const subs = (boot?.subcategories ?? []).filter((s) => !s.hidden);
  const suggestions = op
    ? suggestCategories(op, { rules, history, known: subs.map((s) => s.name), popular: boot?.popular })
    : [];
  // Популярность по таблице и телефону: «Частые» сверху и порядок внутри групп по убыванию.
  const rank = useMemo(() => {
    const m = new Map<string, number>();
    popularSubcategories({ history, popular: boot?.popular }).forEach(([name], i) => m.set(name, i));
    return m;
  }, [history, boot?.popular]);
  const byRank = (a: string, b: string) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999);
  const shown = new Set(suggestions.map((s) => s.subcategory));
  const recent = [...rank.keys()].filter((n) => !shown.has(n) && subs.some((s) => s.name === n)).slice(0, 6);

  const q = query.trim().toLowerCase();
  const groups = [...new Set([...GROUP_ORDER, ...subs.map((s) => s.group)])]
    .map((g) => ({
      g,
      items: subs
        .filter((s) => s.group === g && (!q || s.name.toLowerCase().includes(q)))
        .sort((a, b) => byRank(a.name, b.name)),
    }))
    .filter((x) => x.items.length);

  const choose = (name: string) => {
    log.info('choice', `Все категории: ${name}`, {
      operation: op?.id,
      merchant: op?.merchant ?? null,
      before: op?.subcategory ?? null,
      search: q || null,
    });
    if (draft) {
      emitPicked(target ?? 'subcategory', name);
      goBack();
    } else if (op) void update(op, { subcategory: name }).then(goBack);
  };

  return (
    <Sheet
      title="Подкатегория"
      caption={
        op ? `${op.merchant ? shortMerchant(op.merchant) : 'Покупка'}, ${formatRub(-op.amount)}` : undefined
      }
    >
      <Input
        accessibilityLabel="Поиск подкатегории"
        value={query}
        onChangeText={setQuery}
        placeholder="Поиск: «дост», «такси»…"
        round
      />
      {!q && suggestions.length ? (
        <>
          <Section title="Подсказки" />
          <Chips>
            {suggestions.map((s, i) => (
              <Chip
                key={s.subcategory}
                label={s.subcategory}
                tone={i === 0 ? 'suggested' : 'default'}
                selected={current === s.subcategory}
                onPress={() => choose(s.subcategory)}
              />
            ))}
          </Chips>
        </>
      ) : null}
      {!q && recent.length ? (
        <>
          <Section title="Частые" />
          <Chips>
            {recent.map((name) => (
              <Chip key={name} label={name} selected={current === name} onPress={() => choose(name)} />
            ))}
          </Chips>
        </>
      ) : null}
      {groups.map(({ g, items }) => (
        <View key={g} style={{ gap: 8 }}>
          <Section title={g} />
          <View style={{ backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16 }}>
            {items.map((s, i) => {
              const on = current === s.name;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => choose(s.name)}
                  style={{
                    height: 48,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottomWidth: i === items.length - 1 ? 0 : 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <T v={on ? 'body' : 'bodyRegular'} c={on ? 'accentInk' : 'ink'}>
                    {s.name}
                  </T>
                  {on ? <CheckIcon color={colors.accentInk} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {q && !groups.length ? (
        <T v="label" c="muted">
          Ничего не нашлось. Новую подкатегорию добавь в лист «Справочник» таблицы (в конец списка).
        </T>
      ) : null}
    </Sheet>
  );
}

function Section({ title }: { title: string }) {
  return (
    <T v="caption" c="muted" style={{ marginTop: 4 }}>
      {title}
    </T>
  );
}
