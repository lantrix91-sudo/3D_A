# Руководство по фронтенду для бэкенд-разработчика

Как устроен фронтенд, как его запустить и где что лежит. Правки в «Редакторе стен» хранятся на сервере, см. [раздел 4](#4-где-хранятся-стены-и-колонны).

## Сначала о главном: фронтендов два

| Папка | Что это | Редактор стен | Порт |
|---|---|---|---|
| [`frontend-twin/`](../../frontend-twin/) | Новый двойник цеха на React | **есть** | 5174 |
| [`frontend/`](../FRONTEND.md) | Рабочий план Koktal_1 на чистом Three.js | нет | 5173 |

Оба работают только с данными Django, демо-режима нет. Если вы видите кнопку «✎ Стены», вы работаете с `frontend-twin/`. Поэтому разделы 4 и 5 относятся к `frontend-twin/`. Приложение «Обход» (`mobile/`) здесь не описано, см. [mobile/README.md](../../mobile/README.md).

### Четыре понятия фронтенда

| Понятие | Что это, если сравнивать с бэкендом |
|---|---|
| Компонент React (`.tsx`) | Функция, которая по данным возвращает разметку. Похоже на шаблон Django, но перерисовывается без перезагрузки страницы |
| Хранилище Zustand (`useApp`, `useServer`, `useWalls`) | Глобальный объект с данными. Компонент подписан на поле и обновляется при его изменении |
| Three.js и React Three Fiber | 3D-сцена. В двойнике её объекты тоже описаны компонентами |
| Хранилища браузера | Своего рода маленькая БД на компьютере пользователя. `localStorage` — простые строки по ключу, IndexedDB — объёмные данные. **С сервером они не связаны** |

## 1. Структура кода

### `frontend-twin/src`

Страниц и маршрутов нет: это один экран из панелей. Какой экран показать, решает поле `phase` в [`App.tsx`](../../frontend-twin/src/App.tsx): `login`, `loading`, `ready` или `error`.

| Папка или файл | За что отвечает |
|---|---|
| `main.tsx` | Точка входа, запускает `App` |
| `App.tsx` | Выбор экрана и раскладка панелей |
| `styles.css` | Все стили |

**Экраны и панели (`ui/`)**

| Файл | Что на экране |
|---|---|
| `LoginScreen.tsx` | Экран входа |
| `Header.tsx` | Шапка, статус сервера, меню «☰ Меню» |
| `KpiStrip.tsx` | Плитки со сводкой |
| `EquipmentList.tsx` | Список оборудования слева |
| `ServerEquipmentForm.tsx` | Форма «+ Добавить» и правка данных |
| `EventFeed.tsx`, `MaintenanceOverview.tsx` | Панели «События» и «ППР» |
| `card/` | Карточка: `EquipmentCard`, `SensorsTab`, `SensorChart`, `PprTab`, `BreakdownsTab` (пока скрыт) |
| `common/` | Общие детали: окна, поля, значки статуса |

**3D-сцена (`scene/`)**

| Файл | За что отвечает |
|---|---|
| `PlantScene.tsx` | Вся сцена: камера, свет, кнопки над ней, перетаскивание |
| `EquipmentNode.tsx` | Одна единица оборудования: модель, цвет статуса, анимация |
| `PlantBuilding.tsx` | Здание по чертежу: подложка, стены, колонны |
| `ServerBuilding.tsx` | GLB цеха с сервера поверх чертежа (кнопка «Модель цеха») |
| `WallEditor.tsx`, `WallEditPanel.tsx` | Редактор стен: действия на сцене и панель |
| `PlacementPanel.tsx`, `ScreensPanel.tsx` | Панели «Расстановка» и «Экраны» |
| `labels.tsx`, `infoScreen.ts` | Подписи и экраны на моделях |
| `sceneFrame.ts` | Границы здания и точки камеры |
| `models/` | Условные модели без GLB-файла |

**Логика и данные**

| Папка или файл | За что отвечает |
|---|---|
| `services/telemetryHub.ts` | Запуск приложения, настройки, выбор оборудования, лента событий |
| `services/serverHub.ts` | Главная логика: вход, план, WebSocket, графики, запись, поведение без связи |
| `services/planMapper.ts` | Перевод форматов и координат сервера. Аналог сериализатора |
| `services/walls.ts` | **Стены и колонны:** данные, отмена, сохранение, экспорт и импорт |
| `services/wallsSync.ts`, `serverWalls.ts` | Сохранение стен на сервер: задержка, версия, конфликт, черновик |
| `services/models3d.ts`, `collision.ts`, `journals.ts`, `history.ts` | 3D-файлы, столкновения, поломки и ППР, данные для графиков |
| `api/` | Запросы к бэкенду: `client.ts` (HTTP и токены), `live.ts` (WebSocket), `types.ts`, `config.ts` |
| `engine/alarmEngine.ts` | Типы живого состояния и итоговое состояние для экрана |
| `domain/` | `config.ts` — реестр оборудования в памяти, его заполняет сервер; `plant-layout.json` — чертёж; `types.ts` — типы данных |
| `storage/` | Браузер: `settings.ts` (`localStorage`), `wallsCache.ts` (копия стен в IndexedDB), `memoryRepository.ts` (лента событий в памяти) |
| `store/` | Zustand: `appStore.ts`, `serverStore.ts` |

Путь данных от API до экрана по шагам описан в [frontend-twin/README.md](../../frontend-twin/README.md). Форматы данных — в [frontend-contract.md](frontend-contract.md).

### `frontend/src`

Обычный JavaScript без React. Страницу собирает `main.js`.

| Папка или файл | За что отвечает |
|---|---|
| `main.js` | Точка входа: вход, загрузка плана, WebSocket, связь сцены и панелей |
| `style.css` | Стили |
| `api/` | `client.js` (HTTP и токены), `live.js` (WebSocket), `config.js` (адреса) |
| `ui/` | Панели: `login`, `viewer` (основной экран), `equipmentCard`, `history` и `historyChart`, `roundPanel`, `routesPanel`, `resizeImage` |
| `scene/SceneManager.js` | 3D-сцена: камера и отрисовка |
| `scene/zoneLoader.js`, `assetLoader.js` | Загрузка GLB цеха и оборудования |
| `scene/equipmentView.js`, `liveVisuals.js`, `colors.js`, `theme.js` | Вид оборудования, цвета статусов, оформление |
| `scene/layoutEditor.js` | Перемещение оборудования администратором, сохраняется на сервере |
| `scene/picking.js`, `coordinates.js`, `cameraFit.js`, `resources.js` | Выбор мышью, координаты, камера, освобождение памяти |
| `scene/routeOverlay.js`, `snapshot.js` | Маршрут на сцене, снимок станка из 3D |
| `rounds/routeLogic.js` | Логика маршрутов обхода |
| `pwa/` | Установка на телефон: service worker |
| `*.test.js` | Тесты |

## 2. Запуск и сборка в Windows

Нужны Node.js 22.12+ и Python 3.14. Команды для PowerShell. `npm.cmd` вместо `npm` нужен потому, что Windows может запрещать запуск скриптов `npm.ps1`.

**Перед первым запуском:**

```powershell
cd E:\3D_project_bakery\plant-twin\frontend-twin   # или ...\frontend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd ci
```

**Бэкенд** (нужен для режима сервера, отдельный терминал):

```powershell
cd E:\3D_project_bakery\plant-twin\backend
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

> Не активируйте `.venv`: скрипт активации в этой копии указывает на `E:\3D_project\...`. Команды из корневого `README.md` с путём `E:\3D_project` тоже запустят оригинал, а не эту копию.

**Команды фронтенда:**

| Действие | `frontend-twin/` | `frontend/` |
|---|---|---|
| Разработка | `npm.cmd run dev` → http://localhost:5174 | `npm.cmd run dev` → http://localhost:5173 |
| Сборка | `npm.cmd run build` → папка `dist/` | `npm.cmd run build` → папка `dist/` |
| Просмотр сборки | `npm.cmd run preview` → порт 4174 | `npm.cmd run preview` → порт 4173 |
| Тесты | `npm.cmd test` | `npm.cmd test` |
| Проверка типов | `npm.cmd run typecheck` | нет, это JavaScript |
| Один HTML-файл | `npm.cmd run build:single` → `dist-single/index.html` (около 11 МБ) | нет |

Правки в коде появляются в браузере сами. Правки в `.env` или `vite.config.ts` требуют перезапуска `npm.cmd run dev`.

**Как фронтенд находит бэкенд.** При `npm run dev` браузер обращается только к Vite, а тот пересылает `/api`, `/media`, `/admin`, `/static` и `/ws` на `127.0.0.1:8000`. Настройка — `backendProxy` в `vite.config`. `VITE_API_URL` и `VITE_WS_URL` действуют только при сборке.

**Частые ошибки:**

| Сообщение | Причина |
|---|---|
| `Port 5174 is already in use` | Dev-сервер уже запущен. Откройте его или закройте старый терминал |
| «Сервер недоступен или вернул ошибку (500)» при входе | Бэкенд не запущен на порту 8000 |
| Пустая сцена или «3D-сцена недоступна» | В браузере выключен WebGL или аппаратное ускорение |

## 3. Где лежат модели, план и картинки

### `frontend-twin/`

| Что | Где | Когда используется |
|---|---|---|
| Модели оборудования `.glb` | [`frontend-twin/models/`](../../frontend-twin/models/) | Симулятор. Подключены в `services/models3d.ts`, `BUILTIN_MODELS` |
| Исходники моделей и инструкция по фото | `frontend-twin/tools/glb/` | Для сборки новых моделей |
| Загруженные пользователем модели | браузер: IndexedDB `bakery-twin`, хранилище `meta`, ключ `model3d:<id>` | Симулятор |
| Условные модели без файла | `src/scene/models/Models.tsx` | Симулятор |
| План: стены, колонны, оси, помещения | [`src/domain/plant-layout.json`](../../frontend-twin/src/domain/plant-layout.json) | Симулятор |
| Картинка чертежа на полу | [`src/assets/plan-floor1.png`](../../frontend-twin/src/assets/plan-floor1.png) | Симулятор |
| Как их получить из PDF | `tools/pdf_to_layout.py` | При новой редакции чертежа |
| Модель цеха и оборудования | **на сервере**, см. ниже | Режим сервера |

### На сервере (режим сервера и `frontend/`)

Файлы лежат в `backend/media/` (локально) или в S3/R2 (production). Загружаются **только через админку Django**. Адреса приходят в `GET /api/v1/plan/`.

| Что | Папка | Поле модели | Адрес в плане |
|---|---|---|---|
| Модель цеха | `media/models/` | `Zone.model_file` | `zones[].model_url` |
| Модель оборудования | `media/assets/` | `Asset.glb_file` | `equipment[].asset.url` |
| Картинка станка | `media/equipment-images/` | `Equipment.image` | `equipment[].image` |
| Фото состояний и осмотров | `media/condition-photos/`, `media/inspection-photos/` | — | в истории |

`*.glb` исключены из Git правилом в `.gitignore`. Единственное исключение — `frontend-twin/models/`. Папка `backend/media/` в Git не попадает, поэтому её нужно копировать отдельно.

### `frontend/`

Своих моделей нет, всё приходит с сервера. В `frontend/public/` лежат только значки PWA (`icons/`), `manifest.webmanifest` и `sender.html` — страница отправки тестовых данных.

## 4. Где хранятся стены и колонны

**На сервере:** модель `PlanWalls`, `GET` и `PUT /api/v1/plan-walls/?zone=<id>`. Сохранение идёт примерно через секунду после правки, на сервере хранятся 20 последних версий. В браузере только копия и черновик: IndexedDB `bakery-twin-server`, хранилище `walls`.

Как устроено сохранение и что делать при конфликте двух пользователей, описано в [frontend-twin/README.md](../../frontend-twin/README.md), раздел 6.

**Резервная копия:** «✎ Стены» → «Ещё» → «Выгрузить JSON». Обратно: «Загрузить JSON» там же или `manage.py import_walls <файл> <зона>`.

В `frontend/` стены приходят из GLB (узлы с именами `wall_ext*` и `wall_int*`, см. `scene/zoneLoader.js`), и редактировать их можно только в 3D-редакторе с последующей загрузкой файла через админку.

## 5. Работа без связи с сервером

`frontend-twin/` работает только с Django, переключателя режимов нет. Адрес бэкенда: `VITE_BACKEND_URL` при `npm run dev`, `VITE_API_URL` при `npm run build`.

| Что случилось | Что на экране |
|---|---|
| На сервере нет оборудования | пустой список и нули в сводке |
| Сервер недоступен, вход уже был | основной экран без данных, «Сервер: нет связи»; страница подключается сама |
| Сервер недоступен, входа не было | форма входа с текстом ошибки |
| Связь пропала во время работы | последние полученные значения с предупреждением, через `VITE_STALE_SECONDS` — «Нет связи» |

### Что где хранит браузер

Все значения привязаны к адресу, как и стены.

**`localStorage`**

| Ключ | Что хранит |
|---|---|
| `bakery-twin.server-settings.v1` | настройки интерфейса |
| `bakery-twin.refresh` | refresh-токен |
| `bakery-twin.theme` | тема |
| `bakery-twin.panel.<id>` | положение плавающих панелей |

Ключи старого демо-режима (`bakery-twin.mode`, `bakery-twin.settings.v2`, `bakery-twin.engine.v1`) удаляются при запуске. База IndexedDB `bakery-twin` от демо-режима автоматически не удаляется, приложение её больше не читает.

Старый `frontend/` хранит в `localStorage` только `plant-twin.refresh` и кэш маршрутов `plant-twin:*`.
