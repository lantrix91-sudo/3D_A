"""
Извлечение планировки 1-го этажа из векторного PDF рабочего проекта (21/03-26-АР, лист 7
«План 1-ого этажа на отм. +0,000 после перепланировки») в файлы для 3D-двойника:

  src/domain/plant-layout.json   — оси, стены, колонны, помещения, габариты (метры)
  src/assets/plan-floor1.png     — подложка пола (растр листа в масштабе)

Запуск:  pip install pymupdf pillow && python tools/pdf_to_layout.py путь/к/проекту.pdf

Система координат: начало — пересечение осей «1» и «А», X — вдоль цифровых осей (на восток),
Z — от оси «А» к оси «Н» с минусом (север = −Z), 1 единица = 1 м.
Масштаб определяется по шагу осей 6000 мм на листе. Если в проекте изменится лист —
поправьте PAGE, параметры осей или фильтры стилей ниже и перезапустите.
"""
import json
import math
import sys
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageOps

PDF = sys.argv[1] if len(sys.argv) > 1 else 'plan.pdf'
PAGE = 7  # индекс страницы (с нуля): лист 7 «после перепланировки»
ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / 'src/domain/plant-layout.json'
OUT_PNG = ROOT / 'src/assets/plan-floor1.png'

doc = fitz.open(PDF)
page = doc[PAGE]
words = page.get_text('words')

# ---------------------------------------------------------------- оси
def centers(cond, axis):
    out = {}
    for w in words:
        if cond(w):
            out[w[4]] = (w[0] + w[2]) / 2 if axis == 'x' else (w[1] + w[3]) / 2
    return out

x_labels = centers(lambda w: 740 < w[1] < 752 and w[4].isdigit(), 'x')
z_labels = centers(lambda w: 290 < w[0] < 300 and len(w[4]) == 1, 'z')
z1_labels = centers(lambda w: 1020 < w[0] < 1031 and w[4].endswith('1') and len(w[4]) == 2, 'z')

# шаг осей 1→11 = 10 × 6000 мм
PT_PER_M = (x_labels['11'] - x_labels['1']) / 60.0
X0 = x_labels['1']
Z0 = z_labels['А'] - 0.3  # линия оси чуть выше центра подписи

def to_m(x, y):
    return round((x - X0) / PT_PER_M, 3), round((y - Z0) / PT_PER_M, 3)

# номинальные привязки осей по размерным цепочкам листа (мм): 10×6000, 6000, 1000, 3×6000, 3000
NOMINAL_X = {'1': 0, '2': 6, '3': 12, '4': 18, '5': 24, '6': 30, '7': 36, '8': 42, '9': 48, '10': 54,
             '11': 60, '12': 66, '13': 67, '14': 73, '15': 79, '16': 85, '17': 88}
def snap_x(k, v):
    m = to_m(v, 0)[0]
    return NOMINAL_X[k] if k in NOMINAL_X and abs(NOMINAL_X[k] - m) < 0.4 else m
axes_x = sorted(({'name': k, 'x': snap_x(k, v)} for k, v in x_labels.items()), key=lambda a: a['x'])
order = 'АБВГДЕЖИКЛМН'
axes_z = [{'name': k, 'z': to_m(0, z_labels[k] - 0.3)[1]} for k in order if k in z_labels]
axes_z1 = sorted(({'name': k, 'z': to_m(0, v - 0.3)[1]} for k, v in z1_labels.items()), key=lambda a: -a['z'])

# ---------------------------------------------------------------- стены
def rgb(c):
    return tuple(round(x, 2) for x in c) if c else None

walls = []
seen = set()

def add_wall(x1, y1, x2, y2, t, kind):
    a, b = to_m(x1, y1), to_m(x2, y2)
    length = math.dist(a, b)
    if length < 0.25:
        return
    key = (round(a[0], 1), round(a[1], 1), round(b[0], 1), round(b[1], 1))
    rkey = (key[2], key[3], key[0], key[1])
    if key in seen or rkey in seen:
        return
    seen.add(key)
    walls.append([a[0], a[1], b[0], b[1], t, kind])

ABK_X = 830  # правее — АБК (бытовой корпус), там перегородки тоньше
for g in page.get_drawings():
    fill, color, width = rgb(g.get('fill')), rgb(g.get('color')), round(g.get('width') or 0, 2)
    r = g['rect']
    if r.y0 < 100 or r.x0 < 300 or r.x1 > 1045 or r.y1 > 700:
        continue  # штамп, экспликация, подписи
    if fill == (0.0, 0.0, 1.0):  # новые перегородки (залитые)
        w, h = r.width / PT_PER_M, r.height / PT_PER_M
        if max(w, h) < 0.3:
            continue
        if w >= h:
            add_wall(r.x0, (r.y0 + r.y1) / 2, r.x1, (r.y0 + r.y1) / 2, max(0.1, round(h, 2)), 'new')
        else:
            add_wall((r.x0 + r.x1) / 2, r.y0, (r.x0 + r.x1) / 2, r.y1, max(0.1, round(w, 2)), 'new')
        continue
    if color != (0.0, 0.0, 0.0):
        continue
    if width >= 1.0:
        kind, t, min_len = 'outer', 0.18, 0.25
    elif width >= 0.8:
        kind, t, min_len = 'inner', 0.14, 0.25
    elif width >= 0.58:
        kind, t, min_len = 'partition', 0.1, 1.2
    else:
        continue
    for it in g['items']:
        if it[0] != 'l':
            continue
        p1, p2 = it[1], it[2]
        if kind == 'partition':
            if min(p1.x, p2.x) < ABK_X:
                continue  # тонкие линии в цехах — это оборудование, лестницы, мебель
            if abs(p1.x - p2.x) > 0.05 and abs(p1.y - p2.y) > 0.05:
                continue  # только ортогональные
        if math.dist((p1.x, p1.y), (p2.x, p2.y)) / PT_PER_M < min_len:
            continue
        add_wall(p1.x, p1.y, p2.x, p2.y, t, kind)

# ---------------------------------------------------------------- колонны (каркас 6×6 м)
ax = {a['name']: a['x'] for a in axes_x}
az = {a['name']: a['z'] for a in axes_z}
az1 = {a['name']: a['z'] for a in axes_z1}
columns = []
for xn in [str(i) for i in range(1, 13)]:
    for zn in order:
        if xn not in ax or zn not in az:
            continue
        if zn == 'А' and int(xn) < 4:
            continue  # выступ по оси А начинается между осями 3 и 4
        columns.append([ax[xn], az[zn]])
for xn in ['13', '14', '15', '16', '17']:
    for zn in ['Г1', 'Д/1', 'Е1', 'Ж1', 'И1', 'К1', 'Л1', 'М1', 'Н1', 'П1', 'Р1', 'С1']:
        if zn in az1 and xn in ax:
            columns.append([ax[xn], az1[zn]])

# ---------------------------------------------------------------- помещения
EXPL_PROD = {}
EXPL_ABK = {}
def expl_rows(x0, x1, xcat):
    cats = sorted([w for w in words if abs(w[0] - xcat) < 2 and w[4] in 'ДАГВБ' and 586 < w[1] < 840], key=lambda w: w[1])
    names = [w for w in words if x0 <= w[0] < x1 and 586 < w[1] < 840]
    rows = []
    for c in cats:
        cy = (c[1] + c[3]) / 2
        nm = [w for w in names if abs((w[1] + w[3]) / 2 - cy) < 2.2]
        rows.append((' '.join(x[4] for x in sorted(nm, key=lambda w: (round(w[1]), w[0]))), c[4]))
    return rows
for i, (n, cat) in enumerate(expl_rows(110, 160, 162), 1):
    EXPL_PROD[f'{i:03d}'] = (n, cat)
for i, (n, cat) in enumerate(expl_rows(180, 229, 231), 1):
    EXPL_ABK[str(100 + i)] = (n, cat)

rooms = []
for w in words:
    t = w[4]
    if w[0] < 330 or w[1] > 700:
        continue
    base = t.split('/')[0]
    if len(base) == 3 and base.isdigit():
        name, cat = (EXPL_PROD if base < '100' else EXPL_ABK).get(base, ('', ''))
        x, z = to_m((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
        if not name:
            continue  # трёхзначные числа без строки экспликации — размеры, не помещения
        rooms.append({'id': t, 'name': name, 'category': cat, 'x': x, 'z': z})
area_024 = next((w[4] for w in words if w[4] == '584.5'), None)

# ---------------------------------------------------------------- подложка
clip = fitz.Rect(290, 100, 1045, 757)
zoom = 5.3
pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(zoom, zoom), alpha=False)
img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
img = ImageOps.grayscale(img)
img = img.point(lambda v: 255 if v > 245 else v)  # чистый фон
OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
img.convert('P', palette=Image.ADAPTIVE, colors=16).save(OUT_PNG, optimize=True)
ux0, uz0 = to_m(clip.x0, clip.y0)
ux1, uz1 = to_m(clip.x1, clip.y1)

xs = [v for w in walls for v in (w[0], w[2])]
zs = [v for w in walls for v in (w[1], w[3])]
layout = {
    'source': {
        'project': '21/03-26-АР «Реконструкция производственного комплекса…», ТОО «IPM Engineering», 2025',
        'sheet': 'Лист 7. План 1-ого этажа на отм. +0,000 после перепланировки',
        'note': 'Извлечено автоматически из векторного PDF. Геометрия — по осям, точность ~0,1 м.',
    },
    'ptPerMeter': round(PT_PER_M, 4),
    'floorHeight': 3.95,
    'extents': {'minX': min(xs), 'maxX': max(xs), 'minZ': min(zs), 'maxZ': max(zs)},
    'axesX': axes_x,
    'axesZ': axes_z,
    'axesZ1': axes_z1,
    'walls': walls,
    'columns': columns,
    'rooms': rooms,
    'underlay': {'minX': ux0, 'maxX': ux1, 'minZ': uz0, 'maxZ': uz1, 'width': img.width, 'height': img.height},
}
OUT_JSON.write_text(json.dumps(layout, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'масштаб {PT_PER_M:.3f} pt/м; стен {len(walls)}; колонн {len(columns)}; помещений {len(rooms)}; '
      f'подложка {img.width}×{img.height}, {OUT_PNG.stat().st_size // 1024} КБ; 024={area_024}')
print('габариты', layout['extents'])
