import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { defaultAccountId, kv, log } from '@/adapters';
import { aggressiveVendor } from '@/state/background';
import { listener } from '@/adapters/notifications';
import { useAuthor, useBootstrap, useRules, type Author } from '@/hooks/data';
import { useOnResume } from '@/hooks/useOnResume';
import { autoSend } from '@/adapters/autoSend';
import { reminderToggles, setReminderToggle } from '@/adapters/reminders';
import { formatRub, type ReminderToggles } from '@budget/core';
import type { ReactNode } from 'react';
import { BellIcon, ChevronRightIcon, GaugeIcon, ListIcon, PhoneIcon, RepeatIcon } from '@/ui/icons';
import { humanTime, plural } from '@/state/format';
import { Card, Chip, Chips, PillButton, Row, Screen, Segmented, T, Toggle } from '@/ui/kit';
import { useTheme, type ThemePref } from '@/ui/theme';

const REMINDERS: { key: keyof ReminderToggles; title: string; caption: string }[] = [
  { key: 'limits', title: 'Лимиты: 80% и 100%', caption: 'подкатегории и группы, по разу за месяц' },
  { key: 'recurring', title: 'Регулярные', caption: 'накануне вечером: «Завтра: Аренда 25 000 ₽»' },
  { key: 'month', title: 'Итоги месяца', caption: '1-го числа: потрачено, что вышло за лимиты' },
  { key: 'update', title: 'Новая версия приложения', caption: 'скачать в одно касание' },
];

export default function Settings() {
  const { colors, pref, setPref, scheme, custom } = useTheme();
  const [author, setAuthor] = useAuthor();
  const boot = useBootstrap().data;
  const { rules } = useRules();
  const [quick, setQuick] = useState(() => kv.get('quickActions') !== '0');
  const [lock, setLock] = useState(() => listener?.isLockStatus() ?? false);
  const [bgOpen, setBgOpen] = useState(false);
  const [keep, setKeep] = useState(() => listener?.isKeepAlive() ?? false);
  const [auto, setAuto] = useState(() => autoSend.enabled());
  const lastRun = kv.get('bg.lastRun');
  const [remind, setRemind] = useState<ReminderToggles>(() => reminderToggles());
  const [defAcc, setDefAcc] = useState(() => defaultAccountId() ?? '');
  const [access, setAccess] = useState(() => listener?.isPermissionGranted() ?? false);
  useOnResume(() => setAccess(listener?.isPermissionGranted() ?? false));

  // Разделы как в макете: иконка в круге, значение справа.
  const section = (
    title: string,
    href: Href,
    icon: ReactNode,
    value?: string,
    warn?: boolean,
    last?: boolean,
  ) => (
    <Pressable accessibilityRole="button" onPress={() => router.push(href)}>
      <Row
        left={
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </View>
        }
        title={title}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {value ? (
              <T v="label" c={warn ? 'warnInk' : 'ink'}>
                {value}
              </T>
            ) : null}
            <ChevronRightIcon color={colors.muted} />
          </View>
        }
        last={last}
      />
    </Pressable>
  );
  const sources = listener?.getSources().length ?? 0;
  const lastSyncAt = kv.getJson<string>('lastSyncAt');

  return (
    <Screen inTabs>
      <T v="title">Настройки</T>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T v="h2" c="accentSoftInk">
            {author[0]}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body">{author}, этот телефон</T>
          <T v="caption" c="muted" numberOfLines={2}>
            {boot ? `«${boot.tableName}»` : 'таблица не подключена'}
          </T>
          {lastSyncAt ? (
            <T v="caption" c="muted">
              отправка {humanTime(lastSyncAt)}
            </T>
          ) : null}
        </View>
      </Card>

      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {section(
          'Источники',
          '/sources',
          <BellIcon color={colors.ink} size={18} />,
          access ? `${sources} ${plural(sources, 'приложение', 'приложения', 'приложений')}` : 'нет доступа',
          !access,
        )}
        {section(
          'Правила категорий',
          '/rules',
          <ListIcon color={colors.ink} size={18} />,
          `${rules.filter((r) => r.subcategory).length}`,
        )}
        {section(
          'Лимиты',
          '/limits',
          <GaugeIcon color={colors.ink} size={18} />,
          boot ? formatRub(boot.summary.monthLimit, { whole: true }) : undefined,
        )}
        {section(
          'Подкатегории',
          '/subcategories',
          <ListIcon color={colors.ink} size={18} />,
          boot ? `${boot.subcategories.length}` : undefined,
        )}
        {section('Регулярные', '/recurring', <RepeatIcon color={colors.ink} size={18} />)}
        {section(
          'Устройство',
          '/devices',
          <PhoneIcon color={colors.ink} size={18} />,
          undefined,
          false,
          true,
        )}
      </Card>

      {/* Тема сразу после разделов, как в макете: её меняют чаще уведомлений. */}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T v="body">Тема</T>
          <T v="caption" c="muted">
            сейчас {scheme === 'dark' ? 'тёмная' : 'светлая'}
          </T>
        </View>
        <Segmented<ThemePref>
          label="Тема"
          value={pref}
          onChange={setPref}
          options={[
            { key: 'system', title: 'Как в системе' },
            { key: 'light', title: 'Светлая' },
            { key: 'dark', title: 'Тёмная' },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Цвета темы"
          onPress={() => router.push('/theme-colors' as Href)}
        >
          <Row
            title="Цвета"
            meta={
              custom
                ? custom.preset
                  ? 'готовая палитра, только на этом телефоне'
                  : 'свои, только на этом телефоне'
                : 'Зелёная, как была, у каждого телефона свои'
            }
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {[colors.accent, colors.hero, colors.expense].map((c, i) => (
                  <View
                    key={i}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: c,
                      borderWidth: 1,
                      borderColor: colors.control,
                    }}
                  />
                ))}
                <View style={{ width: 5 }} />
                <ChevronRightIcon color={colors.muted} />
              </View>
            }
            last
          />
        </Pressable>
      </Card>

      <T v="h2">Уведомления</T>
      <Card style={{ gap: 16 }}>
        {REMINDERS.map((x) => (
          <Toggle
            key={x.key}
            title={x.title}
            caption={x.caption}
            value={remind[x.key]}
            onChange={(on) => {
              setReminderToggle(x.key, on);
              setRemind({ ...remind, [x.key]: on });
            }}
          />
        ))}
        <Toggle
          title="Кнопки категорий в уведомлении"
          caption="после покупки, работает и на заблокированном экране"
          value={quick}
          onChange={(on) => {
            kv.set('quickActions', on ? '1' : '0');
            listener?.setQuickActions(on);
            setQuick(on);
          }}
        />
        <Toggle
          title="Остаток на экране блокировки"
          caption="закреплённое уведомление «Можно сегодня» с кнопками «+ Трата» и «Входящие»"
          value={lock}
          onChange={(on) => {
            listener?.setLockStatus(on);
            setLock(on);
          }}
        />
      </Card>

      <T v="h2">Этот телефон</T>
      <Card style={{ gap: 10 }}>
        <T v="body">Кто пользуется</T>
        <Segmented<Author>
          label="Автор операций"
          value={author}
          onChange={setAuthor}
          options={[
            { key: 'Олег', title: 'Олег' },
            { key: 'Елена', title: 'Елена' },
          ]}
        />
        <View style={{ gap: 2, marginTop: 6 }}>
          <T v="body">Счёт по умолчанию</T>
          <T v="caption" c="muted">
            для ручных трат и покупок, где банк не назвал карту
          </T>
        </View>
        <Chips>
          {(boot?.accounts ?? [])
            .filter((a) => a.type !== 'receivable' && !a.hidden)
            .map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={defAcc === a.id}
                onPress={() => {
                  kv.set('defaultAccount', a.id);
                  setDefAcc(a.id);
                }}
              />
            ))}
        </Chips>
      </Card>

      {/* Служебное свёрнуто в две строки (аудит 05.11, п. 12): фон и журнал. */}
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: bgOpen }}
          onPress={() => setBgOpen(!bgOpen)}
        >
          <Row
            title="Работа в фоне"
            meta={[
              auto ? 'отправка сама' : 'отправка вручную',
              keep ? 'держать в памяти' : undefined,
              lastRun ? `запуск ${humanTime(lastRun)}` : undefined,
            ]
              .filter(Boolean)
              .join(', ')}
            metaTone={auto || keep ? 'accentInk' : 'muted'}
            right={
              <View style={{ transform: [{ rotate: bgOpen ? '90deg' : '0deg' }] }}>
                <ChevronRightIcon color={colors.muted} />
              </View>
            }
            last={!bgOpen}
          />
        </Pressable>
        {bgOpen ? (
          <View style={{ gap: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Toggle
              title="Отправлять размеченные сами"
              caption="через минуту после выбора категории, в фоне примерно раз в 15 минут"
              value={auto}
              onChange={(on) => {
                void autoSend.set(on);
                setAuto(on);
              }}
            />
            <Toggle
              title="Держать в памяти"
              caption="телефон не выгружает приложение, покупки уходят в таблицу сразу; в шторке остаётся «Можно сегодня»"
              value={keep}
              onChange={(on) => {
                listener?.setKeepAlive(on);
                setKeep(on);
              }}
            />
            {aggressiveVendor() ? (
              <>
                <T v="caption" c="muted">
                  На {Device.manufacturer ?? 'этом телефоне'} без «Автозапуска» и «Без ограничений» в экономии
                  батареи прошивка усыпляет отправку, и покупки ждут, пока откроешь приложение.
                  {lastRun ? ` Последний запуск в фоне: ${humanTime(lastRun)}.` : ''}
                </T>
                <T v="caption" c="muted">
                  Надёжнее всего: включи «Держать в памяти». И закрепи «Бюджет» в недавних приложениях: открой
                  список недавних, зажми карточку «Бюджета» и нажми замок.
                </T>
                <PillButton
                  kind="secondary"
                  size="md"
                  title="Открыть автозапуск"
                  style={{ alignSelf: 'flex-start' }}
                  onPress={() => {
                    const where = listener?.openAutostartSettings();
                    kv.set('autostartOpened', '1');
                    log.info('app', 'Открыт автозапуск из настроек', { where });
                  }}
                />
              </>
            ) : null}
          </View>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => router.push('/debug-log')}>
          <Row
            title="Для разработчика"
            meta={`журнал, версия ${Constants.expoConfig?.version ?? ''}`}
            right={<ChevronRightIcon color={colors.muted} />}
            last
          />
        </Pressable>
      </Card>
    </Screen>
  );
}
