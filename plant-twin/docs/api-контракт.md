# Контракт API v1 — авторизация и план

Backend и frontend общаются только через API. Здесь фиксируются форматы данных.
Реализованы авторизация, план и список оборудования. Приём телеметрии
(`POST /api/v1/readings/`), живой статус (`/ws/v1/live/`) и симулятор описаны в
[TELEMETRY.md](TELEMETRY.md). Карточка оборудования и техническое состояние описаны в
[EQUIPMENT_CARD.md](old/EQUIPMENT_CARD.md), ежедневный обход — в [ROUNDS.md](ROUNDS.md). В плане у оборудования есть `status`
(run | stop | alarm | offline | unknown) и `last_seen` (Unix-секунды или null).

## Авторизация

Все запросы с телом используют `Content-Type: application/json`.

### POST /api/v1/auth/login/

Без JWT. Запрос:

```json
{"username":"demo_operator","password":"пароль из DEMO_USER_PASSWORD"}
```

Ответ 200:

```json
{"access":"<JWT access>","refresh":"<JWT refresh>"}
```

400 — отсутствуют обязательные поля; 401 — неверные данные или пользователь отключён.

### POST /api/v1/auth/refresh/

Без access JWT. Запрос:

```json
{"refresh":"<JWT refresh>"}
```

Ответ 200:

```json
{"access":"<новый JWT access>"}
```

Refresh не ротируется; его исходный срок действия не продлевается.
400 — отсутствует refresh; 401 — токен недействителен или истёк.

### GET /api/v1/auth/me/

Обязателен заголовок `Authorization: Bearer <JWT access>`.
Ответ 200:

```json
{"id":1,"username":"demo_operator","roles":["operator"]}
```

`roles` содержит назначенные группы operator, engineer, admin в алфавитном порядке.
Пользователь без этих групп имеет пустой список и может читать свой профиль.
401 — access отсутствует, истёк, неверен либо пользователь отключён.

## Права

| Класс permission | operator | engineer | admin |
| --- | --- | --- | --- |
| IsOperator | да | да | да |
| IsEngineer | нет | да | да |
| IsAdmin | нет | нет | да |

Активный Django superuser проходит все проверки ролей. `is_staff` управляет
доступом к Django admin, но не даёт роль в API. Неактивный пользователь
не проходит проверки. Права читаются из БД при запросе, а не из JWT.
`/plan/` и `/equipment/` используют IsOperator; `/me/`
доступен любому активному аутентифицированному пользователю.

## План производства

### GET /api/v1/plan/?plant=factory

JWT и роль operator, engineer, admin либо активный superuser. Без параметра plant
выбирается первый завод по коду. Неизвестный явно заданный завод — 404.
Без заводов: `{"plant":null,"zones":[]}`. Оборудование вложено в зоны;
прежнего верхнего `equipment` больше нет. Ответ 200:

```json
{
  "plant": {"code":"factory","name":"Завод"},
  "zones": [{
    "code":"main", "name":"Главный зал",
    "model_url":"http://localhost:8000/media/models/hall_v0.glb",
    "offset":{"x":0,"z":0}, "rotation_deg":0, "model_rotation_deg":180,
    "visible_by_default":true,
    "equipment":[{
      "code":"oven-1", "name":"Печь MIWE 1", "type":"oven", "zone":"main",
      "asset":{"code":"oven", "url":"http://localhost:8000/media/assets/oven.glb",
               "led_node_name":"led", "size":{"x":1.85,"y":1.9,"z":1.55}},
      "pos":{"x":19,"y":0,"z":60.3}, "rotation_deg":0,
      "size":{"x":1.85,"y":1.9,"z":1.55}, "status":"unknown", "last_seen":null, "is_active":true
    }]
  }]
}
```

`asset` — эффективный ассет: явная ссылка Equipment, иначе default_asset типа,
иначе null. `url` — абсолютный адрес или null, если файл отсутствует.
`size` оборудования — размеры эффективного ассета; без ассета — сохранённые
резервные размеры оборудования (по умолчанию 1×1×1 м).
`device_id` **целиком отсутствует** у не-staff, включая пользователей с ролью admin.
Для `is_staff=true` добавляется `device_id` (строка или null).
В плане только `is_active=true`; зоны отсортированы по order/code, оборудование — по code.
Статус всегда `unknown`, телеметрии нет.

`pos.z` — северная координата плана; преобразование в Three.js выполняет frontend,
сервер возвращает положительные плановые координаты. См. [COORDINATES.md](COORDINATES.md).
`model_rotation_deg` исправляет ориентацию только GLB, не влияет на оборудование.

### GET и PUT /api/v1/plan-walls/?zone=<id>

Стены и колонны плана зоны. `zone` — поле `id` зоны из `/plan/`, координаты — в системе чертежа двойника ([COORDINATES.md](COORDINATES.md)). GET доступен operator, engineer, admin; PUT — engineer и admin, в плане это поле `can_edit_walls`.

```json
{"zone": 3, "version": 2, "updated_by": "ivan", "updated_at": 1792665651.25,
 "data": {"walls": [{"id": "W0001", "x1": 0, "z1": 0, "x2": 5.5, "z2": 0, "t": 0.25, "kind": "outer"}],
          "columns": [{"id": "C0001", "x": 6, "z": 0}], "seq": 1}}
```

`version: 0` и `data: null` означают, что на сервере стен ещё нет и клиент показывает стены проекта. `kind`: `outer`, `inner`, `new`, `partition`.

Запрос PUT: `{"base_version": 2, "data": {...}}`. Ответ 200 — новая версия в том же формате. Если `base_version` устарела — **409** с кодом `version_conflict`, ничего не сохраняется. 400 — неверный формат. `?version=<N>` в GET отдаёт сохранённую версию.

### GET /api/v1/plan-walls/history/?zone=<id>

Последние 20 версий без данных: `[{"version": 2, "walls": 533, "columns": 196, "updated_by": "ivan", "updated_at": 1792665651.25}]`. Загрузка из файла: `python manage.py import_walls <файл.json> <id или код зоны>`.

### GET /api/v1/assets/

Те же права чтения. Ответ 200 — массив объектов того же формата, что `asset` выше,
включая ассеты без файла (`url:null`). Каталог общий для всех заводов.

### GET /api/v1/equipment/?zone=main

Те же права чтения. Ответ 200 — массив объектов оборудования того же формата,
что внутри плана. Список включает неактивные записи для администрирования.
Фильтр zone — точное совпадение кода зоны; неизвестный код даёт пустой список.
Если код зоны используется несколькими заводами, фильтр охватывает все совпадения.

### GET /api/v1/equipment/<code>/

Те же права. Ответ 200 — объект оборудования; неизвестный код — 404.

### POST /api/v1/equipment/

Только роль admin или активный superuser. Запрос:

```json
{"code":"oven-11","name":"Печь 11","type":"oven","zone":"main",
 "asset":null,"pos_x":40,"pos_y":0,"pos_z":65.5,"rotation_deg":180,"is_active":true}
```

Обязательны code/name/type/zone; координаты и угол по умолчанию 0, asset=null,
is_active=true. zone/type/asset задаются кодами. Неоднозначный код зоны — 400.
Ответ 201 — объект оборудования формата GET. Сигналы создаются по шаблонам типа.

### PUT / PATCH / DELETE /api/v1/equipment/<code>/

Только admin/superuser. PUT — полный набор обязательных полей, PATCH — частичное
обновление; ответ 200 в формате GET. DELETE — 204 без тела, сигналы удаляются вместе
с оборудованием. Метаданные ассета не меняются через этот API.

Запросы записи с `device_id` отклоняются с 400, даже для staff: физические устройства
привязываются только через админку Django. Права на чтение и staff-флаг независимы.
Ошибки полей — 400, отсутствие JWT — 401, недостаточно прав — 403.

## Импорт JSON

`python manage.py import_equipment data/ovens_import.json [--dry-run]`
Относительный путь ищется сначала от текущей папки, затем от корня plant-twin.
Формат:

```json
{"equipment":[
  {"code":"oven-1","name":"Печь MIWE 1","type":"oven","asset":"oven","zone":"main",
   "pos_x":19,"pos_y":0,"pos_z":60.3,"rotation_deg":0,"device_id":null}
]}
```

Обязательны code/name/type/zone/pos_x/pos_z. Отсутствующие необязательные поля
сохраняют старые значения; у новых объектов pos_y/rotation_deg=0, asset=null.
`asset:null` снимает явную ссылку, после чего действует default_asset типа.
`device_id:null` или отсутствие поля сохраняет привязку. Ненулевой device_id допустим
только если уже совпадает с записью: новые привязки/перепривязки делаются в админке.
Так разрешено противоречие между наличием device_id в формате импорта и правилом
«привязка только в админке».

По коду создаётся или обновляется запись. Повторный запуск не дублирует станки и
сигналы. Ошибки перечисляются с номерами строк массива (с 1), весь файл откатывается.
Счётчики при ошибке показывают 0 сохранённых записей. Dry-run выводит планируемые
счётчики и откатывает все изменения, включая сигналы. Коды zone/type/asset должны
существовать; неоднозначный код зоны считается ошибкой.
Предыдущий формат массива с id/x_m/y_m заменён этим форматом.

## Файлы

Zone: `.glb` до 50 МБ в `MEDIA_ROOT/models/`. Asset: `.glb` до 20 МБ в
`MEDIA_ROOT/assets/`; отсутствие файла допустимо и включает запасную коробку.
Метры, +Y вверх, самодостаточный GLB без внешних текстур. Draco/KTX2 пока не подключены.
В DEBUG `/media/` доступен без JWT; production-раздача файлов требует отдельной настройки.
Масштаб GLB сохраняется; размеры Asset используются для запасной коробки, не для
масштабирования исходной геометрии. У текущего oven.glb реальная высота около 2.6 м,
а запрошенная высота запасной коробки — 1.9 м.

## Ошибки

Обработанные ошибки REST API имеют единый формат:

```json
{"error":{"code":"authentication_failed","message":"Описание ошибки"}}
```

| HTTP | code |
| --- | --- |
| 400 | validation_error |
| 401 | authentication_failed |
| 403 | permission_denied |
| 404 | not_found |
| 409 | version_conflict |
| 405 | method_not_allowed |
| 406 | not_acceptable |
| 415 | unsupported_media_type |
| 429 | throttled |

`message` — строка; клиент принимает решения по `code`. Для ошибок полей
возвращается первая ошибка с именем поля. Формат относится к REST API,
не к HTML-страницам Django admin или отладочным страницам Django.

## Схема и Swagger

`GET /api/schema/` — OpenAPI; `GET /api/docs/` — Swagger UI.
В Swagger нажмите **Authorize** и вставьте только access, без префикса Bearer.
Swagger подставит префикс автоматически. Токен не сохраняется между загрузками страницы.

Используется стандартная JWT-аутентификация и представления
[SimpleJWT](https://django-rest-framework-simplejwt.readthedocs.io/en/stable/getting_started.html).
