import { useState } from 'react';
import { useOnResume } from '@/hooks/useOnResume';
import { Switch, View } from 'react-native';
import {
  candidates,
  capturedCount,
  disableSource,
  enableSource,
  knownBanks,
  listener,
  type Candidate,
} from '@/adapters/notifications';
import type { KnownBank } from '../../modules/notification-listener/src';
import { humanTime } from '@/state/format';
import { CheckIcon } from '@/ui/icons';
import { AppIcon } from '@/ui/AppIcon';
import { Card, PillButton, Row, Screen, ScreenHeader, T, Toggle } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';

/** Настройки -> «Источники уведомлений»: доступ, батарея, банки, найденные приложения с суммами. */
export default function Sources() {
  const { colors } = useTheme();
  const [state, setState] = useState(() => read());
  const [sms, setSms] = useState(() => listener?.isSmsBanks() ?? true);

  // Возврат из настроек Android: перечитать разрешения.
  useOnResume(() => setState(read()));
  const refresh = () => setState(read());

  const l = listener;
  if (!l) {
    return (
      <Screen>
        <T v="title">Источники</T>
        <Card>
          <T v="body">Слушатель уведомлений работает только на Android.</T>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Источники" onBack={goBack} />

      <Card tone={state.granted ? 'accentSoft' : 'warnSoft'}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {state.granted ? <CheckIcon color={colors.accentSoftInk} /> : null}
          <T v="body" c={state.granted ? 'accentSoftInk' : 'warnSoftInk'}>
            {state.granted ? 'Слушаем уведомления' : 'Нет доступа к уведомлениям'}
          </T>
        </View>
        <T v="label" c={state.granted ? 'accentSoftInk' : 'warnSoftInk'}>
          {state.granted
            ? `Работает в фоне. Поймано уведомлений: ${state.captured}.`
            : 'Без доступа приложение не видит уведомления банков. Включи «Бюджет» в списке.'}
        </T>
        {!state.granted ? (
          <PillButton
            kind="strong"
            size="md"
            title="Открыть настройки доступа"
            onPress={() => l.openPermissionSettings()}
          />
        ) : null}
      </Card>

      {!state.canNotify ? (
        <Card tone="warnSoft">
          <T v="body" c="warnSoftInk">
            Кнопки категорий в уведомлении выключены
          </T>
          <T v="label" c="warnSoftInk">
            Разреши приложению показывать уведомления: после покупки придёт уведомление с кнопками
            подкатегорий, они работают и на заблокированном экране.
          </T>
          <PillButton
            kind="strong"
            size="md"
            title="Разрешить уведомления"
            onPress={() => {
              l.requestPostNotifications();
              setTimeout(refresh, 1500);
            }}
          />
        </Card>
      ) : null}

      {!state.battery ? (
        <Card tone="warnSoft">
          <T v="body" c="warnSoftInk">
            Телефон может усыпить приложение
          </T>
          <T v="label" c="warnSoftInk">
            Сними ограничения батареи, чтобы не терять покупки. На Xiaomi и Huawei ещё включи «Автозапуск» в
            настройках приложения.
          </T>
          <PillButton
            kind="strong"
            size="md"
            title="Снять ограничения батареи"
            onPress={() => l.requestIgnoreBatteryOptimizations()}
          />
        </Card>
      ) : null}

      <Card tone="fill" style={{ gap: 6 }}>
        <T v="body">Название магазина приходит в пуше банка</T>
        <T v="caption" c="muted" style={{ lineHeight: 18 }}>
          Mir Pay присылает только сумму и карту. Включи в приложении банка уведомления об операциях: покупка
          склеится из двух пушей, а магазин возьмётся из пуша банка.
        </T>
      </Card>

      <Card>
        <Toggle
          title="СМС от банков"
          caption="запасной источник: только от 900, T-Bank, VTB и других банков, личные СМС не читаем"
          value={sms}
          onChange={(on) => {
            listener?.setSmsBanks(on);
            setSms(on);
          }}
        />
      </Card>

      <T v="h2">Банки</T>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {state.banks.map((b, i) => (
          <Row
            key={b.package}
            left={
              <AppIcon
                pkg={b.package}
                letter={b.label[0] ?? '?'}
                tone={b.installed ? 'monoYellow' : 'monoGray'}
              />
            }
            title={b.label}
            meta={b.installed ? b.package : 'не установлено'}
            right={
              <Switch
                accessibilityLabel={`Слушать ${b.label}`}
                value={b.enabled}
                onValueChange={(on) => {
                  if (on) enableSource(b.package);
                  else disableSource(b.package);
                  refresh();
                }}
                trackColor={{ true: colors.accent, false: colors.toggleOff }}
                thumbColor={colors.switchThumb}
              />
            }
            last={i === state.banks.length - 1}
          />
        ))}
      </Card>

      <T v="h2">Найдены приложения с суммами</T>
      {state.candidates.length ? (
        state.candidates.map((c) => (
          <Card key={c.package}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <AppIcon pkg={c.package} letter={c.label[0] ?? '?'} tone="monoPurple" />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="body">{c.label}</T>
                <T v="caption" c="muted">
                  {c.package}, {c.count} шт, {humanTime(new Date(c.lastAt).toISOString())}
                </T>
              </View>
            </View>
            <T v="label" c="muted">
              {c.lastText}
            </T>
            <PillButton
              size="md"
              title="Это банк, слушать"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => {
                enableSource(c.package);
                refresh();
              }}
            />
          </Card>
        ))
      ) : (
        <Card>
          <T v="label" c="muted">
            Пока пусто. Сюда попадают приложения не из списка банков, которые прислали уведомление с суммой в
            рублях.
          </T>
        </Card>
      )}
    </Screen>
  );
}

function read(): {
  granted: boolean;
  canNotify: boolean;
  battery: boolean;
  captured: number;
  banks: KnownBank[];
  candidates: Candidate[];
} {
  if (!listener)
    return { granted: false, canNotify: true, battery: true, captured: 0, banks: [], candidates: [] };
  return {
    granted: listener.isPermissionGranted(),
    canNotify: listener.canPostNotifications(),
    battery: listener.isIgnoringBatteryOptimizations(),
    captured: capturedCount(),
    banks: knownBanks(),
    candidates: candidates(),
  };
}
