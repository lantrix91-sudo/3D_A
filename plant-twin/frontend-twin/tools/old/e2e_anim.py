# Автопроверка анимации GLB-модели (соглашение anim-*). Запуск: npm run build && npm run preview, затем
# python tools/e2e_anim.py http://localhost:4173/
import os, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
GLB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'miwe-roll-in-e-plus.glb')
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {info}' if info else ''), flush=True)

def wait(pred, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = pred()
        if v: return v
        time.sleep(1)
    return None

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.add_init_script("try{const k='bakery-twin.settings.v2';const s=JSON.parse(localStorage.getItem(k)||'{}');s.ui=s.ui||{};if(!s.ui.panels){s.ui.panels={card:true,events:true,ppr:true};localStorage.setItem(k,JSON.stringify(s));}}catch(e){}")  # панели рядом со сценой — открыты (в программе по умолчанию скрыты)
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.eq-item'); time.sleep(3)
    pg.locator('.eq-item', has_text='OV-04').click(); time.sleep(0.4)
    pg.locator('.card button', has_text='Данные и 3D-модель').click(); time.sleep(0.3)
    pg.fill('#eq-model', 'MIWE roll-in e+'); pg.fill('#eq-serial', 'TEST-1')
    pg.set_input_files('#eq-file', GLB); time.sleep(1.5)
    pg.locator('.modal button', has_text='Сохранить').click()
    anim = lambda: pg.evaluate("window.__twinAnim('OV-04')")
    a0 = wait(lambda: anim() if anim() and anim()['rotation'] is not None else None)
    check('Модель загружена, найдена вращающаяся тележка (anim-rotate)', a0 is not None, str(a0))
    time.sleep(6)
    a1 = anim()
    check('Печь работает: тележка вращается, камера светится', ((a1['rotation'] - a0['rotation']) % (2 * 3.141592653589793)) > 0.05 and a1['speed'] > 0.9 and a1['glow'] > 0.3, f'{a0} → {a1}')
    pg.select_option('#scenario', 'stop_equipment'); pg.select_option('#scenario-target', 'OV-04')
    s = wait(lambda: anim() if anim()['speed'] < 0.05 else None, 120)
    check('Остановка: тележка выбегает до полной остановки', s is not None, str(anim()))
    r1 = anim()['rotation']; time.sleep(4); r2 = anim()['rotation']
    check('Остановлена: вращения нет, камера остывает', min((r2 - r1) % 6.283185307179586, (r1 - r2) % 6.283185307179586) < 0.01 and anim()['glow'] < a1['glow'], f'{r1:.3f} → {r2:.3f}, glow {anim()["glow"]:.2f}')
    pg.select_option('#scenario', 'normal')
    ok = wait(lambda: anim()['speed'] > 0.9, 120)
    check('Пуск: тележка снова разгоняется', ok)

    # тестомес Kemper: дежа и спираль вращаются в противоположные стороны, при остановке — стоят
    tm = lambda: pg.evaluate("window.__twinAnim('TM-03')")
    t0 = wait(lambda: tm() if tm() and tm()['bowl'] is not None else None, 60)
    time.sleep(3); t1 = tm()
    import math
    d_bowl = math.remainder(t1['bowl'] - t0['bowl'], 2 * math.pi) if t0 else 0
    d_spin = (t1['spin'] - t0['spin']) if t0 else 0
    check('Тестомес: дежа и спираль вращаются в противоположные стороны', t0 is not None and d_bowl > 0.05 and d_spin < -0.5, f'дежа {d_bowl:+.2f} рад, спираль {d_spin:+.2f} рад')
    pg.select_option('#scenario', 'stop_equipment'); pg.select_option('#scenario-target', 'TM-03')
    st = wait(lambda: tm() if tm()['speed'] == 0 else None, 120)
    b1 = tm()['bowl']; s1 = tm()['spin']; time.sleep(3); b2 = tm()['bowl']; s2 = tm()['spin']
    check('Тестомес остановлен: дежа и спираль стоят', st is not None and abs(b2 - b1) < 0.02 and abs(s2 - s1) < 0.05, f'{b2 - b1:.3f} / {s2 - s1:.3f}')
    pg.select_option('#scenario', 'normal'); time.sleep(1)

    # расстоечная камера SINMAG: индикаторы горят в работе и гаснут при остановке
    rc = lambda: pg.evaluate("window.__twinAnim('RC-01')")
    r_on = wait(lambda: rc() if rc() and rc()['display'] > 0.9 else None, 60)
    pg.select_option('#scenario', 'stop_equipment'); pg.select_option('#scenario-target', 'RC-01')
    r_off = wait(lambda: rc() if rc()['display'] < 0.05 else None, 120)
    pg.select_option('#scenario', 'normal')
    r_back = wait(lambda: rc()['display'] > 0.9, 120)
    check('Расстойка: индикаторы горят в работе, гаснут при остановке', r_on is not None and r_off is not None and r_back, f'{r_on} / {r_off}')

    # планетарный миксер: головка обходит дежу, венчик крутится в обратную сторону
    mx = lambda: pg.evaluate("window.__twinAnim('MX-02')")
    m0 = wait(lambda: mx() if mx() and mx()['orbit'] is not None else None, 60)
    time.sleep(3); m1 = mx()
    check('Миксер: планетарное вращение (обход вперёд, венчик назад)', m0 is not None and m1['orbit'] - m0['orbit'] > 0.3 and m1['spin'] - m0['spin'] < -0.5, f"{m1['orbit'] - m0['orbit']:+.2f} / {m1['spin'] - m0['spin']:+.2f}" if m0 else str(m1))

    # вакууматор: дисплей светится и полоса цикла идёт, пока он работает; при остановке дисплей гаснет
    vc = lambda: pg.evaluate("window.__twinAnim('VC-07')")
    v0 = wait(lambda: vc() if vc() and vc()['display'] > 0.9 else None, 60)
    time.sleep(4); v1 = vc()
    check('Вакууматор работает: дисплей светится, цикл идёт', v0 is not None and v1['display'] > 0.9 and (v1['progress'] - v0['progress']) % 1 > 0.01, f'{v0} → {v1}')
    pg.select_option('#scenario', 'stop_equipment'); pg.select_option('#scenario-target', 'VC-07')
    off = wait(lambda: vc() if vc()['display'] < 0.05 else None, 120)
    check('Вакууматор остановлен: дисплей погас', off is not None, str(vc()))
    pg.select_option('#scenario', 'normal')
    check('Вакууматор снова в работе: дисплей загорелся', wait(lambda: vc()['display'] > 0.9, 120))
    # дозатор UNIFILLER: лист ходит по конвейеру, формочки наполняются и пустеют; при остановке лист замирает
    dp = lambda: pg.evaluate("window.__twinAnim('DP-08')")
    wait(lambda: dp() and dp()['tray'], 60)
    xs, fs = [], []
    for _ in range(240):  # полный цикл ~13 с; на медленном рендере дольше
        t = dp()['tray']; xs.append(t['x']); fs.append(t['filled']); time.sleep(0.5)
        if max(xs) - min(xs) > 0.6 and max(fs) >= 6.9 and min(fs) <= 0.1: break
    check('Дозатор: лист движется по конвейеру и возвращается', max(xs) - min(xs) > 0.6, f'x {min(xs):.2f}…{max(xs):.2f}')
    check('Дозатор: формочки наполняются кремом и пустеют у края', max(fs) >= 6.9 and min(fs) <= 0.1, f'{min(fs):.1f}…{max(fs):.1f}')
    pg.select_option('#scenario', 'stop_equipment'); pg.select_option('#scenario-target', 'DP-08')
    stopped = wait(lambda: dp() if dp()['speed'] == 0 else None, 120)
    x1 = dp()['tray']['x']; time.sleep(2); x2 = dp()['tray']['x']
    check('Дозатор остановлен: лист замер', stopped is not None and abs(x2 - x1) < 1e-6, f'{x1} → {x2}')
    pg.select_option('#scenario', 'normal')

    # тестоделитель-округлитель KÖNIG: шарики едут по ленте в 2 ряда и исчезают у края; при остановке замирают
    dr = lambda: pg.evaluate("window.__twinAnim('DR-09')")
    b0 = wait(lambda: dr() if dr() and dr()['balls'] else None, 60)
    time.sleep(4); b1 = dr()
    check('Делитель: заготовки едут по ленте', b0 is not None and b1['balls']['cycle'] - b0['balls']['cycle'] > 0.05 and b1['balls']['visible'] >= 12, f"{b0 and b0['balls']} → {b1['balls']}")
    pg.select_option('#scenario', 'stop_equipment'); pg.select_option('#scenario-target', 'DR-09')
    st = wait(lambda: dr() if dr()['speed'] == 0 else None, 120)
    c1 = dr()['balls']['cycle']; time.sleep(2); c2 = dr()['balls']['cycle']
    check('Делитель остановлен: заготовки замерли', st is not None and c1 == c2, f'{c1} → {c2}')
    pg.select_option('#scenario', 'normal')

    # шоковая камера DEBAG: дисплей горит зелёным при работе и гаснет при остановке
    sf = lambda: pg.evaluate("window.__twinAnim('SF-10')")
    on = wait(lambda: sf() if sf() and sf()['display'] > 0.9 else None, 120)
    check('Шоковая камера работает: дисплей горит', on is not None, str(sf()))
    pg.select_option('#scenario', 'stop_equipment'); pg.select_option('#scenario-target', 'SF-10')
    off = wait(lambda: sf() if sf()['display'] < 0.05 else None, 120)
    check('Шоковая камера остановлена: дисплей погас', off is not None, str(sf()))
    pg.select_option('#scenario', 'normal')

    # расстоечная камера PR-11: при работе дисплей контроллера светится и идёт пар
    pr = lambda: pg.evaluate("window.__twinAnim('PR-11')")
    on = wait(lambda: pr() if pr() and pr()['display'] > 0.9 and pr()['steam'] > 0.1 else None, 120)
    check('Расстоечная камера работает: дисплей светится, идёт пар', on is not None, str(pr()))
    mc = lambda: pg.evaluate("window.__twinAnim('PR-12')")
    on2 = wait(lambda: mc() if mc() and mc()['steam'] > 0.1 else None, 120)
    check('Шкаф M.C.E.: при работе идёт пар', on2 is not None, str(mc()))
    check('Ошибок в консоли нет', not errors, '; '.join(errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f'\nИТОГО: {len(results) - len(fails)}/{len(results)} пройдено')
