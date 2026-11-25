import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, PanResponder, View } from 'react-native';
import { kv, log } from '@/adapters';
import { autoSend } from '@/adapters/autoSend';
import { getConnection, maskToken, parseConnectLink, setConnection } from '@/adapters/connection';
import { listener } from '@/adapters/notifications';
import { keys, useAuthor, useBootstrap, type Author } from '@/hooks/data';
import { useOnResume } from '@/hooks/useOnResume';
import { ArrowDownIcon, CheckIcon } from '@/ui/icons';
import { BackButton, Card, fonts, Input, PillButton, Screen, T, Toggle } from '@/ui/kit';
import { aggressiveVendor } from '@/state/background';
import { useTheme } from '@/ui/theme';

const STEPS = 4;

/**
 * Первый запуск по макету: приветствие -> подключение по ссылке -> доступ к уведомлениям ->
 * разрешения и проверка -> как пользоваться. Шаги листаются назад кнопкой и системным жестом.
 */
export default function Onboarding() {
  // ?step=1: пришли по ссылке подключения, сразу на шаг «Подключи таблицу».
  const params = useLocalSearchParams<{ step?: string }>();
  const [step, setStep] = useState(() => Number(params.step ?? 0) || 0);
  const connected = Boolean(useBootstrap().data);
  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => s + 1);

  useEffect(() => {
    log.info('onboarding', `Шаг ${step}`);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const finish = () => {
    kv.set('onboarded', '1');
    log.info('onboarding', 'Онбординг пройден');
    router.replace('/');
  };

  // Свайп влево: дальше (с шага подключения только когда таблица ответила), вправо: назад.
  const nav = useRef({ back, next: () => {} });
  nav.current = { back, next: step === 1 && !connected ? () => {} : step < STEPS ? next : () => {} };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) nav.current.next();
        else if (g.dx > 60) nav.current.back();
      },
    }),
  ).current;

  return (
    <View style={{ flex: 1 }} {...swipe.panHandlers}>
      {step === 0 ? (
        <Welcome onNext={next} />
      ) : step === 1 ? (
        <Connect onBack={back} onNext={next} />
      ) : step === 2 ? (
        <Access onBack={back} onNext={next} />
      ) : step === 3 ? (
        <Permissions onBack={back} onNext={next} />
      ) : (
        <HowTo onBack={back} onDone={finish} />
      )}
    </View>
  );
}

function StepHeader({ n, title, onBack }: { n: number; title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {Array.from({ length: STEPS }, (_, i) => i + 1).map((i) => (
          <View
            key={i}
            style={{
              width: i === n ? 24 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i <= n ? colors.accent : colors.border,
            }}
          />
        ))}
        <T v="label" c="muted" style={{ marginLeft: 6 }}>
          Шаг {n} из {STEPS}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={onBack} />
        <T v="title" style={{ flex: 1 }}>
          {title}
        </T>
      </View>
    </>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const { colors } = useTheme();
  const items = [
    ['Подключи таблицу', 'ту же, что вы ведёте сейчас'],
    ['Разреши читать уведомления', 'только приложения банков'],
    ['Размечай в одно касание', 'прямо из шторки уведомлений'],
  ];
  return (
    <Screen tone="hero" footer={<PillButton kind="hero" title="Начать" onPress={onNext} />}>
      <View style={{ flexDirection: 'row', marginTop: 24, height: 64 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.heroAccent }} />
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.expense,
            opacity: 0.85,
            marginLeft: -24,
          }}
        />
      </View>
      <T v="title" style={{ fontSize: 34, lineHeight: 40, color: colors.heroInk, marginTop: 8 }}>
        Бюджет на двоих
      </T>
      <T v="bodyRegular" style={{ color: colors.heroMuted, lineHeight: 22 }}>
        Траты из уведомлений банков сами попадают в вашу таблицу. Остаётся выбрать категорию.
      </T>
      {items.map(([a, b], i) => (
        <View
          key={a}
          style={{
            // Нумерованный список без карточек: карточки выглядели нажимаемыми, а нажать было нечего.
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 14,
            paddingVertical: 6,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: colors.heroAccent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T v="label" style={{ color: colors.heroAccent }}>
              {i + 1}
            </T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="body" style={{ color: colors.heroInk }}>
              {a}
            </T>
            <T v="caption" style={{ color: colors.heroMuted }}>
              {b}
            </T>
          </View>
        </View>
      ))}
    </Screen>
  );
}

function Connect({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const boot = useBootstrap();
  const [author, setAuthor] = useAuthor();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const conn = getConnection();
  const ok = Boolean(boot.data);

  // Ключ устройства знает автора: выбираем сами, но оставляем возможность поправить.
  const serverAuthor = boot.data?.author;
  useEffect(() => {
    if (serverAuthor === 'Олег' || serverAuthor === 'Елена') setAuthor(serverAuthor);
    // setAuthor стабилен по смыслу, перезапуск нужен только при смене ответа сервера.
  }, [serverAuthor]);

  const onPaste = (value: string) => {
    setText(value);
    if (!value.trim()) return setBad(false);
    const c = parseConnectLink(value);
    setBad(!c);
    if (!c) return;
    setConnection(c);
    log.info('onboarding', 'Подключено по ссылке', { token: maskToken(c.token) });
    void qc.invalidateQueries({ queryKey: keys.bootstrap });
  };

  return (
    <Screen footer={<PillButton title="Дальше" disabled={!ok} onPress={onNext} />}>
      <StepHeader n={1} title="Подключи таблицу" onBack={onBack} />
      <Card style={{ gap: 10 }}>
        <T v="body">Ссылка подключения</T>
        <T v="caption" c="muted" style={{ lineHeight: 18 }}>
          У каждого телефона своя ссылка, она начинается с budget://connect. Её присылает тот, кто настраивал
          таблицу. Скопируй сообщение со ссылкой и нажми «Вставить ссылку».
        </T>
        <PillButton
          kind="strong"
          size="md"
          title="Вставить ссылку"
          style={{ alignSelf: 'flex-start' }}
          onPress={async () => onPaste(await Clipboard.getStringAsync())}
        />
        <Input
          accessibilityLabel="Ссылка подключения"
          value={text}
          onChangeText={onPaste}
          placeholder="или вставь сюда вручную"
          autoCapitalize="none"
          autoCorrect={false}
          bad={bad}
        />
        {bad ? (
          <T v="caption" c="warnInk">
            Это не похоже на ссылку подключения
          </T>
        ) : null}
      </Card>

      {conn ? (
        <Card
          tone={ok ? 'accentSoft' : boot.isError ? 'warnSoft' : 'fill'}
          style={{ flexDirection: 'row', gap: 10 }}
        >
          {ok ? (
            <CheckIcon color={colors.accentSoftInk} />
          ) : boot.isError ? null : (
            <ActivityIndicator color={colors.muted} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <T v="body" c={ok ? 'accentSoftInk' : boot.isError ? 'warnSoftInk' : 'muted'}>
              {ok
                ? `«${boot.data!.tableName}»`
                : boot.isError
                  ? 'Таблица не отвечает'
                  : 'Подключаем таблицу…'}
            </T>
            <T v="caption" c={ok ? 'accentSoftInk' : 'muted'}>
              {ok
                ? `подключено, ${boot.data!.subcategories.length} подкатегорий, ${boot.data!.accounts.length} счетов`
                : boot.isError
                  ? 'Проверь ссылку и интернет'
                  : `ключ ${maskToken(conn.token)}, первый раз до минуты`}
            </T>
          </View>
          {boot.isError ? (
            <PillButton
              kind="strong"
              size="md"
              title="Повторить"
              loading={boot.isFetching}
              onPress={() => boot.refetch()}
            />
          ) : null}
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <T v="body">Кто пользуется этим телефоном?</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['Олег', 'Елена'] as Author[]).map((a) => (
            <PillButton
              key={a}
              kind="secondary"
              title={a}
              accessibilityState={{ selected: author === a }}
              onPress={() => setAuthor(a)}
              style={{
                flex: 1,
                height: 64,
                borderRadius: 18,
                borderWidth: author === a ? 2 : 1,
                borderColor: author === a ? colors.accent : colors.border,
                backgroundColor: colors.card,
              }}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

function Access({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { colors } = useTheme();
  const [granted, setGranted] = useState(() => listener?.isPermissionGranted() ?? true);
  useOnResume(() => setGranted(listener?.isPermissionGranted() ?? true));
  const points = [
    'Читаем только приложения банков из списка, остальное игнорируем',
    'Сохраняем сумму, магазин, карту и остаток',
    'Данные уходят только в вашу таблицу',
  ];
  return (
    <Screen
      footer={
        <View style={{ gap: 8 }}>
          {granted ? (
            <PillButton title="Дальше" onPress={onNext} />
          ) : (
            <PillButton
              title="Открыть настройки Android"
              onPress={() => listener?.openPermissionSettings()}
            />
          )}
          <PillButton
            kind="secondary"
            title="Какие банки поддерживаются"
            onPress={() => router.push('/sources')}
          />
        </View>
      }
    >
      <StepHeader n={2} title="Доступ к уведомлениям" onBack={onBack} />
      <View style={{ backgroundColor: colors.hero, borderRadius: 22, padding: 18, gap: 10 }}>
        <View style={{ backgroundColor: colors.fill, borderRadius: 16, padding: 12, gap: 2 }}>
          <T v="caption" c="muted">
            Банк
          </T>
          <T v="label">Покупка 523 ₽, PYATEROCHKA</T>
        </View>
        <View style={{ alignSelf: 'center' }}>
          <ArrowDownIcon color={colors.heroAccent} />
        </View>
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 2 }}>
            <T v="caption" c="muted">
              Бюджет
            </T>
            <T v="label">Пятёрочка · −523 ₽</T>
          </View>
          <View
            style={{
              backgroundColor: colors.accent,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <T v="caption" c="onAccent">
              Продукты
            </T>
          </View>
        </View>
      </View>
      {points.map((p) => (
        <View key={p} style={{ flexDirection: 'row', gap: 12 }}>
          <CheckIcon color={colors.accentInk} />
          <T v="bodyRegular" style={{ flex: 1, lineHeight: 21 }}>
            {p}
          </T>
        </View>
      ))}
      {granted ? (
        <Card tone="accentSoft" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <CheckIcon color={colors.accentSoftInk} />
          <T v="body" c="accentSoftInk">
            Доступ уже есть
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}

function Permissions({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { colors } = useTheme();
  const read = () => ({
    listener: listener?.isPermissionGranted() ?? true,
    notify: listener?.canPostNotifications() ?? true,
    battery: listener?.isIgnoringBatteryOptimizations() ?? true,
    autostart: kv.get('autostartOpened') === '1',
  });
  const [perm, setPerm] = useState(read);
  const [test, setTest] = useState<string | null>(null);
  useOnResume(() => setPerm(read()));
  const needsAutostart = aggressiveVendor();

  const row = (done: boolean, title: string, meta: string, action?: () => void, last?: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.line,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: done ? colors.accentSoft : colors.warnSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? (
          <CheckIcon color={colors.accentSoftInk} />
        ) : (
          <T v="label" c="warnSoftInk">
            !
          </T>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body">{title}</T>
        <T v="caption" c="muted">
          {meta}
        </T>
      </View>
      {!done && action ? <PillButton kind="strong" size="md" title="Открыть" onPress={action} /> : null}
    </View>
  );

  return (
    <Screen footer={<PillButton title="Дальше" onPress={onNext} />}>
      <StepHeader n={3} title="Чтобы ничего не терялось" onBack={onBack} />
      <T v="bodyRegular" c="muted" style={{ lineHeight: 22 }}>
        Некоторые телефоны выгружают фоновые приложения. Без этих разрешений покупки могут пропадать.
      </T>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {row(perm.listener, 'Доступ к уведомлениям', perm.listener ? 'включён' : 'читаем пуши банков', () =>
          listener?.openPermissionSettings(),
        )}
        {row(perm.notify, 'Уведомления приложения', 'для кнопок категорий', () => {
          listener?.requestPostNotifications();
          setTimeout(() => setPerm(read()), 1500);
        })}
        {needsAutostart
          ? row(perm.autostart, 'Автозапуск', `нужен на ${Device.manufacturer ?? 'этом телефоне'}`, () => {
              const where = listener?.openAutostartSettings();
              kv.set('autostartOpened', '1');
              log.info('onboarding', 'Открыт автозапуск', { where });
            })
          : null}
        {row(
          perm.battery,
          'Батарея без ограничений',
          'иначе Android усыпит сервис',
          () => listener?.requestIgnoreBatteryOptimizations(),
          true,
        )}
      </Card>
      <Card style={{ gap: 12 }}>
        <T v="h2">Проверка</T>
        <T v="label" c="muted" style={{ lineHeight: 19 }}>
          Отправь тестовое уведомление и нажми в нём любую категорию: так выглядит разметка после покупки.
        </T>
        <PillButton
          kind="secondary"
          size="md"
          title="Тестовое уведомление"
          style={{ alignSelf: 'flex-start' }}
          onPress={() =>
            setTest(
              listener?.showTestNotification()
                ? 'Отправлено: открой шторку уведомлений'
                : 'Сначала разреши уведомления приложения',
            )
          }
        />
        {test ? (
          <T v="caption" c="accentInk">
            {test}
          </T>
        ) : null}
      </Card>
    </Screen>
  );
}

function HowTo({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const [auto, setAuto] = useState(() => autoSend.enabled());
  const [lock, setLock] = useState(() => listener?.isLockStatus() ?? false);

  const card = (n: number, title: string, body: string, illus: ReactNode) => (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T v="label" c="accentSoftInk">
            {n}
          </T>
        </View>
        <T v="body">{title}</T>
      </View>
      {illus}
      <T v="label" c="muted" style={{ lineHeight: 19 }}>
        {body}
      </T>
    </Card>
  );
  const pill = (t: string, primary = false) => (
    <View
      key={t}
      style={{
        height: 34,
        paddingHorizontal: 14,
        borderRadius: 17,
        backgroundColor: primary ? colors.accent : colors.fill,
        justifyContent: 'center',
      }}
    >
      <T v="label" c={primary ? 'onAccent' : 'ink'}>
        {t}
      </T>
    </View>
  );
  const toggle = (title: string, meta: string, value: boolean, onChange: (v: boolean) => void) => (
    <Toggle
      title={title}
      caption={meta}
      value={value}
      onChange={onChange}
      style={{ backgroundColor: colors.ground, borderRadius: 16, padding: 12 }}
    />
  );

  return (
    <Screen footer={<PillButton kind="strong" title="Готово" onPress={onDone} />}>
      <StepHeader n={4} title="Как пользоваться" onBack={onBack} />
      <T v="bodyRegular" c="muted" style={{ lineHeight: 22 }}>
        Четыре привычки, и таблица ведётся почти сама.
      </T>
      {card(
        1,
        'Покупка: категория из шторки',
        'Нажми категорию прямо в уведомлении, даже на заблокированном экране. Первая подсказка: что ты ставил этому магазину, потом самые частые траты.',
        <View style={{ backgroundColor: colors.hero, borderRadius: 18, padding: 12 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <T v="body">Пятёрочка</T>
                <T v="caption" c="muted">
                  Т-Банк · осталось 1 082 ₽
                </T>
              </View>
              <T v="body" style={{ fontFamily: fonts.display }}>
                −523 ₽
              </T>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[pill('Продукты', true), pill('Транспорт')]}
            </View>
          </View>
        </View>,
      )}
      {card(
        2,
        'Входящие: свайпы',
        'Всё, что не разметил в шторке, ждёт здесь. Свайп по карточке быстрее, чем открывать её.',
        <View style={{ gap: 8 }}>
          <View style={{ height: 64, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.accent }}>
            <T v="label" c="onAccent" style={{ position: 'absolute', left: 16, top: 22 }}>
              «Продукты»
            </T>
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 120,
                right: -120,
                backgroundColor: colors.card,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.control,
                justifyContent: 'center',
                paddingHorizontal: 14,
              }}
            >
              <T v="body">Пятёрочка</T>
              <T v="caption" c="muted">
                −523 ₽ · сегодня
              </T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="caption" c="accentInk">
              → вправо: первая подсказка
            </T>
            <T v="caption" c="warnInk">
              ← влево: удалить
            </T>
          </View>
        </View>,
      )}
      {card(
        3,
        '«Всегда так»',
        'Со второй одинаковой категории приложение предложит правило. Дальше этот магазин размечается сам, и на втором телефоне тоже.',
        <View style={{ backgroundColor: colors.ground, borderRadius: 16, padding: 12, gap: 10 }}>
          <T v="label">Всегда «Продукты» для Пятёрочки?</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View
              style={{
                height: 34,
                paddingHorizontal: 14,
                borderRadius: 17,
                backgroundColor: colors.strong,
                justifyContent: 'center',
              }}
            >
              <T v="label" c="onStrong">
                Всегда так
              </T>
            </View>
            {pill('Только сейчас')}
          </View>
        </View>,
      )}
      {card(
        4,
        'Отправка в таблицу',
        'Включи, и размеченное уйдёт само, даже когда приложение закрыто. Или жми «Отправить в таблицу» во «Входящих».',
        toggle('Отправлять размеченные сами', 'через минуту после разметки', auto, (on) => {
          void autoSend.set(on);
          setAuto(on);
        }),
      )}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <CheckIcon color={colors.accentInk} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="body">Виджет на рабочий стол</T>
            <T v="caption" c="muted">
              долгое нажатие на экране → Виджеты → Бюджет
            </T>
          </View>
        </View>
        {toggle('Остаток на экране блокировки', 'закреплённое уведомление «Можно сегодня»', lock, (on) => {
          listener?.setLockStatus(on);
          setLock(on);
        })}
      </Card>
    </Screen>
  );
}
