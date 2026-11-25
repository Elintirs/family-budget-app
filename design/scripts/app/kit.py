"""Компоненты макета: те же токены и размеры, что apps/mobile/src/ui/theme.tsx и kit.tsx."""
from html import escape

LIGHT = dict(
    ground='#F2F3EE', card='#FFFFFF', ink='#14181F', muted='#5B6370', line='#EEF0EA', border='#DDE0D8',
    fill='#E6E8E1', hero='#14181F', heroInk='#FFFFFF', heroMuted='#B8C0CC', heroTrack='#2A313B',
    heroChip='#232A33', heroAccent='#7FE0B5', accent='#0B6E4F', accentInk='#0B6E4F', onAccent='#FFFFFF',
    accentSoft='#DDEFE6', accentSoftInk='#0A4A36', warn='#B4531A', warnInk='#B4531A', warnSoft='#FBE7D9',
    warnSoftInk='#6B2E0B', strong='#14181F', onStrong='#FFFFFF', toggleOff='#C9CDC4', monoYellow='#F5E9B8',
    monoGreen='#D8EEDF', monoGray='#E4E7EF', monoPurple='#ECE2F5',
)
DARK = dict(
    ground='#0F1216', card='#1A1F26', ink='#ECEFF3', muted='#9AA4B1', line='#252C35', border='#333B46',
    fill='#252C35', hero='#1E2A27', heroInk='#FFFFFF', heroMuted='#B8C0CC', heroTrack='#2A313B',
    heroChip='#232A33', heroAccent='#7FE0B5', accent='#0B6E4F', accentInk='#5FD3A2', onAccent='#FFFFFF',
    accentSoft='#173A2E', accentSoftInk='#9FE6C6', warn='#B4531A', warnInk='#F08A4B', warnSoft='#3A2418',
    warnSoftInk='#F6C3A0', strong='#ECEFF3', onStrong='#14181F', toggleOff='#3A424D', monoYellow='#3A3420',
    monoGreen='#1F3A2A', monoGray='#2A303B', monoPurple='#33283F',
)
PEACH = '#F2B28A'


class Ctx:
    c = LIGHT
    dark = False
    dark_names: set = set()


def C(k):
    return Ctx.c.get(k, k)


UB = "Unbounded, sans-serif"
VARIANTS = {
    'display': f"font-family:{UB};font-weight:600;font-size:52px;letter-spacing:-1.5px;line-height:58px",
    'amount': f"font-family:{UB};font-weight:600;font-size:40px;letter-spacing:-1px;line-height:48px",
    'title': f"font-family:{UB};font-weight:600;font-size:24px;letter-spacing:-0.5px;line-height:30px",
    'h2': "font-weight:800;font-size:17px",
    'body': "font-weight:700;font-size:15px",
    'bodyRegular': "font-weight:600;font-size:15px",
    'num': "font-weight:800;font-size:16px",
    'label': "font-weight:700;font-size:13px",
    'caption': "font-weight:600;font-size:12px",
}


def R(v, sign=False):
    """formatRub: неразрывный пробел, настоящий минус, копейки только если есть."""
    neg = v < 0
    a = abs(v)
    whole = int(a + 1e-9)
    cents = int(round((a - whole) * 100))
    s = f"{whole:,}".replace(',', ' ')
    body = f"{s},{cents:02d}" if cents else s
    return ('−' if neg else ('+' if sign and v > 0 else '')) + body + ' ₽'


def link(name):
    """Ссылка на артборд; в тёмной теме только на тёмные копии."""
    if not name:
        return None
    if Ctx.dark:
        return f"{name}Dark.dc.html" if name in Ctx.dark_names else None
    return f"{name}.dc.html"


def T(text, v='body', c='ink', style='', tag='span', raw=False):
    body = text if raw else escape(str(text), quote=False)
    color = C(c)
    extra = f";margin:0;{style}" if tag != 'span' else (f";{style}" if style else '')
    return f'<{tag} style="display:block;{VARIANTS[v]};color:{color}{extra}">{body}</{tag}>'


def box(*kids, style=''):
    return f'<div style="{style}">{"".join(kids)}</div>'


def col(*kids, gap=0, style=''):
    return box(*kids, style=f"display:flex;flex-direction:column;gap:{gap}px;min-width:0;{style}")


def row(*kids, gap=0, align='center', justify='', style=''):
    j = f"justify-content:{justify};" if justify else ''
    return box(*kids, style=f"display:flex;flex-direction:row;align-items:{align};{j}gap:{gap}px;{style}")


def between(left, right, align='baseline', style=''):
    return row(left, right, gap=8, align=align, justify='space-between', style=style)


def grow(*kids, gap=2, style=''):
    return col(*kids, gap=gap, style=f"flex:1 1 0;{style}")


def Card(*kids, tone='card', gap=12, style=''):
    return box(*kids, style=f"background:{C(tone)};border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:{gap}px;{style}")


def ListCard(*kids, tone='card'):
    return box(*kids, style=f"background:{C(tone)};border-radius:22px;padding:4px 16px;display:flex;flex-direction:column")


def Soft(*kids, tone='warnSoft', gap=10, style=''):
    return box(*kids, style=f"background:{C(tone)};border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:{gap}px;{style}")


def Pill(title, kind='primary', size='lg', href=None, style='', icon='', spin=False):
    h = 56 if size == 'lg' else 44
    bg = dict(primary=C('accent'), strong=C('strong'), hero=C('heroAccent')).get(kind, 'transparent')
    fg = dict(primary=C('onAccent'), strong=C('onStrong'), hero=C('hero'), secondary=C('ink'), danger=C('warnInk'), ghost=C('accentInk'))[kind]
    bd = dict(primary=C('accent'), strong=C('strong'), hero=C('heroAccent'), secondary=C('border'), danger=C('warnInk'), ghost='transparent')[kind]
    v = VARIANTS['h2' if size == 'lg' else 'label']
    pad = 24 if size == 'lg' else 18
    css = (f"height:{h}px;border-radius:{h // 2}px;background:{bg};border:1.5px solid {bd};color:{fg};{v};"
           f"font-family:Manrope,sans-serif;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:10px;"
           f"padding:0 {pad}px;box-sizing:border-box;text-decoration:none;white-space:nowrap;{style}")
    inner = icon + escape(title, quote=False)
    url = link(href)
    if url:
        return f'<a href="{url}" style="{css}">{inner}</a>'
    return f'<button type="button" style="{css}">{inner}</button>'


def Chip(label, selected=False, tone='default'):
    bg = C('accent') if selected else (C('accentSoft') if tone == 'suggested' else 'transparent')
    bd = C('accent') if selected else (C('accentSoft') if tone == 'suggested' else C('border'))
    fg = C('onAccent') if selected else (C('accentSoftInk') if tone == 'suggested' else (C('muted') if tone == 'more' else C('ink')))
    dash = 'dashed' if tone == 'more' else 'solid'
    check = icon('check', fg, 16) if selected else ''
    return (f'<button type="button" style="height:40px;padding:0 16px;border-radius:20px;background:{bg};border:1.5px {dash} {bd};'
            f'color:{fg};{VARIANTS["label"]};font-family:Manrope,sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;'
            f'white-space:nowrap;box-sizing:border-box;flex-shrink:0">{check}{escape(label, quote=False)}</button>')


def Chips(*kids, style=''):
    return row(*kids, gap=8, style=f"flex-wrap:wrap;{style}")


def ChipScroll(*kids):
    return row(*kids, gap=8, style="overflow:hidden;flex-wrap:nowrap;margin-right:-20px")


def Seg(options, value):
    out = []
    for o in options:
        on = o == value
        out.append(f'<button type="button" style="flex:1 1 0;height:40px;border-radius:20px;border:0;background:{C("card") if on else "transparent"};'
                   f'color:{C("ink") if on else C("muted")};{VARIANTS["label"]};font-family:Manrope,sans-serif;white-space:nowrap;padding:0">{escape(o, quote=False)}</button>')
    return row(*out, gap=4, style=f"background:{C('fill')};border-radius:24px;padding:4px")


def Switch(on=True, label=''):
    track = C('accent') if on else C('toggleOff')
    pos = 'flex-end' if on else 'flex-start'
    return (f'<button type="button" aria-label="{escape(label)}" aria-pressed="{"true" if on else "false"}" style="width:44px;height:26px;border-radius:13px;background:{track};border:0;padding:3px;'
            f'display:flex;justify-content:{pos};align-items:center;flex-shrink:0;box-sizing:border-box"><span style="display:block;width:20px;height:20px;border-radius:10px;background:#FFFFFF"></span></button>')


def Toggle(title, caption, on=True):
    return row(grow(T(title), T(caption, 'caption', 'muted')), Switch(on, title), gap=12)


def Row(title, meta=None, metaTone='muted', left='', right='', last=False, href=None):
    border = '' if last else f"border-bottom:1px solid {C('line')};"
    m = T(meta, 'caption', metaTone) if meta else ''
    css = f"display:flex;flex-direction:row;align-items:center;gap:12px;padding:12px 0;min-height:44px;box-sizing:content-box;{border}color:inherit;text-decoration:none"
    inner = left + grow(T(title), m) + right
    url = link(href)
    if url:
        return f'<a href="{url}" style="{css}">{inner}</a>'
    return f'<div style="{css}">{inner}</div>'


def Mono(letter, tone='monoGray', size=40):
    return (f'<span style="width:{size}px;height:{size}px;border-radius:12px;background:{C(tone)};display:flex;align-items:center;'
            f'justify-content:center;flex-shrink:0;{VARIANTS["h2"]};color:{C("ink")}">{escape(letter)}</span>')


def Num(text, c='ink'):
    return T(text, 'num', c, style='white-space:nowrap')


def Label(text, c='ink'):
    return T(text, 'label', c, style='white-space:nowrap')


def Input(placeholder='', value='', h=48, r=14, weight=600, size=15, bw=1.5, border='border', family='Manrope, sans-serif', label=None, bg='transparent', style=''):
    v = f' value="{escape(value)}"' if value else ''
    return (f'<input aria-label="{escape(label or placeholder or value)}" placeholder="{escape(placeholder)}"{v} style="height:{h}px;border-radius:{r}px;border:{bw}px solid {C(border)};'
            f'padding:0 14px;color:{C("ink")};background:{C(bg) if bg != "transparent" else bg};font-family:{family};font-weight:{weight};font-size:{size}px;box-sizing:border-box;width:100%;min-width:0;{style}">')


def Meter(value, maxv, tone='ink'):
    color = dict(accent=C('accent'), warn=C('warn'), ink=C('strong'))[tone]
    pct = min(100, value / maxv * 100) if maxv else 0
    return (f'<div style="height:6px;border-radius:3px;background:{C("line")};overflow:hidden"><div style="width:{pct:.1f}%;height:6px;border-radius:3px;background:{color}"></div></div>')


def Bars(items, height=140, palette=None):
    pal = palette or [C('accent'), PEACH]
    mx = max([1] + [v for it in items for v in it[1]])
    out = []
    for lab, vals, active in items:
        bg = C('fill') if active else 'transparent'
        if not any(vals):
            inner = f'<div style="width:60%;height:2px;background:{C("border")}"></div>'
        else:
            w = 12 if len(vals) > 1 else 18
            inner = ''.join(f'<div style="width:{w}px;height:{max(2, v / mx * (height - 12)):.0f}px;border-radius:5px;background:{pal[i]}"></div>' for i, v in enumerate(vals))
        out.append(col(
            f'<div style="height:{height}px;width:100%;display:flex;flex-direction:row;align-items:flex-end;justify-content:center;gap:3px;border-radius:10px;background:{bg};padding-bottom:4px;box-sizing:border-box">{inner}</div>',
            T(lab, 'caption', 'ink' if active else 'muted'), gap=6, style='flex:1 1 0;align-items:center'))
    return row(*out, align='flex-end')


def Legend(color, label):
    return row(f'<span style="display:block;width:10px;height:10px;border-radius:3px;background:{color}"></span>', T(label, 'caption', 'muted'), gap=6)


PATHS = {
    'home': '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    'inbox': '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
    'plus': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    'chart': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    'sliders': '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    'sync': '<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4"/><path d="M6 22v-4h4"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'check': '<path d="m5 12 5 5 9-10"/>',
    'right': '<path d="m9 5 7 7-7 7"/>',
    'left': '<path d="m15 5-7 7 7 7"/>',
    'down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'bell': '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    'list': '<path d="M4 6h16M4 12h10M4 18h6"/>',
    'gauge': '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/>',
    'repeat': '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    'phone': '<path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M11 18h2"/>',
}


def icon(name, color, size=24, width=2):
    return (f'<svg aria-hidden="true" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{width}" '
            f'stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block">{PATHS[name]}</svg>')


def Chevron():
    return icon('right', C('muted'), 18, 2.4)


def Back(href='Main'):
    css = f"width:44px;height:44px;border-radius:22px;border:1.5px solid {C('border')};display:flex;align-items:center;justify-content:center;box-sizing:border-box;flex-shrink:0;background:transparent;padding:0"
    url = link(href)
    ic = icon('left', C('ink'), 20, 2.4)
    if url:
        return f'<a href="{url}" aria-label="Назад" style="{css}">{ic}</a>'
    return f'<button type="button" aria-label="Назад" style="{css}">{ic}</button>'


def Header(title, back='Main', right=''):
    return row(Back(back), T(title, 'title', tag='h1', style='flex:1 1 0;min-width:0'), right, gap=12)


def Sect(title, right=''):
    return between(T(title, 'h2', tag='h2'), T(right, 'caption', 'muted') if right else '')


TABS = [('Главная', 'home', 'Main'), ('Входящие', 'inbox', 'Inbox'), ('Добавить', 'plus', 'Add'), ('Аналитика', 'chart', 'Analytics'), ('Настройки', 'sliders', 'Settings')]


def TabBar(active, badge=0):
    out = []
    for title, ic, target in TABS:
        on = target == active
        color = C('accentInk') if on else C('muted')
        b = ''
        if target == 'Inbox' and badge:
            b = (f'<span style="position:absolute;top:-4px;left:38px;min-width:18px;height:18px;border-radius:9px;background:{C("warn")};color:#FFFFFF;'
                 f'font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box">{badge}</span>')
        inner = (f'<span style="position:relative;display:flex;flex-direction:column;align-items:center;gap:2px">{icon(ic, color)}{b}'
                 f'<span style="font-weight:700;font-size:11px;color:{color}">{title}</span></span>')
        css = 'flex:1 1 0;display:flex;justify-content:center;text-decoration:none;min-width:0'
        url = link(target)
        out.append(f'<a href="{url}" style="{css}">{inner}</a>' if url else f'<span style="{css}">{inner}</span>')
    return box(*out, style=f"background:{C('card')};border-top:1px solid {C('border')};height:68px;box-sizing:border-box;padding:8px 0 6px;display:flex;flex-direction:row;align-items:flex-start;flex-shrink:0")


def Sheet(*kids, gap=14, pad='10px 20px 20px', radius=28):
    handle = f'<div style="align-self:center;width:40px;height:5px;border-radius:3px;background:{C("border")};flex-shrink:0"></div>'
    return box(handle, *kids, style=f"background:{C('ground')};border-radius:{radius}px {radius}px 0 0;padding:{pad};display:flex;flex-direction:column;gap:{gap}px;position:relative")


class Screen:
    def __init__(self, name, title, page, kids=(), footer='', tab=None, badge=0, tone='ground', sheet=None, dialog=None, pad=True, h=None):
        self.name, self.title, self.page = name, title, page
        self.kids, self.footer, self.tab, self.badge, self.tone = kids, footer, tab, badge, tone
        self.sheet, self.dialog, self.pad, self.h = sheet, dialog, pad, h
        self.script = 'renderVals() { return {}; }'

    def inner(self):
        parts = []
        if self.sheet is not None or self.dialog is not None:
            dim = '<div style="position:absolute;inset:0;background:#14181F;opacity:0.5"></div>'
            if self.sheet is not None:
                parts.append(dim + box(self.sheet, style='flex-grow:1;display:flex;flex-direction:column;justify-content:flex-end;position:relative'))
            else:
                parts.append(dim + box(self.dialog, style='flex-grow:1;display:flex;align-items:center;justify-content:center;padding:32px;position:relative'))
            return ''.join(parts)
        parts.append(col(*self.kids, gap=16, style='padding:16px 20px 32px;flex-grow:1'))
        if self.footer:
            parts.append(box(self.footer, style=f"padding:12px 20px 16px;background:{C(self.tone)};flex-shrink:0"))
        if self.tab:
            parts.append(TabBar(self.tab, self.badge))
        return ''.join(parts)

    def root(self, height):
        h = f"height:{height}px" if height else "min-height:844px"
        return (f'<div style="width:390px;{h};position:relative;overflow:hidden;background:{C(self.tone)};font-family:Manrope,sans-serif;color:{C("ink")};'
                f'font-variant-numeric:tabular-nums;display:flex;flex-direction:column">{self.inner()}</div>')
