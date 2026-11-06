# Автопроверка шапки: переименование цеха и сворачивание сводки показателей.
# Запуск: npm run build && npm run preview, затем python tools/e2e_header.py http://localhost:4173/
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
    # счётчик созданных 3D-контекстов: их число не должно расти при перерисовках (иначе браузер отключает сцену)
    pg.add_init_script("""
      window.__glCount = 0;
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (String(t).startsWith('webgl')) window.__glCount++; return orig.call(this, t, ...a); };
    """)
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.eq-item'); time.sleep(3)
    h1 = lambda: pg.locator('.plant-title h1').inner_text()
    check('По умолчанию «Хлебопекарный цех»', h1() == 'Хлебопекарный цех', h1())

    pg.locator('.plant-title__edit').click(); time.sleep(0.2)
    pg.fill('#plant-name', '  Завод К1 ·   Цех выпечки  '); pg.press('#plant-name', 'Enter'); time.sleep(0.5)
    check('Переименование (лишние пробелы убраны), заголовок вкладки', h1() == 'Завод К1 · Цех выпечки' and pg.title() == 'Завод К1 · Цех выпечки', f'{h1()} / {pg.title()}')
    pg.locator('.plant-title h1').dblclick(); time.sleep(0.2)
    pg.fill('#plant-name', 'Не сохранять'); pg.press('#plant-name', 'Escape'); time.sleep(0.3)
    check('Esc отменяет правку', h1() == 'Завод К1 · Цех выпечки')
    check('Событие о переименовании', pg.locator('.ev', has_text='Название цеха изменено').count() >= 1)

    scene0 = pg.locator('.scene').bounding_box()['height']
    pg.locator('.kpis-toggle').click(); time.sleep(1.5)
    scene1 = pg.locator('.scene').bounding_box()['height']
    check('Сводка свёрнута в строку, сцена стала выше', pg.locator('.kpis-mini').count() == 1 and pg.locator('.kpi').count() == 0 and scene1 > scene0, f'{scene0:.0f} → {scene1:.0f}')
    check('В строке — главное: оборудование, в работе, предупреждения, аварии, ППР', all(w in pg.locator('.kpis-mini').inner_text() for w in ['оборуд.', 'в работе', 'предупр.', 'аварий', 'ППР']))

    pg.reload(); pg.wait_for_selector('.eq-item'); time.sleep(3)
    check('После перезагрузки: название и свёрнутость сохранены', h1() == 'Завод К1 · Цех выпечки' and pg.locator('.kpis-mini').count() == 1)
    pg.locator('.kpis-toggle').click(); time.sleep(0.5)
    check('Сводка разворачивается', pg.locator('.kpi').count() == 8)

    # список оборудования скрывается целиком и возвращается кнопкой «☰ Оборудование» на панели сцены
    w0 = pg.locator('.scene').bounding_box()['width']
    ppr0 = pg.locator('.ppr-overview').bounding_box()['width']
    check('Кнопка «☰ Оборудование» на сцене нажата, пока список виден', pg.locator('.scene-tools__list').get_attribute('aria-pressed') == 'true')
    pg.locator('.eq-list__toggle').click(); time.sleep(1.5)
    w1 = pg.locator('.scene').bounding_box()['width']
    ppr1 = pg.locator('.ppr-overview').bounding_box()['width']
    check('Список скрыт целиком: сцена на его месте, ППР прежней ширины', pg.locator('.eq-list').count() == 0 and w1 > w0 + 250 and abs(ppr1 - ppr0) < 2, f'сцена {w0:.0f} → {w1:.0f}, ППР {ppr0:.0f} → {ppr1:.0f}')
    pg.reload(); pg.wait_for_selector('.scene-tools__list'); time.sleep(2)
    check('После перезагрузки список остаётся скрытым', pg.locator('.eq-list').count() == 0)
    pg.locator('.scene-tools__list').click(); time.sleep(1)
    check('Кнопка «☰ Оборудование» показывает список', pg.locator('.eq-item').count() >= 7)
    pg.locator('.scene-tools__list').click(); time.sleep(0.8)
    check('Повторное нажатие снова скрывает список', pg.locator('.eq-list').count() == 0)
    # при скрытом списке переключение оборудования и обновления данных не плодят 3D-контексты
    g0 = pg.evaluate('window.__glCount')
    for eid in ['OV-04', 'MX-02', 'TM-03', 'OV-05', 'RC-01', 'VC-07']:
        # выбор щелчком по модели на сцене (табличек у встроенного оборудования нет)
        pg.locator('.scene-tools button', has_text='Цех-1').click(); time.sleep(2.5)
        p0 = pg.evaluate(f"window.__twinPose('{eid}')")
        q = pg.evaluate(f"window.__twinProject({p0['x']}, 0.9, {p0['z']})")
        cvb = pg.locator('.scene canvas').bounding_box()
        pg.mouse.click(cvb['x'] + q['x'], cvb['y'] + q['y']); time.sleep(0.6)
    time.sleep(5)
    g1 = pg.evaluate('window.__glCount')
    check('Скрытый список: 3D-контексты не накапливаются, сцена не сбрасывается', g1 == g0 and pg.locator('.scene-restoring').count() == 0, f'контекстов {g0} → {g1}')
    pg.locator('.scene-tools__list').click(); time.sleep(0.8)

    pg.locator('.plant-title__edit').click(); pg.fill('#plant-name', ''); pg.press('#plant-name', 'Enter'); time.sleep(0.4)
    check('Пустое название — возврат к «Хлебопекарный цех»', h1() == 'Хлебопекарный цех', h1())
    # сброс 3D-контекста видеокартой: сцена не остаётся белой, восстанавливается сама
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(1.5)
    pg.evaluate('window.__twinLoseContext()'); time.sleep(0.4)
    shown = pg.locator('.scene-restoring').count() == 1
    for _ in range(20):
        time.sleep(0.5)
        if not pg.locator('.scene-restoring').count(): break
    time.sleep(2)
    check('Сброс 3D-контекста: надпись «Восстанавливаю», затем сцена снова работает', shown and pg.locator('.scene-restoring').count() == 0 and pg.locator('.scene canvas').count() == 1 and (pg.evaluate("window.__twinAnim('OV-04')") or {}).get('speed', 0) > 0.5)
    pg.locator('.eq-item', has_text='MX-02').click(); time.sleep(1)
    check('После восстановления переключение оборудования работает', pg.locator('.card .card__id').inner_text() == 'MX-02')
    errors[:] = [e for e in errors if 'CONTEXT_LOST' not in e and 'context lost' not in e.lower()]
    check('Ошибок в консоли нет', not errors, '; '.join(errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f'\nИТОГО: {len(results) - len(fails)}/{len(results)} пройдено')
