# Автопроверка загрузки 3D-моделей: при ошибке причина видна в карточке, модель восстанавливается сама.
# Запуск: npm run build && npm run preview, затем python tools/e2e_models.py http://localhost:4173/
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
    broken = {'on': True}
    def handler(route):
        if broken['on']: route.fulfill(status=200, body=b'not a glb file', content_type='model/gltf-binary')
        else: route.continue_()
    pg.route('**/miwe-roll-in-e-plus*.glb', handler)
    pg.goto(URL); pg.wait_for_selector('.eq-item'); time.sleep(6)
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(1)
    err = pg.locator('.card__model-error').all_inner_texts()
    check('Битый файл модели: причина видна в карточке', len(err) == 1 and 'Не загрузилась' in err[0], str(err)[:120])
    check('Остальные модели не пострадали', len(pg.evaluate("window.__twinScreens('OV-05')")) == 2 and len(pg.evaluate("window.__twinScreens('RC-01')")) == 2)
    broken['on'] = False
    for _ in range(20):
        time.sleep(1)
        if len(pg.evaluate("window.__twinScreens('OV-04')")): break
    check('Файл снова в порядке — модель подгрузилась сама, ошибка снята', len(pg.evaluate("window.__twinScreens('OV-04')")) == 1 and pg.locator('.card__model-error').count() == 0)
    b.close()

fails = [r for r in results if not r[1]]
print(f'\nИТОГО: {len(results) - len(fails)}/{len(results)} пройдено')
