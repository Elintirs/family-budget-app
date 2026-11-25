import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Share } from 'react-native';
import { api, log } from '@/adapters';
import { getConnection, maskToken, parseConnectLink, setConnection } from '@/adapters/connection';
import { keys, useAuthor, useBootstrap, type Author } from '@/hooks/data';
import { goBack } from '@/state/nav';
import { Card, Input, PillButton, Row, Screen, ScreenHeader, Segmented, T } from '@/ui/kit';

const GENITIVE: Record<string, string> = { Елена: 'Елены', Олег: 'Олега' };

/** Это устройство: автор, таблица, ключ. Новый ключ приходит ссылкой подключения. */
export default function Devices() {
  const qc = useQueryClient();
  const [author] = useAuthor();
  const boot = useBootstrap().data;
  const [conn, setConn] = useState(getConnection);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'bad' | 'ok'>('idle');

  const onPaste = (value: string) => {
    setText(value);
    if (!value.trim()) return setState('idle');
    const c = parseConnectLink(value);
    if (!c) return setState('bad');
    setConnection(c);
    setConn(c);
    setState('ok');
    log.info('onboarding', 'Переподключено по ссылке', { token: maskToken(c.token) });
    void qc.invalidateQueries({ queryKey: keys.bootstrap });
  };

  // Приглашение второго телефона: сервер выдаёт новый ключ в ту же таблицу, ссылку шлём через «Поделиться».
  const other: Author = author === 'Олег' ? 'Елена' : 'Олег';
  const [invitee, setInvitee] = useState<Author>(other);
  const [inviting, setInviting] = useState(false);
  const invite = async () => {
    setInviting(true);
    try {
      const r = await api.invite(invitee);
      log.info('onboarding', 'Приглашение создано', { author: r.author, table: r.tableName });
      await Share.share({
        message: `Бюджет на двоих: ссылка подключения для ${GENITIVE[r.author] ?? r.author}. Скопируй её целиком и вставь в приложении на шаге «Подключи таблицу».\n\n${r.link}`,
      });
    } catch (e) {
      log.error('onboarding', 'Приглашение не создано', e);
      Alert.alert('Не получилось', 'Таблица не ответила, попробуй ещё раз.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Устройство" onBack={goBack} />
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <Row title="Автор операций" right={<T v="label">{author}</T>} />
        <Row title="Таблица" right={<T v="label">{boot?.tableName ?? 'не подключена'}</T>} />
        <Row title="Ключ устройства" right={<T v="label">{conn ? maskToken(conn.token) : '—'}</T>} />
        <Row title="Версия" right={<T v="label">{Constants.expoConfig?.version ?? ''}</T>} last />
      </Card>
      <Card style={{ gap: 10 }}>
        <T v="body">Подключить заново</T>
        <T v="caption" c="muted" style={{ lineHeight: 18 }}>
          Скопируй сообщение со ссылкой budget://connect и нажми «Вставить ссылку». Операции, которые ещё не
          отправлены, останутся на телефоне.
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
          placeholder="budget://connect?…"
          autoCapitalize="none"
          autoCorrect={false}
          bad={state === 'bad'}
        />
        {state === 'bad' ? (
          <T v="caption" c="warnInk">
            Это не похоже на ссылку подключения
          </T>
        ) : state === 'ok' ? (
          <T v="caption" c="accentInk">
            Подключено, данные обновляются
          </T>
        ) : null}
      </Card>
      <Card style={{ gap: 10 }}>
        <T v="body">Пригласить второй телефон</T>
        <T v="caption" c="muted" style={{ lineHeight: 18 }}>
          Создаст ссылку подключения к этой же таблице. Отправь её, например, в Telegram: на втором телефоне
          её нужно скопировать и вставить на шаге «Подключи таблицу».
        </T>
        <Segmented<Author>
          label="Для кого"
          value={invitee}
          onChange={setInvitee}
          options={[
            { key: 'Елена', title: 'Елена' },
            { key: 'Олег', title: 'Олег' },
          ]}
        />
        <PillButton
          kind="strong"
          size="md"
          title={inviting ? 'Создаём ссылку…' : 'Создать и отправить ссылку'}
          loading={inviting}
          style={{ alignSelf: 'flex-start' }}
          onPress={invite}
        />
      </Card>
      <Card tone="fill">
        <T v="label" c="muted">
          У каждого телефона свой ключ. Потерянный телефон отключается в Apps Script, второй продолжает
          работать.
        </T>
      </Card>
    </Screen>
  );
}
