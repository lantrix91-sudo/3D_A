# API цифрового двойника

Контракт восстановлен из `plant-twin/backend/{config,accounts,plants,rounds}/urls.py`, EquipmentViewSet, сервисов и ASGI. Обновлено 06.11.2026 после исправлений I6/I10/I11/I13. Это описание реализации, не проект будущего API. Примеры иллюстративные: коды, ID, время и URL нужно заменить данными своей базы. Тела ответов не снимались с работающего сервера.

## Общие правила

- База HTTP: `http://localhost:8000`; ниже бизнес-пути начинаются с `/api/v1/`. Завершающий `/` обязателен для предсказуемой отправки POST/PUT/PATCH.
- JSON: `Content-Type: application/json`. JWT: `Authorization: Bearer <access>`.
- `O` = operator/engineer/admin; `E` = engineer/admin; `A` = admin. Активный superuser проходит все эти проверки. `U` = любой активный аутентифицированный пользователь.
- Коды оборудования/типов/ассетов — строки. ID маршрутов, пунктов чек-листа, зон стен — числа. Фильтр `equipment/?zone=` принимает **код**, `plan-walls/?zone=` — **ID**.
- Числовые времена — Unix-секунды, включая дробную часть; календарные даты — `YYYY-MM-DD`. Сегодня определяется TIME_ZONE сервера. JavaScript Date требует умножить Unix-время на 1000.
- Списки возвращаются массивами, не `{results, count}`; общей пагинации нет. У историй есть limit, но нет курсора.
- Фото отправлять multipart, повторяя поле **`photos`**, не `photos[]`: код использует `request.FILES.getlist('photos')`. Content-Type с boundary формирует браузер.
- OPTIONS обслуживается DRF, HEAD у представлений с GET следует GET без тела; отдельной бизнес-логики нет. Проверка ролей у некоторых APIView зависит от точного GET, поэтому OPTIONS/HEAD могут требовать E. Не использовать OPTIONS вместо явно описанного контракта.

Обработанные ошибки DRF:

```json
{"error":{"code":"validation_error","message":"equipment: Укажите код оборудования."}}
```

Типичные статусы: 400 — неверный запрос, 401 — отсутствует/истёк токен, 403 — роль не подходит, 404 — объект отсутствует, 405 — метод отсутствует, 409 — конфликт версии стен. Обычные 500 и ответы прокси могут быть не JSON. `config/exceptions.py` оставляет только первую ошибку в message.

## Полный реестр прикладных HTTP-маршрутов

Все пути таблицы относительно `/api/v1`.

| Метод | Путь | Доступ | Вход | Ответ |
|---|---|---|---|---|
| POST | `/auth/login/` | Без JWT | username, password | 200 access, refresh |
| POST | `/auth/refresh/` | Refresh в теле | refresh | 200 новая пара токенов |
| GET | `/auth/me/` | U | Нет | 200 id, username, roles |
| GET | `/plan/` | O | ?plant=код, необязательно | 200 план и capability-флаги |
| GET | `/assets/` | O | Нет | 200 Asset[] |
| GET | `/equipment/` | O | ?zone=код, необязательно | 200 Equipment[]; включая неактивное |
| POST | `/equipment/` | A | EquipmentWrite | 201 Equipment |
| GET | `/equipment/{code}/` | O | Нет | 200 Equipment |
| PUT | `/equipment/{code}/` | A | EquipmentWrite | 200 Equipment |
| PATCH | `/equipment/{code}/` | A | Частичный EquipmentWrite | 200 Equipment |
| DELETE | `/equipment/{code}/` | A | Нет | 204, архивирование без удаления истории |
| GET | `/equipment/{code}/card/` | O | Нет | 200 паспорт, сигналы, документы, события |
| GET | `/equipment/{code}/conditions/` | O | ?limit=50, ограничен 1–200 | 200 ConditionEvent[] |
| POST | `/equipment/{code}/conditions/` | E | condition, comment?, photos? | 201 ConditionEvent |
| POST | `/equipment/{code}/image/` | E | multipart image, source | 200 картинка |
| GET | `/equipment/{code}/readings/` | O | ?hours=1, целое 1–24 | 200 минутные серии |
| GET | `/plan-walls/` | O | ?zone=ID; ?version=N опционально | 200 Walls |
| PUT | `/plan-walls/` | E | ?zone=ID; base_version, data | 200 Walls или 409 |
| GET | `/plan-walls/history/` | O | ?zone=ID | 200 история версий |
| POST | `/readings/` | X-Device-Key | Пакет устройства | 201 новый / 200 дубль |
| GET | `/rounds/today/` | O | ?route=ID опционально | 200 сегодняшний маршрут |
| GET | `/rounds/routes/` | O | Нет | 200 Route[] |
| POST | `/rounds/routes/` | E | name, is_active?, order?, stops? | 201 Route |
| GET | `/rounds/routes/{id}/` | O | Нет | 200 Route |
| PATCH | `/rounds/routes/{id}/` | E | Частичные поля маршрута | 200 Route |
| DELETE | `/rounds/routes/{id}/` | E | Нет | 204, без тела |
| PUT | `/rounds/routes/{id}/stops/` | E | equipment: список кодов либо сам список | 200 Route |
| GET | `/rounds/inspections/` | O | ?equipment=код обязательно; ?limit=30, 1–200 | 200 Inspection[] |
| POST | `/rounds/inspections/` | E | Осмотр JSON/multipart | 201 новый / 200 дубль |

PUT маршрута, GET stops отдельно, PATCH/DELETE осмотра, REST CRUD заводов/зон/типов/чек-листов/документов, tickets, maintenance и logout **не найдены**. Используется Django admin либо будущая разработка.

## Вход и профиль

```http
POST /api/v1/auth/login/
Content-Type: application/json

{"username":"engineer1","password":"<пароль пользователя>"}
```

```json
{"access":"<JWT access>","refresh":"<JWT refresh>"}
```

Refresh-запрос: `POST /api/v1/auth/refresh/` с `{"refresh":"<текущий refresh>"}`. Ответ той же формы; **сохранить новый refresh**. Старый после ротации не использовать. Сроки по умолчанию 15 минут/7 дней.

`GET /api/v1/auth/me/` без тела:

```json
{"id":7,"username":"engineer1","roles":["engineer"]}
```

roles — реально назначенные группы, не полный расчёт прав. Superuser без групп может получить `[]`. Полей is_superuser/is_staff в профиле нет. Для прав на план использовать capability-флаги.

## Оборудование, ассеты, план

Asset (ответ `/assets/` — массив таких объектов; имя Asset.name в ответ не включено):

```json
{"code":"oven-model","url":"http://localhost:8000/media/assets/oven.glb","led_node_name":"led","rotation_speed_deg_s":0,"animation_node_name":"","size":{"x":2,"y":2.5,"z":2}}
```

Equipment (общее тело GET/POST/PUT/PATCH):

```json
{"code":"oven-1","name":"Печь 1","type":"oven","zone":"hall","asset":null,"pos":{"x":3,"y":0,"z":4},"rotation_deg":0,"status":"unknown","is_active":true,"last_seen":null,"key_signals":["temperature"],"condition":"working","has_telemetry":false,"size":{"x":1,"y":1,"z":1},"image":null,"image_source":null,"image_updated_at":null,"offline_seconds":180}
```

`asset` — объект выше либо null. Только is_staff дополнительно получает `device_id` (строка либо null). `status` вычисляет effective_status с таймаутом. `asset` в ответе — итоговый ассет, в запросе — код либо null (взять умолчание типа).

Создание:

```http
POST /api/v1/equipment/
Authorization: Bearer <access-admin>
Content-Type: application/json

{"code":"oven-1","name":"Печь 1","zone":"hall","type":"oven","asset":null,"pos_x":3,"pos_y":0,"pos_z":4,"rotation_deg":0,"is_active":true}
```

Обязательны code/name/zone/type, справочники должны существовать. Остальные поля модели имеют умолчания. `EquipmentWriteSerializer` принимает только `code,name,zone,type,asset,pos_x,pos_y,pos_z,rotation_deg,is_active`. Паспорт, размеры, device_id и сигналы управляются в admin; попытка передать device_id явно отклоняется. Не рассчитывать, что все неизвестные поля будут отклонены: сериализатор не реализует строгую проверку лишних полей.

Пример PATCH: `{"pos_x":5,"pos_z":6,"rotation_deg":90}`. В update координаты проверяются по size_x/size_z зоны, угол 0–360; менять pos_y существующего объекта нельзя. PUT требует обязательные поля сериализатора, но не является гарантированным сбросом всех необязательных полей к умолчаниям. POST и смена зоны без координат также проверяют итоговую позицию. Если размеры зоны не заданы, создание/перемещение/смена зоны отклоняются.

`GET /equipment/?zone=hall` возвращает массив Equipment; `GET /equipment/oven-1/` — объект. `DELETE` выставляет is_active=false и возвращает 204, включая повторный вызов. История и шаги маршрутов сохраняются. Для восстановления admin отправляет PATCH `{"is_active":true}`. Архив доступен через GET equipment; в plan и отображаемых маршрутах архивных станков нет. В Django admin физическое удаление (одиночное/массовое) запрещено при наличии Reading, Inspection или ConditionEvent.

`GET /plan/?plant=bakery`:

```json
{"plant":{"code":"bakery","name":"Цех"},"zones":[{"id":1,"code":"hall","name":"Зал","model_url":null,"offset":{"x":0,"z":0},"rotation_deg":0,"model_rotation_deg":0,"visible_by_default":true,"size_x":30,"size_z":20,"plan_offset":{"x":0,"z":0},"plan_rotation_deg":0,"equipment":[]}],"can_edit_layout":false,"can_change_condition":true,"can_change_image":true,"can_edit_walls":true}
```

В equipment вложены объекты Equipment **только активного** оборудования. Без plant выбирается первый завод по code. Если заводов нет: plant=null, zones=[], capability-флаги всё равно добавляются. Неизвестный явно заданный plant → 404. `/equipment/` не ограничен выбранным заводом; одинаковые коды зон разных заводов неоднозначны при записи.

## Карточка, состояние, фото, история показаний

`GET /equipment/oven-1/card/`:

```json
{"code":"oven-1","name":"Печь 1","zone":{"code":"hall","name":"Зал"},"type":{"code":"oven","name":"Печь"},"image":null,"image_source":null,"image_updated_at":null,"condition":"working","condition_changed_at":null,"status":"unknown","has_telemetry":false,"last_seen":null,"passport":{"manufacturer":"","model":"","serial_number":"","inventory_number":"","commissioned_on":null,"service_contact":"","notes":""},"signals":[{"key":"temperature","name":"Температура","unit":"°C","kind":"number","min":null,"max":null,"nominal":null}],"documents":[],"events":[],"conditions":[{"value":"working","label":"Работает"},{"value":"idle","label":"Простой"},{"value":"faulty","label":"Неисправно"},{"value":"maintenance","label":"На ТО"},{"value":"repair","label":"В ремонте"},{"value":"decommissioned","label":"Выведено из работы"}],"offline_seconds":180,"is_active":true}
```

Документ: `{"title":"Инструкция","url":"https://files.example/manual.pdf"}`. events содержит последние 10 ConditionEvent. Значения сигналов здесь не передаются: только определения. В карточке, плане и WS status вычисляется через effective_status. Без устройства и измерений — unknown. Во всех трёх форматах передаются last_seen (Unix-секунды/null) и offline_seconds (таймаут типа либо STATUS_OFFLINE_SECONDS); WS сохраняет ts как совместимый псевдоним last_seen. Карточка также содержит is_active. Между WS-обновлениями браузер досчитывает offline по этим полям, с условием now - last_seen > offline_seconds.

`POST /equipment/oven-1/conditions/` JSON `{"condition":"repair","comment":"Замена привода"}` либо multipart с теми же строками и до 5 полей photos. Ответ 201:

```json
{"id":15,"condition":"repair","previous":"faulty","comment":"Замена привода","source":"manual","actor":"engineer1","created_at":1793836800,"photos":[]}
```

Повтор того же состояния всё равно создаёт событие. `comment` до 2000 символов, фото до 10 МБ каждое. GET conditions без тела возвращает массив таких событий, новые первыми; limit default 50, значения вне 1–200 зажимаются, нечисловое → 400.

`POST /equipment/oven-1/image/`: FormData `image=<JPEG/PNG/WebP файл>`, `source=photo` либо `render`; до 10 МБ. Ответ 200:

```json
{"code":"oven-1","image":"http://localhost:8000/media/equipment-images/oven-1-example.jpg","image_source":"photo","image_updated_at":1793836800}
```

`GET /equipment/oven-1/readings/?hours=1`:

```json
{"equipment":"oven-1","start":1793833200,"end":1793836800,"bucket_seconds":60,"series":[{"key":"temperature","name":"Температура","unit":"°C","points":[{"x":1793836740,"y":180,"min":179,"max":181}]}]}
```

Только number-сигналы. x — начало минуты в секундах, y — среднее исправных измерений; min/max — экстремумы. Если в минуте только неисправные измерения, агрегаты null. Пустые минуты не вставляются. hours default 1, вне 1–24 → 400.

## Стены

`GET /plan-walls/?zone=1` при отсутствии сохранённых стен:

```json
{"zone":1,"version":0,"data":null,"updated_by":null,"updated_at":null}
```

data=null означает «нет серверной геометрии», а не пустой список стен. Клиент может показать встроенный чертёж.

`PUT /plan-walls/?zone=1`:

```json
{"base_version":0,"data":{"walls":[{"id":"w1","x1":0,"z1":0,"x2":10,"z2":0,"t":0.2,"kind":"outer"}],"columns":[{"id":"c1","x":2,"z":3}],"seq":2}}
```

Ответ 200; data равно принятому объекту:

```json
{"zone":1,"version":1,"data":{"walls":[{"id":"w1","x1":0,"z1":0,"x2":10,"z2":0,"t":0.2,"kind":"outer"}],"columns":[{"id":"c1","x":2,"z":3}],"seq":2},"updated_by":"engineer1","updated_at":1793836800}
```

`kind`: outer/inner/new/partition; t > 0 и <= 5; координаты конечные в ±10000 м; до 5000 стен и отдельно колонн; id непустой до 32 символов, уникален внутри своего списка; seq — целое >=0. В data и элементах набор полей строгий. base_version — текущая версия GET; несовпадение → 409 `error.code=version_conflict`. После конфликта прочитать серверную версию и предложить пользователю разрешение, а не бесконечно перезаписывать.

`GET /plan-walls/history/?zone=1`:

```json
[{"version":1,"walls":1,"columns":1,"updated_by":"engineer1","updated_at":1793836800}]
```

До 20 последних версий. `GET /plan-walls/?zone=1&version=1` возвращает обычный Walls для сохранённой версии, отсутствующая → 404. Отдельного restore нет: загрузить старые data и PUT с **текущей** base_version.

## Приём данных устройств

JWT не используется: `X-Device-Key: <выданный ключ>`. AllowAny у View не означает открытый доступ: ключ проверяется вручную. Исключения: оборудование со снятой галочкой «Требовать ключ устройства» (`require_device_key=false`) и явно включённый ALLOW_UNAUTHENTICATED_DEVICES при DEBUG=true. В обоих случаях запрос принимается только без заголовка; переданный неверный ключ всегда даёт 401. См. [TELEMETRY.md](TELEMETRY.md#ключи-устройств).

```http
POST /api/v1/readings/
X-Device-Key: <ключ устройства>
Content-Type: application/json

{"device_id":"esp32-1","ts":1793836800,"seq":42,"values":{"state":"run","temperature":180},"faults":[]}
```

Ключи values/faults — **Signal.device_key**, а в выдаче WS — Signal.key. Привязка device_id и сигналы должны существовать. ts можно опустить: используется время сервера; для надёжного повтора сохранять ts или seq. seq — целое 0 <= seq < 2^63. При перезапуске устройства сброс seq может пересечься с уже принятым номером. Время не старше 7 дней и не более чем на 5 минут впереди. number — конечное число, bool — true/false либо 0/1, state — строка до 64 символов либо целое. Неизвестные поля и сигналы отклоняются; faults помечает неисправность датчика.

Ответ 201 (либо 200 с duplicate=true):

```json
{"equipment":"oven-1","duplicate":false,"status":"run","written":2}
```

written — число записанных Reading, а не обязательно число переданных values. Дедупликация по оборудованию и seq; без seq — по времени. Новый пакет может не записать историю, если значения не изменились и интервал ещё не прошёл.

Пакетный запрос, 1–500 записей одного устройства:

```json
{"device_id":"esp32-1","readings":[{"ts":1793836740,"seq":41,"values":{"temperature":179}},{"ts":1793836800,"seq":42,"values":{"temperature":180}}]}
```

```json
{"equipment":"oven-1","accepted":2,"duplicates":0,"status":"run","results":[{"index":0,"duplicate":false},{"index":1,"duplicate":false}]}
```

201 если есть новые записи, иначе 200. Весь пакет транзакционный; любая ошибка отклоняет его. Обрабатывается по времени, results соответствует исходным индексам. Характерные error.code: device_key_missing/device_key_invalid (401), unknown_device (404), invalid_format, invalid_value, unknown_signal, ts_out_of_range, batch_too_large (400).

## Мобильное приложение: маршруты и осмотры

### Маршруты

`GET /rounds/routes/` — массив Route, включая неактивные. `GET /rounds/routes/1/` — один Route:

```json
{"id":1,"name":"Утренний обход","is_active":true,"order":0,"updated_at":1793836800,"stops":[{"position":0,"equipment":"oven-1","name":"Печь 1","zone":"Зал","is_active":true,"condition":"working"}]}
```

zone здесь **название**, не код. Архивные станки скрыты в stops, но RouteStop остаются в базе; позиции не перенумеровываются. PATCH оборудования с is_active=true возвращает шаг в выдачу. POST routes: `{"name":"Утренний обход","is_active":true,"order":0,"stops":["oven-1"]}` → 201 Route. PATCH routes/1: `{"name":"Обход печей"}` → 200 Route. name непустое до 120, order целое >=0, is_active boolean. Не переданные PATCH-поля остаются прежними.

PUT routes/1/stops: `{"equipment":["oven-1","oven-2"]}` (или `["oven-1","oven-2"]`) → 200 Route. Полностью заменяет порядок, пустой список разрешён; дубли/неизвестные коды → 400. DELETE routes/1 → 204; осмотры остаются.

`GET /rounds/today/?route=1`:

```json
{"date":"2026-11-05","time_zone":"Asia/Qyzylorda","route":{"id":1,"name":"Утренний обход"},"route_equipment":["oven-1"],"inspected":[],"total":1,"done":0,"stops":[{"equipment":"oven-1","name":"Печь 1","zone":"Зал","type":"Печь","condition":"working","checklist":[{"id":3,"text":"Проверить привод"}],"image":null,"image_source":null,"image_updated_at":null,"inspection":null}],"can_change_image":true}
```

Без route выбирается первый активный по order/id; если активных нет, возвращается всё активное оборудование, кроме decommissioned, route=null. Явный ID не проверяется на is_active. В stops только подходящее активное оборудование. `inspection` — последний осмотр за сегодняшний день; done общий для всех инженеров. `route_equipment` и `inspected` учитывают все маршруты/осмотры дня, а не только выбранный маршрут. Это **не назначенное пользователю задание**.

### Заполнение обхода

`POST /rounds/inspections/`, JSON без фото:

```json
{"client_id":"f96af628-2e31-450a-a048-131783ce364a","equipment":"oven-1","inspected_at":1793836800,"result":"remark","answers":[{"item":3,"result":"remark","note":"Шум","text":"Проверить привод"}],"comment":"Проверить крепление"}
```

Для реальной отправки заменить inspected_at текущим временем. multipart: те же поля строками, answers — JSON-строка, photos — повторяющееся файловое поле. В JSON также принимаются числовая строка inspected_at и JSON-строка answers; после разбора answers обязан быть списком объектов. Неверная структура/тип/время возвращают 400 в едином error-формате. Повтор принятого UUID разрешён и после 48 часов. UUID создаётся **до помещения в очередь**, при повторе не меняется.

Ответ 201:

```json
{"id":12,"client_id":"f96af628-2e31-450a-a048-131783ce364a","equipment":"oven-1","inspected_at":1793836800,"inspector":"engineer1","result":"remark","answers":[{"item":3,"text":"Проверить привод","result":"remark","note":"Шум"}],"comment":"Проверить крепление","photos":[],"duplicate":false,"condition":"working"}
```

Повтор client_id возвращает 200, duplicate=true и существующий осмотр. Сейчас совпадение автора и содержимого повтора не проверяется. Обычная форма Inspection — тот же ответ **без duplicate и condition**; её возвращает GET inspections и поле inspection в today.

Ограничения:

- inspected_at обязателен: конечное число либо числовая строка для совместимости очереди; boolean/объект/список запрещены; не старше 48 часов и не более 5 минут в будущем.
- equipment — существующий код, client_id — UUID. Проверки принадлежности назначенному маршруту нет.
- result: ok/remark/fault, при отсутствии — ok. Сервер повышает итог до худшего результата answers.
- answers: до 100 объектов `{item, result, note?, text?}`; item — положительное целое (не boolean), result/note/text — строки; note до 500, text до 300. Актуальный текст берётся из чек-листа, для удалённого/неизвестного item берётся присланный text, до 300.
- Полнота обязательного чек-листа и уникальность item не проверяются; пустые answers разрешены.
- comment до 2000; максимум 5 фото по 10 МБ; jpg/jpeg/png/webp/heic/heif.
- fault меняет working/idle на faulty с историей; более позднюю смену состояния запоздалый осмотр не перезаписывает. ok не закрывает неисправность.

`GET /rounds/inspections/?equipment=oven-1&limit=30` — массив Inspection, новые первыми. Без equipment → 400; неизвестный код → пустой массив. limit ограничивается 1–200. Фильтров по дате/инженеру/маршруту и постраничного обхода всей истории нет.

### Что мобильному клиенту уже доступно и чего нет

Существующий `mobile/src/api/client.js` использует вход/refresh, маршруты/today, осмотры, card, conditions GET, image POST. Базовый обход с фото и офлайн-повтором уже реализуем по этому API.

Не найдены: назначенные задания с исполнителем/сменой/сроком; отдельная сессия прохождения маршрута и её start/finish; заявки на ремонт с ответственным, приоритетом, статусами и связью с осмотром; ППР; серверный logout; API правки чек-листов и их версии; курсорная синхронизация и пагинация истории; отдельный справочник типов; права по предприятию. Эти возможности нельзя считать существующими эндпоинтами. План доработок — [AUDIT.md](AUDIT.md).

## WebSocket

`ws://localhost:8000/ws/v1/live/?token=<access>` (в production wss). Требуется O; cookie-сессия не используется. Подключение только на чтение. Origin сервер не проверяет. Коды закрытия: 4401 — обновить access и переподключиться, 4403 — нет роли.

Первое сообщение:

```json
{"type":"snapshot","equipment":[{"equipment":"oven-1","status":"run","condition":"working","values":{"state":"run","temperature":180},"faults":[],"signals":{"state":{"name":"Состояние","unit":"","kind":"state"},"temperature":{"name":"Температура","unit":"°C","kind":"number"}},"ts":1793836800,"last_seen":1793836800,"offline_seconds":180}]}
```

Далее тот же объект станка с `"type":"update"` на верхнем уровне. snapshot включает всё активное оборудование, не фильтруется по пользователю или заводу. values: число/boolean/строка/null, faults — список ключей, signals — метаданные. ts — время последних данных устройства, не время отправки WS.

Дополнительные события:

```json
{"type":"inspection","equipment":"oven-1","result":"remark","inspected_at":1793836800,"date":"2026-11-05"}
```

```json
{"type":"route_changed","route":1}
```

Клиентское `{"type":"ping"}` → `{"type":"pong"}`. События маршрутов требуют перечитать HTTP. Долговременного журнала/replay WS нет. Новый 3D-клиент обрабатывает только snapshot/update.

## Служебные маршруты

| Метод/путь | Доступ и формат |
|---|---|
| GET/HEAD `/health/` | Публичный, без параметров; 200 `{"status":"ok"}`; не проверяет зависимости |
| GET `/api/schema/` | Генератор drf-spectacular, YAML/OpenAPI по умолчанию; формат выбирается renderer/Accept. В собственном settings нет переопределения SERVE_PERMISSIONS, стандартный spectacular AllowAny; это не бизнес-данные |
| GET `/api/docs/` | Swagger HTML, не JSON; по стандартному spectacular AllowAny. Наличие страницы не отменяет JWT на бизнес-методах |
| `/admin/` | HTML-интерфейс Django: login/logout, CRUD зарегистрированных моделей; session + CSRF + is_staff и Django permissions. Не мобильный REST-контракт |
| GET `/media/{path}` | Добавлен URLconf только при DEBUG; без JWT. В production URL строит storage/S3 либо внешний сервер файлов |
| GET `/static/{path}` | Статика WhiteNoise / dev staticfiles; не бизнес-API |

Часть схем spectacular помечена `request=dict/responses=dict`: автоматическая схема не описывает все поля осмотров/карточек/телеметрии. Для реализации клиента использовать этот документ совместно с сервисами, а не только Swagger.
