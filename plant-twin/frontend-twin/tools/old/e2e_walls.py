# Автопроверка редактора стен. Запуск: npm run build && npm run preview, затем
# python tools/e2e_walls.py http://localhost:4173/
import json, re, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'test-shots'
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info else ''), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True, color_scheme='dark')
    pg = ctx.new_page()
    pg.add_init_script("try{const k='bakery-twin.settings.v2';const s=JSON.parse(localStorage.getItem(k)||'{}');s.ui=s.ui||{};if(!s.ui.panels){s.ui.panels={card:true,events:true,ppr:true};localStorage.setItem(k,JSON.stringify(s));}}catch(e){}")  # панели рядом со сценой — открыты (в программе по умолчанию скрыты)
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.eq-item'); time.sleep(5)

    def scr(x, z, y=0.0):
        cv = pg.locator('.scene canvas').bounding_box()
        q = pg.evaluate(f'window.__twinProject({x},{y},{z})')
        return cv['x'] + q['x'], cv['y'] + q['y']
    def open_more():
        # редкие действия спрятаны в раздел «Ещё»
        if not pg.locator('.wall-panel .fpanel__more').count():
            pg.locator('.wall-panel .fpanel__more-btn').click(); time.sleep(0.2)

    def stats():
        t = pg.locator('.wall-panel__stats').inner_text()
        return [int(n) for n in re.findall(r'\d+', t)]

    pg.locator('.scene-tools button', has_text='✎ Стены').click(); time.sleep(3)
    check('Режим редактора открыт, сцена во всю ширину', pg.locator('.wall-panel').is_visible() and pg.locator('.layout.is-editing').count() == 1)
    s0 = stats()
    pg.screenshot(path=f'{OUT}/walls_top.png')

    # создание: две стены ломаной (свободное место у оси 9–10 / В–Г)
    pg.keyboard.press('KeyD'); time.sleep(0.3)
    # толщина новой стены: любые значения 0,05–1,5 м вводом и кнопками
    pg.fill('#wnew-t', '0.38'); pg.press('#wnew-t', 'Enter'); time.sleep(0.2)
    t_typed = pg.input_value('#wnew-t')
    pg.locator('.wall-panel__presets button', has_text='0,51').click(); time.sleep(0.2)
    t_preset = pg.input_value('#wnew-t')
    pg.fill('#wnew-t', '3'); pg.press('#wnew-t', 'Enter'); time.sleep(0.2)
    t_bad = pg.input_value('#wnew-t')
    check('Толщина новой стены: ввод 0,38, кнопка 0,51, 3 м отклонено', t_typed == '0.38' and t_preset == '0.51' and t_bad == '0.51', f'{t_typed} / {t_preset} / {t_bad}')
    pg.fill('#wnew-t', '0,38'); pg.press('#wnew-t', 'Enter'); time.sleep(0.2)
    pg.locator('.scene canvas').hover(); time.sleep(0.2)
    for (x, z) in [(50, -14), (56, -14), (56, -10)]:
        sx, sy = scr(x, z); pg.mouse.move(sx, sy); time.sleep(0.15); pg.mouse.click(sx, sy); time.sleep(0.35)
    pg.keyboard.press('Escape'); time.sleep(0.3)
    s1 = stats()
    check('Создание: ломаная из двух стен', s1[0] == s0[0] + 2 and s1[1] == s0[1] + 2, f'{s0} → {s1}')
    nws = [w for w in pg.evaluate('window.__twinWalls()') if w['id'] in ('N0001', 'N0002')]
    check('Новые стены получили толщину 0,38 м', len(nws) == 2 and all(abs(w['t'] - 0.38) < 1e-6 for w in nws), str([w['t'] for w in nws]))

    # выбор и перемещение (координаты созданной стены — из состояния редактора)
    pg.keyboard.press('KeyV'); time.sleep(0.3)
    nw = [w for w in pg.evaluate('window.__twinWalls()') if w['id'] == 'N0001'][0]
    mx, mz = (nw['x1'] + nw['x2']) / 2, (nw['z1'] + nw['z2']) / 2
    sx, sy = scr(mx, mz, 0.7)
    pg.mouse.click(sx, sy); time.sleep(0.4)
    sel = pg.locator('.wall-panel__sel').inner_text() if pg.locator('.wall-panel__sel').count() else ''
    check('Выбор стены щелчком', 'N0001' in sel, sel)
    c0 = pg.locator('.wall-panel__coords').inner_text()
    sx, sy = scr(mx, mz, 0.7); tx, ty = scr(mx, mz + 2, 0.7)
    pg.mouse.move(sx, sy); pg.mouse.down()
    for i in range(1, 13): pg.mouse.move(sx + (tx - sx) * i / 12, sy + (ty - sy) * i / 12); time.sleep(0.03)
    pg.mouse.up(); time.sleep(0.4)
    c1 = pg.locator('.wall-panel__coords').inner_text()
    check('Перемещение стены целиком', c0 != c1, f'{c0} → {c1}')

    # перемещение конца за маркер
    m = re.findall(r'-?\d+\.\d+', c1); x2, z2 = float(m[2]), float(m[3])
    hx, hy = scr(x2, z2, 1.4 + 0.25); tx, ty = scr(x2 + 3, z2, 0)
    pg.mouse.move(hx, hy); pg.mouse.down()
    for i in range(1, 13): pg.mouse.move(hx + (tx - hx) * i / 12, hy + (ty - hy) * i / 12); time.sleep(0.03)
    pg.mouse.up(); time.sleep(0.4)
    len_after = float(pg.input_value('#wsel-len'))
    check('Перемещение конца стены за маркер', len_after > 7.5, f'длина {len_after}')

    # длина из поля
    pg.fill('#wsel-len', '4'); pg.press('#wsel-len', 'Enter'); time.sleep(0.3)
    check('Длина из поля ввода', abs(float(pg.input_value('#wsel-len')) - 4) < 0.01)
    pg.fill('#wsel-t', '0.25'); pg.press('#wsel-t', 'Enter'); time.sleep(0.3)
    check('Толщина из поля ввода', pg.input_value('#wsel-t') == '0.25')

    # удаление клавишей, отмена и повтор
    pg.locator('.scene canvas').hover(); n_before = stats()[0]
    pg.keyboard.press('Delete'); time.sleep(0.3)
    check('Удаление клавишей Delete', stats()[0] == n_before - 1)
    pg.keyboard.press('Control+KeyZ'); time.sleep(0.3)
    check('Отмена (Ctrl+Z) возвращает стену', stats()[0] == n_before)
    pg.keyboard.press('Control+KeyY'); time.sleep(0.3)
    check('Повтор (Ctrl+Y)', stats()[0] == n_before - 1)
    pg.keyboard.press('Control+KeyZ'); time.sleep(0.3)

    # удаление инструментом: стена проекта (наружная по оси 1)
    pg.keyboard.press('KeyE'); time.sleep(0.3)
    st = stats()
    sx, sy = scr(-0.2, -27, 0.7); pg.mouse.move(sx, sy); time.sleep(0.2); pg.mouse.click(sx, sy); time.sleep(0.4)
    st2 = stats()
    check('Инструмент «Удалить»: стена проекта удалена', st2[0] == st[0] - 1 and st2[3] == st[3] + 1, f'{st} → {st2}')
    pg.screenshot(path=f'{OUT}/walls_edit.png')

    # колонны: выбор и удаление клавишей, удаление инструментом, отмена
    def col_stats():
        t = pg.locator('.wall-panel__stats').inner_text()
        m = re.search(r'колонн: (\d+) \(−(\d+)\)', t)
        return int(m.group(1)), int(m.group(2))
    cols = pg.evaluate('window.__twinColumns()')
    c1, c2 = cols[40], cols[41]
    k0 = col_stats()
    pg.keyboard.press('KeyV'); time.sleep(0.3)
    sx, sy = scr(c1['x'], c1['z'], 1.0); pg.mouse.move(sx, sy); time.sleep(0.2); pg.mouse.click(sx, sy); time.sleep(0.4)
    sel = pg.locator('.wall-panel__sel').inner_text() if pg.locator('.wall-panel__sel').count() else ''
    check('Выбор колонны щелчком', c1['id'] in sel and 'Колонна' in sel, sel)
    pg.keyboard.press('Delete'); time.sleep(0.3)
    k1 = col_stats()
    check('Удаление колонны клавишей Delete', k1 == (k0[0] - 1, k0[1] + 1), f'{k0} → {k1}')
    pg.keyboard.press('KeyE'); time.sleep(0.3)
    sx, sy = scr(c2['x'], c2['z'], 1.0); pg.mouse.move(sx, sy); time.sleep(0.2); pg.mouse.click(sx, sy); time.sleep(0.4)
    k2 = col_stats()
    check('Удаление колонны инструментом «Удалить»', k2 == (k0[0] - 2, k0[1] + 2), f'{k1} → {k2}')
    pg.keyboard.press('Control+KeyZ'); time.sleep(0.3)
    check('Отмена возвращает колонну', col_stats() == k1)
    pg.keyboard.press('Control+KeyY'); time.sleep(0.3)
    k2 = col_stats()
    st2 = stats()

    # сохранение после перезагрузки
    time.sleep(0.8)
    pg.reload(); pg.wait_for_selector('.eq-item'); time.sleep(4)
    pg.locator('.scene-tools button', has_text='✎ Стены').click(); time.sleep(1.5)
    st3 = stats()
    check('После перезагрузки изменения сохранены', st3 == st2, f'{st2} / {st3}')
    check('После перезагрузки удалённые колонны не вернулись', col_stats() == k2, f'{col_stats()}')

    with pg.expect_download() as d:
        open_more()
        pg.locator('.wall-panel button', has_text='Выгрузить JSON').click()
    data = json.load(open(d.value.path(), encoding='utf-8'))
    check('Выгрузка JSON (стены и колонны)', data['format'] == 'bakery-twin/walls@1' and len(data['walls']) == st3[0] and len(data['columns']) == k2[0])

    # загрузка обратно выгруженного файла
    pg.set_input_files('#walls-import', d.value.path()); time.sleep(0.6)
    check('Загрузка JSON', stats()[0] == st3[0] and pg.locator('.wall-panel .form-error').count() == 0)

    open_more()
    pg.locator('.wall-panel button', has_text='Вернуть по проекту').click(); time.sleep(0.3)
    pg.locator('.modal button', has_text='Вернуть по проекту').click(); time.sleep(0.5)
    st4 = stats()
    check('Возврат по проекту (стены и колонны)', st4[1:4] == [0, 0, 0] and st4[0] == s0[0] and st4[5] == 0 and st4[4] == s0[4], str(st4))
    pg.locator('.wall-panel button', has_text='Готово').click(); time.sleep(0.5)
    check('Выход из редактора', pg.locator('.wall-panel').count() == 0 and pg.locator('.layout.is-editing').count() == 0)
    for _ in range(10):  # событие пишется асинхронно — ждём до 5 с
        if pg.locator('.ev', has_text='планировка стен').count(): break
        time.sleep(0.5)
    check('Событие о правке планировки', pg.locator('.ev', has_text='планировка стен').count() > 0)
    check('Ошибок в консоли нет', not errors, '; '.join(errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f'\nИТОГО: {len(results) - len(fails)}/{len(results)} пройдено')
