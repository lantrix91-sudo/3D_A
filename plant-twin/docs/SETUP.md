# Запуск с нуля на Windows

Команды для PowerShell, корень `E:\3D_project_bakery`. Это инструкция по исходникам, не отчёт об успешном запуске: при ревизии зависимости не устанавливались, миграции/серверы не запускались. На имеющейся рабочей копии не перезаписывайте свои `.env` примерами.

## Требования

- Python 3.14 — версия из backend/Dockerfile. Отдельного ограничения версии локального Python не найдено.
- Node 22.12+ в ветке 22 — соответствует engines Vite/Vitest из lock-файлов обоих клиентов; npm.
- Для локального старта достаточно SQLite. Для WebSocket между разными процессами — Redis; при DEBUG=false он обязателен. Версии Redis/PostgreSQL проект не фиксирует.
- Исходники, GLB в `frontend-twin/models/` и ресурсы `src/assets/`. Данные `data/` и `backend/media/` в основном исключены из Git: из чистого clone они не восстанавливаются автоматически.

## Django

```powershell
Set-Location E:\3D_project_bakery\plant-twin\backend
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Полученный случайный секрет вставьте в `.env` локально. В документах и Git его не хранить. Активация venv необязательна: команды ниже используют точный путь к Python.

Минимальный `.env` для разработки:

```dotenv
SECRET_KEY=<сгенерированный секрет не короче 50 символов>
DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1
LOCAL_IP=
CSRF_TRUSTED_ORIGINS=http://localhost:8000,http://localhost:5174,http://localhost:5175
CORS_ALLOWED_ORIGINS=http://localhost:5174,http://localhost:5175
DATABASE_URL=sqlite:///db.sqlite3
REDIS_URL=
ALLOW_UNAUTHENTICATED_DEVICES=false
TIME_ZONE=Asia/Qyzylorda
```

Угловые скобки здесь обозначают место для своего значения. В `.env.example` указаны нейтральные origins для портов 5174 и 5175; LOCAL_IP оставлен пустым. CORS нужен при прямом обращении с другого origin; через Vite proxy браузер обращается к своему origin, но CSRF нужен для admin через прокси.

```powershell
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Админка: `http://localhost:8000/admin/`; health: `http://localhost:8000/health/`. Daphne включён в INSTALLED_APPS, runserver использует ASGI для WS. Для телефона в LAN вместо 127.0.0.1 слушайте `0.0.0.0:8000`, задайте свой LOCAL_IP/ALLOWED_HOSTS и адрес компьютера на телефоне; это режим разработки.

Создайте в admin группы `operator`, `engineer`, `admin` и назначьте пользователям. Роль admin API не тождественна is_staff. Для ежедневной работы используйте обычные учётные записи. `create_demo_users` существует, но для запуска приложения не требуется.

В отдельном PowerShell:

```powershell
Set-Location E:\3D_project_bakery\plant-twin\backend
.\.venv\Scripts\python.exe manage.py check_offline --loop 15
```

При пустом REDIS_URL отдельный check_offline обновит БД, но его InMemory-события не попадут в процесс runserver. Для полноценного live задайте обоим процессам `REDIS_URL=redis://127.0.0.1:6379/0` и запустите доступный Redis. Без Redis 3D-клиент досчитывает устаревание по last_seen и offline_seconds сервера; отдельный check_offline для этого не требуется. Способ установки Redis на Windows в проекте не задан.

## Первые данные

Миграции не создают полный рабочий цех. В admin:

1. Создать Plant, Zone; заполнить размеры зоны, смещения и привязку к чертежу. GLB зоны необязательна.
2. Создать Asset с GLB и размерами, EquipmentType с шаблонами сигналов и правилами статуса.
3. Создать Equipment с кодом, зоной, типом, координатами. При сохранении создаются недостающие сигналы.
4. Для устройства назначить device_id и выпустить ключ; без устройства станок может участвовать в обходах.
5. Создать ChecklistItem. Route и шаги сейчас создаются через REST: admin запрещает их редактирование, в новом фронтенде редактор не найден. Без активных маршрутов today показывает всё подходящее оборудование.

Для первого маршрута можно использовать PowerShell (код станка должен существовать):

```powershell
$credential = Get-Credential -Message 'Пользователь engineer/admin API'
$loginBody = @{username=$credential.UserName; password=$credential.GetNetworkCredential().Password} | ConvertTo-Json
$tokens = Invoke-RestMethod -Method Post -Uri 'http://localhost:8000/api/v1/auth/login/' -ContentType 'application/json' -Body $loginBody
$headers = @{Authorization="Bearer $($tokens.access)"}
$routeBody = @{name='Первый обход'; stops=@('oven-1')} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8000/api/v1/rounds/routes/' -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($routeBody))
Remove-Variable credential,loginBody,tokens,headers
```

Необязательный импорт имеющегося файла (типы/зоны должны существовать):

```powershell
.\.venv\Scripts\python.exe manage.py import_equipment ..\data\ovens_import.json --dry-run
.\.venv\Scripts\python.exe manage.py import_equipment ..\data\ovens_import.json
.\.venv\Scripts\python.exe manage.py issue_device_key esp32-1 --name "ESP32 цеха"
```

Команда ключа печатает секрет один раз. Передайте его устройству как X-Device-Key. Импорт не назначает новый device_id. Не запускайте симулятор как часть обычного старта: это отдельный инструмент, который пишет искусственные данные в реальную БД.

## 3D-фронтенд

```powershell
Set-Location E:\3D_project_bakery\plant-twin\frontend-twin
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

В `.env`:

```dotenv
VITE_BACKEND_URL=http://127.0.0.1:8000
VITE_API_URL=
VITE_WS_URL=/ws/
```

Открыть `http://localhost:5174/`. Если порт занят, Vite завершится: strictPort=true. Войти созданным пользователем. Пустой план означает отсутствие данных на сервере, а не неисправность деморежима.

Для воспроизводимой установки по существующему lock-файлу вместо npm install можно использовать `npm.cmd ci`. Проверка/сборка по package.json:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Preview — `http://localhost:4174/`. `build:single` создаёт dist-single, но «один HTML» всё равно требует backend и загружает серверные media: это не автономный двойник.

При отдельном production-домене задайте перед build `VITE_API_URL=https://backend.example`, `VITE_WS_URL=wss://backend.example`; значения встраиваются в сборку. Если оставить `/ws/`, WebSocket пойдёт на домен фронтенда: там должен быть прокси. В dev используются относительные API-адреса независимо от VITE_API_URL. После изменения env перезапустить Vite.

## Мобильный клиент

Он уже есть и запускается отдельно. frontend-twin использует 5174, mobile — 5175. Адрес dev-прокси mobile задаётся через VITE_BACKEND_URL (по умолчанию http://127.0.0.1:8000):

```powershell
Set-Location E:\3D_project_bakery\plant-twin\mobile
npm.cmd install
npm.cmd run dev -- --port 5175
```

Открыть `http://localhost:5175/`. В dev proxy жёстко направлен на `http://127.0.0.1:8000`; VITE_BACKEND_URL тут не читается. Адрес для APK/PWA задаётся экраном настроек или VITE_API_URL при build. В коде есть LAN-адрес по умолчанию, замените его в настройках своим. Для production PWA нужен HTTPS.

```powershell
# В этом окне до сборки; пример адреса, не реальный сервис
$env:VITE_API_URL = 'https://backend.example'
npm.cmd run build
```

Для Android: `npm.cmd run sync`, затем `npm.cmd run open`; требуется Android Studio/SDK. Полную воспроизводимость Android toolchain эта ревизия не проверяла. CORS backend для Capacitor задаётся явно: нужные origins из `http://localhost,https://localhost,capacitor://localhost`. При DEBUG они добавляются автоматически.

## Переменные окружения

Основной перечень — `backend/.env.example`; реальные `.env` сюда не копируются.

| Имена | Назначение / пример |
|---|---|
| SECRET_KEY (совместимость DJANGO_SECRET_KEY) | Случайный секрет >=50 символов, обязательно |
| DEBUG (DJANGO_DEBUG), DJANGO_READ_DOT_ENV | false для production; чтение backend/.env по умолчанию true |
| ALLOWED_HOSTS (DJANGO_ALLOWED_HOSTS), LOCAL_IP | Хосты без схемы/порта; LOCAL_IP добавляется только в debug |
| CSRF_TRUSTED_ORIGINS, CORS_ALLOWED_ORIGINS | Origins со схемой, через запятую |
| DATABASE_URL | sqlite:///db.sqlite3 либо postgresql://user:<password>@host:5432/db |
| REDIS_URL | redis://127.0.0.1:6379/0; обязательно при DEBUG=false |
| STATUS_OFFLINE_SECONDS, READING_MIN_INTERVAL_SECONDS | По умолчанию 180 / 30 секунд |
| STATUS_CHECK_INTERVAL | 15; используется start.sh, не аргумент Windows runserver |
| ALLOW_UNAUTHENTICATED_DEVICES | false; true разрешён только с DEBUG=true |
| DEVICE_API_KEYS | JSON для отдельного simulator; backend проверяет структуру env, но авторизует по DeviceKey в БД |
| MEDIA_ROOT | media относительно backend или абсолютный путь |
| AWS_STORAGE_BUCKET_NAME | Непустое значение включает S3/R2 |
| AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY | Секреты только backend, либо роль IAM |
| AWS_S3_ENDPOINT_URL, AWS_S3_REGION_NAME, AWS_S3_CUSTOM_DOMAIN | Endpoint/регион/CDN, например auto для R2; CDN без схемы |
| AWS_QUERYSTRING_AUTH, AWS_QUERYSTRING_EXPIRE | true / 3600; подпись и время жизни URL |
| TIME_ZONE | Asia/Qyzylorda |
| JWT_ACCESS_MINUTES, JWT_REFRESH_DAYS | 15 / 7 |
| SECURE_SSL_REDIRECT, SECURE_HSTS_SECONDS | По умолчанию зависят от DEBUG |
| SECURE_HSTS_INCLUDE_SUBDOMAINS, SECURE_HSTS_PRELOAD | false по умолчанию |
| PORT | start.sh/Daphne, 8000 по умолчанию; mobile Nginx — 8080 |
| DEMO_USER_PASSWORD | Только необязательная команда create_demo_users |
| DJANGO_SUPERUSER_USERNAME, DJANGO_SUPERUSER_EMAIL, DJANGO_SUPERUSER_PASSWORD | Для createsuperuser --noinput; интерактивный вариант выше их не требует |
| VITE_BACKEND_URL | Только 3D Vite proxy |
| VITE_API_URL | Адрес API в сборке обоих клиентов |
| VITE_WS_URL | WebSocket 3D-клиента; mobile Dockerfile передаёт ARG, но подключения WS в текущем mobile не найдено |

`backend/start.sh` — Linux/container-запуск: migrate, collectstatic, check_offline и Daphne. Для production также нужны постоянная БД, Redis и доступное клиентам media-хранилище; локальную раздачу media URLconf включает только в DEBUG. Реальные настройки развернутого сервера не проверялись.

## Частые причины ошибок

- Нет SECRET_KEY или длина <50 — settings не загрузится.
- DEBUG=false без Redis — ошибка при старте; HTTPS redirect включён по умолчанию.
- 403 API при успешном входе — нет группы роли; is_staff недостаточно.
- 400 при расстановке — не заданы размеры зоны или координаты вне границ.
- Стены 409 — другая версия на сервере, требуется разрешить конфликт.
- Отсутствующие GLB при сборке — проверить models/; часть ресурсов исключена общими правилами Git.
- Старые e2e-скрипты с 4173/demo-banner не подтверждают работоспособность новой серверной версии. `e2e_server_pose.mjs` меняет оборудование в БД, поэтому не запускать на рабочем цехе ради проверки документации.
