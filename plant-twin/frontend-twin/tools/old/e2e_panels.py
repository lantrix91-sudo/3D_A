"""Панели рядом со сценой: по умолчанию скрыты, открываются и закрываются кнопками над сценой, состояние сохраняется."""
import time
from playwright.sync_api import sync_playwright
res = []
def check(name, ok, info=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info else ''))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1600, 'height': 950}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.goto('http://localhost:4173/'); pg.wait_for_selector('.eq-item', timeout=90000); time.sleep(3)
    cnt = lambda sel: pg.locator(sel).count()
    w0 = pg.locator('.scene').bounding_box()['width']
    check('По умолчанию карточка, события и ППР скрыты', cnt('.card') == 0 and cnt('.events') == 0 and cnt('.ppr-overview') == 0)
    pg.locator('.scene-tools__panel--card').click(); time.sleep(1)
    w1 = pg.locator('.scene').bounding_box()['width']
    check('Кнопка «Карточка» открывает карточку', cnt('.card') == 1 and w1 < w0 - 200, f'сцена {w0:.0f} → {w1:.0f}')
    pg.locator('.scene-tools__panel--events').click(); pg.locator('.scene-tools__panel--ppr').click(); time.sleep(1)
    check('События и ППР открываются', cnt('.events') == 1 and cnt('.ppr-overview') == 1)
    pg.reload(); pg.wait_for_selector('.eq-item', timeout=90000); time.sleep(2)
    check('Открытые панели сохраняются после перезагрузки', cnt('.card') == 1 and cnt('.events') == 1 and cnt('.ppr-overview') == 1)
    for k in ('card', 'events', 'ppr'): pg.locator(f'.scene-tools__panel--{k}').click()
    time.sleep(1)
    w2 = pg.locator('.scene').bounding_box()['width']
    check('Скрытые панели освобождают место для сцены', cnt('.card') == 0 and abs(w2 - w0) < 5, f'{w2:.0f} vs {w0:.0f}')
    check('Ошибок нет', not errs, '; '.join(errs[:2]))
    b.close()
print(f'\nИТОГО: {sum(res)}/{len(res)} пройдено')
