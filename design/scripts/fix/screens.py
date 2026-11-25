"""Экраны приложения 0.3.14: тексты и условия из apps/mobile/src/app, суммы и имена условные."""
from kit import *

TODAY = 'среда, 4 ноября'
ACCS = ['Т-Банк', 'Т-Банк Елена', 'Сбер Елены', 'ВТБ', 'Наличные', 'Сбер кредитка', 'Т-Банк кредитка']
ICON = {'Т-Банк': ('Т', 'monoYellow'), 'Т-Банк Елена': ('Т', 'monoYellow'), 'Сбер Елены': ('С', 'monoGreen'), 'ВТБ': ('В', 'monoGray'), 'Наличные': ('Н', 'monoGray')}


def AccChips(sel=None, skip=()):
    return Chips(*[Chip(a, a == sel) for a in ACCS if a not in skip])


def Hero(remaining=1982, spent=640, limit=2622, pending=2, month=70160, days=27, inner=''):
    pct = min(100, max(0, spent / limit * 100))
    over = remaining < 0
    chip = ''
    if pending:
        chip = row(icon('clock', PEACH, 14, 2.4), T(f'с учётом {pending} неотправленных', 'label', style='color:#DCE2EA'), gap=8,
                   style=f"align-self:flex-start;background:{C('heroChip')};border-radius:12px;padding:8px 12px")
    num = R(remaining).replace(' ₽', '')
    return box(
        col(T('Можно потратить сегодня', 'body', style=f"color:{C('heroMuted')}"),
            f'<span style="display:block;{VARIANTS["display"]};color:{C("heroInk")};white-space:nowrap">{num}<span style="color:{C("warnInk") if over else C("heroAccent")}"> ₽</span></span>', gap=6),
        col(f'<div style="height:8px;border-radius:4px;background:{C("heroTrack")};overflow:hidden"><div style="width:{pct:.0f}%;height:8px;border-radius:4px;background:{C("warn") if over else C("heroAccent")}"></div></div>',
            between(T(f'Потрачено {R(spent)}', 'label', style=f"color:{C('heroMuted')}"), T(f'Лимит на день {R(limit)}', 'label', style=f"color:{C('heroMuted')}")), gap=8),
        chip,
        inner,
        row(grow(T('Осталось на месяц', 'caption', style=f"color:{C('heroMuted')}"), T(R(month), 'num', style=f"color:{C('heroInk')};font-size:18px")),
            grow(T('До конца месяца', 'caption', style=f"color:{C('heroMuted')}"), T(f'{days} дней', 'num', style=f"color:{C('heroInk')};font-size:18px")),
            align='flex-start', style=f"border-top:1px solid {C('heroTrack')};padding-top:16px"),
        style=f"background:{C('hero')};border-radius:28px;padding:24px;display:flex;flex-direction:column;gap:18px")


def MainHead(waiting=2):
    btn = (f'<a href="{link("SyncResult") or "#"}" aria-label="Отправить в таблицу, ждут {waiting}" style="height:44px;padding:0 16px;border-radius:22px;border:1.5px solid {C("control")};background:{C("card")};'
           f'display:flex;align-items:center;gap:8px;box-sizing:border-box;text-decoration:none">{icon("sync", C("accentInk"), 18, 2.2)}{T(f"Отправить · {waiting}", "label")}</a>') if waiting else ''
    return between(col(T(TODAY, 'bodyRegular', 'muted'), T('Бюджет', 'title', tag='h1'), gap=2), btn, align='center')


def AccRow(name, value, meta=None, tone='muted', last=False, neg=False, href='Account'):
    letter, mono = ICON.get(name, (name[0], 'monoGray'))
    return Row(name, meta, tone, left=Mono(letter, mono), right=Num(R(value), 'warnInk' if neg else 'ink'), last=last, href=href)


def Lists(money=64020):
    return [
        between(T('На счетах', 'h2', tag='h2'), T(R(money), 'h2', style=f"font-family:{UB};font-weight:600")),
        ListCard(
            AccRow('Т-Банк', 42180, 'сходится с банком', 'accentInk'),
            AccRow('Т-Банк Елена', 1240, 'сходится с банком', 'accentInk'),
            AccRow('Сбер Елены', 5400, 'разница с банком 400 ₽', 'warnInk'),
            AccRow('ВТБ', 3200, 'нет данных из банка'),
            AccRow('Наличные', 12000),
            T('Сбер: 0 ₽', 'caption', 'muted', style='padding:12px 0'),
        ),
    ]


def Tail():
    return [
        box(Row('История операций', right=Chevron(), last=True, href='History'), style=f"background:{C('card')};border-radius:22px;padding:4px 16px"),
        f'<a href="{link("DebtPlan") or "#"}" aria-label="Долги" style="background:{C("card")};border-radius:22px;padding:16px;display:flex;flex-direction:row;gap:12px;text-decoration:none">'
        + grow(T('Долг по кредиткам', 'caption', 'muted'), T(R(540000), 'num', 'warnInk', style='font-size:18px'))
        + grow(T('Чистые деньги', 'caption', 'muted'), T(R(-445980), 'num', style='font-size:18px'), T(f'с учётом «нам должны» {R(30000)}', 'caption', 'muted'))
        + '</a>',
        box(Row('Цели', 'Подушка 15%, Отпуск 20%', right=row(Label(R(45000)), Chevron(), gap=8), last=True, href='Goals'), style=f"background:{C('card')};border-radius:22px;padding:4px 16px"),
    ]


def main():
    scr = Screen('Main', 'Главная', 'main', [
        MainHead(), Hero(),
        LimitsFoldCard(),
        *Lists(), *Tail(),
    ], tab='Main', badge=4)
    scr.script = FOLD_SCRIPT
    return scr


def main_alerts():
    more = (f'<button type="button" aria-expanded="false" style="display:flex;align-items:center;gap:12px;width:100%;min-height:52px;background:{C("card")};border:0;border-radius:22px;padding:8px 16px;font-family:Manrope,sans-serif;text-align:left">'
            + grow(T('Ещё 3 предупреждения'), T('нет связи с таблицей · телефон усыпляет · вышла 0.3.15', 'caption', 'muted')) + Chevron() + '</button>')
    return Screen('MainAlerts', 'Главная: одна плашка, остальные свёрнуты', 'main', [
        MainHead(0),
        Card(T('Нет доступа к уведомлениям', 'body', 'warnSoftInk'),
             T('Покупки из банков не ловятся. Включи «Бюджет» в списке доступа к уведомлениям.', 'label', 'warnSoftInk'),
             Pill('Включить', 'strong', 'md', style='align-self:flex-start'), tone='warnSoft'),
        Hero(pending=0),
        more,
        T('Показываем одну плашку, самую важную: нет доступа → нет связи → телефон усыпляет → новая версия. Остальные в строке «Ещё».', 'caption', 'muted', style='text-align:center'),
    ], tab='Main')


def main_negative():
    return Screen('MainNegative', 'Главная: счёт в минусе', 'main', [
        MainHead(0), Hero(remaining=-443, spent=2152, limit=1709, pending=0),
        f'<a href="{link("Reconcile") or "#"}" style="text-decoration:none;display:block">' + Card(T(f'Т-Банк Елена в минусе: {R(-98000)}', 'body', 'warnSoftInk'),
             T('Карта и наличные в минус не уходят, значит, в таблице ошибка. Чаще всего это перевод, записанный в обратную сторону, или покупка не с того счёта.', 'caption', 'warnSoftInk'),
             T('Открыть сверку', 'label', 'warnSoftInk', style='text-decoration:underline'), tone='warnSoft', gap=4) + '</a>',
        between(T('На счетах', 'h2', tag='h2'), T(R(-33800), 'h2', style=f"font-family:{UB};font-weight:600")),
        ListCard(
            AccRow('Т-Банк', 42180, 'сходится с банком', 'accentInk'),
            AccRow('Т-Банк Елена', -98000, f'так не бывает, в банке {R(1240)}', 'warnInk', neg=True, href='Reconcile'),
            AccRow('Наличные', 22020, last=True),
        ),
    ], tab='Main')


def Kebab(label='Действия с покупкой'):
    dots = ''.join(f'<span style="display:block;width:4px;height:4px;border-radius:2px;background:{C("muted")}"></span>' for _ in range(3))
    return f'<button type="button" aria-label="{label}" style="width:44px;height:44px;margin:-8px -12px -8px 0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;gap:3px;flex-shrink:0">{dots}</button>'


def OpHead(icon_letter, tone, title, meta, amount, plus=False, menu=True):
    # «Т-Банк · из уведомления · сегодня 18:45» → слева счёт (источник только если не уведомление), справа сумма и время
    parts = meta.split(' · ')
    if len(parts) != 3:
        return row(Mono(icon_letter, tone), grow(T(title), T(meta, 'caption', 'muted')), Num(amount, 'accentInk' if plus else 'ink'), Kebab() if menu else '', gap=12)
    acc, src, when = parts
    left = acc if src == 'из уведомления' else f'{acc}, {src}'
    return row(Mono(icon_letter, tone), grow(T(title), T(left, 'caption', 'muted')), NumWhen(amount, when, 'accentInk' if plus else 'ink'), Kebab() if menu else '', gap=12, align='flex-start')


def InboxHead():
    return col(T('Входящие', 'title', tag='h1'), T('из уведомлений банков и вручную', 'bodyRegular', 'muted'), gap=2)


def Badge(text):
    return f'<span style="display:block;align-self:flex-start;background:{C("warnSoft")};border-radius:8px;padding:4px 8px;{VARIANTS["caption"]};color:{C("warnSoftInk")}">{text}</span>'


def inbox():
    return Screen('Inbox', 'Входящие', 'main', [
        InboxHead(),
        Chips(Chip('Все 4', True), Chip('Без категории 2'), Chip('Готовы 2')),
        Card(OpHead('Т', 'warnSoft', 'Пятёрочка', 'Т-Банк · из уведомления · сегодня 18:45', R(-523)),
             Badge('Выбери категорию'),
             Chips(Chip('Продукты', tone='suggested'), Chip('Рестораны и кафе'), Chip('Транспорт'), Chip('Все категории…', tone='more')),
             T('Подсказка: ты так отмечал этот магазин.', 'caption', 'muted')),
        Card(OpHead('Т', 'monoGray', 'Суши-Маркет', 'Т-Банк · из уведомления · сегодня 14:10', R(-624)),
             Chips(Chip('Доставка еды', True)),
             between(f'<span style="display:block;background:{C("accentSoft")};border-radius:8px;padding:4px 8px;{VARIANTS["caption"]};color:{C("accentSoftInk")}">по правилу «Суши-Маркет → Доставка еды»</span>', Pill('Изменить', 'ghost', 'md'), align='center')),
        Card(OpHead('Т', 'monoGray', 'Бутыль', 'Т-Банк · из уведомления · сегодня 12:09', R(-272.96)),
             Chips(Chip('Продукты', True), Chip('Товары для дома'), Chip('Все категории…', tone='more')),
             box(T('Всегда «Продукты» для Бутыль?'), T('Уже второй раз так. Правило появится и на втором телефоне.', 'caption', 'muted'),
                 row(Pill('Всегда так', 'strong', 'md'), Pill('Только сейчас', 'secondary', 'md'), gap=8),
                 style=f"background:{C('ground')};border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px")),
        Card(OpHead('Т', 'warnSoft', 'счет RUB. Олег Д.', 'Т-Банк Елена · из уведомления · сегодня 09:42', R(40000, True), plus=True),
             Chips(Chip('Зарплата'), Chip('Аванс'), Chip('Возвраты и кешбэк'), Chip('Прочее'))),
    ], footer=Pill('Отправить в таблицу · 2', 'primary', href='SyncResult', style='width:100%'), tab='Inbox', badge=4)


def inbox_states():
    return Screen('InboxStates', 'Входящие: вопросы к покупке', 'main', [
        InboxHead(),
        Card(OpHead('Т', 'warnSoft', 'Покупка', 'Т-Банк · из уведомления · сегодня 19:04', R(-223.8)),
             Soft(T('Новая карта ••4321: с какого она счёта?', 'label'),
                  T('Mir Pay показывает свой номер, а не цифры с карты. Запомню, и дальше покупки с ••4321 пойдут на этот счёт сами.', 'caption', 'muted'),
                  AccChips('Т-Банк'), Pill('Не знаю, не спрашивать', 'ghost', 'md'), tone='fill'),
             Badge('Выбери категорию'),
             Chips(Chip('Продукты', tone='suggested'), Chip('Транспорт'), Chip('Все категории…', tone='more')),
             T('Новый магазин: подсказки из твоих частых.', 'caption', 'muted')),
        Card(OpHead('Т', 'warnSoft', 'Деливери', 'Т-Банк · из уведомления · сегодня 15:28', R(-1642.2)),
             Soft(T('Похоже на ту же покупку с телефона Елены. В таблицу пока не записана.', 'label', 'warnSoftInk'),
                  row(Pill('Это дубль', 'strong', 'md', style='flex:1 1 0'), Pill('Разные покупки', 'secondary', 'md', style='flex:1 1 0;padding:0 8px'), gap=8))),
        Card(OpHead('Т', 'warnSoft', 'Магазин у дома', 'Т-Банк · из уведомления · сегодня 08:15', R(-507)),
             Soft(T('Покупка картой: Елена. С телефона Елены за 6 часов не пришла. Если её никто не вносил, размечай и отправляй.', 'label', 'warnSoftInk'),
                  Pill('Уже внесена, удалить', 'secondary', 'md'))),
    ], footer=col(
        row(T('Удалено: Пятёрочка', 'label', style=f"color:{C('onStrong')};flex:1 1 0"),
            f'<button type="button" style="height:44px;padding:0 16px;background:transparent;border:0;{VARIANTS["label"]};font-family:Manrope,sans-serif;color:{C("heroAccent") if not Ctx.dark else C("accent")}">Вернуть</button>',
            gap=12, style=f"background:{C('strong')};border-radius:18px;padding:6px 6px 6px 18px"),
        gap=10), tab='Inbox', badge=3)


def inbox_empty():
    return Screen('InboxEmpty', 'Входящие: всё разобрано', 'main', [
        InboxHead(),
        col(f'<div style="width:88px;height:88px;border-radius:44px;background:{C("accentSoft")};display:flex;align-items:center;justify-content:center">{icon("check", C("accentInk"), 40, 2.6)}</div>',
            T('Всё разобрано', 'title', style='font-size:20px'),
            T('Новые покупки появятся здесь сами.', 'bodyRegular', 'muted', style='text-align:center'),
            Pill('История операций', 'secondary', 'md', href='History'), gap=14, style='align-items:center;padding-top:72px'),
    ], tab='Inbox')


SUBS = ['Продукты', 'Транспорт', 'Рестораны и кафе', 'Доставка еды', 'Товары для дома', 'Развлечения', 'Вкусняшки', 'Подписки', 'Аренда', 'Связь', 'Коммуналка', 'Проценты и комиссии', 'Штрафы/Госпошлины', 'Машина', 'Здоровье', 'Одежда и обувь']


def Field(title, *kids):
    return col(T(title, 'h2', style='font-size:14px'), Chips(*kids), gap=10)


def AmountCard(amount, when='Сегодня 21:02'):
    color = C('ink') if amount else C('muted')
    return Card(T('Сумма', 'label', 'muted'),
                f'<span style="display:block;font-family:{UB};font-weight:600;font-size:44px;color:{color};text-align:center;line-height:54px">{amount or "0 ₽"}</span>',
                f'<span style="display:block;{VARIANTS["label"]};color:{C("muted")}">{when} · <span style="color:{C("accentInk")}">изменить</span></span>',
                gap=4, style='align-items:center;padding:20px 16px')


def AccountPick(acc, title='Счёт', hint='по умолчанию'):
    letter, mono = ICON.get(acc, (acc[0], 'monoGray'))
    return f'<a href="{link("Pick") or "#"}" aria-label="{title}: {acc}, изменить" style="text-decoration:none;display:block">' + ListCard(
        Row(title, None, left=Mono(letter, mono, 36), right=row(T(acc, 'label'), T(hint, 'caption', 'muted'), Chevron(), gap=8), last=True)) + '</a>'


def Comment(value=''):
    return col(T('Комментарий', 'h2', style='font-size:14px'), Input(value=value, label='Комментарий', r=14, bw=1, bg='card'), gap=8)


KINDS = ['Расход', 'Доход', 'Перевод']


def add():
    return Screen('Add', 'Добавить: расход', 'main', [
        T('Новая операция', 'title', tag='h1'), Seg(KINDS, 'Расход'), BalanceAmount(1355, 41657),
        Field('Подкатегория', Chip('Продукты', True), Chip('Транспорт'), Chip('Рестораны и кафе'), Chip('Доставка еды'), Chip('Вкусняшки'), Chip('Все категории…', tone='more')),
        FromAccount('Т-Банк', 41657, 1355, 'Счёт'),
        Comment(),
    ], footer=Pill('Сохранить', 'primary', style='width:100%', href='Main'), tab='Add')


def add_income():
    return Screen('AddIncome', 'Добавить: доход', 'ops', [
        T('Новая операция', 'title', tag='h1'), Seg(KINDS, 'Доход'), AmountCard('40 000 ₽'),
        Field('Категория дохода', Chip('Зарплата', True), Chip('Аванс'), Chip('Возвраты и кешбэк'), Chip('Прочее')),
        AccountPick('ВТБ', hint=''),
        Comment(),
    ], footer=Pill('Сохранить', 'primary', style='width:100%'), tab='Add')


def FromAccount(acc, balance, amount, title='Откуда'):
    """Строка счёта с «было → станет»: оранжевое только отрицательное «станет»."""
    letter, mono = ICON.get(acc, (acc[0], 'monoGray'))
    after = balance - amount
    num = lambda t, c: f'<span style="{VARIANTS["label"]};color:{C(c)};white-space:nowrap">{t}</span>'
    right = col(T(acc, 'label'), row(num(R(balance), 'muted'), num('→', 'muted'), num(R(after), 'warnInk' if after < 0 else 'muted'), gap=6), gap=2, style='align-items:flex-end')
    return ListCard(Row(title, None, left=Mono(letter, mono, 36), right=row(right, Chevron(), gap=8), last=True, href='Pick'))


def BalanceAmount(amount, balance):
    """Подпись под суммой: серая «Доступно», при превышении та же строка оранжевая с выходом."""
    over = amount > balance
    color = C('warnInk') if over else C('ink')
    if over:
        link_ = f'<a href="#" style="{VARIANTS["label"]};color:{C("accentInk")};text-decoration:underline;text-underline-offset:3px">Перевести всё {R(balance)}</a>'
        under = row(T(f'Больше остатка на {R(amount - balance)}', 'label', 'warnInk'), T('·', 'label', 'muted'), link_, gap=6, style='flex-wrap:wrap;justify-content:center')
    else:
        under = T(f'Доступно {R(balance)}', 'label', 'muted')
    return Card(T('Сумма', 'label', 'muted'),
                f'<span style="display:block;font-family:{UB};font-weight:600;font-size:44px;color:{color};text-align:center;line-height:54px">{R(amount)}</span>',
                under, gap=8, style='align-items:center;padding:20px 16px')


def add_transfer():
    return Screen('AddTransfer', 'Перевод: доступно и «было → станет»', 'ops', [
        T('Новая операция', 'title', tag='h1'), Seg(KINDS, 'Перевод'), BalanceAmount(1000, 1200),
        FromAccount('Т-Банк', 1200, 1000), AccountPick('Т-Банк кредитка', 'Куда', ''),
        Comment('Цель: Отпуск'),
    ], footer=Pill('Сохранить', 'primary', style='width:100%'), tab='Add')


def overdraft():
    return Screen('Overdraft', 'Перевод больше остатка: одна строка', 'ops', [
        T('Новая операция', 'title', tag='h1'), Seg(KINDS, 'Перевод'), BalanceAmount(5000, 1200),
        FromAccount('Т-Банк', 1200, 5000), AccountPick('Т-Банк кредитка', 'Куда', ''),
        Comment(),
    ], footer=Pill('Сохранить', 'primary', style='width:100%'), tab='Add')


def pick():
    def group(g, items, sel=None):
        rows = []
        for i, s in enumerate(items):
            on = s == sel
            b = '' if i == len(items) - 1 else f"border-bottom:1px solid {C('line')};"
            rows.append(f'<button type="button" style="height:48px;width:100%;background:transparent;border:0;{b}padding:0;display:flex;align-items:center;justify-content:space-between;font-family:Manrope,sans-serif">'
                        + T(s, 'body' if on else 'bodyRegular', 'accentInk' if on else 'ink') + (icon('check', C('accentInk'), 18, 2.6) if on else '') + '</button>')
        return col(Sec(g), box(*rows, style=f"background:{C('card')};border-radius:18px;padding:0 16px"), gap=8)

    def Sec(t):
        return T(t, 'caption', 'muted', style='text-transform:uppercase;letter-spacing:0.5px;font-weight:800;margin-top:4px')
    return Screen('Pick', 'Выбор подкатегории', 'ops', sheet=Sheet(
        between(T('Подкатегория', 'h2'), T(f'Пятёрочка · {R(-523)}', 'caption', 'muted')),
        Input('Поиск: «дост», «такси»…', r=24, label='Поиск подкатегории'),
        Sec('Подсказки'), Chips(Chip('Продукты', tone='suggested'), Chip('Рестораны и кафе'), Chip('Транспорт')),
        Sec('Частые'), Chips(Chip('Доставка еды'), Chip('Товары для дома'), Chip('Развлечения')),
        group('Повседневные', ['Продукты', 'Транспорт', 'Рестораны и кафе', 'Доставка еды', 'Товары для дома', 'Развлечения'], 'Продукты'),
        group('Обязательные', ['Аренда', 'Связь', 'Коммуналка', 'Проценты и комиссии', 'Штрафы/Госпошлины']),
        group('Крупные', ['Машина', 'Здоровье', 'Одежда и обувь']),
        gap=12))


def SyncSheet(failed=False):
    circle = lambda c, ic: f'<div style="width:64px;height:64px;border-radius:32px;background:{C(c)};display:flex;align-items:center;justify-content:center">{ic}</div>'
    if failed:
        body = Card(T('Таблица не ответила', 'body', 'warnSoftInk'), T('сеть: нет ответа за 30 с', 'caption', 'warnSoftInk'),
                    T('Операции остались во «Входящих». Повтор безопасен: дубля не будет.', 'label', 'warnSoftInk'),
                    Pill('Повторить', 'strong', 'md', style='align-self:flex-start'), tone='warnSoft')
        title, c, ic = 'Не отправлено', 'warnSoft', icon('sync', C('warnInk'), 24, 2.2)
    else:
        ck = icon('check', C('accentInk'), 18, 2.6)
        body = ListCard(
            Row('Операции', 'записаны в «Форму»', left=ck, right=Num('2')),
            Row('Правки', 'применены в таблице', left=ck, right=Num('1')),
            Row('Не нашлось в таблице', 'строку удалили или поменяли руками, правка не применилась', 'warnInk', right=Num('1')),
            Row('Похожи на дубли', 'остались во «Входящих»', 'warnInk', right=row(Num('1'), Pill('Разобрать', 'secondary', 'md', href='InboxStates'), gap=10)),
            Row('Отклонены', 'нет подкатегории', 'warnInk', right=row(Num('1'), Pill('Разобрать', 'secondary', 'md', href='Inbox'), gap=10)),
            Row('Остаток на день', 'обновлён из «Сводки»', left=ck, right=Num(R(1342)), last=True))
        title, c, ic = 'Отправлено в таблицу', 'accentSoft', icon('sync', C('accentInk'), 24, 2.2)
    return Sheet(col(circle(c, ic), T(title, 'title', style='font-size:20px'), gap=10, style='align-items:center'), body, Pill('Готово', 'primary', href='Main'))


def sync_result():
    return Screen('SyncResult', 'Результат отправки', 'ops', sheet=SyncSheet(), h=844)


def sync_failed():
    return Screen('SyncFailed', 'Отправка не удалась', 'ops', sheet=SyncSheet(True), h=844)


def history():
    def op(letter, tone, title, meta, amount, plus=False, wait=False, gray=False, last=False, href='Operation'):
        b = '' if last else f"border-bottom:1px solid {C('line')};"
        url = link(href)
        inner = (Mono(letter, tone) + grow(T(title, style='white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), T(meta, 'caption', 'muted'))
                 + col(Num(amount, 'muted' if gray else 'accentInk' if plus else 'ink'), row(icon('clock', C('warnInk'), 12, 2.4), T('ждёт', 'caption', 'warnInk'), gap=4) if wait else row(icon('check', C('accentInk'), 12, 2.6), T('в таблице', 'caption', 'muted'), gap=4), gap=4, style='align-items:flex-end'))
        css = f"display:flex;align-items:center;gap:12px;padding:12px 0;{b}text-decoration:none"
        return f'<a href="{url}" style="{css}">{inner}</a>' if url else f'<div style="{css}">{inner}</div>'

    def day(t, total, *ops):
        return col(between(T(t, 'label', 'muted'), T(total, 'label', 'muted')), ListCard(*ops), gap=8)
    return Screen('History', 'История', 'ops', [
        Header('История'), Input('Магазин, сумма, комментарий', r=24, label='Поиск по операциям'),
        Chips(Chip('Все', True), Chip('Расходы'), Chip('Доходы'), Chip('Переводы'), Chip('Олег'), Chip('Елена')),
        day('Сегодня', R(-747),
            op('Т', 'monoYellow', 'Пятёрочка', 'Продукты · Н', R(-523), wait=True),
            op('Т', 'monoYellow', 'Покупка', 'без категории · А', R(-223.8), wait=True, href='Operation'),
            op('Т', 'monoYellow', 'Поправка · Т-Банк', 'по сверке, не расход · Н', R(-1763), gray=True, href='OperationFix'),
            op('Т', 'monoYellow', 'Перевод', 'перевод · А', R(40000), href='OperationTransfer', last=True)),
        day('Вчера, 3 ноября', R(-4272),
            op('Д', 'monoGray', 'Деливери', 'Доставка еды · Н', R(-4272), href='OperationSynced', last=True)),
        day('2 ноября', R(40000, True),
            op('В', 'monoGray', 'Зарплата', 'Зарплата · Н', R(40000, True), plus=True),
            op('Н', 'monoGray', 'Носочки', 'Одежда и обувь · форма', R(-100), last=True)),
    ])


def OpTop(title, amount, plus=False, meta='нужна категория', letter='Т'):
    return col(Mono(letter, 'monoYellow', 48), T(title, style='text-align:center'),
               f'<a href="{link("OperationSynced") or "#"}" aria-label="Изменить сумму" style="text-decoration:none;display:block">' +
               T(amount, 'amount', 'accentInk' if plus else 'ink', style='text-align:center') + T('нажми, чтобы изменить сумму', 'caption', 'muted', style='text-align:center') + '</a>',
               T(meta, 'caption', 'muted'), gap=6, style='align-items:center;padding:8px 0')


def OneOff(on=True, offer=True):
    return Card(row(grow(T('Единовременный расход'), T('Крупная трата не каждый месяц: ремонт, штраф, техника', 'caption', 'muted')), Switch(on, 'Единовременный расход'), gap=12),
                T('В аналитике идёт в «Единовременные расходы» и не завышает регулярные траты и прогноз. В лимит месяца и остатки входит как обычно.', 'caption', 'muted'),
                Pill('Всегда так для «Машина»', 'secondary', 'md') if offer else '')


def Meta(author='Елена', source='уведомление', when='сегодня 18:45', card=None):
    last = card is None
    return ListCard(
        Row('Время', right=row(Label(when), Chevron(), gap=8)),
        Row('Автор', right=Label(author)),
        Row('Источник', right=Label(source), last=last),
        Row('Карта', right=Label(card), last=True) if card else '')


def CommentCard(value=''):
    return Card(T('Комментарий'), Input('Например: подарок маме', value=value, label='Комментарий'), gap=8)


def Push(title, text, app='Т-Банк', when='сегодня 18:45'):
    return Card(col(between(T(f'Уведомление {app}', 'caption', 'muted'), T(when, 'caption', 'muted')), T(f'{title}<br>{text}', 'label', style='font-weight:600', raw=True), gap=4), tone='fill', gap=8)


def operation():
    return Screen('Operation', 'Операция: новая', 'ops', [
        Header('Операция', 'Inbox'),
        OpTop('Пятёрочка', R(-523)),
        Seg(KINDS, 'Расход'),
        Card(T('Подкатегория'), Chips(Chip('Выбрать…', tone='more'))),
        OneOff(False, False),
        FromAccount('Т-Банк', 41657, 523, 'Счёт'),
        CommentCard(),
        Pill('Разделить покупку', 'secondary', href='OperationSplit'),
        Push('Пятёрочка', 'Покупка на 523 ₽, счет карты *5678<br>Доступно 41 657 ₽'),
        Meta(card='*5678 Елена'),
        Pill('Удалить операцию', 'danger'),
    ])


def operation_synced():
    return Screen('OperationSynced', 'Операция в таблице: правка суммы', 'ops', [
        Header('Операция', 'History'),
        col(Mono('Т', 'monoYellow', 48), T('СТО Автомир', style='text-align:center'),
            f'<input aria-label="Сумма" value="48 000" style="font-family:{UB};font-weight:600;font-size:36px;color:{C("ink")};text-align:center;width:220px;border:0;border-bottom:2px solid {C("accent")};background:transparent">',
            row(Pill('Отмена', 'ghost', 'md'), Pill('Сохранить сумму', 'primary', 'md'), gap=8),
            T('правка ждёт отправки', 'caption', 'muted'), gap=8, style='align-items:center;padding:8px 0'),
        Seg(KINDS, 'Расход'),
        Card(T('Подкатегория'), Chips(Chip('Машина', True), Chip('Изменить…', tone='more')), Pill('Всегда так для СТО Автомир', 'secondary', 'md')),
        OneOff(True, True),
        FromAccount('Т-Банк', 50180, 48000, 'Счёт'),
        CommentCard('Замена сцепления'),
        Card(T('Уведомление', 'caption', 'muted'), T('Покупка на 48 000 ₽, счет карты *5678<br>Доступно 2 180 ₽<br><br>Покупка, счет карты *5678. 48000 ₽. СТО Автомир', 'label', style='font-weight:600', raw=True), tone='fill', gap=4),
        Meta('Олег', 'вручную', 'вчера 15:28'),
        Pill('Удалить операцию', 'danger'),
    ])


def operation_transfer():
    return Screen('OperationTransfer', 'Операция: доход стал переводом', 'ops', [
        Header('Операция', 'History'),
        OpTop('счет RUB. Олег Д.', R(50000, True), True, 'ждёт отправки'),
        Seg(KINDS, 'Перевод'),
        Card(T('Откуда пришли'), T('Погашение кредитки, долг или между своими счетами: не расход и не доход, двигает только остатки.', 'caption', 'muted'), AccChips('ВТБ', skip=('Т-Банк Елена',))),
        Card(T('Куда пришли'), AccChips('Т-Банк Елена')),
        CommentCard('Зп Олега'),
        Push('ВТБ', 'Пополнение на 50 000 ₽, счет RUB. Олег Д.<br>Доступно 51 240 ₽', when='сегодня 09:42'),
        Meta('Елена', 'уведомление', 'сегодня 09:42'),
        Pill('Удалить операцию', 'danger'),
    ])


def operation_fix():
    return Screen('OperationFix', 'Операция: поправка по сверке', 'ops', [
        Header('Операция', 'History'),
        OpTop('Поправка по сверке 04.11: в банке 40 417 ₽', R(1763), False, 'в таблице'),
        Card(T('Поправка по сверке'), T('Подгоняет остаток счёта под банк. В расходы, доходы и лимиты не попадает. Если пропажа нашлась, удали поправку.', 'caption', 'muted'), tone='fill', gap=6),
        CommentCard('Поправка по сверке 04.11: в банке 40 417 ₽'),
        Meta('Олег', 'вручную', 'сегодня 12:30'),
        Pill('Удалить операцию', 'danger'),
    ])


def operation_split():
    def part(sub, value, last=False):
        b = '' if last else f"border-bottom:1px solid {C('line')};"
        pick = f'<a href="{link("Pick") or "#"}" style="flex:1 1 0;min-width:0;display:flex;align-items:center;gap:8px;text-decoration:none">' + grow(T(sub), T('категория', 'caption', 'muted')) + Chevron() + '</a>'
        amt = row(Input('0', value=value, weight=800, size=16, label=f'Сумма: {sub}', style='width:110px;text-align:right'), T('₽', 'body', 'muted'), gap=6)
        return row(pick, amt, gap=12, style=f"padding:10px 0;{b}")
    return Screen('OperationSplit', 'Разделить покупку', 'ops', [
        Header('Разделить покупку', 'Operation'),
        OpTop('Пятёрочка', R(-1523), meta='из уведомления'),
        Card(part('Продукты', '1 023'), part('Товары для дома', '500', True), gap=0, style='padding:4px 16px'),
        between(Pill('+ Ещё часть', 'secondary', 'md'), T(f'Осталось распределить: {R(0)}', 'label', 'accentInk'), align='center'),
    ], footer=Pill('Сохранить 2 части', 'primary', style='width:100%', href='Operation'))


def Compare(l_cap, l_val, r_cap, r_val, l_sub='', r_sub=''):
    return row(grow(T(l_cap, 'caption', 'muted'), T(l_val, 'num', style='font-size:20px'), T(l_sub, 'caption', 'muted') if l_sub else ''),
               grow(T(r_cap, 'caption', 'muted'), T(r_val, 'num', style='font-size:20px'), T(r_sub, 'caption', 'muted') if r_sub else ''), gap=12, align='flex-start')


def Dot(c):
    return f'<span style="display:block;width:10px;height:10px;border-radius:5px;background:{C(c)};flex-shrink:0"></span>'


def Point(when, source, value, ok=True, diff=None, last=False):
    return Row(when, source, left=Dot('accent' if ok else 'warn'),
               right=col(Num(value), T('сходится' if ok else f'разница {diff}', 'caption', 'accentInk' if ok else 'warnInk'), gap=2, style='align-items:flex-end'), last=last)


def Settings_(masks, credit=False):
    return [
        Sect('Настройки счёта', 'пишутся в «Счета»'),
        Card(col(T('Карты и слова из уведомления'), Input('1234 Олег, 5678 Елена, счет RUB', value=masks, h=44, r=12, bw=1, label='Маски карт и слова из уведомления'),
                 T('через запятую: последние 4 цифры карт и слова, которые банк пишет про этот счёт без карты («счет RUB»). По ним пуш понимает, что это этот счёт. Имя после карты: чья она, покупку этой картой отправит телефон владельца', 'caption', 'muted'), gap=6),
             col(T('Долг на старт' if credit else 'Остаток на старт'), Input('не меняем', h=44, r=12, bw=1, label='На старт'),
                 Row('Дата старта', right=row(Label('не меняем'), Chevron(), gap=8)),
                 T('с какого дня считать остаток по операциям; остаток на старт на конец этого дня', 'caption', 'muted'), gap=6),
             col(T('Кредитный лимит'), Input('200 000', value='600 000', h=44, r=12, bw=1, label='Кредитный лимит'), gap=6) if credit else '',
             gap=12),
    ]


def account():
    return Screen('Account', 'Счёт: расхождение и лента сверки', 'acc', [
        Header('Т-Банк', 'Main', Mono('Т', 'monoYellow')),
        Card(Compare('По таблице', R(58240), 'В банке', R(58243), 'с учётом всех операций', 'сегодня 18:46'),
             Soft(T(f'Не сходится на {R(32502)}', 'body', 'warnSoftInk'),
                  T(f'Скорее всего, «Зп Олега» записана через 2 минуты после остатка из банка. Поставь ей время раньше, и разница закроется.', 'caption', 'warnSoftInk'),
                  Pill('Поставить время до остатка', 'strong', 'md', style='align-self:flex-start'), gap=8)),
        Sect('Сверка', 'остатки из банка'),
        ListCard(
            Soft(T(f'Между вчера 15:56 и сегодня 18:46 лишние {R(32502)}', 'label', 'warnSoftInk'),
                 T(f'Похоже, «Зп Олега» на {R(32499)} внесено в сегодня 18:48, уже после снимка, а деньги прошли до него.', 'caption', 'warnSoftInk'),
                 Pill('Поставить время до остатка', 'strong', 'md', style='align-self:flex-start'), gap=8, style='margin:6px 0'),
            Point('сегодня 18:46', 'вручную', R(58243), False, R(32502)),
            Soft(T(f'Между вчера 15:53 и вчера 15:56 не хватает {R(542)}', 'label', 'warnSoftInk'),
                 T('Банк списал больше, чем записано. Скорее всего, одна трата не поймалась.', 'caption', 'warnSoftInk'),
                 Pill('Добавить пропущенное', 'strong', 'md', href='Add', style='align-self:flex-start'), gap=8, style='margin:6px 0'),
            Point('вчера 15:56', 'уведомление банка', R(21500)),
            Soft(T(f'Между 2 ноября 09:12 и вчера 15:53 лишние {R(25000)}', 'label', 'warnSoftInk'),
                 T('В таблице больше трат, чем списал банк. Возможно, дубль или не тот счёт.', 'caption', 'warnSoftInk'), gap=8, style='margin:6px 0'),
            Point('2 ноября 09:12', 'уведомление банка', R(47000), last=True)),
        Pill('Сверить с банком', 'primary', href='Reconcile'),
        T('Ноябрь по счёту', 'h2', tag='h2'),
        ListCard(Row('На начало', right=Num(R(21500))), Row('Приход', right=Num(R(40000, True))), Row('Уход', right=Num(R(-5427))), Row('Переводы', right=Num(R(1000, True)), last=True)),
        T('Последние операции', 'h2', tag='h2'),
        ListCard(Row('Альмак', 'Продукты, Олег', right=NumWhen(R(-1790), 'сегодня 14:25'), href='OperationSynced'),
                 Row('Зп Олега', 'Елена', right=NumWhen(R(32499, True), 'сегодня 18:48'), href='OperationTransfer'),
                 Row('Деливери', 'Доставка еды, Олег', right=NumWhen(R(-4272), 'вчера 17:28'), last=True)),
        ListCard(Row('Пятёрочка', 'ещё не в таблице', right=Num(R(-523)), last=True)),
        box(Row('Настройки счёта', 'карты, остаток на старт, лимит', right=Chevron(), last=True, href='AccountSettings'), style=f"background:{C('card')};border-radius:22px;padding:4px 16px"),
    ])


def account_settings():
    return Screen('AccountSettings', 'Счёт: настройки отдельно', 'acc', [
        Header('Настройки счёта', 'Account'), T('Т-Банк · меняются редко, пишутся в лист «Счета»', 'label', 'muted'),
        *Settings_('*1234 Олег, *5678 Елена')[1:],
    ], footer=Pill('Сохранить', 'primary', style='width:100%', href='Account'))


def account_credit():
    return Screen('AccountCredit', 'Счёт: кредитка', 'acc', [
        Header('Сбер кредитка', 'Debts', Mono('С', 'monoGreen')),
        Card(Compare('Долг по таблице', R(450000), 'В банке', R(450000), 'по операциям', 'сегодня 09:12'),
             Soft(T('✓ Сходится с банком', 'body', 'accentSoftInk'), tone='accentSoft')),
        Sect('Сверка', 'остатки из банка'),
        ListCard(Point('сегодня 09:12', 'уведомление банка', R(450000)), Point('1 ноября 08:47', 'уведомление банка', R(462300), last=True)),
        Pill('Погасить', 'primary', href='AddTransfer'),
        Pill('Сверить с банком', 'secondary', href='Reconcile'),
        T('Долг за ноябрь', 'h2', tag='h2'),
        ListCard(Row('На начало месяца', right=Num(R(462300))),
                 Row('Покупки и проценты', 'расходы с этой кредитки', right=Num(R(12700, True))),
                 Row('Погашено', 'переводы на кредитку', right=Num(R(-25000), 'accentInk'), last=True)),
        box(Row('Настройки счёта', 'карты, остаток на старт, лимит', right=Chevron(), last=True, href='AccountSettings'), style=f"background:{C('card')};border-radius:22px;padding:4px 16px"),
    ])


def account_receivable():
    return Screen('AccountOwed', 'Счёт: «Нам должны»', 'acc', [
        Header('Нам должны', 'Debts', Mono('Н')),
        Card(Compare('По таблице', R(30000), 'В банке', '—', 'по операциям', 'остатка из банка ещё нет'),
             Soft(T('Нет сверки', 'body', 'muted'), tone='fill')),
        row(Pill('Вернули', 'strong', 'md', style='flex:1 1 0', href='AddTransfer'), Pill('Дали в долг', 'secondary', 'md', style='flex:1 1 0', href='AddTransfer'), gap=10),
        Pill('Сверить с банком', 'secondary', href='Reconcile'),
        T('Ноябрь по счёту', 'h2', tag='h2'),
        ListCard(Row('На начало', right=Num(R(30000))), Row('Приход', right=Num(R(0))), Row('Уход', right=Num(R(0))), Row('Переводы', right=Num(R(0)), last=True)),
    ])


def reconcile():
    return Screen('Reconcile', 'Сверка: разница и подсказки', 'acc', [
        Header('Сверка', 'Account'), T('Т-Банк', 'label', 'muted'),
        Card(T('Сколько сейчас в банке'), T('Посмотри в приложении банка и введи как есть, с копейками', 'caption', 'muted'),
             Input('Остаток', value='40 417,10', h=56, bw=1.5, border='accent', family=UB, size=24, label='Остаток из банка'),
             T(f'Последний остаток из банка: {R(42180)} · вчера 15:56', 'caption', 'muted'), gap=10),
        Card(Compare('По таблице', R(42180.1), 'В банке', R(40417.1), f'с неотправленными {R(-523)}'),
             Soft(T(f'В банке меньше на {R(1763)}', 'body', 'warnSoftInk'))),
        T('Что могло не попасть в таблицу', 'h2', tag='h2'),
        Card(T(f'Во входящих 2 без категории на {R(746.8)}'), T('Пока они не разобраны, остаток расходится с банком. Разбери их, и разница уменьшится.', 'caption', 'muted'), Pill('Разобрать', 'secondary', 'md', href='Inbox'), gap=8),
        Card(T('Похоже на перевод в обратную сторону'), T(f'{R(50000)} от 29 октября 11:20 «Зп Олега»: если поменять «Откуда» и «Куда», разница закроется.', 'caption', 'muted'), Pill('Открыть перевод', 'secondary', 'md', href='OperationTransfer'), gap=8),
        Card(T('Не нашлось? Запиши поправку'), T('Поправка подгоняет остаток под банк. В расходы, доходы и лимиты она не попадает, в истории видна с пометкой «Поправка», и её можно удалить, если пропажа найдётся.', 'caption', 'muted'),
             Pill(f'Записать поправку {R(-1763)}', 'strong', href='OperationFix'),
             tone='fill', gap=10),
        Pill('Только сохранить остаток', 'secondary', href='Account'),
        T('Остаток уйдёт в «Снимки балансов», расхождение останется видно на счёте', 'caption', 'muted', style='text-align:center'),
    ])


def reconcile_ok():
    return Screen('ReconcileOk', 'Сверка: сходится', 'acc', [
        Header('Сверка', 'Account'), T('Сбер кредитка', 'label', 'muted'),
        Card(T('Сколько сейчас должен банку'), T('Посмотри в приложении банка и введи как есть, с копейками', 'caption', 'muted'),
             Input('Долг', value='450 000', h=56, bw=1.5, border='accent', family=UB, size=24, label='Остаток из банка'),
             T(f'Последний остаток из банка: {R(462300)} · 1 ноября 08:47', 'caption', 'muted'), gap=10),
        Card(Compare('По таблице', R(450000), 'В банке', R(450000)), Soft(T('✓ Сходится с банком', 'body', 'accentSoftInk'), tone='accentSoft')),
        Pill('Только сохранить остаток', 'secondary', href='AccountCredit'),
        T('Остаток уйдёт в «Снимки балансов», расхождение останется видно на счёте', 'caption', 'muted', style='text-align:center'),
    ])


def Stepper(title, sub=None, can_next=True):
    def b(ic, on, lab):
        return (f'<button type="button" aria-label="{lab}" style="width:44px;height:44px;border-radius:22px;border:1.5px solid {C("border") if on else C("line")};background:transparent;padding:0;display:flex;align-items:center;justify-content:center;opacity:{1 if on else 0.4}">{ic}</button>')
    return row(
        b(icon('left', C('ink'), 20, 2.4), True, 'Предыдущий'),
        col(T(title, 'title', style='font-size:18px'), T(sub, 'caption', 'muted') if sub else '', gap=2, style='align-items:center'),
        b(icon('right', C('ink'), 20, 2.4), can_next, 'Следующий'), justify='space-between')


def Totals(inc, exp, free, rate, s1=None, s2=None):
    def cell(l, v, sub=None, tone='ink'):
        return col(T(l, 'caption', 'muted'), T(v, 'num', tone, style='font-size:19px'), T(sub, 'caption', 'muted') if sub else '', gap=2, style='width:50%;padding:6px 0;box-sizing:border-box')
    return Card(cell('Доходы', inc, s1), cell('Расходы', exp, s2), cell('Свободные деньги', free, 'на долги и цели', 'accentInk' if free.startswith('+') else 'warnInk'), cell('Норма сбережений', rate), gap=0, style='flex-direction:row;flex-wrap:wrap')


def AnaHead(mode='Месяц'):
    return row(T('Аналитика', 'title', tag='h1', style='flex:1 1 0'), box(Seg(['Месяц', 'Год'], mode), style='width:150px'), gap=12)


def Structure(cur_month, cur, reg, one, prev_month, prev, preg, pone, items, dative):
    mx = max(cur, prev)

    def bar(name, tot, r, o):
        return col(between(T(name, 'label'), T(R(tot), 'label')),
                   f'<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:{C("line")}"><div style="width:{r / mx * 100:.1f}%;background:{C("accent")}"></div><div style="width:{o / mx * 100:.1f}%;background:{C("expense")}"></div></div>',
                   T(f'{R(r)} + {R(o)}', 'caption', 'muted'), gap=6)
    return [Sect('Регулярные и единовременные', 'расходы'),
            Card(row(Legend(C('accent'), 'Регулярные'), Legend(C('expense'), 'Единовременные'), gap=16),
                 bar(prev_month, prev, preg, pone), bar(cur_month, cur, reg, one),
                 col(T(f'Единовременные в {dative}', 'caption', 'muted'), *[between(T(n), Num(R(v))) for n, v in items], gap=8, style=f"border-top:1px solid {C('line')};padding-top:10px") if items else
                 T('Крупные разовые траты отмечаются в карточке операции переключателем «Единовременный расход», для подкатегории можно сделать так по умолчанию.', 'caption', 'muted'),
                 gap=14)]


def SubCat(name, v, mx, cap, tone='warnInk'):
    return col(between(T(name), Num(R(v))), row(box(Meter(v, mx), style='flex:1 1 0'), T(cap, 'caption', tone, style='min-width:90px;text-align:right'), gap=10), gap=6)


def analytics():
    return Screen('Analytics', 'Аналитика: текущий месяц', 'main', [
        AnaHead(), Stepper('Ноябрь 2026', 'прошло 4 из 30 дней', False),
        ChipScroll(Chip('авг 26'), Chip('сен 26'), Chip('окт 26'), Chip('ноя 26', True)),
        Totals(R(40000), R(14912), R(25088, True), '63%', '−60% к октябрю', '−81% к октябрю'),
        Card(between(T('Темп трат', 'body', 'accentSoftInk'), T('в пределах плана', 'label', 'accentSoftInk')), Meter(9840, 80000, 'accent'),
             T(f'Потрачено {R(9840)} из {R(80000)} · по плану к сегодня {R(10667)}', 'caption', 'accentSoftInk'), tone='accentSoft'),
        *Structure('Ноябрь', 14912, 14912, 0, 'Октябрь', 79000, 57000, 22000, [], 'ноябре'),
        Card(row(T('Последние 6 месяцев', 'h2'), row(Legend(C('accent'), 'Доходы'), Legend(C('expense'), 'Расходы'), gap=12), justify='space-between', style='flex-wrap:wrap;gap:8px'),
             Bars([('июн', [90000, 72000], False), ('июл', [95000, 81000], False), ('авг', [88000, 76000], False), ('сен', [92000, 94000], False), ('окт', [100000, 79000], False), ('ноя', [40000, 14912], True)])),
        Card(T('Кто сколько потратил', 'h2'),
             f'<div style="display:flex;height:12px;border-radius:6px;overflow:hidden"><div style="flex:0.58;background:{C("accent")}"></div><div style="flex:0.42;background:{C("expense")}"></div></div>',
             row(col(row(Dot('accent'), T('Олег · 58%', 'label'), gap=6), T(R(8120), 'num', style='font-size:18px'), T('больше всего: Продукты, Транспорт', 'caption', 'muted'), gap=2, style='flex:1 1 0'),
                 col(row(f'<span style="display:block;width:10px;height:10px;border-radius:5px;background:{C("expense")}"></span>', T('Елена · 42%', 'label'), gap=6), T(R(5880), 'num', style='font-size:18px'), T('больше всего: Рестораны и кафе', 'caption', 'muted'), gap=2, style='flex:1 1 0'), gap=12, align='flex-start'),
             T(f'Траты из формы без автора в долю не входят: {R(912)}', 'caption', 'muted')),
        Card(between(T('Подкатегории', 'h2'), T('к октябрю', 'caption', 'muted')),
             SubCat('Продукты', 5340, 5340, f'−72% · {R(19000)}', 'accentInk'),
             SubCat('Доставка еды', 4272, 5340, f'−40% · {R(7100)}', 'accentInk'),
             SubCat('Транспорт', 2300, 5340, f'+15% · {R(2000)}', 'warnInk'),
             SubCat('Развлечения', 1616, 5340, 'не было', 'muted'), gap=10),
        Card(T('По категориям', 'h2'),
             col(between(T('Повседневные'), Num(R(9840))), Meter(9840, 14912), gap=6),
             col(between(T('Обязательные'), Num(R(5072))), Meter(5072, 14912), gap=6), gap=10),
    ], tab='Analytics')


def analytics_past():
    return Screen('AnalyticsPast', 'Аналитика: прошлый месяц и прогноз', 'acc', [
        AnaHead(), Stepper('Октябрь 2026'),
        ChipScroll(Chip('авг 26'), Chip('сен 26'), Chip('окт 26', True), Chip('ноя 26')),
        Totals(R(100000), R(79000), R(21000, True), '21%', '+9% к сентябрю', '−16% к сентябрю'),
        *Structure('Октябрь', 79000, 57000, 22000, 'Сентябрь', 94000, 63000, 31000, [('Машина', 15000), ('Здоровье', 7000)], 'октябре'),
        Card(T('Прогноз на следующий месяц', 'body', 'accentSoftInk'),
             T(f'Если регулярные расходы останутся такими же, а единовременных не будет: расходы ~{R(57000)}, свободно ~{R(43000)}.', 'caption', 'accentSoftInk'), tone='accentSoft', gap=4),
    ], tab='Analytics')


def analytics_year():
    ms = 'ЯФМАМИИАСОНД'
    v = [0, 0, 0, 0, 0, 72000, 81000, 76000, 94000, 79000, 14912, 0]
    return Screen('AnalyticsYear', 'Аналитика: год', 'acc', [
        AnaHead('Год'), Stepper('2026', None, False),
        Totals(R(505000), R(416912), R(88088, True), '17%'),
        Card(T('Расходы по месяцам', 'h2'), Bars([(ms[i], [v[i]], i == 10) for i in range(12)], palette=[C('expense')])),
        Card(T('По категориям за год', 'h2'),
             col(between(T('Повседневные'), Num(R(251000))), Meter(251000, 416912), gap=6),
             col(between(T('Обязательные'), Num(R(120000))), Meter(120000, 416912), gap=6),
             col(between(T('Крупные'), Num(R(45912))), Meter(45912, 416912), gap=6), gap=10),
    ], tab='Analytics')


def category():
    return Screen('Category', 'Подкатегория', 'acc', [
        Header('Продукты', 'Analytics'),
        Card(T('Ноябрь 2026', 'caption', 'muted'), T(R(5340), 'amount'), T(f'−72% к прошлому месяцу ({R(19000)})', 'label', 'accentInk')),
        Card(T('6 месяцев', 'h2'), Bars([('июн', [17000], False), ('июл', [21000], False), ('авг', [18400], False), ('сен', [22000], False), ('окт', [19000], False), ('ноя', [5340], True)])),
        T('Операции на телефоне', 'h2', tag='h2'),
        ListCard(Row('Пятёрочка', 'сегодня 18:45', right=Num(R(-523))), Row('Альмак', 'сегодня 14:25', right=Num(R(-1790))), Row('Бутыль', 'вчера 12:09', right=Num(R(-272.96)), last=True)),
    ])


def month_summary():
    return Screen('MonthSummary', 'Итоги месяца', 'acc', [
        Header('Итоги октября'),
        Card(T('Повседневные траты', 'caption', style=f"color:{C('heroMuted')}"), T(R(83200), 'amount', style=f"color:{C('heroInk')}"),
             f'<div style="height:8px;border-radius:4px;background:{C("heroTrack")};overflow:hidden"><div style="width:100%;height:8px;background:{PEACH}"></div></div>',
             T(f'на {R(3200)} больше лимита {R(80000)}', 'label', style=f'color:{PEACH}'),
             row(grow(T('Доходы', 'caption', style=f"color:{C('heroMuted')}"), T(R(100000), 'num', style=f"color:{C('heroInk')};font-size:18px")),
                 grow(T('Все расходы', 'caption', style=f"color:{C('heroMuted')}"), T(R(141000), 'num', style=f"color:{C('heroInk')};font-size:18px")), style=f"border-top:1px solid {C('heroTrack')};padding-top:12px"),
             tone='hero', gap=10),
        T('Вышли за лимит', 'h2', tag='h2'),
        ListCard(Row('Продукты', f'{R(27400)} из {R(25000)}', 'warnInk', right=Num(R(2400, True), 'warnInk')),
                 Row('Рестораны и кафе', f'{R(11200)} из {R(10000)}', 'warnInk', right=Num(R(1200, True), 'warnInk'), last=True)),
        T('Больше всего', 'h2', tag='h2'),
        ListCard(Row('Аренда', right=Num(R(35000))), Row('Продукты', right=Num(R(27400))), Row('Доставка еды', right=Num(R(14300)), last=True)),
        Card(T('Лимит на этот месяц', 'body', 'accentSoftInk'), T(f'В прошлом месяце вышли за лимит. Оставить {R(80000)} или поставить другой?', 'label', 'accentSoftInk'),
             Chips(Pill(f'Оставить {R(80000)}', 'primary', 'md', href='Main'), Pill('Изменить', 'secondary', 'md', href='Limits')), tone='accentSoft', gap=10),
    ])


def debts():
    bars = [('сен', 572000, False, False), ('окт', 557000, False, False), ('ноя', 540000, True, False), ('дек', 523000, False, True), ('янв', 506000, False, True)]
    mx = max(b[1] for b in bars)
    cols = []
    for lab, v, cur, fut in bars:
        style = (f"background:transparent;border:2px dashed {C('muted')};box-sizing:border-box" if fut else f"background:{C('accent') if cur else C('strong')}")
        cols.append(col(f'<div style="width:100%;max-width:56px;height:{v / mx * 120:.0f}px;border-radius:8px;{style}"></div>', T(lab, 'caption', 'muted' if fut else 'ink'), gap=6, style='flex:1 1 0;align-items:center'))
    pay = lambda t, h='AddTransfer', kind='strong': Pill(t, kind, 'md', href=h)
    return Screen('Debts', 'Долги', 'acc', [
        Header('Долги'),
        Card(T('По кредиткам сейчас', 'caption', style=f"color:{C('heroMuted')}"), T(R(540000), 'amount', style=f"color:{C('heroInk')}"),
             T(f'{R(-17000)} с конца прошлого месяца · погашено {R(25000)}', 'label', style=f"color:{C('heroAccent')}"), tone='hero'),
        Card(between(T('Долг по месяцам', 'h2'), T('конец месяца', 'caption', 'muted')),
             row(*cols, gap=10, align='flex-end', style='height:150px'),
             T('Пунктиром прогноз, если гасить как в последние месяцы.', 'caption', 'muted')),
        Card(T(f'При ~{R(17000)} в месяц закроете к июню 2029', 'body', 'accentSoftInk'),
             T(f'Если гасить {R(25000)}, к ноябрю 2028. Проценты в этом месяце: {R(9600)}.', 'label', 'accentSoftInk'), tone='accentSoft', gap=6),
        T('Кредитки', 'h2', tag='h2'),
        ListCard(Row('Сбер кредитка', f'{R(450000)} · погашено {R(25000)}', left=Mono('С', 'monoGreen'), right=pay('Погасить'), href=None),
                 Row('Т-Банк кредитка', R(90000), left=Mono('Т', 'monoYellow'), right=pay('Погасить'), last=True)),
        ListCard(Row('Нам должны', R(30000), left=Mono('Н'), right=pay('Вернули', kind='secondary'), last=True)),
    ])


def goals():
    def goal(name, saved, target, tail, cap, tone='muted', done=False):
        return Card(between(T(name, style='flex:1 1 0'), Num(R(saved))), Meter(saved, target, 'accent' if done else 'ink'),
                    T(f'из {R(target)}{tail}', 'caption', 'muted'), T(cap, 'caption', tone),
                    Pill('Отложить', 'secondary', 'md', href='AddTransfer', style='align-self:flex-start'), gap=10)
    return Screen('Goals', 'Цели', 'acc', [
        Header('Цели'),
        Card(T('Отложено всего', 'caption', style=f"color:{C('heroMuted')}"), T(R(45000), 'amount', style=f"color:{C('heroInk')}"), T('по переводам на копилки', 'caption', style=f"color:{C('heroMuted')}"), tone='hero'),
        goal('Подушка', 30000, 200000, ' · на «Т-Банк Елена»', f'осталось {R(170000)}'),
        goal('Отпуск', 15000, 75000, ' · к июню 2027 · на «ВТБ»', f'откладывать ~{R(8000)} в месяц, чтобы успеть'),
        Pill('Новая цель', 'primary', href='GoalEdit'),
        T('«Отложить»: перевод на копилку, в расходы не идёт.', 'caption', 'muted', style='text-align:center'),
    ])


def goal_edit():
    return Screen('GoalEdit', 'Новая цель', 'acc', [
        Header('Новая цель', 'Goals'),
        Card(T('Название'), Input('Подушка, отпуск, ремонт', value='Отпуск', bg='card', label='Название цели'), T('Переводы с комментарием «Цель: Отпуск» считаются в эту цель.', 'caption', 'muted'), gap=8),
        Card(T('Сколько собрать'), Input('300 000', value='75 000', weight=800, bg='card', label='Сумма цели'), gap=8),
        Card(between(T('К какому сроку'), row(Chip('2026'), Chip('2027', True), Chip('2028'), gap=8), align='center'),
             Chips(*[Chip(m, m == 'июн') for m in 'янв фев мар апр май июн июл авг сен окт ноя дек'.split()]),
             T('по сроку посчитаем, сколько откладывать в месяц', 'caption', 'muted'), gap=10),
        Card(T('Счёт-копилка'), Chips(*[Chip(a, a == 'ВТБ') for a in ACCS[:5]]), T('куда переводить; если отдельного счёта нет, можно не выбирать', 'caption', 'muted'), gap=10),
    ], footer=Pill('Добавить цель', 'primary', style='width:100%', href='Goals'))


def LimitRow(name, hint, spent, limit, last=False):
    over = limit is not None and spent > limit
    near = limit is not None and not over and spent >= limit * 0.8
    b = '' if last else f"border-bottom:1px solid {C('line')};"
    url = link('LimitEdit')
    right = T(R(limit), 'num', 'warnInk' if over else 'ink') if limit else T('без лимита', 'label', 'muted')
    inner = row(grow(T(name), T(f"{hint + ' · ' if hint else ''}потрачено {R(spent)}{', превышен' if over else ''}", 'caption', 'warnInk' if over else 'muted')), right, Chevron(), gap=10)
    meter = Meter(spent, limit, 'warn' if over or near else 'accent') if limit else ''
    css = f"padding:12px 0;display:flex;flex-direction:column;gap:8px;{b}text-decoration:none"
    return f'<a href="{url}" style="{css}">{inner}{meter}</a>' if url else f'<div style="{css}">{inner}{meter}</div>'


def limits():
    return Screen('Limits', 'Лимиты', 'set', [
        Header('Лимиты', 'Settings'),
        f'<a href="{link("LimitEdit") or "#"}" aria-label="Изменить лимит на месяц" style="text-decoration:none;display:block">' +
        Card(between(T('Лимит на месяц', 'caption', 'muted'), T('изменить', 'label', 'accentInk'), align='center'), T(R(80000), 'amount'),
             T(f'≈ {R(2622)} в день на оставшиеся 27 дней. В лимит идут только «Повседневные».', 'label', 'muted')) + '</a>',
        Sect('Вне лимита на день', 'свой лимит на месяц'),
        ListCard(LimitRow('Обязательные', 'аренда, связь, кредиты', 41200, 40000), LimitRow('Крупные', 'ремонт, техника, поездки', 0, None, True)),
        Sect('По подкатегориям', 'необязательно'),
        ListCard(LimitRow('Продукты', '', 22600, 25000), LimitRow('Доставка еды', '', 4272, 12000), LimitRow('Транспорт', '', 2300, None),
                 LimitRow('Рестораны и кафе', '', 1800, 10000), LimitRow('Аренда', 'Обязательные', 35000, None, True)),
        Card(row(grow(T('Предупреждать на 80%'), T('сводка в «Лимитах» на главной выделяется, когда подкатегория или группа подходит к лимиту', 'caption', 'muted')), Switch(True, 'Предупреждать на 80%'), gap=12)),
    ])


def limit_edit():
    return Screen('LimitEdit', 'Лист: лимит', 'set', sheet=Sheet(
        col(T('Продукты', 'title', style='font-size:20px'), T('Подкатегория: предупреждение при 80% и 100%', 'caption', 'muted'), gap=2),
        row(f'<input aria-label="Лимит: Продукты" value="25 000" style="flex:1 1 0;min-width:0;border:0;background:transparent;font-family:{UB};font-weight:600;font-size:34px;color:{C("ink")};padding:0">',
            T('₽', 'title', 'muted', style='font-size:28px'), gap=8, style=f"background:{C('card')};border-radius:22px;padding:12px 16px;border:1.5px solid {C('accent')}"),
        Chips(Chip(f'как в прошлом месяце · {R(27500)}'), Chip(f'в среднем за 3 мес. · {R(21000)}'), Chip(f'+10% · {R(27500)}')),
        Pill('Сохранить', 'primary', href='Limits'), Pill('Убрать лимит', 'danger', 'md'),
        pad='10px 20px 16px'), h=844)


def recurring():
    return Screen('Recurring', 'Регулярные платежи', 'set', [
        Header('Регулярные платежи', 'Settings'),
        Card(T('В месяц примерно', 'caption', style='color:#B8C0CC'), T(R(52300), 'amount', style='color:#FFFFFF'), T(f'ещё спишется в этом месяце {R(38300)}', 'caption', style='color:#DCE2EA'), tone='hero'),
        Card(T('Похоже на регулярный платёж', 'body', 'accentSoftInk'), T(f'«Яндекс Плюс», {R(399)}, 3 мес. подряд около 12-го числа', 'label', 'accentSoftInk'),
             Chips(Chip('Добавить', True), Chip('Не регулярный')), tone='accentSoft', gap=10),
        T('Ожидаются', 'h2', tag='h2'),
        ListCard(Row('Интернет', '3 ноября, оплаты не видно · Обязательные', 'warnInk', right=Num(R(900)), href='RecurringEdit'),
                 Row('Аренда', '11 ноября · Обязательные', right=Num(R(35000)), href='RecurringEdit'),
                 Row('Платёж по кредитке', '20 ноября', right=Num(R(2400)), last=True, href='RecurringEdit')),
        T('Уже списаны', 'h2', tag='h2'),
        ListCard(Row('Связь', '2 ноября · Мобильная связь', right=Num(R(800), 'muted'), href='RecurringEdit'),
                 Row('Кредит', '1 ноября · Проценты и комиссии', right=Num(R(13200), 'muted'), last=True, href='RecurringEdit')),
        col(Pill('Добавить платёж', 'secondary', href='RecurringEdit'), T('Оплачен, если в месяце есть трата с его словом в комментарии или магазине и похожей суммой.', 'caption', 'muted', style='text-align:center'), gap=6),
    ])


def recurring_edit():
    F = lambda t, *k: Card(T(t), *k, gap=8)
    return Screen('RecurringEdit', 'Регулярный платёж: правка', 'set', [
        Header('Регулярный платёж', 'Recurring'),
        F('Название', Input('Аренда, связь, Яндекс Плюс', value='Аренда', bg='card', label='Название')),
        row(box(F('Сумма в месяц', Input('35 000', value='35 000', weight=800, bg='card', label='Сумма')), style='flex:1 1 0;min-width:0'),
            box(F('Число', Input('1–31', value='11', weight=800, bg='card', label='Число месяца')), style='width:110px'), gap=12, align='stretch'),
        F('Как узнать оплату', Input('слово из комментария или магазина', value='аренда', bg='card', label='Слово для поиска'), T('Платёж оплачен, если в месяце есть трата с этим словом в комментарии, магазине или подкатегории и суммой ±20%.', 'caption', 'muted')),
        F('Подкатегория', Chips(*[Chip(s, s == 'Аренда') for s in SUBS])),
        F('Счёт', Chips(*[Chip(a, a == 'Т-Банк') for a in ACCS])),
        Pill('Удалить платёж', 'danger'),
    ], footer=Pill('Сохранить', 'primary', style='width:100%', href='Recurring'))


def subcategories():
    G = lambda t, h, items, sel=None: Card(col(T(t), T(h, 'caption', 'muted'), gap=2), Chips(*[Chip(s, s == sel) for s in items]), gap=10)
    return Screen('Subcategories', 'Подкатегории', 'set', [
        Header('Подкатегории', 'Settings'),
        Card(T('«Развлечения»: перенести в группу', 'body', 'accentSoftInk'), Chips(Chip('Повседневные', True), Chip('Обязательные'), Chip('Крупные')),
             Pill('Скрыть из выбора', 'secondary', 'md'), T('Старые операции и таблица не меняются, её просто не будет в списке при выборе категории.', 'caption', 'accentSoftInk'), tone='accentSoft', gap=10),
        G('Повседневные', 'идут в лимит на день', ['Продукты', 'Транспорт', 'Рестораны и кафе', 'Доставка еды', 'Товары для дома', 'Развлечения', 'Вкусняшки', 'Вредные привычки'], 'Развлечения'),
        G('Обязательные', 'аренда, связь, кредиты: не в лимите', ['Аренда', 'Связь', 'Коммуналка', 'Подписки', 'Проценты и комиссии', 'Штрафы/Госпошлины']),
        G('Крупные', 'редкие большие покупки: не в лимите', ['Машина', 'Здоровье', 'Одежда и обувь']),
        Card(col(T('Скрытые'), T('не показываются при выборе, нажми, чтобы вернуть', 'caption', 'muted'), gap=2), Chips(Chip('Аптека', tone='more'), Chip('Свадьба', tone='more')), gap=10),
        Card(T('Новая подкатегория'), Input('Например, Спорт', label='Название подкатегории'), Chips(Chip('Повседневные', True), Chip('Обязательные'), Chip('Крупные')),
             T('В Google Форме её не будет, пока не добавить вариант в саму форму.', 'caption', 'muted'), Pill('Добавить в таблицу', 'primary', 'md'), gap=10),
    ])


def rules():
    def rule(p, s, a, last=False):
        b = '' if last else f"border-bottom:1px solid {C('line')};"
        return row(grow(T(p), T(f'→ {s} · добавил: {a}', 'caption', 'muted'), gap=4), Kebab(f'Действия с правилом {p}'), gap=10, style=f"padding:12px 0;{b}")
    return Screen('Rules', 'Правила категорий', 'set', [
        Header('Правила категорий', 'Settings'),
        T('Правило появляется, когда в операции нажимаешь «Всегда так». Общие для двух телефонов, хранятся в листе «Правила».', 'label', 'muted'),
        ListCard(rule('Пятёрочка', 'Продукты', 'Олег'), rule('Суши-Маркет', 'Доставка еды', 'Елена'), rule('Деливери', 'Доставка еды', 'Олег'), rule('Яндекс Go', 'Транспорт', 'Елена', True)),
    ])


def sources():
    bank = lambda n, p, on=True, inst=True, last=False: Row(n, p if inst else 'не установлено', left=Mono(n[0], 'monoYellow' if inst else 'monoGray'), right=Switch(on, f'Слушать {n}'), last=last)
    return Screen('Sources', 'Источники', 'set', [
        Header('Источники', 'Settings'),
        Card(row(icon('check', C('accentSoftInk'), 18, 2.6), T('Слушаем уведомления', 'body', 'accentSoftInk'), gap=10), T('Работает в фоне. Поймано уведомлений: 1 284.', 'label', 'accentSoftInk'), tone='accentSoft'),
        Card(T('Кнопки категорий в уведомлении выключены', 'body', 'warnSoftInk'), T('Разреши приложению показывать уведомления: после покупки придёт уведомление с кнопками подкатегорий, они работают и на заблокированном экране.', 'label', 'warnSoftInk'), Pill('Разрешить уведомления', 'strong', 'md'), tone='warnSoft'),
        Card(T('Телефон может усыпить приложение', 'body', 'warnSoftInk'), T('Сними ограничения батареи, чтобы не терять покупки. На Xiaomi и Huawei ещё включи «Автозапуск» в настройках приложения.', 'label', 'warnSoftInk'), Pill('Снять ограничения батареи', 'strong', 'md'), tone='warnSoft'),
        Card(T('Название магазина приходит в пуше банка'), T('Mir Pay присылает только сумму и карту. Включи в приложении банка уведомления об операциях: покупка склеится из двух пушей, а магазин возьмётся из пуша банка.', 'caption', 'muted'), tone='fill', gap=6),
        Card(row(grow(T('СМС от банков'), T('запасной источник: только от 900, T-Bank, VTB и других банков, личные СМС не читаем', 'caption', 'muted')), Switch(True, 'СМС от банков'), gap=12)),
        T('Банки', 'h2', tag='h2'),
        ListCard(bank('Т-Банк', 'com.idamob.tinkoff.android'), bank('Сбер', 'ru.sberbankmobile'), bank('ВТБ', 'ru.vtb24.mobilebanking.android'),
                 bank('Mir Pay', 'ru.nspk.mirpay'), bank('Яндекс Go', 'ru.yandex.taxi'), bank('Альфа-Банк', '', False, False, True)),
        T('Найдены приложения с суммами', 'h2', tag='h2'),
        Card(row(Mono('Л', 'monoPurple'), grow(T('Литрес'), T('ru.litres.android · 2 шт · вчера 11:16', 'caption', 'muted')), gap=12),
             T('Оплата подписки 399 ₽', 'label', 'muted'), Pill('Это банк, слушать', 'primary', 'md', style='align-self:flex-start')),
    ])


def devices():
    return Screen('Devices', 'Устройство', 'set', [
        Header('Устройство', 'Settings'),
        ListCard(Row('Автор операций', right=Label('Олег')), Row('Таблица', right=Label('Учёт Доходов/Расходов')), Row('Ключ устройства', right=Label('•••• a1f3')), Row('Режим', right=Label('полный')), Row('Версия', right=Label('0.3.14'), last=True)),
        Card(T('Подключить заново'), T('Скопируй сообщение со ссылкой budget://connect и нажми «Вставить ссылку». Операции, которые ещё не отправлены, останутся на телефоне.', 'caption', 'muted', style='line-height:18px'),
             Pill('Вставить ссылку', 'strong', 'md', style='align-self:flex-start'), Input('budget://connect?…', label='Ссылка подключения'), gap=10),
        Card(T('Пригласить второй телефон'), T('Создаст ссылку подключения к этой же таблице. Отправь её, например, в Telegram: на втором телефоне её нужно скопировать и вставить на шаге «Подключи таблицу».', 'caption', 'muted', style='line-height:18px'),
             Seg(['Елена', 'Олег'], 'Елена'), Pill('Создать и отправить ссылку', 'strong', 'md', style='align-self:flex-start'), gap=10),
        Card(T('У каждого телефона свой ключ. Потерянный телефон отключается в Apps Script, второй продолжает работать.', 'label', 'muted'), tone='fill'),
    ])


def debug_log():
    def line(t, tag, msg, data=None, err=False):
        return col(T(f"{t} · {tag}{' · error' if err else ''}", 'caption', 'warnInk' if err else 'muted'), T(msg, 'label'), T(data, 'caption', 'muted') if data else '', gap=2,
                   style=f"padding-bottom:8px;border-bottom:1px solid {C('line')}")
    stat = lambda v, l, w=False: col(T(v, 'num', 'warnInk' if w else 'ink'), T(l, 'caption', 'muted'))
    return Screen('DebugLog', 'Журнал для разработчика', 'set', [
        Header('Журнал', 'Settings'),
        Card(T('В файл попадает вся история: записи журнала, уведомления банков и операции на телефоне. Номера карт скрыты до последних 4 цифр. Отправь файл разработчику после теста на живых покупках.', 'bodyRegular', 'muted'),
             Chips(stat('15 240', 'записей'), stat('3', 'ошибок', True), stat('1 284', 'уведомлений'), stat('412', 'операций'), style='gap:16px')),
        T('Все записи, новые сверху', 'h2', tag='h2'),
        col(line('04.11 18:45:42', 'sync', 'отправлено 1 (фон)', '{"accepted":1,"duplicates":0,"rejected":[],"suspected":[]}'),
            line('04.11 18:45:41', 'listener', 'Поймано уведомление: Т-Банк', '{"package":"com.idamob.tinkoff.android","hasMoney":true}'),
            line('04.11 12:01:07', 'api', 'pull: не удалось за 3 попыток', '{"error":"нет ответа за 30 с"}', True), gap=8),
    ], footer=col(Pill('Поделиться журналом', 'primary', style='width:100%'), Pill('Очистить журнал', 'danger', 'md', style='width:100%'), gap=8))


def settings():
    def sec(title, ic, value=None, warn=False, last=False, href=None):
        return Row(title, left=f'<span style="width:36px;height:36px;border-radius:18px;background:{C("fill")};display:flex;align-items:center;justify-content:center;flex-shrink:0">{icon(ic, C("ink"), 18)}</span>',
                   right=row(T(value, 'label', 'warnInk' if warn else 'ink') if value else '', Chevron(), gap=8), last=last, href=href)
    return Screen('Settings', 'Настройки', 'main', [
        T('Настройки', 'title', tag='h1'),
        Card(f'<span style="width:48px;height:48px;border-radius:24px;background:{C("accentSoft")};display:flex;align-items:center;justify-content:center;flex-shrink:0;{VARIANTS["h2"]};color:{C("accentSoftInk")}">Н</span>',
             grow(T('Олег, этот телефон'), T('«Учёт Доходов/Расходов»', 'caption', 'muted'), T('отправка сегодня 18:46', 'caption', 'muted')), style='flex-direction:row;align-items:center'),
        ListCard(sec('Источники', 'bell', '5 приложений', href='Sources'), sec('Правила категорий', 'list', '4', href='Rules'), sec('Лимиты', 'gauge', R(80000), href='Limits'),
                 sec('Подкатегории', 'list', '17', href='Subcategories'), sec('Регулярные платежи', 'repeat', href='Recurring'), sec('Устройство', 'phone', last=True, href='Devices')),
        Card(between(T('Тема'), T('сейчас ' + ('тёмная' if Ctx.dark else 'светлая'), 'caption', 'muted')), Seg(['Как в системе', 'Светлая', 'Тёмная'], 'Как в системе'),
             Row('Цвета', 'Зелёная, как была, у каждого телефона свои', right=row(ThemeDots(THEMES[0]), Chevron(), gap=8), last=True, href='ThemeColors'), gap=10),
        T('Уведомления', 'h2', tag='h2'),
        Card(Toggle('Лимиты: 80% и 100%', 'подкатегории и группы, по разу за месяц'), Toggle('Регулярные платежи', 'накануне вечером: «Завтра: Аренда 35 000 ₽»'),
             Toggle('Итоги месяца', '1-го числа: потрачено, что вышло за лимиты'), Toggle('Новая версия приложения', 'скачать в одно касание'),
             Toggle('Кнопки категорий в уведомлении', 'после покупки, и на заблокированном экране'),
             Toggle('Остаток на экране блокировки', '«Можно сегодня» с кнопками «+ Трата» и «Входящие»', False), gap=16),
        T('Этот телефон', 'h2', tag='h2'),
        Card(T('Кто пользуется'), Seg(['Олег', 'Елена'], 'Олег'),
             col(T('Счёт по умолчанию'), T('для ручных трат и покупок, где банк не назвал карту', 'caption', 'muted'), gap=2), AccChips('Т-Банк'), gap=10),
        ListCard(Row('Работа в фоне', 'отправка сама, держать в памяти, автозапуск', 'accentInk', right=Chevron(), href=None),
                 Row('Для разработчика', 'журнал, версия 0.3.14', right=Chevron(), last=True, href='DebugLog')),
    ], tab='Settings')


# ---------- онбординг ----------

def Steps(n, title, back):
    dots = ''.join(f'<span style="display:block;width:{24 if i == n else 8}px;height:8px;border-radius:4px;background:{C("accent") if i <= n else C("border")}"></span>' for i in range(1, 5))
    return row(dots, T(f'Шаг {n} из 4', 'label', 'muted', style='margin-left:6px'), gap=6) + row(Back(back), T(title, 'title', tag='h1', style='flex:1 1 0'), gap=12)


def onb_welcome():
    items = [('Подключи таблицу', 'ту же, что вы ведёте сейчас'), ('Разреши читать уведомления', 'только приложения банков'), ('Размечай в одно касание', 'прямо из шторки уведомлений')]
    return Screen('OnbWelcome', '0. Приветствие', 'onb', [
        row(f'<span style="display:block;width:64px;height:64px;border-radius:32px;background:{C("heroAccent")}"></span>', f'<span style="display:block;width:64px;height:64px;border-radius:32px;background:{C("expense")};opacity:0.85;margin-left:-24px"></span>', style='margin-top:24px;height:64px'),
        T('Бюджет на двоих', 'title', tag='h1', style=f"font-size:34px;line-height:40px;color:{C('heroInk')};margin-top:8px"),
        T('Траты из уведомлений банков сами попадают в вашу таблицу. Остаётся выбрать категорию.', 'bodyRegular', style=f"color:{C('heroMuted')};line-height:22px"),
        col(*[row(f'<span style="width:28px;height:28px;border-radius:14px;border:1.5px solid {C("heroAccent")};display:flex;align-items:center;justify-content:center;{VARIANTS["label"]};color:{C("heroAccent")};flex-shrink:0;box-sizing:border-box">{i + 1}</span>',
              grow(T(a, style=f"color:{C('heroInk')}"), T(b, 'caption', style=f"color:{C('heroMuted')}")), gap=14, align='flex-start') for i, (a, b) in enumerate(items)], gap=18, style='margin-top:8px'),
    ], footer=Pill('Начать', 'hero', style='width:100%', href='OnbConnect'), tone='hero', h=844)


def onb_connect():
    who = lambda a, on: f'<button type="button" aria-pressed="{"true" if on else "false"}" style="flex:1 1 0;height:64px;border-radius:18px;border:{2 if on else 1}px solid {C("accent") if on else C("border")};background:{C("card")};{VARIANTS["h2"]};font-family:Manrope,sans-serif;color:{C("ink")}">{a}</button>'
    return Screen('OnbConnect', '1. Подключи таблицу', 'onb', [
        Steps(1, 'Подключи таблицу', 'OnbWelcome'),
        Card(T('Ссылка подключения'), T('У каждого телефона своя ссылка, она начинается с budget://connect. Её присылает тот, кто настраивал таблицу. Скопируй сообщение со ссылкой и нажми «Вставить ссылку».', 'caption', 'muted', style='line-height:18px'),
             Pill('Вставить ссылку', 'strong', 'md', style='align-self:flex-start'), Input('или вставь сюда вручную', label='Ссылка подключения'), gap=10),
        Card(icon('check', C('accentSoftInk'), 18, 2.6), grow(T('«Учёт Доходов/Расходов»', 'body', 'accentSoftInk'), T('подключено · 17 подкатегорий · 7 счетов', 'caption', 'accentSoftInk')), tone='accentSoft', gap=10, style='flex-direction:row'),
        col(T('Кто пользуется этим телефоном?'), row(who('Олег', True), who('Елена', False), gap=10), gap=10),
    ], footer=Pill('Дальше', 'primary', style='width:100%', href='OnbAccess'), h=844)


def onb_access():
    pts = ['Читаем только приложения банков из списка, остальное игнорируем', 'Сохраняем сумму, магазин, карту и остаток', 'Данные уходят только в вашу таблицу']
    return Screen('OnbAccess', '2. Доступ к уведомлениям', 'onb', [
        Steps(2, 'Доступ к уведомлениям', 'OnbConnect'),
        box(col(T('Банк', 'caption', 'muted'), T('Покупка 523 ₽, PYATEROCHKA', 'label'), gap=2, style=f"background:{C('fill')};border-radius:16px;padding:12px"),
            box(icon('down', C('heroAccent'), 22, 2.4), style='align-self:center'),
            between(col(T('Бюджет', 'caption', 'muted'), T(f'Пятёрочка · {R(-523)}', 'label'), gap=2), f'<span style="display:block;background:{C("accent")};border-radius:10px;padding:6px 10px;{VARIANTS["caption"]};color:{C("onAccent")}">Продукты</span>', align='center', style=f"background:{C('card')};border-radius:16px;padding:12px"),
            style=f"background:{C('hero')};border-radius:22px;padding:18px;display:flex;flex-direction:column;gap:10px"),
        *[row(icon('check', C('accentInk'), 18, 2.6), T(p, 'bodyRegular', style='flex:1 1 0;line-height:21px'), gap=12, align='flex-start') for p in pts],
        Card(icon('check', C('accentSoftInk'), 18, 2.6), T('Доступ уже есть', 'body', 'accentSoftInk'), tone='accentSoft', gap=10, style='flex-direction:row;align-items:center'),
    ], footer=col(Pill('Дальше', 'primary', style='width:100%', href='OnbPermissions'), Pill('Какие банки поддерживаются', 'secondary', style='width:100%', href='Sources'), gap=8), h=844)


def onb_permissions():
    def rw(done, title, meta, last=False):
        b = '' if last else f"border-bottom:1px solid {C('line')};"
        mark = (f'<span style="width:32px;height:32px;border-radius:16px;background:{C("accentSoft") if done else C("warnSoft")};display:flex;align-items:center;justify-content:center;flex-shrink:0">'
                + (icon('check', C('accentSoftInk'), 18, 2.6) if done else T('!', 'label', 'warnSoftInk')) + '</span>')
        return row(mark, grow(T(title), T(meta, 'caption', 'muted')), Pill('Открыть', 'strong', 'md') if not done else '', gap=12, style=f"padding:12px 0;{b}")
    return Screen('OnbPermissions', '3. Чтобы ничего не терялось', 'onb', [
        Steps(3, 'Чтобы ничего не терялось', 'OnbAccess'),
        T('Некоторые телефоны выгружают фоновые приложения. Без этих разрешений покупки могут пропадать.', 'bodyRegular', 'muted', style='line-height:22px'),
        ListCard(rw(True, 'Доступ к уведомлениям', 'включён'), rw(True, 'Уведомления приложения', 'для кнопок категорий'), rw(False, 'Автозапуск', 'нужен на Xiaomi'), rw(False, 'Батарея без ограничений', 'иначе Android усыпит сервис', True)),
        Card(T('Проверка', 'h2'), T('Отправь тестовое уведомление и нажми в нём любую категорию: так выглядит разметка после покупки.', 'label', 'muted', style='line-height:19px'),
             Pill('Тестовое уведомление', 'secondary', 'md', style='align-self:flex-start'), T('Отправлено: открой шторку уведомлений', 'caption', 'accentInk')),
    ], footer=Pill('Дальше', 'primary', style='width:100%', href='OnbHowTo'), h=844)


def onb_howto():
    def card(n, title, body, illus):
        return Card(row(f'<span style="width:28px;height:28px;border-radius:14px;background:{C("accentSoft")};display:flex;align-items:center;justify-content:center;{VARIANTS["label"]};color:{C("accentSoftInk")};flex-shrink:0">{n}</span>', T(title), gap=10),
                    illus, T(body, 'label', 'muted', style='line-height:19px'))

    def pill(t, primary=False):
        return f'<span style="display:flex;align-items:center;height:34px;padding:0 14px;border-radius:17px;background:{C("accent") if primary else C("fill")};{VARIANTS["label"]};color:{C("onAccent") if primary else C("ink")}">{t}</span>'

    def tog(t, m, on=True):
        return row(grow(T(t), T(m, 'caption', 'muted')), Switch(on, t), gap=12, style=f"background:{C('ground')};border-radius:16px;padding:12px")
    return Screen('OnbHowTo', '4. Как пользоваться', 'onb', [
        Steps(4, 'Как пользоваться', 'OnbPermissions'),
        T('Четыре привычки, и таблица ведётся почти сама.', 'bodyRegular', 'muted', style='line-height:22px'),
        card(1, 'Покупка: категория из шторки', 'Нажми категорию прямо в уведомлении, даже на заблокированном экране. Первая подсказка: что ты ставил этому магазину, потом самые частые траты.',
             box(box(between(col(T('Пятёрочка'), T('Т-Банк · осталось 1 082 ₽', 'caption', 'muted'), gap=2), T(R(-523), style=f'font-family:{UB};font-weight:600'), align='flex-start'), row(pill('Продукты', True), pill('Транспорт'), gap=6),
                     style=f"background:{C('card')};border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:10px"), style=f"background:{C('hero')};border-radius:18px;padding:12px")),
        card(2, 'Входящие: одно нажатие', 'Всё, что не разметил в шторке, ждёт здесь. Нажми категорию на карточке; удалить или отметить дубль можно в меню «⋯».',
             box(OpHead('Т', 'monoYellow', 'Пятёрочка', f'{R(-523)} · сегодня', ''), row(pill('Продукты', True), pill('Транспорт'), gap=6),
                 style=f"background:{C('ground')};border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px")),
        card(3, '«Всегда так»', 'Со второй одинаковой категории приложение предложит правило. Дальше этот магазин размечается сам, и на втором телефоне тоже.',
             box(T('Всегда «Продукты» для Пятёрочки?', 'label'), row(f'<span style="display:flex;align-items:center;height:34px;padding:0 14px;border-radius:17px;background:{C("strong")};{VARIANTS["label"]};color:{C("onStrong")}">Всегда так</span>', pill('Только сейчас'), gap=8),
                 style=f"background:{C('ground')};border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px")),
        card(4, 'Отправка в таблицу', 'Включи, и размеченное уйдёт само, даже когда приложение закрыто. Или жми «Отправить в таблицу» во «Входящих».', tog('Отправлять размеченные сами', 'через минуту после разметки')),
        Card(row(icon('check', C('accentInk'), 18, 2.6), grow(T('Виджет на рабочий стол'), T('долгое нажатие на экране → Виджеты → Бюджет', 'caption', 'muted')), gap=12, align='flex-start'),
             tog('Остаток на экране блокировки', 'закреплённое уведомление «Можно сегодня»', False), gap=10),
    ], footer=Pill('Готово', 'primary', style='width:100%', href='Main'))


# ---------- шторка и виджеты ----------

SHADE = '#14181F'


def NotifShell(*kids, app='Бюджет · сейчас'):
    return box(row(f'<span style="display:block;width:16px;height:16px;border-radius:8px;background:{C("accent")}"></span>', T(app, 'caption', 'muted'), gap=8), *kids,
               style=f"background:{C('card')};border-radius:22px;padding:14px 16px;display:flex;flex-direction:column;gap:10px")


def notification():
    btn = lambda t, primary=False, dashed=False: (f'<button type="button" style="flex:1 1 0;height:44px;border-radius:22px;border:{"1.5px dashed " + C("border") if dashed else "0"};background:{C("accent") if primary else (C("fill") if not dashed else "transparent")};'
                                                  f'{VARIANTS["label"]};font-family:Manrope,sans-serif;color:{C("onAccent") if primary else (C("muted") if dashed else C("ink"))};padding:0 10px">{t}</button>')
    return Screen('Notification', 'Уведомление после покупки', 'native', [
        T('После покупки', 'title', tag='h1'),
        T('Своё уведомление с кнопками. Работает на заблокированном экране, в шторке только две последние покупки.', 'bodyRegular', 'muted'),
        box(col(
            NotifShell(between(T('Пятёрочка'), T(R(-523), style=f'font-family:{UB};font-weight:600')), T(f'Т-Банк · на сегодня осталось {R(1459)}', 'caption', 'muted'),
                       row(btn('Продукты', True), btn('Рестораны и кафе'), gap=8), row(btn('Транспорт'), btn('Все категории…', dashed=True), gap=8)),
            NotifShell(T('Покупка', 'body'), T(f'Mir Pay •• 5678 · перерасход {R(443)}', 'caption', 'warnInk'), app='Бюджет · 2 мин назад'),
            NotifShell(T('Покупка на 523 ₽, счет карты *5678', 'label'), T('Доступно 41 657 ₽', 'caption', 'muted'), app='Т-Банк · сейчас'),
            gap=8), style=f"background:{C('fill')};border-radius:28px;padding:12px"),
        T('Пуш банка приложение читает само. Кнопка ставит категорию и будит отправку, приложение открывать не нужно.', 'caption', 'muted'),
    ], h=844)


def status_notifs():
    act = lambda t: f'<button type="button" style="background:transparent;border:0;padding:6px 0;{VARIANTS["label"]};font-family:Manrope,sans-serif;color:{C("accentInk")}">{t}</button>'
    prog = lambda p, c='accent': f'<div style="height:4px;border-radius:2px;background:{C("line")};overflow:hidden"><div style="width:{p}%;height:4px;background:{C(c)}"></div></div>'
    return Screen('StatusNotifs', 'Закреплённое и напоминания', 'native', [
        T('Шторка', 'title', tag='h1'),
        Sect('Закреплённое «Можно сегодня»'),
        T('Показывают «Остаток на экране блокировки» и «Держать в памяти». Без него служба в фоне не живёт.', 'caption', 'muted'),
        NotifShell(T(f'Можно сегодня {R(1982)}'), prog(24), T(f'Потрачено {R(640)} из {R(2622)} · 2 ждут отправки', 'caption', 'muted'), row(act('+ Трата'), act('Входящие'), gap=20), app='Бюджет'),
        NotifShell(T(f'Перерасход {R(1034)}', 'body', 'warnInk'), prog(100, 'warn'), T(f'Потрачено {R(2743)} из {R(1709)}', 'caption', 'muted'), row(act('+ Трата'), act('Входящие'), gap=20), app='Бюджет'),
        NotifShell(T('Бюджет следит за покупками'), app='Бюджет'),
        Sect('Напоминания'),
        NotifShell(T('Продукты: 84% лимита'), T(f'Осталось {R(4000)} из {R(25000)} до конца месяца.', 'caption', 'muted')),
        NotifShell(T('Обязательные: лимит превышен'), T(f'Потрачено {R(41200)} из {R(40000)}, сверху {R(1200)}.', 'caption', 'muted')),
        NotifShell(T('Завтра списание: Аренда'), T(f'{R(35000)} с Т-Банк.', 'caption', 'muted')),
        NotifShell(T('Итоги октября'), T(f'Потрачено {R(83200)} из {R(80000)} лимита. Вышли за лимит: Продукты, Рестораны и кафе.', 'caption', 'muted')),
        NotifShell(T('Вышла версия 0.3.15'), T('Нажми, чтобы скачать и установить.', 'caption', 'muted')),
    ])


def widgets():
    num = lambda t, size, c: f'<span style="display:block;font-family:{UB};font-weight:600;font-size:{size}px;color:{c};white-space:nowrap;letter-spacing:-0.5px">{t}</span>'
    bar = lambda p, track, c: f'<div style="height:6px;border-radius:3px;background:{track};overflow:hidden"><div style="width:{p}%;height:6px;border-radius:3px;background:{c}"></div></div>'
    mini = lambda t, primary: f'<span style="display:flex;align-items:center;justify-content:center;flex:1 1 0;height:40px;border-radius:20px;background:{C("accent") if primary else C("fill")};{VARIANTS["label"]};color:{C("onAccent") if primary else C("ink")}">{t}</span>'
    large = box(between(T('Можно сегодня', 'label', 'muted'), f'<span style="display:block;background:{C("warnSoft")};border-radius:10px;padding:3px 8px;{VARIANTS["caption"]};color:{C("warnSoftInk")}">2 ждут отправки</span>', align='center'),
                num(R(1982), 36, C('ink')), bar(24, C('line'), C('accent')),
                T(f'Потрачено {R(640)} из {R(2622)}', 'caption', 'muted'), T(f'На месяц осталось {R(70160)} · 27 дней', 'caption', 'muted'),
                row(mini('+ Трата', True), mini('Входящие', False), gap=8),
                style=f"background:{C('card')};border-radius:28px;padding:16px;display:flex;flex-direction:column;gap:8px")
    today = box(T('Можно сегодня', 'label', style=f"color:{C('heroMuted')}"), num(R(1982), 24, C('heroInk')), bar(24, C('heroTrack'), C('heroAccent')),
                T(f'потрачено {R(640)}<br>лимит {R(2622)}', 'caption', style=f"color:{C('heroAccent')}", raw=True),
                style=f"background:{C('hero')};border-radius:28px;padding:16px;display:flex;flex-direction:column;gap:8px;flex:1 1 0;min-width:0")
    money = box(T('На счетах', 'label', 'muted'), num(R(64020), 24, C('ink')), T(f'долг {R(540000)}', 'caption', 'warnInk'),
                style=f"background:{C('card')};border-radius:28px;padding:16px;display:flex;flex-direction:column;gap:8px;flex:1 1 0;min-width:0")
    over = box(T('Можно сегодня', 'label', 'muted'), num(R(-1034), 36, C('warnInk')), bar(100, C('warn'), C('warn')),
               T(f'Потрачено {R(2743)} из {R(1709)} · перерасход {R(1034)}', 'caption', 'warnInk'), row(mini('+ Трата', True), mini('Входящие', False), gap=8),
               style=f"background:{C('card')};border-radius:28px;padding:16px;display:flex;flex-direction:column;gap:8px")
    return Screen('Widgets', 'Виджеты', 'native', [
        T('Виджеты', 'title', tag='h1'), large, row(today, money, gap=12, align='stretch'), over,
        T('Обновляются сразу после покупки, без открытия приложения. Тема берётся из системы.', 'caption', 'muted'),
    ], h=844)



# ---------- лимиты на Главной ----------

LIMS = [('Обязательные', 41200, 40000), ('Продукты', 22600, 25000), ('Доставка еды', 4272, 12000), ('Рестораны и кафе', 1800, 10000)]

FOLD_SCRIPT = ("renderVals() {\n    const open = !!(this.state && this.state.open);\n    return { toggle: () => this.setState({ open: !open }), expanded: open ? 'true' : 'false', listH: open ? 320 : 0, listO: open ? 1 : 0, rot: open ? 270 : 90 };\n  }")


def LimLine(name, spent, limit):
    hot = spent >= limit * 0.8
    cap = f'превышен на {R(spent - limit)}' if spent > limit else f'осталось {R(limit - spent)} из {R(limit)}'
    return col(between(T(name), T(cap, 'caption', 'warnInk' if spent > limit else 'muted')), Meter(spent, limit, 'warn' if hot else 'accent'), gap=6)


def LimitsFoldCard():
    all_link = f'<a href="{link("Limits") or "#"}" style="{VARIANTS["label"]};color:{C("accentInk")};text-decoration:none">Все лимиты</a>'
    head = (f'<button type="button" aria-expanded="{{{{expanded}}}}" onClick="{{{{toggle}}}}" style="width:100%;background:transparent;border:0;padding:0;display:flex;align-items:center;gap:12px;text-align:left;font-family:Manrope,sans-serif;min-height:44px;cursor:pointer">'
            + grow(T('Лимиты'), T('1 превышен, 1 почти', 'caption', 'warnInk'))
            + f'<span style="display:block;flex-shrink:0;transform:rotate({{{{rot}}}}deg);transition:transform 250ms ease">{icon("right", C("muted"), 18, 2.4)}</span></button>')
    body = (f'<div style="max-height:{{{{listH}}}}px;opacity:{{{{listO}}}};overflow:hidden;transition:max-height 250ms ease,opacity 250ms ease">'
            + col(*[LimLine(*l) for l in LIMS], box(all_link, style='align-self:flex-start;padding:4px 0'), gap=12, style='padding:12px 0 8px') + '</div>')
    return Card(head, body, gap=0, style='padding:8px 16px')


LIGHT_SCREENS = [
    onb_welcome, onb_connect, onb_access, onb_permissions, onb_howto,
    main, main_alerts, main_negative, inbox, inbox_states, inbox_empty, add, analytics, settings,
    add_income, add_transfer, overdraft, pick, sync_result, sync_failed, history, operation, operation_synced, operation_transfer, operation_fix, operation_split,
    account, account_settings, account_credit, account_receivable, reconcile, reconcile_ok, analytics_past, analytics_year, category, month_summary, goals, goal_edit,
    limit_edit, recurring, recurring_edit, subcategories, rules, sources, devices, debug_log,
    notification, status_notifs, widgets,
]
DARK_SCREENS = [main, inbox, add, analytics, operation_synced, settings, account, widgets, notification]
PAGES = [('onb', 'Первый запуск'), ('main', 'Основные экраны'), ('ops', 'Операции'), ('acc', 'Счета, аналитика, долги'), ('set', 'Настройки'), ('native', 'Шторка и виджеты'), ('dark', 'Тёмная тема')]


# ---------- варианты: перевод больше остатка ----------

def OverAmount(amount, under='', over=True, extra=''):
    color = C('warnInk') if over else C('ink')
    return Card(T('Сумма', 'label', 'muted'),
                f'<span style="display:block;font-family:{UB};font-weight:600;font-size:44px;color:{color};text-align:center;line-height:54px">{R(amount)}</span>',
                under, extra, gap=8, style='align-items:center;padding:20px 16px')


def OverShell(name, title, kids, footer):
    return Screen(name, title, 'over', [T('Новая операция', 'title', tag='h1'), Seg(KINDS, 'Перевод'), *kids,
                                        AccountPick('Т-Банк кредитка', 'Куда', ''), Comment()], footer=footer, tab='Add')


def over_a():
    link_ = lambda t: f'<a href="#" style="{VARIANTS["label"]};color:{C("accentInk")};text-decoration:underline;text-underline-offset:3px">{t}</a>'
    under = row(T(f'Больше остатка на {R(3800)}', 'label', 'warnInk'), T('·', 'label', 'muted'), link_(f'Перевести всё {R(1200)}'), gap=6, style='flex-wrap:wrap;justify-content:center')
    return OverShell('OverA', 'А. Подпись под суммой', [
        OverAmount(5000, under),
        AccountPick('Т-Банк', 'Откуда', f'{R(1200)}'),
    ], Pill('Сохранить', 'primary', style='width:100%'))


def over_b():
    after = lambda t, c: f'<span style="{VARIANTS["label"]};color:{C(c)};white-space:nowrap">{t}</span>'
    from_row = ListCard(Row('Откуда', None, left=Mono('Т', 'monoYellow', 36),
                            right=col(T('Т-Банк', 'label'), row(after(R(1200), 'muted'), after('→', 'muted'), after(R(-3800), 'warnInk'), gap=6), gap=2, style='align-items:flex-end'), last=True))
    to_row = ListCard(Row('Куда', None, left=Mono('Т', 'monoGray', 36),
                          right=col(T('Т-Банк кредитка', 'label'), row(after(f'долг {R(100000)}', 'muted'), after('→', 'muted'), after(R(95000), 'ink'), gap=6), gap=2, style='align-items:flex-end'), last=True))
    return Screen('OverB', 'Б. Было → станет на счетах', 'over', [
        T('Новая операция', 'title', tag='h1'), Seg(KINDS, 'Перевод'), OverAmount(5000, T('остатки ниже пересчитываются по мере ввода', 'caption', 'muted'), over=False),
        from_row, to_row,
        Comment(),
    ], footer=Pill('Сохранить', 'primary', style='width:100%'), tab='Add')


def over_c():
    pct = 1200 / 5000 * 100
    bar = (f'<div aria-hidden="true" style="width:100%;height:10px;border-radius:5px;overflow:hidden;display:flex;background:{C("line")}">'
           f'<div style="width:{pct:.0f}%;background:{C("accent")}"></div>'
           f'<div style="flex:1 1 0;background:repeating-linear-gradient(135deg,{C("warn")} 0 6px,{C("warnSoft")} 6px 12px)"></div></div>')
    under = col(bar, between(T(f'есть {R(1200)}', 'caption', 'muted'), T(f'не хватает {R(3800)}', 'caption', 'warnInk')), gap=6, style='width:100%')
    return OverShell('OverC', 'В. Шкала остатка', [
        OverAmount(5000, under),
        AccountPick('Т-Банк', 'Откуда', f'{R(1200)}'),
    ], Pill('Сохранить', 'primary', style='width:100%'))


def over_d():
    quiet = f'<a href="#" style="display:block;text-align:center;{VARIANTS["label"]};color:{C("muted")};padding:12px 0;text-decoration:underline;text-underline-offset:3px">Всё равно {R(5000)}, уйдёт в минус</a>'
    return OverShell('OverD', 'Г. Кнопка предлагает безопасное', [
        OverAmount(5000, T(f'доступно {R(1200)}', 'label', 'warnInk')),
        AccountPick('Т-Банк', 'Откуда', f'{R(1200)}'),
    ], col(Pill(f'Перевести всё · {R(1200)}', 'primary', style='width:100%'), quiet, gap=0))


OVER_SCREENS = [over_a, over_b, over_c, over_d]


# Предложения 05.11 (на утверждение): отдельная страница холста.
from themes import THEMES, ThemeDots, THEME_SCREENS  # noqa: E402
from ideas import IDEA_SCREENS  # noqa: E402
LIGHT_SCREENS += THEME_SCREENS + IDEA_SCREENS
PAGES.append(('idea', 'Предложения 05.11'))
