# Исправления по ревизии — 06.11.2026

## Результат

- **I13:** DELETE оборудования сохраняет запись с `is_active=false` и возвращает 204. В 3D-клиенте действие называется «В архив»; список «Архив» открывает карточку с кнопкой «Вернуть из архива» (`PATCH is_active=true`). Права архивирования и восстановления совпадают. Django admin разрешает одиночное и массовое физическое удаление только без показаний, осмотров и событий состояния; иначе показывает причину. Архивные шаги скрыты в выдаче маршрутов, но остаются в БД и возвращаются после восстановления оборудования.
- **I6:** plan/card/WS возвращают серверный статус, `last_seen` и `offline_seconds` с учётом типа оборудования. Карточка использует `effective_status`. Браузер между обновлениями рассчитывает устаревание по этим полям; `VITE_STALE_SECONDS` удалён из кода и примера окружения. Этот расчёт не зависит от Redis или watchdog. Старое поле WS `ts` сохранено для совместимости.
- **I10:** вход осмотра проверяется сериализаторами. Некорректные тела, вложенные ответы и даты дают 400 в формате `error.code/message`. Исправлена обработка вложенной ошибки после корректного элемента списка. Проверен мобильный клиент: он передаёт время строкой и сериализует answers в JSON-строку; оба формата сохранены, в том числе для multipart с фотографиями. Числовые строки времени принимаются. Окно приёма остаётся 48 часов назад / 5 минут вперёд; повтор уже принятого client_id допускается после истечения окна.
- **I11:** создание оборудования и смена зоны проверяют итоговые координаты и угол, включая координаты существующей записи, если их нет в PATCH. Недопустимая позиция не сохраняется.

Модели обходов и миграции не менялись. Остальные замечания ревизии, включая проверку автора при повторе client_id, версии перемещений и журналирование через admin, остаются отдельными задачами.

## Изменённые файлы

Пути приложения ниже относительно `plant-twin/`. Перечислены файлы этой задачи, а не все ранее существовавшие изменения рабочего дерева.

**Бэкенд:**

- `backend/config/exceptions.py`
- `backend/equipment/admin.py`
- `backend/equipment/conditions.py`
- `backend/equipment/live.py`
- `backend/equipment/serializers.py`
- `backend/equipment/services.py`
- `backend/equipment/views.py`
- `backend/plants/serializers.py`
- `backend/rounds/serializers.py` — новый файл
- `backend/rounds/services.py`
- `backend/rounds/views.py`

**Тесты бэкенда:**

- `backend/tests/test_equipment_archive.py` — новый файл
- `backend/tests/test_status_contract.py` — новый файл
- `backend/tests/test_conditions.py`
- `backend/tests/test_live.py`
- `backend/tests/test_moves.py`
- `backend/tests/test_rounds.py`

**Фронтенд:**

- `frontend-twin/.env.example`
- `frontend-twin/src/api/client.ts`
- `frontend-twin/src/api/config.ts`
- `frontend-twin/src/api/types.ts`
- `frontend-twin/src/services/planMapper.ts`
- `frontend-twin/src/services/planMapper.test.ts`
- `frontend-twin/src/services/serverHub.ts`
- `frontend-twin/src/services/telemetryHub.ts`
- `frontend-twin/src/ui/EquipmentArchive.tsx` — новый файл
- `frontend-twin/src/ui/EquipmentList.tsx`
- `frontend-twin/src/ui/card/EquipmentCard.tsx`

**Документация в корне рабочего пространства:**

- `docs/API.md`
- `docs/BACKEND.md`
- `docs/FRONTEND.md`
- `docs/SETUP.md`
- `docs/AUDIT.md`
- `docs/BACKEND_FIXES.md` — этот отчёт

## Фактические проверки

| Проверка | Результат |
|---|---|
| Полный pytest бэкенда | **315 passed, 243 warnings**, 14,51 с, код завершения 0 |
| `npm.cmd run typecheck` | **Успешно**, код завершения 0 |
| `npm.cmd test` | **40 passed**, 2 файла тестов, код завершения 0 |

Pytest запускался из `plant-twin/backend` через `.venv/Scripts/python.exe -m pytest -q --tb=short --basetemp=<уникальная папка в plant-twin/.qa>`. Уникальная папка обходит ошибку доступа к системному каталогу pytest. Использованы тестовые настройки и тестовая БД; рабочие данные не изменялись.

Предупреждения pytest относятся к устаревающим API зависимостей Daphne/asyncio и drf-spectacular, а также отсутствующей папке staticfiles. Они не помешали тестам. Проверены HTTP-сценарии admin, сохранение истории/шагов маршрута, права, восстановление, совпадение статусов, WebSocket-поля, границы позиции и негативный JSON, включая ошибки преобразования времени и настоящий формат mobile. Во фронтенде проверен расчёт по серверному таймауту и last_seen.

Ручной проход интерфейса в браузере и тестирование на физическом мобильном устройстве не выполнялись.
