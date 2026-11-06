# Автопроверка столкновений: оборудование не проходит сквозь стены, колонны и другое оборудование;
# стена в редакторе не проходит сквозь оборудование. Запуск: npm run build && npm run preview, затем
# python tools/e2e_collision.py http://localhost:4173/
import sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info else ''), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.add_init_script("try{const k='bakery-twin.settings.v2';const s=JSON.parse(localStorage.getItem(k)||'{}');s.ui=s.ui||{};if(!s.ui.panels){s.ui.panels={card:true,events:true,ppr:true};localStorage.setItem(k,JSON.stringify(s));}}catch(e){}")  # панели рядом со сценой — открыты (в программе по умолчанию скрыты)
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.eq-item'); time.sleep(3)
    pg.locator('button', has_text='Пауза').click()  # меньше перерисовок — стабильнее перетаскивание

    def settle(limit=40):
        prev = None; still = 0
        for _ in range(limit):
            time.sleep(0.8)
            cur = pg.evaluate('window.__twinCamera()')
            still = still + 1 if prev and sum(abs(a - c) for a, c in zip(cur, prev)) < 0.02 else 0
            if still >= 2: return
            prev = cur

    def screen(x, z, y=0.0):
        cv = pg.locator('.scene canvas').bounding_box()
        q = pg.evaluate(f'window.__twinProject({x},{y},{z})')
        return cv['x'] + q['x'], cv['y'] + q['y']

    def pose(eid):
        t = pg.locator('.place-panel dd').first.inner_text()
        import re
        m = re.findall(r'-?\d+\.\d', t)
        return float(m[0]), float(m[1])

    def drag(eid, tx, tz, steps=30):
        x0, z0 = pose(eid)
        # точка на корпусе, не закрытая подписями
        start = None
        for y in (0.6, 0.3, 1.0, 0.1):
            for dx, dz in ((0, 0), (0.2, 0), (-0.2, 0), (0, 0.2), (0, -0.2)):
                sx, sy = screen(x0 + dx, z0 + dz, y)
                if pg.evaluate(f"document.elementFromPoint({sx},{sy})?.tagName") == 'CANVAS':
                    start = (sx, sy); break
            if start: break
        sx, sy = start or screen(x0, z0, 0.6)
        pg.mouse.move(sx, sy); time.sleep(0.2); pg.mouse.down()
        for i in range(1, steps + 1):
            k = i / steps
            px, py = screen(x0 + (tx - x0) * k, z0 + (tz - z0) * k, 0.0)
            pg.mouse.move(px, py); time.sleep(0.05)
        pg.mouse.up(); time.sleep(0.6)

    collisions = lambda: dict(pg.evaluate('window.__twinCollisions()'))

    def place(eid):
        # выбрать оборудование в списке и открыть расстановку (в этом режиме сцена на всю ширину)
        if pg.locator('.place-panel').count():
            pg.locator('.place-panel button', has_text='Готово').click(); time.sleep(0.3)
        pg.locator('.eq-item', has_text=eid).click(); time.sleep(0.3)
        pg.locator('.scene-tools button', has_text='Расстановка').click(); time.sleep(0.5)
        pg.locator('.scene-tools button', has_text='Цех-1').click(); settle()

    # 0. габаритный прямоугольник на полу совпадает с корпусом модели (допуск 2 см, центр — 1 см)
    for eid in ['RC-01', 'MX-02', 'TM-03', 'OV-04', 'OV-05', 'OV-06', 'VC-07', 'DP-08', 'DR-09', 'SF-10', 'PR-11', 'PR-12']:
        f = pg.evaluate(f"window.__twinFootprint('{eid}')")
        ok = f and all(abs(z - m) <= 0.02 + 1e-6 for z, m in zip(f['zone'], f['model'])) and all(abs(o) <= 0.01 for o in f['offset'])
        check(f'Габарит {eid} = размер оборудования', ok, str(f))

    place('MX-02')

    # 1. миксер тащим вправо — на пути дозатор DP-08 (x 11.6), за ним тестомес TM-03
    drag('MX-02', 20.0, -57.2)
    x, z = pose('MX-02')
    msg = pg.locator('.place-panel').inner_text()
    check('Миксер не проходит сквозь дозатор', x < 11.6 and collisions()['MX-02'] is None, f'x={x}')
    check('Подсказка «Упирается: Дозатор UNIFILLER DP-08»', 'Дозатор UNIFILLER DP-08' in msg, msg.replace('\n', ' | ')[-160:])

    # 2. расстойку — в наружную стену по оси 1 (x≈0)
    place('RC-01')
    drag('RC-01', -4.0, -62.6)
    x, z = pose('RC-01')
    check('Расстойка не проходит сквозь стену', x > 0.5 and collisions()['RC-01'] is None, f'x={x}')
    check('Подсказка про стену', 'стена' in pg.locator('.place-panel').inner_text())

    # 3. скольжение вдоль стены: тянем по диагонали в стену — движется вдоль неё
    drag('RC-01', -4.0, -60.0)
    x2, z2 = pose('RC-01')
    check('Скольжение вдоль стены при упоре', z2 > z + 0.5 and collisions()['RC-01'] is None, f'z {z} → {z2}')

    # 4. поворот, который упёрся бы в стену, не выполняется
    pg.locator('.place-panel button', has_text='⟳ 90°').click(); time.sleep(0.4)
    drag('RC-01', -4.0, z2)  # повёрнутая (узкая) — прижимаем к стене
    xr, zr = pose('RC-01')
    rot_before = pg.locator('.place-panel').inner_text()
    pg.locator('.place-panel button', has_text='⟲ 90°').click(); time.sleep(0.4)
    rot_after = pg.locator('.place-panel').inner_text()
    check('Поворот у стены заблокирован', '90°' in rot_after and 'Упирается' in rot_after and collisions()['RC-01'] is None, rot_after.replace('\n', ' | ')[-140:])
    pg.locator('.place-panel button', has_text='Готово').click(); time.sleep(0.3)

    # 5. редактор стен: новая стена поперёк миксера не создаётся
    place('MX-02')
    mx, mz = pose('MX-02')
    pg.locator('.place-panel button', has_text='Готово').click(); time.sleep(0.3)
    pg.locator('.scene-tools button', has_text='✎ Стены').click(); time.sleep(1.5)
    pg.locator('.scene-tools button', has_text='Цех-1').click(); settle()
    n0 = pg.locator('.wall-panel__stats').inner_text()
    pg.keyboard.press('KeyD'); time.sleep(0.2)
    for (wx, wz) in [(mx, mz - 2.0), (mx, mz + 2.0)]:
        sx, sy = screen(wx, wz); pg.mouse.move(sx, sy); time.sleep(0.2); pg.mouse.click(sx, sy); time.sleep(0.4)
    n1 = pg.locator('.wall-panel__stats').inner_text()
    check('Стена сквозь оборудование не создаётся', n0 == n1 and 'сквозь оборудование' in pg.locator('.wall-panel').inner_text(), n1)
    pg.keyboard.press('Escape'); time.sleep(0.2)
    pg.locator('.wall-panel button', has_text='Готово').click(); time.sleep(0.3)

    # 6. новое оборудование ставится в свободное место
    pg.locator('.eq-list button', has_text='Добавить').click(); time.sleep(0.3)
    eid = pg.input_value('#eq-id')
    pg.fill('#eq-name', 'Шкаф'); pg.fill('#eq-model', 'Т-1'); pg.fill('#eq-serial', '1')
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(1.5)
    c = collisions()
    check('Новое оборудование не пересекается ни с чем', all(v is None for v in c.values()), str(c))
    check('Ошибок в консоли нет', not errors, '; '.join(errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f'\nИТОГО: {len(results) - len(fails)}/{len(results)} пройдено')
