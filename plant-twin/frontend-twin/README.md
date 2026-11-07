# Новый фронтенд Plant Twin: двойник цеха

Фронтенд для бэкенда из `../backend`. Работает только с данными Django: оборудование и позиции из `GET /api/v1/plan/`,
статусы и показания из WebSocket `/ws/v1/live/`, стены из `/api/v1/plan-walls/`, вход по JWT. Демо-режима и встроенных данных нет.

- **На сервере нет оборудования:** пустой список и нули в сводке.
- **Сервер недоступен, вход уже был:** основной экран с пустыми данными и статусом «Сервер: нет связи». Страница проверяет сервер каждые 5 секунд и подключается сама.
- **Сервер недоступен, входа не было:** форма входа с текстом ошибки.
- **Связь пропала во время работы:** последние полученные значения остаются с предупреждением, через `VITE_STALE_SECONDS` станок показывается как «Нет связи».

## Запуск

Нужны Node.js 22+ и Python 3.14. Команды — для PowerShell, пути указаны относительно папки `plant-twin`.

```powershell
# Терминал 1: бэкенд. Запускайте именно так, без активации .venv:
# скрипт активации в этой копии указывает на другую папку (E:\3D_project\...)
cd backend
.\.venv\Scripts\python.exe manage.py migrate      # создаёт таблицы стен и привязку зоны к чертежу
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000

# Терминал 2: фронтенд
cd frontend-twin
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd ci
npm.cmd run dev        # открыть http://localhost:5174
```

Войдите пользователем Django. Нужна роль `operator`, `engineer` или `admin` либо суперпользователь.

Живые статусы появятся, когда устройства начнут присылать данные (нужен `device_id` в админке):

```powershell
# Терминал 3, из папки plant-twin: симулятор устройств
python simulator/simulate.py --devices sim-01,sim-02 --keys-file simulator/sim-keys.json --interval 3
```

Ключи выдаёт `manage.py issue_device_key --all --name simulator` (см. `docs/TELEMETRY.md`).

Другие команды: `npm.cmd test` — тесты преобразований и синхронизации стен, `npm.cmd run typecheck` — проверка типов, `npm.cmd run build` — сборка в `dist/`.

Проверка «сохранили, перезагрузили, положение то же»: `tools/e2e_server_pose.mjs`, инструкция в начале файла.

### Настройки `.env`

| Переменная | Значение |
|---|---|
| `VITE_BACKEND_URL` | адрес Django для `npm run dev` (по умолчанию `http://127.0.0.1:8000`); на него Vite пересылает запросы |
| `VITE_API_URL` | адрес бэкенда для `npm run build`; при `npm run dev` не используется |
| `VITE_WS_URL` | адрес WebSocket для `npm run build`; при `npm run dev` не используется |
| `VITE_STALE_SECONDS` | через сколько секунд без данных показывать «Нет связи» (по умолчанию 120) |

При `npm run dev` браузер обращается только к Vite, а Vite пересылает `/api`, `/media`, `/admin`, `/static` и `/ws`
на `VITE_BACKEND_URL` (`server.proxy` в `vite.config.ts`). Настраивать CORS для этого не нужно. После смены переменной перезапустите `npm run dev`.

## Как данные идут от API до экрана

Сначала четыре понятия из фронтенда, в терминах бэкенда:

- **Компонент React** (`.tsx`) — функция, которая по данным возвращает разметку. Данные изменились — React перерисовал экран сам. Это похоже на шаблон Django, который перерисовывается без перезагрузки страницы.
- **Хранилище Zustand** (`useApp`, `useServer`, `useRegistry`) — глобальный объект с данными. Компонент подписывается на поле и обновляется при его изменении.
- **Three.js и React Three Fiber** — 3D-сцена. Объекты сцены описываются такими же компонентами.
- **`planMapper.ts`** — аналог сериализатора: переводит формат сервера в формат интерфейса и обратно.

Главная идея: интерфейс читает реестр `EQUIPMENT` и снимок `useApp.live`, а заполняет их `serverHub.ts`.

```text
              Django
    REST /api/v1/      WS /ws/v1/live/
          │                  │
   api/client.ts        api/live.ts
          └───────┬──────────┘
         services/serverHub.ts  ──▶ services/planMapper.ts (перевод форматов)
          ┌───────┴───────────┐
 domain/config.ts        store/appStore.ts
 (реестр EQUIPMENT)      (useApp.live — статусы и показания)
          └───────┬───────────┘
   ui/EquipmentList, ui/card/*, scene/PlantScene ─▶ scene/EquipmentNode
```

### 1. Запуск и вход

1. `src/main.tsx` — точка входа: удаляет из `localStorage` ключи старого демо-режима и рисует `App`.
2. `src/App.tsx` — вызывает `initApp()` и выбирает экран по полю `phase` (`login`, `loading`, `ready`, `error`).
3. `src/services/telemetryHub.ts`, `initApp` — передаёт управление в `bootServerMode`.
4. `src/services/serverHub.ts`, `bootServerMode` — пробует восстановить вход через `restoreSession` из `api/client.ts`. Если токена нет, ставит `phase: 'login'`; если токен есть, но сервер не отвечает, показывает основной экран без данных (`showOffline`).
5. `src/ui/LoginScreen.tsx` → `signIn` → `POST /api/v1/auth/login/`. Access-токен хранится в памяти, refresh — в `localStorage`.

### 2. Список оборудования и позиции: `GET /api/v1/plan/`

1. `serverHub.ts`, `openPlan` — запрашивает `/auth/me/` и `/plan/`. Поле `can_edit_layout` определяет, показывать ли кнопки администратора.
2. `serverHub.ts`, `replaceEquipment` — заполняет реестр оборудованием из плана.
3. `planMapper.ts`, `equipmentFromPlan` — переводит запись. Важная часть — координаты в `planToWorld`: в базе север это `+z`, в Three.js это `-Z` (см. `docs/COORDINATES.md`).
4. `services/models3d.ts`, `registerServerModel` — регистрирует GLB из `asset.url`.
5. `domain/config.ts`, `upsertEquipment` — кладёт запись в массив `EQUIPMENT` и увеличивает счётчик `useRegistry`, из-за чего компоненты перерисовываются.
6. Экран:
   - `ui/EquipmentList.tsx` — список;
   - `scene/PlantScene.tsx` — проходит по `EQUIPMENT` и рисует `scene/EquipmentNode.tsx` для каждой записи;
   - `scene/ServerBuilding.tsx` — здание из `zone.model_url`.
7. После загрузки GLB `EquipmentNode.tsx` сообщает настоящие размеры (`reportModelSize`): размеры в базе часто условные (1×1×1), а рамка на полу и зона щелчка должны совпасть с корпусом.

### 3. Статусы и показания: WebSocket `/ws/v1/live/`

1. `api/live.ts`, `connectLive` — подключается с `?token=<access>`, делает ping и переподключается. На код 4401 обновляет токен, на 4403 не повторяет попытки.
2. `serverHub.ts`, `handleEntry` — получает `snapshot` или `update`. Если набор сигналов изменился, пересобирает датчики (`sensorsFromSignals`): в `/plan/` списка датчиков нет.
3. `planMapper.ts`, `computeLive` — переводит запись в структуры из `engine/alarmEngine.ts`, которые читает интерфейс.
4. `serverHub.ts`, `publishLive` — записывает результат в `useApp.live`.
5. Статус читают:
   - `ui/common/useDerived.ts` (`useDisplayStates`) → `engine/alarmEngine.ts` (`deriveDisplayState`). Эта функция сначала смотрит `serverState`, поэтому браузер статус не вычисляет;
   - `ui/EquipmentList.tsx`, `ui/KpiStrip.tsx`, `ui/card/EquipmentCard.tsx`;
   - `scene/PlantScene.tsx` → `scene/EquipmentNode.tsx`: цвет рамки, лампа, узел `led` модели, экран на корпусе.

| Статус сервера | На экране |
|---|---|
| `run` | Работает |
| `stop` | Остановлено |
| `alarm` | Авария |
| `offline` | Нет связи |
| `unknown`, устройство привязано, данные свежие | Данные поступают (связь есть, значения показываются, работа не определена) |
| `unknown`, устройство привязано, данных ещё не было | Нет связи, в карточке «Ожидание данных» |
| `unknown`, устройство не привязано (`has_telemetry: false`) | Без датчиков |
| данных нет дольше `VITE_STALE_SECONDS` | Нет связи (серверный статус не перезаписывается) |

Таймер устаревания нужен потому, что сервер сообщает об отключении устройства из отдельного процесса `check_offline`,
а без Redis такие события в браузер не доходят.

### 4. Графики: `GET /api/v1/equipment/<code>/readings/?hours=N`

`ui/card/SensorsTab.tsx` → `ui/card/SensorChart.tsx` → `services/history.ts` (`loadSeries`) → `serverHub.ts` (`loadServerSeries`) → `api/client.ts` (`getReadings`).

На периоды 15 минут и 1 час уходит `hours=1` (15 минут вырезаются в браузере), на 24 часа — `hours=24`.
Ответ кэшируется на 30 секунд: сервер отдаёт сразу все сигналы станка, а графиков на экране несколько.

### 5. Запись на сервер (только admin)

Кнопки показываются по полю `can_edit_layout`. Сервер проверяет права и сам: другим ролям он вернёт 403.

| Действие | Путь в коде | Запрос |
|---|---|---|
| Перетащить или повернуть | `scene/PlantScene.tsx` или `scene/PlacementPanel.tsx` → `telemetryHub.commitPose` → `serverHub.commitServerPose` | `PATCH /equipment/<code>/` с `pos_x`, `pos_z`, `rotation_deg` |
| Добавить | `ui/ServerEquipmentForm.tsx` → `serverHub.addServerEquipment` | `POST /equipment/` |
| Изменить данные | `ui/ServerEquipmentForm.tsx` → `serverHub.updateServerEquipment` | `PATCH /equipment/<code>/` |
| Удалить | `ui/card/EquipmentCard.tsx` → `telemetryHub.deleteEquipment` → `serverHub.deleteServerEquipment` | `DELETE /equipment/<code>/` |

Во время перетаскивания положение хранится временно в `settings.layout`. После отпускания оно отправляется на сервер.
Если сервер отказал, станок возвращается на последнее сохранённое место и появляется сообщение.

### 6. Стены и колонны: `GET` и `PUT /api/v1/plan-walls/?zone=<id>`

Источник истины — сервер. В браузере только копия и черновик (IndexedDB `bakery-twin-server`).

1. `serverHub.ts`, `openPlan` → `serverWalls.ts`, `initServerWalls` → `wallsSync.ts`, `init`: сначала показывает копию из браузера, затем загружает версию с сервера.
2. Правка в редакторе: `scene/WallEditPanel.tsx` или `scene/WallEditor.tsx` → `services/walls.ts` (`commit` → `persist`) → `wallsSync.edited`. Черновик сразу пишется в браузер.
3. Примерно через секунду `wallsSync.flush` отправляет `PUT` с `base_version`. После успеха черновик удаляется.

| Что случилось | Что происходит |
|---|---|
| Страницу закрыли до отправки | При следующем открытии черновик отправится, если версия на сервере та же |
| Стены успел изменить другой пользователь (409) | Сами ничего не перезаписываем. В панели выбор: «Взять версию с сервера» или «Записать мою поверх» |
| Нет связи или 5xx | Черновик остаётся, повтор каждые 5 секунд |
| Черновик другого пользователя на этом компьютере | Не отправляется, удаляется |

«Выгрузить JSON» и «Загрузить JSON» работают как резервная копия: загруженный файл сохраняется на сервер новой версией. Править стены могут `engineer` и `admin`, поле `can_edit_walls` в плане. Сервер хранит 20 последних версий: `GET /api/v1/plan-walls/history/?zone=<id>`, просмотр версии `?zone=<id>&version=<N>`. Загрузка файла с сервера: `manage.py import_walls <файл.json> <id или код зоны>`.

### 7. Координаты

Сцена построена в координатах чертежа: ноль — пересечение осей 1 и А. В базе координаты зоны (`pos_x`, `pos_z`) не меняются, а связь задают поля зоны `plan_offset_x`, `plan_offset_z`, `plan_rotation_deg` (админка, раздел «Зоны»). Пересчёт в обе стороны — `planToWorld` и `worldToPlan` в `services/planMapper.ts`, подробности в [docs/COORDINATES.md](../docs/COORDINATES.md).

## Какие файлы за что отвечают

| Файл | Назначение |
|---|---|
| `src/api/config.ts` | адреса бэкенда из `.env` |
| `src/api/types.ts` | форматы ответов API |
| `src/api/client.ts` | все HTTP-запросы и токены |
| `src/api/live.ts` | WebSocket |
| `src/services/planMapper.ts` | перевод форматов и координат; тесты — `planMapper.test.ts` |
| `src/services/serverHub.ts` | **главный файл приложения**: загрузка плана, статусы, графики, запись |
| `src/store/serverStore.ts` | состояние подключения: связь, пользователь, зоны, ассеты |
| `src/services/wallsSync.ts` | логика сохранения стен: задержка, версия, конфликт, черновик; тесты — `wallsSync.test.ts` |
| `src/services/serverWalls.ts` | подключает эту логику к API, кэшу, редактору и интерфейсу |
| `src/storage/wallsCache.ts` | копия стен и черновик в браузере |
| `src/scene/ServerBuilding.tsx` | GLB цеха поверх чертежа (кнопка «Модель цеха») |
| `src/scene/sceneFrame.ts` | границы здания и точки камеры |
| `src/ui/LoginScreen.tsx`, `src/ui/ServerEquipmentForm.tsx` | экран входа и форма оборудования |


## Что важно знать

- **ППР:** панель и вкладка есть, но на бэкенде пока нет моделей и эндпоинтов, поэтому они пусты и показывают «На сервере пока нет данных ППР». Создание записей выключено флагом `JOURNALS_WRITABLE` в `services/journals.ts`: в браузере записи исчезали бы при перезагрузке. Плитки ППР в сводке нет, чтобы при пустых данных не показывать «в срок».
- **Поломки:** компонент `ui/card/BreakdownsTab.tsx` сохранён, но вкладка скрыта до появления API.
- **Пороги, предупреждения и сумма токов** удалены вместе с симулятором: на бэкенде их нет. Статус считает сервер.
- **Здание — чертёж двойника**, стены и колонны хранятся на сервере. GLB цеха можно наложить кнопкой «Модель цеха» для проверки совпадения.
- **Модели оборудования берутся с сервера** (`asset.url`). Файлы в `models/` сохранены, но сейчас оборудованию не назначаются.
- **Столкновения не запрещают перемещение:** панель расстановки только предупреждает о наложении на стену, колонну или соседа, а граница одна — размеры зоны.
- **Техническое состояние важнее телеметрии:** `maintenance` и `repair` показываются как «На обслуживании», `faulty` как «Авария», `decommissioned` как «Выведено из работы».
- **Лента событий** показывает смены статуса с момента открытия страницы и хранится только в памяти.
- **`+ Добавить`** работает, только если в админке есть хотя бы один тип оборудования: отдельного списка типов в API нет.
- **Скрипты `tools/e2e_*.py`** писались под демо-режим и больше не подходят. Актуальна `tools/e2e_server_pose.mjs`.

## Известные ограничения

- Изменения другого пользователя (оборудование и стены) видны после перезагрузки страницы: WebSocket сообщает о статусах, а не об изменениях плана. Если правят стены вдвоём, второй получит конфликт при сохранении.
- Редактор стен один на сцену: стены относятся к первой показанной зоне.
- Подложка, оси и помещения чертежа зашиты в сборку (`plant-layout.json`, `plan-floor1.png`), на сервере только стены и колонны.
- Новое оборудование ставится в центр зоны, откуда его нужно перетащить на место.
- GLB и новые типы оборудования создаются только в админке Django: отдельного списка типов в API нет, поэтому форма предлагает типы из плана.
- Зоны с `visible_by_default: false` не показываются: переключателя зон пока нет.
- Анимация из `rotation_speed_deg_s` и `animation_node_name`, а также поле `condition` пока не используются.
- Для production есть Dockerfile и настройка Railway (см. `docs/DEPLOYMENT.md`). Работа с бэкендом на отдельном домене не проверялась: для GLB потребуется CORS на `/media`.
