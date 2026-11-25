import { Alert, Pressable, View } from 'react-native';
import { deleteRule } from '@/adapters/rules';
import { useRules } from '@/hooks/data';
import { Card, Screen, ScreenHeader, T } from '@/ui/kit';
import { useTheme } from '@/ui/theme';
import { goBack } from '@/state/nav';

/** Правила «всегда так»: общие для двух телефонов через лист «Правила». */
export default function Rules() {
  const { colors } = useTheme();
  const { rules, refresh } = useRules();
  const active = rules.filter((r) => r.subcategory);
  const remove = (pattern: string) =>
    Alert.alert('Удалить правило?', `«${pattern}» снова будет спрашивать категорию.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          deleteRule(pattern);
          void refresh();
        },
      },
    ]);
  return (
    <Screen>
      <ScreenHeader title="Правила категорий" onBack={goBack} />
      <T v="label" c="muted">
        Правило появляется, когда в операции нажимаешь «Всегда так». Общие для двух телефонов, хранятся в
        листе «Правила».
      </T>
      {active.length ? (
        <Card style={{ paddingVertical: 4, gap: 0 }}>
          {active.map((r, i) => (
            <View
              key={r.pattern}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 12,
                borderBottomWidth: i === active.length - 1 ? 0 : 1,
                borderBottomColor: colors.line,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <T v="body" numberOfLines={1}>
                  {r.pattern}
                </T>
                <T v="caption" c="muted">
                  → {r.subcategory}, добавил: {r.author}
                </T>
              </View>
              {/* Удаление через «⋯» с подтверждением: красная кнопка в каждой строке была шумом (аудит 05.11). */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Действия с правилом ${r.pattern}`}
                hitSlop={8}
                onPress={() => remove(r.pattern)}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <T v="h2" c="muted">
                  ⋯
                </T>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <T v="label" c="muted">
            Правил пока нет.
          </T>
        </Card>
      )}
    </Screen>
  );
}
