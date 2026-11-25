"""Свои цвета темы: готовые палитры и ручная настройка. Тема хранится на телефоне, у каждого своя."""
from kit import *
import math
import kit


def lum(h):
    h = h.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


# Пользователь выбирает 3 цвета: акцент, главная карточка, расходы. Остальные токены выводятся из них.
THEMES = [
    dict(name='Зелёная', note='как была', accent='#0B6E4F', soft='#DDEFE6', softInk='#0A4A36', hero='#14181F', heroAccent='#7FE0B5', expense='#CC7440'),
    dict(name='Сливовая', note='', accent='#7A3E8E', soft='#F0E4F4', softInk='#4E2160', hero='#2A1730', heroAccent='#E3B6F0', expense='#C0684A'),
    dict(name='Морская', note='', accent='#0F6684', soft='#DDEEF4', softInk='#0A4357', hero='#10222B', heroAccent='#8FD8F2', expense='#C9763C'),
    dict(name='Терракота', note='', accent='#A0461F', soft='#F7E3D8', softInk='#6B2C11', hero='#2B1A14', heroAccent='#F4B999', expense='#3F7A8C'),
    dict(name='Графит', note='', accent='#3A4452', soft='#E6E9EE', softInk='#252C35', hero='#14181F', heroAccent='#C9D3E0', expense='#CC7440'),
]


def apply(t):
    """Светлая палитра с цветами темы; ink-токены акцента и текст на нём."""
    c = dict(LIGHT)
    c.update(accent=t['accent'], accentInk=t['accent'], accentSoft=t['soft'], accentSoftInk=t['softInk'],
             hero=t['hero'], heroAccent=t['heroAccent'], expense=t['expense'])
    return c


def ThemeDots(t, size=14):
    return row(*[f'<span style="display:block;width:{size}px;height:{size}px;border-radius:{size // 2}px;background:{t[k]};border:1px solid {C("control")}"></span>'
                 for k in ('accent', 'hero', 'expense')], gap=3)


def Preview(t):
    """Кусок Главной в цветах темы: рендерим тем же китом с подменённой палитрой."""
    old = kit.Ctx.c
    kit.Ctx.c = apply(t)
    try:
        hero = box(T('Можно потратить сегодня', 'label', style=f"color:{C('heroMuted')}"),
                   f'<span style="display:block;font-family:{UB};font-weight:600;font-size:30px;color:{C("heroInk")}">1 588<span style="color:{C("heroAccent")}"> ₽</span></span>',
                   f'<div style="height:6px;border-radius:3px;background:{C("heroTrack")}"><div style="width:30%;height:6px;border-radius:3px;background:{C("heroAccent")}"></div></div>',
                   style=f"background:{C('hero')};border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:8px")
        bars = row(*[f'<div style="flex:1 1 0;height:{h}px;border-radius:4px;background:{C("accent") if i % 2 == 0 else C("expense")}"></div>' for i, h in enumerate([38, 30, 44, 26, 40, 34])], gap=4, align='flex-end', style='height:48px')
        out = col(hero, Chips(Chip('Продукты', True), Chip('Транспорт')), bars, Pill('Сохранить', 'primary', 'md', style='width:100%'), gap=12)
    finally:
        kit.Ctx.c = old
    return box(out, style=f"background:{LIGHT['ground']};border-radius:22px;padding:14px;border:1px solid {C('line')}")


def Swatch(t, on=False):
    ring = f"border:2px solid {C('ink')}" if on else f"border:1px solid {C('line')}"
    return (f'<button type="button" aria-pressed="{"true" if on else "false"}" aria-label="Тема {t["name"]}" style="flex:1 1 0;min-width:0;background:{C("card")};{ring};border-radius:18px;padding:10px 6px;'
            f'display:flex;flex-direction:column;align-items:center;gap:8px;font-family:Manrope,sans-serif;box-sizing:border-box">'
            + ThemeDots(t, 16) + T(t['name'], 'caption', 'ink' if on else 'muted') + '</button>')


def theme_colors():
    sel = THEMES[1]
    return Screen('ThemeColors', 'Тема: готовые палитры', 'set', [
        Header('Цвета', 'Settings'),
        T('Только на этом телефоне: у Елены и Олега могут быть разные. Таблицу и данные не меняет.', 'label', 'muted'),
        Seg(['Готовые', 'Свои'], 'Готовые'),
        Preview(sel),
        row(*[Swatch(t, t is sel) for t in THEMES[:3]], gap=8), row(*[Swatch(t) for t in THEMES[3:]], box(style='flex:1 1 0'), gap=8),

    ], footer=Pill('Применить «Сливовую»', 'primary', style='width:100%', href='Settings'))


def hsv_hex(h, s, v):
    def f(n):
        k = (n + h / 60) % 6
        return v - v * s * max(0, min(k, 4 - k, 1))
    return '#' + ''.join(f'{round(f(n) * 255):02X}' for n in (5, 3, 1))


def max_value(h, s, bg='#FFFFFF', mn=4.5):
    if contrast(hsv_hex(h, s, 1), bg) >= mn:
        return 1
    lo, hi = 0.0, 1.0
    for _ in range(18):
        mid = (lo + hi) / 2
        if contrast(hsv_hex(h, s, mid), bg) >= mn:
            lo = mid
        else:
            hi = mid
    return lo


def PreviewCompact(t):
    old = kit.Ctx.c
    kit.Ctx.c = apply(t)
    try:
        hero = box(T('Можно сегодня', 'caption', style=f"color:{C('heroMuted')}"),
                   f'<span style="display:block;font-family:{UB};font-weight:600;font-size:22px;color:{C("heroInk")}">1 588<span style="color:{C("heroAccent")}"> ₽</span></span>',
                   style=f"flex:1 1 0;background:{C('hero')};border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:4px;justify-content:center")
        bars = row(*[f'<div style="flex:1 1 0;height:{h * 0.65:.0f}px;border-radius:3px;background:{C("accent") if i % 2 == 0 else C("expense")}"></div>' for i, h in enumerate([38, 30, 44, 26, 40, 34])], gap=3, align='flex-end', style='height:30px')
        side = col(f'<span style="display:flex;height:32px;border-radius:16px;background:{C("accent")};align-items:center;justify-content:center;{VARIANTS["label"]};color:{C("onAccent")}">Сохранить</span>', bars, gap=8, style='width:128px;justify-content:center')
        out = row(hero, side, gap=10, align='stretch')
    finally:
        kit.Ctx.c = old
    return box(out, style=f"background:{LIGHT['ground']};border-radius:22px;padding:10px;border:1px solid {C('line')}")


def theme_custom():
    rules = dict(accent=('#FFFFFF', 4.5), hero=('#B8C0CC', 4.5), expense=('#FFFFFF', 3))
    pts = dict(accent=(290, 0.62, 1.0), hero=(50, 0.45, 0.8), expense=(170, 0.55, 0.9))  # триада от акцента
    col_ = {k: hsv_hex(h, sat, max_value(h, sat, *rules[k]) * b) for k, (h, sat, b) in pts.items()}
    SZ, R = 320, 156
    c = SZ / 2
    def at(h, sat):
        a = math.radians(h)
        return c + R * sat * math.cos(a), c + R * sat * math.sin(a)
    lines = ''.join(f'<line x1="{c}" y1="{c}" x2="{at(h, sat)[0]:.1f}" y2="{at(h, sat)[1]:.1f}" stroke="#FFFFFF" stroke-width="{2 if k == "accent" else 1}"/>' for k, (h, sat, b) in pts.items())
    handles = ''
    for k, (h, sat, b) in pts.items():
        x, y = at(h, sat)
        big = 36 if k == 'accent' else 30
        handles += f'<span style="position:absolute;left:{x - big / 2:.0f}px;top:{y - big / 2:.0f}px;width:{big}px;height:{big}px;border-radius:{big // 2}px;background:{col_[k]};border:3px solid #FFFFFF;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>'
    wheel = (f'<div role="slider" aria-label="Цветовой круг" style="position:relative;width:{SZ}px;height:{SZ}px;align-self:center;border-radius:50%;'
             f'background:radial-gradient(circle closest-side,#FFF,rgba(255,255,255,0)),conic-gradient(from 90deg,' + ','.join(hsv_hex(h % 360, 1, 1) for h in range(0, 361, 30)) + ')">'
             f'<svg aria-hidden="true" width="{SZ}" height="{SZ}" style="position:absolute;inset:0">{lines}</svg>{handles}</div>')
    def slotrow(k, t, hnt, last=False):
        on = k == 'accent'
        sw = f'<span style="display:block;width:36px;height:36px;border-radius:18px;background:{col_[k]};border:{3 if on else 1}px solid {C("ink") if on else C("control")};box-sizing:border-box;flex-shrink:0"></span>'
        return Row(t, hnt, left=sw, last=last)
    h, sat, b = pts['accent']
    mx = max_value(h, sat)
    slider = (f'<div role="slider" aria-label="Акцент: яркость" style="position:relative;height:44px;display:flex;align-items:center">'
              f'<div style="width:100%;height:20px;border-radius:10px;background:linear-gradient(to right,{hsv_hex(h, sat, mx * 0.2)},{hsv_hex(h, sat, mx)})"></div>'
              f'<span style="position:absolute;left:{b * 350 - 14:.0f}px;width:28px;height:28px;border-radius:14px;border:3px solid #FFFFFF;background:{col_["accent"]};box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span></div>')
    def seg_target():
        out = []
        for k, t in [('accent', 'Акцент'), ('hero', 'Карточка'), ('expense', 'Расходы')]:
            on = k == 'accent'
            dot = f'<span style="display:block;width:14px;height:14px;border-radius:7px;background:{col_[k]};border:1px solid {C("control")};box-sizing:border-box"></span>'
            out.append(f'<button type="button" role="radio" aria-checked="{"true" if on else "false"}" style="flex:1 1 0;height:44px;border-radius:22px;border:0;background:{C("card") if on else "transparent"};display:flex;align-items:center;justify-content:center;gap:6px;{VARIANTS["label"]};font-family:Manrope,sans-serif;color:{C("ink") if on else C("muted")};padding:0">{dot}{t}</button>')
        return row(*out, gap=4, style=f"background:{C('fill')};border-radius:24px;padding:4px")
    return Screen('ThemeCustom', 'Тема: цветовой круг с правилами гармонии', 'set', [
        Header('Цвета', 'Settings'),
        Seg(['Готовые', 'Свои'], 'Свои'),
        PreviewCompact(dict(accent=col_['accent'], soft='#F0E4F4', softInk='#4E2160', hero=col_['hero'], heroAccent='#E3B6F0', expense=col_['expense'])),
        ChipScroll(*[Chip(n, n == 'Триада') for n in ['Свободно', 'Аналоговая', 'Комплементарная', 'Триада', 'Раздельная', 'Монохром']]),
        seg_target(),
        wheel,
        col(between(T('Яркость · Акцент', 'label'), T('светлее не пустит граница читаемости', 'caption', 'muted')), slider, gap=4),
    ], footer=Pill('Сохранить цвета', 'primary', style='width:100%', href='Settings'))


THEME_SCREENS = [theme_colors, theme_custom]
