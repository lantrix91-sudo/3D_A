/**
 * Проверочный скрипт: сохранили положение, перезагрузили — положение то же.
 *
 * Что делает: входит, перетаскивает оборудование мышью в режиме «Расстановка», ждёт PATCH на сервер,
 * сверяет положение на сцене с базой (с учётом plan_offset зоны), перезагружает страницу и сверяет снова.
 * В конце возвращает оборудование на исходное место.
 *
 * Запуск (бэкенд и npm run dev уже работают). ВНИМАНИЕ: скрипт на время меняет положение станка в базе,
 * к которой подключён бэкенд, поэтому запускайте его на копии или в разработке:
 *   npm.cmd i --no-save playwright-core
 *   $env:TWIN_USER="admin"; $env:TWIN_PASSWORD="..."; $env:TWIN_CODE="Owen-3"; node tools/e2e_server_pose.mjs
 * Нужен установленный Chrome. Код возврата 0 — проверка пройдена.
 */
import { chromium } from 'playwright-core';

const URL = process.env.TWIN_URL ?? 'http://localhost:5174/';
const USER = process.env.TWIN_USER;
const PASSWORD = process.env.TWIN_PASSWORD;
const CODE = process.env.TWIN_CODE ?? 'Owen-3';
const TOLERANCE_M = 0.011; // сервер хранит положение с точностью 0,01 м
if (!USER || !PASSWORD) {
  console.error('Задайте TWIN_USER и TWIN_PASSWORD');
  process.exit(2);
}

let failed = 0;
const check = (name, ok, details = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${details ? ` — ${details}` : ''}`);
  if (!ok) failed += 1;
};
const near = (a, b) => Math.abs(a - b) <= TOLERANCE_M;

/** Положение на чертеже по данным сервера. Та же формула, что planToWorld при нулевых offset и повороте зоны */
function expectedWorld(zone, item) {
  const a = (zone.plan_rotation_deg * Math.PI) / 180;
  const x0 = zone.offset.x + item.pos.x;
  const z0 = -zone.offset.z - item.pos.z;
  return { x: zone.plan_offset.x + x0 * Math.cos(a) + z0 * Math.sin(a), z: -zone.plan_offset.z - x0 * Math.sin(a) + z0 * Math.cos(a) };
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();

const api = (path, method = 'GET', body) => page.evaluate(async ({ path, method, body, USER, PASSWORD }) => {
  const login = await fetch('/api/v1/auth/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASSWORD }) });
  const { access } = await login.json();
  const r = await fetch(path, { method, headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return r.json();
}, { path, method, body, USER, PASSWORD });
const planItem = async () => {
  const plan = await api('/api/v1/plan/');
  for (const zone of plan.zones) {
    const item = zone.equipment.find((e) => e.code === CODE);
    if (item) return { zone, item };
  }
  throw new Error(`В плане нет ${CODE}`);
};
const pose = () => page.evaluate((code) => window.__twinPose(code), CODE);

let original = null;
try {
  await page.goto(URL);
  await page.fill('#login-user', USER);
  await page.fill('#login-pass', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('.topbar', { timeout: 30000 });
  await page.waitForTimeout(3000);

  const before = await planItem();
  original = { pos_x: before.item.pos.x, pos_z: before.item.pos.z, rotation_deg: before.item.rotation_deg };
  console.log(`Зона ${before.zone.code}: plan_offset ${JSON.stringify(before.zone.plan_offset)}, поворот ${before.zone.plan_rotation_deg}°`);

  const start = await pose();
  const startWorld = expectedWorld(before.zone, before.item);
  check('при загрузке станок стоит по данным сервера', near(start.x, startWorld.x) && near(start.z, startWorld.z), JSON.stringify({ start, startWorld }));

  await page.locator('.eq-item', { hasText: CODE }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Расстановка' }).click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const code = document.querySelector('.place-panel__eq span')?.textContent ?? '';
    const p = window.__twinPose(code);
    window.__twinLookAt(p.x + 0.01, 22, p.z + 9, p.x, 0, p.z);
  });
  await page.waitForTimeout(2500);

  const box = await page.locator('canvas').boundingBox();
  const s = await page.evaluate((code) => window.__twinScreen(code), CODE);
  const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes(`/equipment/${CODE}/`), { timeout: 20000 });
  await page.mouse.move(box.x + s.x, box.y + s.y);
  await page.waitForTimeout(300);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(box.x + s.x - i * 6, box.y + s.y + i * 5);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  const response = await saved;
  check('PATCH принят сервером', response.status() === 200, `код ${response.status()}`);
  await page.waitForTimeout(1200);

  const moved = await pose();
  check('станок действительно сдвинулся', !near(moved.x, start.x) || !near(moved.z, start.z), JSON.stringify(moved));
  const afterSave = await planItem();
  const savedWorld = expectedWorld(afterSave.zone, afterSave.item);
  check('база и сцена совпадают после сохранения', near(moved.x, savedWorld.x) && near(moved.z, savedWorld.z), JSON.stringify({ moved, savedWorld, pos: afterSave.item.pos }));

  await page.reload();
  await page.waitForSelector('.topbar', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const reloaded = await pose();
  check('после перезагрузки положение то же', near(reloaded.x, moved.x) && near(reloaded.z, moved.z) && Math.abs(reloaded.rotY - moved.rotY) < 1e-6, JSON.stringify({ moved, reloaded }));
  const afterReload = await planItem();
  check('в базе те же координаты', afterReload.item.pos.x === afterSave.item.pos.x && afterReload.item.pos.z === afterSave.item.pos.z);
} catch (e) {
  check('сценарий выполнен', false, String(e));
} finally {
  if (original) {
    await api(`/api/v1/equipment/${CODE}/`, 'PATCH', original).catch(() => {});
    console.log(`Исходное положение ${CODE} восстановлено`);
  }
  await browser.close();
}
console.log(failed ? `Ошибок: ${failed}` : 'Проверка пройдена');
process.exit(failed ? 1 : 0);
