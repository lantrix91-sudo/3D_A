# Автопроверка сценариев раздела 10 ТЗ. Запуск: npm run build && npm run preview, затем
# pip install playwright && playwright install chromium && mkdir -p test-shots && python tools/e2e_check.py http://localhost:4173/
import sys, time, re
from playwright.sync_api import sync_playwright

OUT = 'test-shots'
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok), info))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info else ''), flush=True)

def wait_for(pred, timeout=60, step=1):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if pred(): return True
        except Exception:
            pass
        time.sleep(step)
    return False

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True, color_scheme='dark')
    pg = ctx.new_page()
    pg.add_init_script("try{const k='bakery-twin.settings.v2';const s=JSON.parse(localStorage.getItem(k)||'{}');s.ui=s.ui||{};if(!s.ui.panels){s.ui.panels={card:true,events:true,ppr:true};localStorage.setItem(k,JSON.stringify(s));}}catch(e){}")  # панели рядом со сценой — открыты (в программе по умолчанию скрыты)
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'fonts.g' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.goto(URL)
    pg.wait_for_selector('.eq-item', timeout=20000)
    time.sleep(4)
    check('Отметка демо-режима видна', pg.locator('.demo-banner').is_visible())
    check('Canvas 3D создан', pg.locator('.scene canvas').count() == 1)

    # 1. выбор из списка
    names = {'RC-01': 'Расстоечная камера SINMAG', 'MX-02': 'Миксер TeknoStamap', 'TM-03': 'Тестомес Kemper', 'OV-04': 'Печь ротационная MIWE', 'OV-05': 'Печь тележечная DEBAG', 'OV-06': 'Печь ротационная ZF', 'VC-07': 'Вакууматор Weber Cooling'}
    for eid, nm in names.items():
        pg.locator('.eq-item', has_text=eid).click()
        time.sleep(0.6)
        h = pg.locator('.card__title h2').inner_text()
        check(f'Выбор {eid} из списка → карточка', h == nm, h)
    # показания — на живых экранах моделей, парящих табличек у встроенного оборудования нет
    check('Табличек над встроенным оборудованием нет', pg.locator('.scene-label').count() == 0, str(pg.locator('.scene-label').count()))
    scr = {e: len(pg.evaluate(f"window.__twinScreens('{e}')")) for e in names}
    check('Живые экраны у всех встроенных моделей (DEBAG и SINMAG — по два)', all(n >= 1 for n in scr.values()) and scr['OV-05'] == 2 and scr['RC-01'] == 2, str(scr))
    # выбор кликом по самой 3D-модели: печь
    pg.locator('button:has-text("Весь этаж")').click(); time.sleep(2)
    pg.locator('.eq-item', has_text='RC-01').click(); time.sleep(0.3)
    pg.locator('button:has-text("Цех-1")').click(); time.sleep(3.5)
    for _ in range(12):
        # щёлкаем по корпусу печи в точке, не закрытой подписями других машин
        cvb = pg.locator('.scene canvas').bounding_box()
        p0 = pg.evaluate("window.__twinScreen('OV-04')")
        pts = [(p0['x'] + dx, p0['y'] + dy) for dy in (0, 25, 45, -15) for dx in (0, -20, 20)]
        free = [q for q in pts if pg.evaluate(f"document.elementFromPoint({cvb['x'] + q[0]},{cvb['y'] + q[1]})?.tagName") == 'CANVAS']
        if free:
            pg.mouse.click(cvb['x'] + free[0][0], cvb['y'] + free[0][1])
            time.sleep(1)
            if 'OV-04' in pg.locator('.eq-item.is-selected').inner_text(): break
        time.sleep(1)
    check('Выбор печи кликом по 3D-модели', 'OV-04' in pg.locator('.eq-item.is-selected').inner_text())
    pg.screenshot(path=f'{OUT}/t_model_click.png')

    # 2. камера: колесо и возврат
    cv = pg.locator('.scene canvas').bounding_box()
    cx, cy = cv['x'] + cv['width'] / 2, cv['y'] + cv['height'] / 2
    def settled_camera(limit=40):
        # плавный перелёт камеры: ждём, пока положение перестанет меняться (на медленном WebGL — дольше)
        prev, still = None, 0
        for _ in range(limit):
            time.sleep(1)
            cur = pg.evaluate('window.__twinCamera()')
            still = still + 1 if prev and sum(abs(a - b) for a, b in zip(cur, prev)) < 0.02 else 0
            if still >= 3: return cur
            prev = cur
        return prev
    pg.locator('button:has-text("Весь этаж")').click(); time.sleep(1)
    before = settled_camera()
    pg.mouse.move(cx, cy); pg.mouse.wheel(0, -1500); time.sleep(1.5)
    pg.mouse.move(cx, cy + 80); time.sleep(0.2); pg.mouse.down()
    for i in range(20): pg.mouse.move(cx + i * 12, cy + 80 + i); time.sleep(0.03)
    pg.mouse.up(); time.sleep(1.5)
    moved = pg.evaluate('window.__twinCamera()')
    check('Камера: приближение и вращение меняют вид', sum(abs(a - b) for a, b in zip(moved, before)) > 3, f'{before} → {moved}')
    pg.mouse.move(cx, cy)
    for _ in range(10): pg.mouse.wheel(0, 3000); time.sleep(0.1)
    time.sleep(1.5)
    far_cam = pg.evaluate('window.__twinCamera()')
    check('Камера: ограничение отдаления — сцена не теряется', max(abs(c) for c in far_cam) < 200, str(far_cam))
    pg.locator('button:has-text("Весь этаж")').click(); time.sleep(1)
    after = settled_camera()
    pg.screenshot(path=f'{OUT}/t_overview.png')
    check('Кнопка «Весь этаж» возвращает камеру', sum(abs(a - b) for a, b in zip(after, before)) < 0.5, f'{before} → {after}')

    # 3. обновление показаний
    pg.locator('.eq-item', has_text='TM-03').click(); time.sleep(0.5)
    v1 = pg.locator('.readings').inner_text()
    time.sleep(4.5)
    v2 = pg.locator('.readings').inner_text()
    check('Показания обновляются', v1 != v2)
    check('Графики отрисованы (3 шт)', pg.locator('.chart .recharts-line-curve').count() >= 3)
    for per in ['1 час', '24 часа', '15 минут']:
        pg.locator('.chart-bar .seg button', has_text=per).click(); time.sleep(1.5)
        n = pg.locator('.chart .recharts-line-curve').count()
        check(f'Графики за период «{per}»', n >= 3, f'линий: {n}')
    check('Пороги на графике', pg.locator('.chart .recharts-reference-line').count() >= 3)

    # 4. пауза
    pg.locator('button:has-text("Пауза")').click(); time.sleep(1)
    a1 = pg.locator('.readings .reading__value').all_inner_texts()
    time.sleep(10)
    a2 = pg.locator('.readings .reading__value').all_inner_texts()
    nc = pg.locator('.kpi', has_text='Нет связи').locator('.kpi__value').inner_text()
    check('Пауза: показания заморожены, связь не теряется', a1 == a2 and nc == '0', f'{a1}={a2}, без связи={nc}')
    check('Пауза: уведомление в карточке', pg.locator('.notice', has_text='на паузе').count() == 1)
    pg.locator('button:has-text("Пуск")').click(); time.sleep(4.5)
    a3 = pg.locator('.readings .reading__value').all_inner_texts()
    check('Возобновление: показания снова идут', a3 != a2, f'{a2} → {a3}')

    # 5. перегрузка тестомеса
    pg.select_option('#scenario', 'kneader_overload')
    ok = wait_for(lambda: pg.locator('.ev--alarm_start', has_text='Ток').count() > 0, 90)
    check('Перегрузка TM-03: событие аварии по току', ok)
    check('Перегрузка: состояние «Авария» в карточке', 'Авария' in pg.locator('.card__state').inner_text())
    alarms = pg.locator('.kpi', has_text='Аварии').locator('.kpi__value').inner_text()
    check('Сводка: аварий = 1', alarms == '1', alarms)
    n_ev = pg.locator('.ev--alarm_start').count()
    time.sleep(8)
    check('Нет дублей событий на каждом обновлении', pg.locator('.ev--alarm_start').count() == n_ev)
    pg.screenshot(path=f'{OUT}/t_alarm.png')
    pg.select_option('#scenario', 'normal')
    ok = wait_for(lambda: pg.locator('.ev', has_text='Авария снята').count() > 0, 90)
    check('Снятие аварии после возврата в норму', ok)
    ok = wait_for(lambda: 'Работает' in pg.locator('.card__state').inner_text(), 90)
    check('Состояние вернулось в «Работает»', ok)

    # 5b. перегрев печи (дольше)
    pg.select_option('#scenario', 'oven_overheat')
    ok = wait_for(lambda: pg.locator('.ev--warning_start', has_text='печи').count() > 0, 150)
    check('Перегрев печи: предупреждение по температуре', ok)
    pg.select_option('#scenario', 'normal')

    # 6. потеря связи
    pg.select_option('#scenario', 'comm_loss')
    pg.select_option('#scenario-target', 'RC-01')
    pg.locator('.eq-item', has_text='RC-01').click()
    ok = wait_for(lambda: pg.locator('.reading__nodata').count() == 3, 15)
    check('Потеря связи RC-01: «Нет данных» по всем датчикам', ok)
    txt = pg.locator('.readings').inner_text()
    check('Нет ложных нулей', not re.search(r'(^|\s)0[.,]0\s*(А|°C|%)', txt) and 'Последнее измерение' in txt)
    check('Состояние «Нет связи»', 'Нет связи' in pg.locator('.card__state').inner_text())
    check('Событие потери связи', pg.locator('.ev--comm_lost', has_text='RC-01').count() > 0 or pg.locator('.ev--comm_lost').count() > 0)
    lst = pg.locator('.eq-item', has_text='RC-01').inner_text()
    check('Список: «нет данных» вместо значений', 'нет данных' in lst and 'Нет связи' in lst)
    pg.locator('.chart-bar .seg button', has_text='15 минут').click(); time.sleep(3)
    pg.screenshot(path=f'{OUT}/t_commloss.png')
    pg.select_option('#scenario', 'normal')
    ok = wait_for(lambda: pg.locator('.reading__nodata').count() == 0, 15)
    check('Восстановление связи', ok and pg.locator('.ev--comm_restored').count() > 0)

    # 6b. остановка оборудования
    pg.select_option('#scenario', 'stop_equipment')
    pg.select_option('#scenario-target', 'MX-02')
    ok = wait_for(lambda: 'Остановлено' in pg.locator('.eq-item', has_text='MX-02').inner_text(), 15)
    check('Остановка MX-02 → «Остановлено», связь есть', ok and pg.locator('.ev--run_stopped').count() > 0)
    pg.select_option('#scenario', 'normal')

    # 7. поломка: добавить и закрыть
    pg.locator('.eq-item', has_text='MX-02').click(); time.sleep(0.4)
    pg.locator('.tabs button', has_text='Поломки').click()
    n0 = pg.locator('.record').count()
    pg.locator('button:has-text("+ Неисправность")').click()
    pg.fill('#brk-desc', 'Тестовая неисправность: вибрация дежи')
    pg.fill('#brk-cause', 'Проверка прототипа')
    # окончание раньше начала → ошибка
    start = pg.input_value('#brk-dts')
    pg.fill('#brk-dte', '2020-01-01T10:00')
    pg.locator('.modal button:has-text("Сохранить")').click(); time.sleep(0.4)
    err = pg.locator('.form-error').inner_text() if pg.locator('.form-error').count() else ''
    check('Валидация: окончание простоя раньше начала', 'раньше' in err, err)
    pg.fill('#brk-dte', '')
    pg.fill('#brk-resp', 'Тестировщик')
    pg.locator('.modal button:has-text("Сохранить")').click(); time.sleep(0.8)
    check('Поломка добавлена', pg.locator('.record').count() == n0 + 1 and pg.locator('.record', has_text='вибрация дежи').count() == 1)
    rec = pg.locator('.record', has_text='вибрация дежи')
    rec.locator('button:has-text("Редактировать")').click()
    pg.fill('#brk-comment', 'Отредактировано')
    pg.select_option('#brk-status', 'in_progress')
    pg.locator('.modal button:has-text("Сохранить")').click(); time.sleep(0.6)
    check('Поломка отредактирована', 'в работе' in rec.inner_text().lower() and 'Отредактировано' in rec.inner_text())
    rec.locator('button:has-text("Закрыть неисправность")').click()
    pg.fill('#cl-works', 'Подтянуты крепления')
    pg.locator('.modal button:has-text("Отметить устранённой")').click(); time.sleep(0.8)
    t = rec.inner_text()
    check('Поломка закрыта, длительность простоя рассчитана', 'устранена' in t.lower() and 'мин' in t, t.replace('\n', ' | ')[:160])

    # 8. ППР: создать и выполнить
    pg.locator('.tabs button', has_text='ППР').click(); time.sleep(0.3)
    pg.locator('button:has-text("+ Работа ППР")').click()
    pg.fill('#ppr-title', 'Тестовая проверка ремня')
    pg.fill('#ppr-works', 'Осмотр; натяжение')
    pg.fill('#ppr-period', '30')
    pg.fill('#ppr-resp', 'Тестировщик')
    pg.locator('.modal button:has-text("Сохранить")').click(); time.sleep(0.7)
    item = pg.locator('.record', has_text='Тестовая проверка ремня')
    check('ППР создано', item.count() == 1)
    item.locator('button:has-text("Отметить выполнение")').click()
    pg.fill('#pd-comment', 'Выполнено в рамках проверки')
    pg.locator('.modal button:has-text("Отметить выполненной")').click(); time.sleep(0.8)
    check('Следующая плановая запись создана', pg.locator('.record', has_text='Тестовая проверка ремня').count() == 1)
    pg.locator('.disclosure').click(); time.sleep(0.3)
    check('История выполнения сохранена', pg.locator('.hist-table', has_text='Тестовая проверка ремня').count() == 1)

    # 9. CSV
    with pg.expect_download() as d:
        pg.locator('.journal__bar button:has-text("CSV")').click()
    path = d.value.path()
    raw = open(path, 'rb').read()
    txt = raw.decode('utf-8-sig')
    check('CSV ППР: BOM UTF-8 и кириллица', raw.startswith(b'\xef\xbb\xbf') and 'Тестовая проверка ремня' in txt and 'Периодичность' in txt, d.value.suggested_filename)
    pg.locator('.tabs button', has_text='Поломки').click()
    with pg.expect_download() as d2:
        pg.locator('.journal__bar button:has-text("CSV")').click()
    t2 = open(d2.value.path(), 'rb').read().decode('utf-8-sig')
    check('CSV поломок: кириллица и поля', 'вибрация дежи' in t2 and 'Длительность простоя' in t2)
    open(f'{OUT}/polomki.csv', 'w', encoding='utf-8').write(t2)

    # 10. перезагрузка
    pg.reload(); pg.wait_for_selector('.eq-item'); time.sleep(3)
    pg.locator('.eq-item', has_text='MX-02').click(); time.sleep(0.3)
    pg.locator('.tabs button', has_text='Поломки').click(); time.sleep(0.3)
    check('После перезагрузки: поломка сохранена', pg.locator('.record', has_text='вибрация дежи').count() == 1)
    pg.locator('.tabs button', has_text='ППР').click(); time.sleep(0.3)
    check('После перезагрузки: ППР сохранено', pg.locator('.record', has_text='Тестовая проверка ремня').count() == 1)
    check('После перезагрузки: события сохранены', pg.locator('.ev', has_text='Тестовая неисправность').count() > 0)

    # пороги: редактирование
    pg.locator('.tabs button', has_text='Датчики').click()
    pg.locator('button:has-text("Пороги…")').click()
    pg.fill('#thr-MX-02\\.current-warnHigh', '20')
    pg.locator('.modal button:has-text("Сохранить")').click(); time.sleep(0.4)
    err = pg.locator('.form-error').inner_text() if pg.locator('.form-error').count() else ''
    check('Валидация порогов (предупреждение ≥ аварии)', 'ниже аварийного' in err, err)
    pg.fill('#thr-MX-02\\.current-warnHigh', '10.5')
    pg.locator('.modal button:has-text("Сохранить")').click(); time.sleep(0.4)
    check('Пороги сохранены', pg.locator('.modal').count() == 0)

    check('Ошибок в консоли нет', not errors, '; '.join(errors[:5]))
    b.close()

fails = [r for r in results if not r[1]]
print(f'\nИТОГО: {len(results) - len(fails)}/{len(results)} пройдено')
