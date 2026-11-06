# Автопроверка добавления оборудования. Запуск: npm run build && npm run preview, затем
# python tools/e2e_equipment.py http://localhost:4173/ [папка-для-скриншотов]
import os, re, sys, tempfile, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'test-shots'
GLB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'sample-divider.glb')
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info else ''), flush=True)

bad = os.path.join(tempfile.mkdtemp(), 'broken.glb')
open(bad, 'wb').write(b'not a model at all')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark')
    pg = ctx.new_page()
    pg.add_init_script("try{const k='bakery-twin.settings.v2';const s=JSON.parse(localStorage.getItem(k)||'{}');s.ui=s.ui||{};if(!s.ui.panels){s.ui.panels={card:true,events:true,ppr:true};localStorage.setItem(k,JSON.stringify(s));}}catch(e){}")  # панели рядом со сценой — открыты (в программе по умолчанию скрыты)
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.eq-item'); time.sleep(4)
    n0 = pg.locator('.eq-item').count()

    # 0. фокус не прыгает на первое поле при обновлении показаний (ввод с клавиатуры, как у пользователя)
    pg.locator('.eq-list button', has_text='Добавить').click(); time.sleep(0.4)
    pg.keyboard.type('Тестоделитель', delay=20)
    pg.keyboard.press('Tab')
    pg.keyboard.type('ТД-', delay=20)
    time.sleep(4.5)  # два-три пакета телеметрии
    pg.keyboard.type('Ручной', delay=20)
    focus_id = pg.evaluate('document.activeElement && document.activeElement.id')
    check('Фокус остаётся в поле «Модель» после обновления показаний', focus_id == 'eq-model' and pg.input_value('#eq-model') == 'ТД-Ручной' and pg.input_value('#eq-name') == 'Тестоделитель', f'фокус: {focus_id}, модель: {pg.input_value("#eq-model")!r}, наим.: {pg.input_value("#eq-name")!r}')
    pg.keyboard.press('Escape'); time.sleep(0.3)
    check('Esc закрывает форму', pg.locator('#eq-form').count() == 0)

    # то же в форме неисправности
    pg.locator('.eq-item', has_text='MX-02').click(); time.sleep(0.4)
    pg.locator('.tabs button', has_text='Поломки').click()
    pg.locator('button:has-text("+ Неисправность")').click(); time.sleep(0.4)
    pg.locator('#brk-desc').click(); pg.keyboard.type('Проверка', delay=20)
    time.sleep(4.5)
    pg.keyboard.type(' фокуса', delay=20)
    check('Форма неисправности: фокус не сбрасывается', pg.evaluate('document.activeElement.id') == 'brk-desc' and pg.input_value('#brk-desc') == 'Проверка фокуса')
    pg.keyboard.press('Escape'); time.sleep(0.3)

    # 1. обязательные поля
    pg.locator('.eq-list button', has_text='Добавить').click(); time.sleep(0.4)
    check('Форма добавления открыта', pg.locator('#eq-form').count() == 1)
    eq_id = pg.input_value('#eq-id')
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(0.3)
    check('Без наименования — ошибка', 'наименование' in pg.locator('.modal .form-error').inner_text().lower())
    pg.fill('#eq-name', 'Тестоделитель')
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(0.3)
    check('Без модели — ошибка', 'модель' in pg.locator('.modal .form-error').inner_text().lower())
    pg.fill('#eq-model', 'ТД-Тест 1')
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(0.3)
    check('Без серийного номера — ошибка', 'серийный' in pg.locator('.modal .form-error').inner_text().lower())
    pg.fill('#eq-serial', 'SN-0001')

    # 2. неверный файл
    pg.set_input_files('#eq-file', bad); time.sleep(1.2)
    check('Повреждённый файл отклонён', pg.locator('.model-field .form-error').count() == 1, pg.locator('.model-field .form-error').inner_text() if pg.locator('.model-field .form-error').count() else '')

    # 3. правильный GLB
    pg.set_input_files('#eq-file', GLB); time.sleep(1.5)
    info = pg.locator('.model-check').inner_text() if pg.locator('.model-check').count() else ''
    check('GLB прочитан, габариты посчитаны', '0.80 × 1.65 × 1.37' in info, info.replace('\n', ' | '))
    pg.select_option('#eq-unit', 'mm'); time.sleep(0.2)
    check('Смена единиц пересчитывает габариты и предупреждает', 'неправдоподобно' in pg.locator('.model-check').inner_text())
    pg.select_option('#eq-unit', 'm'); time.sleep(0.2)
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(1.5)
    check('Оборудование добавлено в список', pg.locator('.eq-item').count() == n0 + 1 and pg.locator('.eq-item', has_text=eq_id).count() == 1)
    check('Сразу открыт режим «Расстановка»', pg.locator('.place-panel').count() == 1 and eq_id in pg.locator('.place-panel').inner_text())
    card = pg.locator('.card').inner_text()
    check('Карточка: модель, серийный номер, 3D-файл', 'ТД-Тест 1' in card and 'SN-0001' in card and 'sample-divider.glb' in card)
    check('Состояние «Без датчиков»', 'Без датчиков' in pg.locator('.card__state').inner_text())
    time.sleep(1.5)
    check('Свой файл без экрана: двойник прикрепил живой экран, табличек нет', len(pg.evaluate(f"window.__twinAutoScreens('{eq_id}')")) == 1 and pg.locator('.scene-label').count() == 0)
    time.sleep(2)
    pg.screenshot(path=f'{OUT}/eq_added.png')
    pg.locator('.place-panel button', has_text='Готово').click(); time.sleep(0.3)
    check('Событие о добавлении', pg.locator('.ev', has_text='Добавлено оборудование').count() == 1)

    # 4. дубликат модели и серийного номера
    pg.locator('.eq-list button', has_text='Добавить').click(); time.sleep(0.3)
    pg.fill('#eq-name', 'Копия'); pg.fill('#eq-model', 'ТД-Тест 1'); pg.fill('#eq-serial', 'sn-0001')
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(0.3)
    check('Дубликат модели и серийного номера отклонён', 'уже есть' in pg.locator('.modal .form-error').inner_text())

    # 5. второе — без 3D-файла, с профилем датчиков тестомеса
    id2 = pg.input_value('#eq-id')
    pg.fill('#eq-name', 'Тестомес 2'); pg.fill('#eq-model', 'Спираль-60'); pg.fill('#eq-serial', 'S60-777')
    pg.select_option('#eq-kind', 'kneader')
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(5)
    pg.locator('.place-panel button', has_text='Готово').click(); time.sleep(0.3)
    pg.locator('.tabs button', has_text='Датчики').click(); time.sleep(0.3)
    vals = pg.locator('.readings').inner_text() if pg.locator('.readings').count() else ''
    check('Профиль датчиков: показания идут', 'А' in vals and 'Нет данных' not in vals, vals.replace('\n', ' ')[:80])

    # 6. правка
    pg.locator('.eq-item', has_text=eq_id).click(); time.sleep(0.5)
    pg.locator('.card button', has_text='Данные и 3D-модель').click(); time.sleep(0.3)
    check('Правка: текущая 3D-модель показана', 'sample-divider.glb' in pg.locator('.model-file').inner_text())
    pg.fill('#eq-serial', 'SN-0002')
    pg.locator('.modal button', has_text='Сохранить').click(); time.sleep(0.8)
    check('Правка серийного номера', 'SN-0002' in pg.locator('.card').inner_text())

    # 7. базовое оборудование: модель и серийный номер
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(0.5)
    pg.locator('.card button', has_text='Данные и 3D-модель').click(); time.sleep(0.3)
    check('У базового профиль датчиков доступен для смены', not pg.locator('#eq-kind').is_disabled() and pg.input_value('#eq-kind') == 'oven')
    pg.fill('#eq-model', 'MIWE condo (уточнить)'); pg.fill('#eq-serial', 'OV-SN-1')
    pg.locator('.modal button', has_text='Сохранить').click(); time.sleep(0.8)
    check('Базовое: модель и серийный номер сохранены', 'OV-SN-1' in pg.locator('.card').inner_text())
    check('У базового есть кнопка «Удалить»', pg.locator('.card button', has_text='Удалить').count() == 1)

    # 8. перезагрузка
    time.sleep(0.5)
    pg.reload(); pg.wait_for_selector('.eq-item'); time.sleep(4)
    check('После перезагрузки: оба добавленных на месте', pg.locator('.eq-item', has_text=eq_id).count() == 1 and pg.locator('.eq-item', has_text=id2).count() == 1)
    pg.locator('.eq-item', has_text=eq_id).click(); time.sleep(1)
    card = pg.locator('.card').inner_text()
    check('После перезагрузки: 3D-модель и данные сохранены', 'sample-divider.glb' in card and 'SN-0002' in card)
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(0.4)
    check('После перезагрузки: правка базового сохранена', 'OV-SN-1' in pg.locator('.card').inner_text())

    # 9. удаление
    pg.locator('.eq-item', has_text=id2).click(); time.sleep(0.4)
    pg.locator('.card button', has_text='Удалить').click(); time.sleep(0.3)
    pg.locator('.modal button', has_text='Удалить оборудование').click(); time.sleep(0.8)
    check('Удаление: исчезло из списка и сцены', pg.locator('.eq-item', has_text=id2).count() == 0 and pg.locator('.scene-label', has_text=id2).count() == 0)
    for _ in range(10):  # событие пишется асинхронно
        if pg.locator('.ev', has_text='Удалено оборудование').count(): break
        time.sleep(0.5)
    check('Событие об удалении', pg.locator('.ev', has_text='Удалено оборудование').count() == 1)

    # 10. удаление базового (печь OV-04) и восстановление
    pg.select_option('#scenario', 'oven_overheat'); time.sleep(0.5)
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(0.4)
    pg.locator('.card button', has_text='Удалить').click(); time.sleep(0.3)
    check('Подтверждение удаления базового предлагает восстановление', 'Восстановить' in pg.locator('.modal').inner_text())
    pg.locator('.modal button', has_text='Удалить оборудование').click(); time.sleep(1)
    check('Базовое удалено из списка, сцены и сводки', pg.locator('.eq-item', has_text='OV-04').count() == 0 and pg.locator('.scene-label', has_text='OV-04').count() == 0)
    check('Сценарий «Перегрев печи» сброшен и недоступен', pg.input_value('#scenario') == 'normal' and pg.locator('#scenario option[value="oven_overheat"]').is_disabled())
    n_items = pg.locator('.eq-item').count()
    kpi = pg.locator('.kpi', has_text='Оборудование').locator('.kpi__value').inner_text()
    check('Сводка: количество уменьшилось', kpi == str(n_items), f'{kpi} / {n_items}')
    time.sleep(3)
    pg.reload(); pg.wait_for_selector('.eq-item'); time.sleep(3)
    check('После перезагрузки удалённое базовое не вернулось', pg.locator('.eq-item', has_text='OV-04').count() == 0 and pg.locator('.eq-restore', has_text='OV-04').count() == 1)
    pg.locator('.eq-restore button', has_text='OV-04').click(); time.sleep(1)
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(0.4)
    card = pg.locator('.card').inner_text()
    check('Восстановление базового: исходные данные', pg.locator('.eq-restore').count() == 0 and 'Печь ротационная MIWE' in card and 'OV-SN-1' not in card)
    time.sleep(5)
    check('Восстановленное: показания снова идут', 'Нет данных' not in pg.locator('.readings').inner_text())

    pg.locator('.eq-item', has_text=eq_id).click(); time.sleep(0.4)
    pg.locator('button', has_text='Цех-1').click(); time.sleep(3)
    pg.screenshot(path=f'{OUT}/eq_shop.png')
    # профиль датчиков можно сменить после добавления: «Без датчиков» → миксер → снова без датчиков; у базовой — тоже
    pg.locator('.eq-list button', has_text='Добавить').click(); time.sleep(0.4)
    gid = pg.input_value('#eq-id')
    pg.fill('#eq-name', 'Стол разделочный'); pg.fill('#eq-model', 'СР-1'); pg.fill('#eq-serial', 'SR-001')
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(1.5)
    pg.locator('.place-panel button', has_text='Готово').click(); time.sleep(0.3)
    pg.locator('.eq-item', has_text=gid).click(); time.sleep(0.4)
    pg.locator('.card .tabs button', has_text='Датчики').click(); time.sleep(0.3)
    check('Без датчиков: в карточке есть «Подключить датчики»', pg.locator('.card button', has_text='Подключить датчики').count() == 1)
    pg.locator('.card button', has_text='Подключить датчики').click(); time.sleep(0.5)
    check('Выбор профиля доступен и в фокусе', not pg.locator('#eq-kind').is_disabled() and pg.evaluate('document.activeElement.id') == 'eq-kind')
    pg.select_option('#eq-kind', 'mixer'); pg.locator('.modal button', has_text='Сохранить').click(); time.sleep(5)
    check('Профиль сменён: показания пошли', 'Без датчиков' not in pg.locator('.eq-item', has_text=gid).inner_text() and pg.locator('.readings').count() == 1)
    pg.reload(); pg.wait_for_selector('.eq-item'); time.sleep(4)
    check('После перезагрузки профиль сохранён', 'датчики не подключены' not in pg.locator('.eq-item', has_text=gid).inner_text())
    pg.locator('.eq-item', has_text=gid).click(); time.sleep(0.4)
    pg.locator('.card button', has_text='Данные и 3D-модель').click(); time.sleep(0.4)
    pg.select_option('#eq-kind', 'generic'); pg.locator('.modal button', has_text='Сохранить').click(); time.sleep(2)
    check('Снова «Без датчиков»', 'датчики не подключены' in pg.locator('.eq-item', has_text=gid).inner_text())
    pg.locator('.eq-item', has_text='MX-02').click(); time.sleep(0.4)
    pg.locator('.card button', has_text='Данные и 3D-модель').click(); time.sleep(0.4)
    check('У базового оборудования профиль тоже можно сменить', not pg.locator('#eq-kind').is_disabled())
    pg.keyboard.press('Escape'); time.sleep(0.3)

    check('Ошибок в консоли нет', not errors, '; '.join(errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f'\nИТОГО: {len(results) - len(fails)}/{len(results)} пройдено')
