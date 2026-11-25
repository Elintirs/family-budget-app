"""Сборка холста: меряет высоту экранов в Chromium и пишет project/*.dc.html и canvas.json."""
import json, os, re, subprocess, sys, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import Ctx, DARK, LIGHT
import screens as sc

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'canvas')
OUT = os.path.join(ROOT, 'project')
os.makedirs(OUT, exist_ok=True)
REPO = os.path.expanduser('~/Developer/GitHub/family-budget')
CHROME = os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell')
FONT_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&amp;family=Unbounded:wght@600&amp;display=swap" rel="stylesheet">'

items = []
Ctx.dark_names = {f.__name__ for f in []}
DARK_BOARD = {'main': 'Main', 'inbox': 'Inbox', 'add': 'Add', 'analytics': 'Analytics', 'operation_synced': 'OperationSynced', 'settings': 'Settings', 'account': 'Account', 'widgets': 'Widgets', 'notification': 'Notification'}
Ctx.dark_names = set(DARK_BOARD.values())
for f in sc.LIGHT_SCREENS:
    Ctx.c, Ctx.dark = LIGHT, False
    s = f()
    items.append((s.name, s.title, s.page, s))
for f in sc.DARK_SCREENS:
    Ctx.c, Ctx.dark = DARK, True
    s = f()
    s.name, s.title, s.page = s.name + 'Dark', s.title, 'dark'
    items.append((s.name, s.title, s.page, s))


def face(fam, w, path):
    return f"@font-face{{font-family:{fam};font-weight:{w};src:url('file://{path}')}}"


faces = ''.join(face('Manrope', w, f"{REPO}/node_modules/@expo-google-fonts/manrope/{w}{n}/Manrope_{w}{n}.ttf") for w, n in [(500, 'Medium'), (600, 'SemiBold'), (700, 'Bold'), (800, 'ExtraBold')])
faces += face('Unbounded', 600, f"{REPO}/node_modules/@expo-google-fonts/unbounded/600SemiBold/Unbounded_600SemiBold.ttf")


def themed(i):
    Ctx.c, Ctx.dark = (DARK, True) if items[i][2] == 'dark' else (LIGHT, False)


fig = []
for i, (name, title, page, s) in enumerate(items):
    themed(i)
    fig.append(f'<figure data-n="{name}" style="margin:0"><figcaption style="color:#ccc;font:12px sans-serif;margin-bottom:4px">{name}</figcaption>{s.root(None)}</figure>')
JS = """<script>document.fonts.ready.then(()=>{const r={},w={};document.querySelectorAll('figure').forEach(f=>{const el=f.querySelector(':scope>div');r[f.dataset.n]=Math.ceil(el.scrollHeight);
const b=el.getBoundingClientRect();let m=0;el.querySelectorAll('*').forEach(x=>{const q=x.getBoundingClientRect();if(q.width&&q.right>b.right+0.5&&!x.closest('[data-clip]'))m=Math.max(m,q.right-b.right)});if(m)w[f.dataset.n]=Math.round(m)});
const p=document.createElement('pre');p.id='H';p.textContent=JSON.stringify({r,w});document.body.appendChild(p)})</script>"""
allhtml = os.path.join(HERE, 'all.html')
open(allhtml, 'w').write(f'<!doctype html><html lang="ru"><meta charset="utf-8"><style>{faces} body{{margin:0;background:#2a2d33}} main{{display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-start}}</style><main>{"".join(fig)}</main>{JS}</html>')
dom = subprocess.run([CHROME, '--headless', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=8000', '--window-size=3000,3000', '--dump-dom', 'file://' + allhtml], capture_output=True, text=True, timeout=180).stdout
m = re.search(r'<pre id="H">(.*?)</pre>', dom, re.S)
data = json.loads(m.group(1).replace('&quot;', '"'))
heights, wide = data['r'], data['w']
print('вылезают за ширину:', wide)

boards, order, step = {}, [], 470
xs = {}
for i, (name, title, page, s) in enumerate(items):
    themed(i)
    h = s.h and max(s.h, heights[name]) or max(844, heights[name])
    x = xs.get(page, 0)
    xs[page] = x + step
    boards[f'{name}.dc.html'] = dict(x=x, y=0, w=390, h=h, title=title, page=page, is_interactive=True)
    order.append(f'{name}.dc.html')
    doc = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONT_LINK}
<style>
body{{margin:0}}
a{{color:inherit;text-decoration:none}}a:hover{{color:inherit}}
</style>
</helmet>
{s.root(h)}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":390,"height":{h}}}}}'>
class Component extends DCLogic {{
  {s.script}
}}
</script>
</body>
</html>
"""
    open(os.path.join(OUT, f'{name}.dc.html'), 'w').write(doc)

notes = {f't_{p}': dict(x=0, y=-300, text=n, kind='title1', maxW=max(xs.get(p, 390) - 80, 390), page=p) for p, n in sc.PAGES}
notes['ver'] = dict(x=0, y=-140, w=520, text='Собрано из кода версии 0.3.14 (коммит 661ad8d). Суммы условные, тексты и состояния настоящие. Экран с несколькими плашками показывает их вместе, в приложении они появляются по условиям.', size='s', page='main', fill='gray')
main_first = order.index('Main.dc.html')
prev = os.path.join(OUT, 'canvas.json')
created = json.load(open(prev))['createdOnFiles'] if os.path.exists(prev) else dict(v=1, at=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
canvas = dict(v=3, createdOnFiles=created, title='Семейный бюджет: макет 0.3.14',
              launch=dict(view='canvas', page='main'), pages=[dict(id=p, name=n) for p, n in sc.PAGES], boards=boards, order=order, notes=notes, designSystems=[])
json.dump(canvas, open(os.path.join(OUT, 'canvas.json'), 'w'), ensure_ascii=False, indent=2)
print(len(items), 'экранов; записано в', OUT)
print({n: heights[n] for n in list(heights)[:60]})
