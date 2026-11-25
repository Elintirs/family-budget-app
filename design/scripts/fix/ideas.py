"""Предложения 05.11: план долгов, темп трат, деньги до зарплаты, сверка по времени, Pathfinder.
Суммы взяты из таблицы на 5 ноября, чтобы макет читался как настоящий месяц."""
from kit import *
import screens
from screens import MainHead, Hero, Compare, Point, NotifShell, LimitRow, SUBS, ACCS

NOW = 'четверг, 5 ноября'
DAYS_LEFT = 26          # 5–30 ноября
MONTH, SPENT = 54000, 8701.23
LEFT = MONTH - SPENT     # 45 298,77
GAMES = 4000          # Pathfinder отложен заранее, в лимит на день не идёт
PER_DAY = (LEFT - GAMES) / DAYS_LEFT


def Head(title):
    return between(col(T(NOW, 'bodyRegular', 'muted'), T(title, 'title', tag='h1'), gap=2), '', align='center')


def Tick(pct_fill, pct_mark, tone='warn'):
    """Полоса потраченного с отметкой «где должны быть по календарю»."""
    color = C('warn') if tone == 'warn' else C('accent')
    return (f'<div style="position:relative;height:10px;border-radius:5px;background:{C("line")}">'
            f'<div style="width:{pct_fill:.1f}%;height:10px;border-radius:5px;background:{color}"></div>'
            f'<div aria-hidden="true" style="position:absolute;left:{pct_mark:.1f}%;top:-4px;width:2px;height:18px;border-radius:1px;background:{C("ink")}"></div></div>')


def PaceCard():
    pct_spent, pct_month = SPENT / MONTH * 100, 4 / 30 * 100
    forecast = SPENT / 4 * 30
    return f'<a href="{link("Limits") or "#"}" style="text-decoration:none;display:block">' + Card(
        between(T('Темп трат'), T(f'{pct_spent:.0f}% лимита за {pct_month:.0f}% месяца', 'caption', 'warnInk'), align='center'),
        Tick(pct_spent, pct_month),
        between(T(f'Потрачено {R(SPENT)}', 'caption', 'muted'), T('черта: 4 дня из 30', 'caption', 'muted')),
        Soft(T(f'Так к 30 ноября выйдет ≈ {R(round(forecast, -2))} из {R(MONTH)}', 'body', 'warnSoftInk'),
             T(f'Больше всего: продукты {R(4722)} и бензин {R(2851)}.', 'caption', 'warnSoftInk'), gap=4),
        gap=10) + '</a>'


def PaydayCard():
    return f'<a href="{link("Payday") or "#"}" style="text-decoration:none;display:block">' + Card(
        between(T('До зарплаты 10 ноября', 'caption', 'muted'), T('5 дней', 'label', 'muted'), align='center'),
        row(T(R(1878), 'amount', style='font-size:32px;line-height:38px'), T('в день', 'label', 'muted'), gap=8, align='baseline'),
        T(f'На картах {R(9393)}, до 10-го обязательных нет. Запас {R(20000)} наличными не считаем.', 'caption', 'muted'),
        T('График выплат и платежей', 'label', 'accentInk'), gap=8) + '</a>'


def PaydayLine():
    return f'<a href="{link("Payday") or "#"}" style="text-decoration:none;display:block">' + ListCard(
        Row('До зарплаты 10 ноября хватает', f'на картах {R(9393)} · это {R(1878)} в день, запас {R(290)} в день', 'accentInk', right=Chevron(), last=True)) + '</a>'


def main_pace():
    old, screens.TODAY = screens.TODAY, NOW
    head = MainHead(0)
    screens.TODAY = old
    return Screen('MainPace', '3·4·5 Главная: темп и до зарплаты', 'idea', [
        head,
        Hero(remaining=round(PER_DAY), spent=0, limit=round(PER_DAY), pending=0, month=LEFT, days=DAYS_LEFT),
        PaydayLine(), PaceCard(),
        f'<a href="{link("DebtPlan") or "#"}" style="text-decoration:none;display:block">' + Card(
            between(T('Сбер: платёж за ноябрь'), Num(f'{R(15000)} из {R(43700)}')), Meter(15000, 43700, 'accent'),
            T(f'Следующий: 10 ноября {R(22000)}. Идём по плану, закроем в августе 2027.', 'caption', 'muted'), gap=8) + '</a>',
    ], tab='Main')


# ---------- 3. План долгов ----------

SBER_PATH = [('ноя', 478381), ('дек', 417851), ('янв', 366696), ('фев', 314457), ('мар', 261113), ('апр', 206640), ('май', 151014), ('июн', 94211), ('июл', 36205), ('авг', 0)]


def DebtBars():
    mx = 496221
    cols = []
    for i, (lab, v) in enumerate(SBER_PATH):
        cur = i == 0
        h = max(4, v / mx * 120)
        style = f"background:{C('accent')}" if cur else f"background:transparent;border:2px dashed {C('muted')};box-sizing:border-box"
        cols.append(col(f'<div style="width:100%;max-width:26px;height:{h:.0f}px;border-radius:6px;{style}"></div>',
                        T(lab, 'caption', 'ink' if cur else 'muted'), gap=6, style='flex:1 1 0;align-items:center'))
    return row(*cols, gap=4, align='flex-end', style='height:150px')


def debt_plan():
    step = lambda when, what, amount, done=False, last=False: Row(
        what, when, 'accentInk' if done else 'muted', left=box(icon('check', C('onAccent'), 14, 3) if done else '', style=(
            f"width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
            + (f"background:{C('accent')}" if done else f"border:2px solid {C('border')};box-sizing:border-box"))),
        right=Num(R(amount), 'muted' if done else 'ink'), last=last)
    return Screen('DebtPlan', '3 Долги: план погашения', 'idea', [
        Header('Долги'),
        Card(T('Долг по кредиткам', 'caption', style=f"color:{C('heroMuted')}"), T(R(596221), 'amount', style=f"color:{C('heroInk')}"),
             T('Все закроем к октябрю 2027 · идём по плану', 'label', style=f"color:{C('heroAccent')}"), tone='hero'),
        Card(between(T('Сбер кредитка · ноябрь', 'h2'), Mono('С', 'monoGreen', 32), align='center'),
             between(T('Внесено за месяц', 'caption', 'muted'), Num(f'{R(15000)} из {R(43700)}')), Meter(15000, 43700, 'accent'),
             T(f'Обязательный {R(27000)} до 30 ноября: осталось {R(12000)}. Ещё {R(16700)} сверх, чтобы меньше процентов.', 'caption', 'muted'),
             ListCard(step('1 ноября · внесено', 'Первая часть', 15000, done=True),
                      step('10 ноября · с зарплаты', 'Добрать обязательный и сверх', 22000),
                      step('16 ноября · с перевода', 'Сверх плана', 6700, last=True), tone='ground'),
             Pill('Внести на Сбер', 'strong', 'md', href='AddTransfer'), gap=10),
        Card(between(T('Долг Сбера по плану', 'h2'), T('конец месяца', 'caption', 'muted')), DebtBars(),
             T(f'60 000 в месяц с января, проценты за всё время ≈ {R(60000)}.', 'caption', 'muted')),
        Card(T('Если вносить в месяц'), Chips(Chip('50 тыс. · окт 2027'), Chip('60 тыс. · авг 2027', True), Chip('70 тыс. · июл 2027')),
             T('Внесли меньше: дата сдвинется сама.', 'caption', 'muted'), gap=10),
        Card(between(T('Т-Банк кредитка'), Num(R(100000))), T('0% пока прогоняем 100 000 до даты выписки', 'caption', 'accentInk'),
             Soft(T('Дата выписки не указана', 'body', 'warnSoftInk'), T('Без неё не напомню о прогоне. Пропуск = 30–39,9% годовых на всю сумму.', 'caption', 'warnSoftInk'),
                  Pill('Указать дату', 'strong', 'md', style='align-self:flex-start', href='DebtTermsSber'), gap=6), gap=8),
        box(Row('Условия: Сбер кредитка', 'ставка, платёж, страховка', right=Chevron(), last=True, href='DebtTermsSber'), style=f"background:{C('card')};border-radius:22px;padding:4px 16px"),
    ])


def debt_terms():
    F = lambda label, value, cap='': col(T(label, 'caption', 'muted'), T(value, 'num'), T(cap, 'caption', 'muted') if cap else '', gap=2)
    return Screen('DebtTermsSber', '3 Условия долга: Сбер', 'idea', [
        Header('Условия долга', 'DebtPlan'), T('Сбер кредитка · договор от 15.10.2022', 'label', 'muted'),
        Card(row(F('Ставка', '25,4%', 'вне льготного периода'), F('Неустойка', '36%', 'на просрочку'), gap=12, align='flex-start'),
             row(F('Обязательный', '3% + проценты', f'сейчас ≈ {R(27000)}'), F('Отчёт', 'последний день', 'месяца'), gap=12, align='flex-start'), gap=14),
        Card(T('Платить до'), Input('число месяца', value='20', weight=800, bg='card', label='Платить до'), T('дата платежа из отчёта банка; за 3 дня напомню, сколько осталось до обязательного', 'caption', 'muted'), gap=8),
        Card(T('Страховка по карте'), T(f'по договору: 2,3% долга 15-го числа, сейчас ≈ {R(11400)} в месяц', 'caption', 'muted'),
             Seg(['Списывается', 'Отключена', 'Не знаю'], 'Не знаю'),
             Soft(T('Проверь выписку за 15 октября', 'body', 'warnSoftInk'), T('Ищи «Плата за участие в программе страхования». Пока не отмечено, план считает без страховки, а риск ≈ 27% годовых сверху.', 'caption', 'warnSoftInk'), gap=4), gap=10),
        Card(T('В этом месяце'), between(T('Проценты', 'caption', 'muted'), Num(f'≈ {R(10500)}')), between(T('Страховка', 'caption', 'muted'), Num('не учтена', 'warnInk')),
             between(T('Уменьшит долг', 'caption', 'muted'), Num(f'≈ {R(33200)}', 'accentInk')), T(f'из платежа {R(43700)}', 'caption', 'muted'), gap=8),
    ], footer=Pill('Сохранить', 'primary', style='width:100%', href='DebtPlan'))


# ---------- 5. До зарплаты ----------

def payday():
    def Stage(date, items, left_cap, last=False):
        rows = [Row(t, meta, left='', right=Num(R(v, True), 'accentInk' if v > 0 else 'ink'), last=i == len(items) - 1) for i, (t, meta, v) in enumerate(items)]
        return col(between(T(date, 'h2', tag='h2'), ''), ListCard(*rows),
                   Soft(T(left_cap, 'label', 'accentSoftInk'), tone='accentSoft'), gap=8)
    return Screen('Payday', '5 Деньги до зарплаты', 'idea', [
        Header('До зарплаты'),
        Card(T('До 10 ноября можно', 'caption', style=f"color:{C('heroMuted')}"),
             row(T(R(1878), 'amount', style=f"color:{C('heroInk')}"), T('в день', 'label', style=f"color:{C('heroMuted')}"), gap=8, align='baseline'),
             T(f'на картах {R(9393)} · 5 дней · запас {R(20000)} не трогаем', 'label', style=f"color:{C('heroAccent')}"), tone='hero'),
        Stage('10 ноября', [('Зарплата Олега', 'карта', 25000), ('Остаток зарплаты Елены', '', 37000),
                            ('Аренда маме', 'Обязательные · регулярный', -25000), ('Сбер кредитка', 'обязательный 12 000 и сверх 10 000', -22000)],
              f'На жизнь до 16-го: {R(15000)} · {R(2500)} в день'),
        Stage('16 ноября', [('Олег: перевод', 'за вторую половину октября', 25000), ('Сбер кредитка', 'сверх плана', -6700)],
              f'До 25-го: {R(18300)} · {R(2033)} в день'),
        Stage('25 ноября', [('Зарплата Олега', 'карта, уже по 120 тыс.', 27000), ('Аванс Елены', 'карта и наличные', 30500),
                            ('Связь, подписки, коммуналка', 'Обязательные · 4 платежа', -9800)],
              f'До 1 декабря: {R(47700)}, остаток уйдёт в декабрьский платёж Сбера'),
        T('Выплаты и обязательные платежи берутся из «Регулярных». Если зарплата пришла раньше, график сдвигается сам.', 'caption', 'muted', style='text-align:center'),
        Pill('Даты выплат и платежей', 'secondary', href='Recurring'),
    ])


# ---------- 6. Сверка по точному времени ----------

def reconcile_time():
    return Screen('ReconcileTime', '6 Сверка по точному времени', 'idea', [
        Header('Сбер кредитка', 'DebtPlan', Mono('С', 'monoGreen')),
        Card(Compare('Долг по таблице', R(511220.59), 'В банке', R(508785.02), 'на 1 ноября 14:50', '1 ноября 14:50'),
             Soft(T(f'Разница {R(2435.57)}', 'body', 'warnSoftInk'),
                  T('Сравниваем с операциями до минуты снимка. Платёж в 17:50 прошёл позже и в эту разницу не входит.', 'caption', 'warnSoftInk'), gap=4)),
        Sect('Сверка', 'снимки из банка'),
        ListCard(Row('Перевод с Т-Банка', '1 ноября 17:50 · после снимка', left=box(icon('down', C('accentInk'), 18, 2.4), style='width:24px;display:flex;justify-content:center'), right=Num(R(-15000), 'accentInk')),
                 Point('1 ноября 14:50', 'уведомление банка', R(508785.02), False, R(2435.57), last=True)),
        Card(T('Как сейчас, до исправления'), T(f'Остаток банка в 14:50 сравнивается со всеми операциями за 1 ноября, в том числе с платежом в 17:50, который был позже. Выходит, будто платёж уже прошёл: по таблице долг {R(496220.59)}, и сверка пишет «в банке больше на {R(12564.43)}». На деле разница {R(2435.57)}.', 'caption', 'muted'), tone='fill', gap=6),
        Pill('Сверить с банком', 'primary', href='Reconcile'),
        T('Чтобы разница закрылась, нужен свежий долг из СберБанк Онлайн', 'caption', 'muted', style='text-align:center'),
    ])


# ---------- 4. Уведомления о темпе ----------

def pace_notifs():
    return Screen('PaceNotifs', '4·5 Напоминания: темп и платежи', 'idea', [
        T('Шторка', 'title', tag='h1'),
        NotifShell(T('Вкусняшки: 80% лимита'), T(f'Осталось {R(1000)} из {R(5000)}, до конца месяца 12 дней.', 'caption', 'muted')),
        NotifShell(T('Траты быстрее плана'), T(f'За неделю {R(15200)} при норме {R(12200)}. Так к концу месяца выйдет ≈ {R(64000)}.', 'caption', 'muted')),
        NotifShell(T('Итоги недели'), T(f'Потрачено {R(11800)} из {R(12200)}. Лучше всего: доставка 0 ₽. Больше всего: продукты {R(4700)}.', 'caption', 'muted')),
        NotifShell(T('Завтра: аренда маме'), T(f'{R(25000)} с Т-Банка. На карте сейчас {R(9393)}, зарплата придёт утром.', 'caption', 'muted')),
        NotifShell(T('Сбер: до обязательного 3 дня'), T(f'Осталось внести {R(12000)} из {R(27000)}.', 'caption', 'muted')),
        NotifShell(T('Т-Банк: прогнать 100 000'), T('Выписка через 2 дня. Без прогона льготный период сгорит.', 'caption', 'muted')),
    ], h=844)


# ---------- Pathfinder ----------

def limits54():
    games = ''.join(f'<span style="display:block;width:28px;height:28px;border-radius:14px;border:2px solid {C("accent")};box-sizing:border-box"></span>' for _ in range(4))
    return Screen('Limits', 'Лимиты: игры и вкусняшки', 'set', [
        Header('Лимиты', 'Settings'),
        Card(between(T('Лимит на месяц', 'caption', 'muted'), T('изменить', 'label', 'accentInk'), align='center'), T(R(MONTH), 'amount'),
             T(f'≈ {R(round(PER_DAY))} в день на 26 дней: из остатка {R(LEFT)} сначала отложены игры Pathfinder {R(GAMES)}.', 'label', 'muted')),
        Card(between(T('Pathfinder', 'h2'), Num(f'0 из {R(4000)}')), row(games, gap=8),
             T(f'4 игры по {R(1000)} впереди, раз в неделю. Каждая игра сама отметится по покупке в «Развлечениях».', 'caption', 'muted'),
             Pill('Записать игру', 'secondary', 'md', href='Add', style='align-self:flex-start'), gap=10),
        Sect('По подкатегориям', 'ноябрь'),
        ListCard(LimitRow('Продукты', '', 4722, 26000), LimitRow('Транспорт', 'бензин, такси', 2851, 8000),
                 LimitRow('Вкусняшки', 'кола и энергосы тоже здесь', 594, 5000), LimitRow('Развлечения', 'Pathfinder', 0, 4000),
                 LimitRow('Рестораны и кафе', 'посиделки тоже здесь', 534, 4000), LimitRow('Доставка еды', '', 0, 4000),
                 LimitRow('Товары для дома', '', 0, 2000, True)),
    ])


def recurring_weekly():
    F = lambda t, *k: Card(T(t), *k, gap=8)
    return Screen('RecurringWeekly', 'Pathfinder Регулярный раз в неделю', 'idea', [
        Header('Регулярный платёж', 'Limits'),
        F('Название', Input('Аренда, связь, Pathfinder', value='Pathfinder', bg='card', label='Название')),
        F('Сумма', Input('1 000', value='1 000', weight=800, bg='card', label='Сумма')),
        F('Как часто', Seg(['Каждый месяц', 'Каждую неделю'], 'Каждую неделю'),
          Chips(*[Chip(d) for d in 'пн вт ср чт пт сб вс'.split()]), T('день игры: по нему напоминание и проверка, была ли оплата', 'caption', 'muted')),
        F('Как узнать оплату', Input('слово или магазин', value='игра', bg='card', label='Слово для поиска'),
          T(f'Игра отмечена, если за неделю есть трата {R(1000)} ±20% в «Развлечениях» или со словом «игра».', 'caption', 'muted')),
        F('Подкатегория', Chips(*[Chip(s, s == 'Развлечения') for s in SUBS[:8]])),
        F('Счёт', Chips(*[Chip(a, a == 'Т-Банк') for a in ACCS[:5]])),
    ], footer=Pill('Сохранить', 'primary', style='width:100%', href='Limits'))




# ---------- Регулярные: гибкий повтор ----------

DOT = dict(income='accent', expense='warn', transfer='strong')


def Dots(*kinds):
    return row(*[f'<span style="display:block;width:6px;height:6px;border-radius:3px;background:{C(DOT[k])}"></span>' for k in kinds], gap=2, style='justify-content:center;height:6px')


def MonthCal(marks, today=5, first_wd=6, days=30):
    """Календарь месяца, неделя с понедельника; marks: день -> виды операций."""
    head = row(*[T(d, 'caption', 'muted', style='flex:1 1 0;text-align:center') for d in 'пн вт ср чт пт сб вс'.split()])
    cells = [''] * first_wd + list(range(1, days + 1))
    cells += [''] * (-len(cells) % 7)
    weeks = []
    for w in range(0, len(cells), 7):
        out = []
        for d in cells[w:w + 7]:
            if d == '':
                out.append(box(style='flex:1 1 0;height:44px'))
                continue
            on = d == today
            num = (f'<span style="display:flex;width:30px;height:30px;border-radius:15px;align-items:center;justify-content:center;'
                   f'{VARIANTS["label"]};color:{C("onAccent") if on else C("ink")};background:{C("accent") if on else "transparent"}">{d}</span>')
            out.append(col(num, Dots(*marks.get(d, ())), gap=2, style='flex:1 1 0;align-items:center;height:44px'))
        weeks.append(row(*out))
    return col(head, *weeks, gap=4)


def RecRow(title, rule, amount, kind, last=False, href='RecurrenceIncome'):
    tone = dict(income='accentInk', expense='ink', transfer='ink')[kind]
    left = f'<span style="display:block;width:10px;height:10px;border-radius:5px;background:{C(DOT[kind])};flex-shrink:0"></span>'
    return Row(title, rule, left=left, right=row(Num(amount, tone), Chevron(), gap=8), last=last, href=href)


def recurring_plan():
    marks = {1: ('income',), 10: ('income', 'income', 'expense', 'transfer'), 16: ('income', 'transfer'), 25: ('income', 'income', 'expense'), 28: ('expense',)}
    return Screen('RecurringPlan', 'Регулярные: календарь и список', 'idea', [
        Header('Регулярные', 'Settings'),
        Card(between(T('Ноябрь', 'h2'), row(Legend(C('accent'), 'приход'), Legend(C('warn'), 'расход'), Legend(C('strong'), 'перевод'), gap=10), align='center'),
             MonthCal(marks), gap=12),
        Card(between(T('В месяц', 'caption', 'muted'), T('по правилам ниже', 'caption', 'muted')),
             row(grow(T('Приходит', 'caption', 'muted'), Num(R(169500, True), 'accentInk')), grow(T('Уходит', 'caption', 'muted'), Num(R(-73500))),
                 grow(T('Остаётся', 'caption', 'muted'), Num(R(96000))), gap=8, align='flex-start'), gap=8),
        box(Row('Доходы: план и факт', f'октябрь: узнано {R(187592)}, 2 прихода ждут разбора', 'warnInk', right=Chevron(), last=True, href='IncomeCheck'), style=f"background:{C('card')};border-radius:22px;padding:4px 16px"),
        Sect('Доходы'),
        ListCard(RecRow('Зарплата Олега', '10 и 25 числа · в выходной раньше', '20–40 тыс.', 'income'),
                 RecRow('Олег: перевод', '1 и 16 числа · в выходной раньше', '20–40 тыс.', 'income'),
                 RecRow('Елена: аванс и остаток', '25 и 10 числа', '30,5 и 37 тыс.', 'income', last=True)),
        Sect('Обязательные'),
        ListCard(RecRow('Аренда маме', 'каждый месяц 10 числа', R(25000), 'expense'),
                 RecRow('Сбер кредитка', '10 и 16 · до последнего дня месяца', R(28700), 'transfer'),
                 RecRow('Т-Банк: прогон', 'каждый месяц до даты выписки', R(100000), 'transfer'),
                 RecRow('Связь, подписки, коммуналка', '4 правила · 1–28 числа', R(9800), 'expense', last=True)),
        Sect('Свои'),
        ListCard(RecRow('Pathfinder', 'каждую неделю · день не выбран', R(1000), 'expense', last=True, href='RecurrencePathfinder')),
        Pill('Добавить правило', 'secondary', href='RecurrenceIncome'),
    ])


def DayGrid(selected, last=False):
    cells = []
    for d in list(range(1, 32)) + ['посл.']:
        on = d in selected or (d == 'посл.' and last)
        w = 'flex:2 1 0' if d == 'посл.' else 'flex:1 1 0'
        cells.append(f'<button type="button" style="{w};height:40px;border-radius:12px;border:1.5px solid {C("accent") if on else C("border")};'
                     f'background:{C("accent") if on else "transparent"};color:{C("onAccent") if on else C("ink")};{VARIANTS["label"]};font-family:Manrope,sans-serif;padding:0;min-width:0">{d}</button>')
    rows = [row(*cells[i:i + 7], gap=6) for i in range(0, len(cells), 7)]
    return col(*rows, gap=6)


def Opt(title, cap, on):
    mark = (f'<span style="display:flex;width:22px;height:22px;border-radius:11px;box-sizing:border-box;align-items:center;justify-content:center;flex-shrink:0;'
            + (f'background:{C("accent")}">' + icon('check', C('onAccent'), 14, 3) if on else f'border:2px solid {C("border")}">') + '</span>')
    return row(mark, grow(T(title), T(cap, 'caption', 'muted') if cap else ''), gap=12, style='padding:10px 0')


def Every(n, unit):
    btn = lambda t, lab: (f'<button type="button" aria-label="{lab}" style="width:44px;height:44px;border-radius:22px;border:1.5px solid {C("border")};background:transparent;'
                          f'{VARIANTS["h2"]};color:{C("ink")};font-family:Manrope,sans-serif;padding:0">{t}</button>')
    return col(row(T('Каждые', 'body'), btn('−', 'Меньше'), T(str(n), 'title', style='min-width:28px;text-align:center'), btn('+', 'Больше'), gap=10),
               Seg(['дней', 'недель', 'месяцев', 'лет'], unit), gap=10)


def Upcoming(*items):
    return Soft(T('Ближайшие', 'label', 'accentSoftInk'),
                *[between(T(d, 'label', 'accentSoftInk'), T(n, 'caption', 'accentSoftInk')) for d, n in items], tone='accentSoft', gap=6)


def recurrence_income():
    F = lambda t, *k: Card(T(t), *k, gap=10)
    return Screen('RecurrenceIncome', 'Регулярное: зарплата, по числам', 'idea', [
        Header('Зарплата Олега', 'RecurringPlan'),
        Soft(T('Каждый месяц 10 и 25 числа · в выходной раньше · 20–40 тыс. на Т-Банк', 'body', 'accentSoftInk'), T('Узнаём по словам «зп», «зарплата», «кусок зп» и сумме', 'caption', 'accentSoftInk'), tone='accentSoft', gap=4),
        Seg(['Расход', 'Доход', 'Перевод'], 'Доход'),
        F('Сумма', Seg(['Точная', 'Плавает', 'Как прошлая'], 'Плавает'),
          row(Input('от', value='20 000', weight=800, bg='card', label='Сумма от'), T('–', 'h2', 'muted'), Input('до', value='40 000', weight=800, bg='card', label='Сумма до'), gap=8),
          T('Для графика «До зарплаты» берём нижнюю границу, чтобы не обещать лишнего.', 'caption', 'muted')),
        F('Повтор', Chips(Chip('Каждый месяц', True), Chip('Каждую неделю'), Chip('Каждые 2 недели'), Chip('Свой', tone='more')),
          Seg(['По числам', 'По дню недели'], 'По числам'), DayGrid({10, 25}),
          T('Можно несколько чисел. «посл.» — последний день месяца.', 'caption', 'muted')),
        F('Счёт', Chips(*[Chip(a, a == 'Т-Банк') for a in ACCS[:5]])),
        F('Как узнать приход', Input('слова через запятую', value='зп, зарплата, кусок зп', bg='card', label='Слова в комментарии'),
          T('Ищем в комментарии и в тексте пуша. Ещё учитываем отправителя и сумму в границах выше.', 'caption', 'muted'),
          Soft(T('Узнано в октябре', 'label', 'accentSoftInk'),
               between(T('10 октября · «Зарплата»', 'caption', 'accentSoftInk'), T(R(24999, True), 'label', 'accentSoftInk')),
               between(T('24 октября · «ЗП 25 число» · на день раньше', 'caption', 'accentSoftInk'), T(R(25000, True), 'label', 'accentSoftInk')), tone='accentSoft', gap=6)),
        box(Row('Ещё настройки', 'в выходной раньше · всегда · окно 3 дня до и 2 после · отправитель из пуша · напомнить в день', right=Chevron(), last=True), style=f"background:{C('card')};border-radius:22px;padding:4px 16px"),
        Upcoming(('10 ноября, вт', '20–40 тыс.'), ('25 ноября, ср', '20–40 тыс.'), ('10 декабря, чт', '20–40 тыс.'), ('25 декабря, пт', '20–40 тыс.')),
    ], footer=Pill('Сохранить', 'primary', style='width:100%', href='RecurringPlan'))


def recurrence_pathfinder():
    F = lambda t, *k: Card(T(t), *k, gap=10)
    wd = lambda d, on=False: (f'<button type="button" style="flex:1 1 0;height:44px;border-radius:22px;border:1.5px solid {C("accent") if on else C("border")};'
                              f'background:{C("accent") if on else "transparent"};color:{C("onAccent") if on else C("ink")};{VARIANTS["label"]};font-family:Manrope,sans-serif;padding:0;min-width:0">{d}</button>')
    return Screen('RecurrencePathfinder', 'Регулярное: Pathfinder, по дням недели', 'idea', [
        Header('Pathfinder', 'RecurringPlan'),
        Seg(['Расход', 'Доход', 'Перевод'], 'Расход'),
        F('Сумма', Seg(['Точная', 'Плавает', 'Как прошлая'], 'Точная'), Input('1 000', value='1 000', weight=800, bg='card', label='Сумма')),
        F('Повтор', Chips(Chip('Каждый день'), Chip('Каждую неделю', True), Chip('Каждый месяц'), Chip('Каждый год'), Chip('Свой', tone='more')),
          Every(1, 'недель'),
          row(*[wd(d) for d in 'пн вт ср чт пт сб вс'.split()], gap=6),
          T('Выбери день игры, можно несколько. Пока день не выбран, лимит держит 4 игры в месяц.', 'caption', 'muted')),
        F('Пропуски', Toggle('Перенести, если не сыграли', 'деньги игры остаются в «Развлечениях» до конца месяца', True),
          Toggle('Пауза', 'например, на отпуск: правило не учитывается до выбранной даты', False)),
        F('Как узнать оплату', Input('слово или магазин', value='игра', bg='card', label='Слово для поиска'),
          T(f'Отмечена, если в неделю есть трата {R(1000)} ±20% в «Развлечениях» или со словом «игра».', 'caption', 'muted')),
        F('Подкатегория', Chips(*[Chip(s, s == 'Развлечения') for s in ['Развлечения', 'Рестораны и кафе', 'Вкусняшки', 'Транспорт']], Chip('ещё', tone='more'))),
        Upcoming(('эта неделя', 'день не выбран'), ('в ноябре', f'4 игры · {R(4000)}')),
    ], footer=Pill('Сохранить', 'primary', style='width:100%', href='RecurringPlan'))




def income_check():
    def Line(title, plan, fact, cap, ok=True):
        tone = 'accentInk' if ok else 'warnInk'
        return col(between(T(title), Num(f'{R(fact)} из {R(plan)}', tone)), Meter(min(fact, plan), plan, 'accent' if ok else 'warn'),
                   T(cap, 'caption', tone), gap=6, style=f"padding:12px 0;border-bottom:1px solid {C('line')}")
    def Occ(when, what, amount, state):
        tone, mark = dict(ok=('accentInk', '✓ узнано'), early=('accentInk', '✓ раньше срока'), wait=('muted', 'ждём'), miss=('warnInk', 'не пришло'))[state]
        return Row(what, f'{when} · {mark}', tone, right=Num(R(amount, True) if amount else '—', 'accentInk' if amount else 'muted'))
    return Screen('IncomeCheck', 'Доходы: план и факт', 'idea', [
        Header('Доходы: план и факт', 'RecurringPlan'),
        Seg(['Октябрь', 'Ноябрь'], 'Октябрь'),
        Card(T('Пришло по правилам', 'caption', style=f"color:{C('heroMuted')}"), T(R(187592), 'amount', style=f"color:{C('heroInk')}"),
             T(f'план {R(147500)}–{R(227500)} · {R(25000)} ждут разбора · {R(69404)} разовых', 'label', style=f"color:{C('heroAccent')}"), tone='hero'),
        Card(Line('Олег: зарплата и переводы', 160000, 99999, '3 из 4 узнаны; одна пришла сразу за два куска, одну узнать не удалось'),
             Line('Елена: аванс и остаток', 67500, 87593, f'больше плана на {R(20093)}: премия и подарочные пришли тем же переводом'),
             T('Сумма в границах правила — зелёная, вне границ — оранжевая.', 'caption', 'muted'), gap=0),
        Sect('Октябрь по датам', 'Олег'),
        ListCard(Occ('1 октября', 'Перевод за вторую половину сентября', 50000, 'early'),
                 Occ('10 октября', 'Зарплата', 24999, 'ok'),
                 Occ('16 октября', 'Перевод', None, 'miss'),
                 Occ('24 октября', 'ЗП 25 число', 25000, 'early')),
        Card(T('Не узнаны, это зарплата?'), T('Доходы с похожей суммой, но без слов из правила', 'caption', 'muted'),
             Row('Кусочек зп', '28 октября · Олег', right=Num(R(25000, True), 'accentInk')),
             Chips(Pill('Это перевод 16-го', 'strong', 'md'), Pill('Разовый', 'secondary', 'md')),
             Row('Подарочные + премия', '20 октября · Елена', right=Num(R(12000, True), 'accentInk'), last=True),
             Chips(Pill('Разовый', 'strong', 'md'), Pill('К зарплате Елены', 'secondary', 'md')), gap=8),
        T('Узнанные приходы закрывают ожидание в графике «До зарплаты»; если не пришло, дневная сумма пересчитывается от того, что есть на счетах.', 'caption', 'muted', style='text-align:center'),
    ])


IDEA_SCREENS = [main_pace, debt_plan, debt_terms, payday, pace_notifs, limits54, recurring_plan, recurrence_income, income_check, recurrence_pathfinder]
