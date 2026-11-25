import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, log } from '@/adapters';
import { keys, useBootstrap } from '@/hooks/data';
import { Card, Chip, Chips, Input, PillButton, Screen, ScreenHeader, T } from '@/ui/kit';
import { goBack } from '@/state/nav';

const GROUPS = ['Повседневные', 'Обязательные', 'Крупные'] as const;
type Group = (typeof GROUPS)[number];

const HINT: Record<Group, string> = {
  Повседневные: 'идут в лимит на день',
  Обязательные: 'аренда, связь, кредиты: не в лимите',
  Крупные: 'редкие большие покупки: не в лимите',
};

/**
 * Подкатегории «Справочника»: группа решает, идёт ли трата в лимит на день. Новые дописываются в конец
 * «Справочника». Вместо удаления «Скрыть»: строка остаётся (от порядка зависит Дэшборд, на имя ссылается
 * история), но подкатегория пропадает из выбора в приложении. Переименования нет.
 */
export default function Subcategories() {
  const qc = useQueryClient();
  const boot = useBootstrap().data;
  const subs = boot?.subcategories ?? [];
  const [selected, setSelected] = useState<string>();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<Group>('Повседневные');
  const [busy, setBusy] = useState(false);

  const save = async (n: string, g: Group) => {
    setBusy(true);
    try {
      await api.upsertSubcategory(n, g);
      log.info('subcategories', `«${n}» -> ${g}`);
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
      return true;
    } catch (e) {
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const hide = async (n: string, hidden: boolean) => {
    setBusy(true);
    try {
      await api.setSubcategoryHidden(n, hidden);
      log.info('subcategories', `«${n}» ${hidden ? 'скрыта' : 'возвращена'}`);
      await qc.invalidateQueries({ queryKey: keys.bootstrap });
      setSelected(undefined);
    } catch (e) {
      Alert.alert('Не сохранилось', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const current = subs.find((s) => s.name === selected);
  const hiddenSubs = subs.filter((s) => s.hidden);
  const exists = subs.some((s) => s.name.toLowerCase() === name.trim().toLowerCase());

  return (
    <Screen>
      <ScreenHeader title="Подкатегории" onBack={goBack} />
      {/* Выбранная подкатегория: перенос в группу сверху, чтобы не листать до конца. */}
      {current ? (
        <Card tone="accentSoft" style={{ gap: 10 }}>
          <T v="body" c="accentSoftInk">
            {current.hidden ? `«${current.name}» скрыта` : `«${current.name}»: перенести в группу`}
          </T>
          {current.hidden ? null : (
            <Chips>
              {GROUPS.map((g) => (
                <Chip
                  key={g}
                  label={g}
                  selected={current.group === g}
                  onPress={() =>
                    current.group !== g &&
                    void save(current.name, g).then((ok) => ok && setSelected(undefined))
                  }
                />
              ))}
            </Chips>
          )}
          <PillButton
            kind={current.hidden ? 'strong' : 'danger'}
            size="md"
            title={current.hidden ? 'Вернуть в выбор' : 'Скрыть из выбора'}
            loading={busy}
            onPress={() => void hide(current.name, !current.hidden)}
          />
          {current.hidden ? null : (
            <T v="caption" c="accentSoftInk">
              Старые операции и таблица не меняются, её просто не будет в списке при выборе категории.
            </T>
          )}
        </Card>
      ) : null}
      {GROUPS.map((g) => {
        const items = subs.filter((s) => s.group === g && !s.hidden);
        return (
          <Card key={g} style={{ gap: 10 }}>
            <View style={{ gap: 2 }}>
              <T v="body">{g}</T>
              <T v="caption" c="muted">
                {HINT[g]}
              </T>
            </View>
            <Chips>
              {items.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={selected === s.name}
                  onPress={() => setSelected(selected === s.name ? undefined : s.name)}
                />
              ))}
            </Chips>
          </Card>
        );
      })}

      {hiddenSubs.length ? (
        <Card style={{ gap: 10 }}>
          <View style={{ gap: 2 }}>
            <T v="body">Скрытые</T>
            <T v="caption" c="muted">
              не показываются при выборе, нажми, чтобы вернуть
            </T>
          </View>
          <Chips>
            {hiddenSubs.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                tone="more"
                selected={selected === s.name}
                onPress={() => setSelected(selected === s.name ? undefined : s.name)}
              />
            ))}
          </Chips>
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <T v="body">Новая подкатегория</T>
        <Input
          accessibilityLabel="Название подкатегории"
          value={name}
          onChangeText={setName}
          placeholder="Например, Спорт"
          maxLength={40}
        />
        <Chips>
          {GROUPS.map((g) => (
            <Chip key={g} label={g} selected={group === g} onPress={() => setGroup(g)} />
          ))}
        </Chips>
        <T v="caption" c="muted">
          В Google Форме её не будет, пока не добавить вариант в саму форму.
        </T>
        <PillButton
          size="md"
          title={exists ? 'Такая уже есть' : 'Добавить в таблицу'}
          disabled={name.trim().length < 2 || exists}
          loading={busy}
          onPress={() => void save(name.trim(), group).then((ok) => ok && setName(''))}
        />
      </Card>
    </Screen>
  );
}
