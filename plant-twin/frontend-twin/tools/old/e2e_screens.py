import time, base64
from playwright.sync_api import sync_playwright
import os
S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','test-shots')+'/'
os.makedirs(S,exist_ok=True)
PIX = """async (u) => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return Array.from(x.getImageData(8, Math.floor(im.height/2), 1, 1).data).slice(0,3); }"""
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1600,'height':950}); errs=[]
    pg.add_init_script("try{const k='bakery-twin.settings.v2';const s=JSON.parse(localStorage.getItem(k)||'{}');s.ui=s.ui||{};if(!s.ui.panels){s.ui.panels={card:true,events:true,ppr:true};localStorage.setItem(k,JSON.stringify(s));}}catch(e){}")  # панели рядом со сценой — открыты (в программе по умолчанию скрыты)
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.goto('http://localhost:4173/'); pg.wait_for_selector('.eq-item'); time.sleep(4)
    pg.locator('.eq-list button', has_text='Добавить').click(); time.sleep(0.4)
    cid=pg.input_value('#eq-id'); pg.fill('#eq-name','Делитель'); pg.fill('#eq-model','M'); pg.fill('#eq-serial','D1'); pg.select_option('#eq-kind','mixer')
    pg.set_input_files('#eq-file','/home/claude/bakery-twin/models/sample-divider.glb'); time.sleep(2)
    pg.locator('.modal button', has_text='Добавить и расставить').click(); time.sleep(2)
    pg.locator('.place-panel button', has_text='Готово').click(); time.sleep(6)
    own = pg.evaluate("window.__twinScreens('OV-04')")[0]; auto = pg.evaluate(f"window.__twinAutoScreens('{cid}')")[0]
    for _ in range(15):
        own = pg.evaluate("window.__twinScreens('OV-04')")[0]; auto = pg.evaluate(f"window.__twinAutoScreens('{cid}')")[0]
        c1=pg.evaluate(PIX, own); c2=pg.evaluate(PIX, auto)
        if c1[1]>c1[0] and c2[1]>c2[0]: break
        time.sleep(2)
    print('OV-04 color', c1, '| custom', c2)
    assert c1[1]>c1[0] and c2[1]>c2[0], ('normal screens must be green', c1, c2)
    open(S+'tex_main.png','wb').write(base64.b64decode(own.split(',')[1]))
    pg.locator('.scene-tools__screens').click(); time.sleep(0.5)
    pg.locator('.screens-panel label', has_text='Все показания').click(); time.sleep(1)
    open(S+'tex_all.png','wb').write(base64.b64decode(pg.evaluate("window.__twinScreens('OV-04')")[0].split(',')[1]))
    open(S+'tex_all_auto.png','wb').write(base64.b64decode(pg.evaluate(f"window.__twinAutoScreens('{cid}')")[0].split(',')[1]))
    pg.locator('.eq-item', has_text=cid).click(); time.sleep(12)
    pg.locator('.screens-panel button', has_text='L').click(); time.sleep(0.5)
    pg.locator('.screens-panel button', has_text='Справа').click(); time.sleep(4)
    pg.locator('.nudge__right').click(); pg.locator('.nudge__right').click(); pg.locator('.nudge__up').click(); time.sleep(1.5)
    off = pg.inner_text('[data-testid=scr-offset]'); print('auto offset', off); assert '+10 см' in off and '+5 см' in off, off
    pg.locator('.scene').screenshot(path=S+'scr_panel.png')
    # собственный экран печи: сдвиг стрелками
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(10)
    pg.locator('.screens-panel button', has_text='10 см').click()
    pg.locator('.nudge__left').click(); pg.locator('.nudge__down').click(); time.sleep(1.5)
    off = pg.inner_text('[data-testid=scr-offset]'); print('own offset', off); assert '-10 см' in off, off
    for _ in range(5): pg.locator('.scr-zoom-in').click()
    time.sleep(1.5); z = pg.inner_text('[data-testid=scr-zoom]'); print('own zoom', z); assert z.startswith('150'), z
    pg.locator('.scene').screenshot(path=S+'scr_own_shift.png')
    # авария: сценарий перегрева печи
    pg.select_option('#scenario', 'oven_overheat')
    for i in range(40):
        time.sleep(3)
        c = pg.evaluate(PIX, pg.evaluate("window.__twinScreens('OV-04')")[0])
        if c[0] > 110 and c[0] > 3*c[1]: break
    print('OV-04 after overheat', c); assert c[0]>110 and c[0]>3*c[1], 'alarm must be red'
    pg.reload(); pg.wait_for_selector('.eq-item'); time.sleep(4)
    print('persist', pg.evaluate("JSON.parse(localStorage.getItem('bakery-twin.settings.v2')).ui.screens"))
    sc=pg.evaluate("JSON.parse(localStorage.getItem('bakery-twin.settings.v2')).ui.screens")
    print(sc); assert sc['content']=='all' and sc['size']=='l' and sc['place'][cid]['side']=='right' and abs(sc['place'][cid]['x']-0.1)<1e-6 and sc['shift']['OV-04']=={'x':-0.1,'y':-0.1} and sc['zoom']['OV-04']==1.5
    print('errs', errs); assert not errs
    print('OK e2e_screens')
    b.close()
