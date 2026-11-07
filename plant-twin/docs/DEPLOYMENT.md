# Развёртывание Plant Twin

Обновлено по текущим Dockerfile, railway.json и start.sh. Развёртывание в Railway в рамках уборки не выполнялось. Исторические сведения о переносе стенда ниже не являются проверкой текущего облачного окружения.

## Railway: backend и mobile

Git-корень — `plant-twin/`. Для сервиса backend задайте Root Directory `/backend`, для PWA — `/mobile`. В обеих папках есть `Dockerfile` и `railway.json`; пути конфигурационных файлов в настройках сервиса должны указывать на соответствующую папку репозитория.

Backend использует Python 3.14. `start.sh` выполняет migrate, collectstatic, запускает check_offline и Daphne на `$PORT`. Healthcheck: `/health/`. Mobile собирается Node 22 и раздаётся Nginx, healthcheck `/`. Не задавайте старый Root Directory `/frontend`.

Подключите PostgreSQL и Redis к backend, постоянное S3-совместимое хранилище для media. Основные Variables backend:

```dotenv
DEBUG=false
SECRET_KEY=<случайный секрет не короче 50 символов>
ALLOWED_HOSTS=backend.example.com,healthcheck.railway.app
CSRF_TRUSTED_ORIGINS=https://backend.example.com,https://mobile.example.com,https://frontend.example.com
CORS_ALLOWED_ORIGINS=https://mobile.example.com,https://frontend.example.com,http://localhost
DATABASE_URL=<URL PostgreSQL>
REDIS_URL=<URL Redis>
DJANGO_READ_DOT_ENV=false
```

`http://localhost` нужен для origin текущего Android-приложения. Остальные переменные и примеры — [backend/.env.example](../backend/.env.example) и [SETUP.md](SETUP.md). Для production Redis обязателен настройками backend. Локальный расчёт устаревания устройства в frontend-twin использует серверные last_seen/offline_seconds и не требует Redis.

В сборку mobile передайте `VITE_API_URL=https://backend.example.com`: Dockerfile объявляет соответствующий ARG. Адрес публичный, секреты в VITE-переменные не помещать. После смены build-time переменной нужна новая сборка. `VITE_BACKEND_URL` используется только локальным Vite-прокси.

## Текущий frontend-twin

В `frontend-twin/` есть `Dockerfile` (сборка Vite → Nginx), `nginx.conf.template` и `railway.json`, healthcheck `/`. Для сервиса frontend задайте Root Directory `/frontend-twin` и Variables `VITE_API_URL=https://backend.example.com`, `VITE_WS_URL=wss://backend.example.com`: Dockerfile объявляет их как ARG, после смены значений нужна новая сборка.

Деплой без GitHub выполняется из папки `plant-twin/`, потому что архив должен содержать папку из Root Directory: `railway up --service backend`, `railway up --service frontend`.

Прежняя схема frontend вынесена в [old/DEPLOYMENT-frontend.md](old/DEPLOYMENT-frontend.md). Текущий mobile описан в [MOBILE.md](MOBILE.md).

## Media: Railway Bucket (или R2 / S3)

**Railway Bucket** (текущий стенд): `railway bucket create media --region ams`, затем в backend
ссылки, а не значения — ключи не попадают ни в чат, ни в файлы:

```text
AWS_STORAGE_BUCKET_NAME=${{media.BUCKET}}
AWS_ACCESS_KEY_ID=${{media.ACCESS_KEY_ID}}
AWS_SECRET_ACCESS_KEY=${{media.SECRET_ACCESS_KEY}}
AWS_S3_ENDPOINT_URL=${{media.ENDPOINT}}
AWS_S3_REGION_NAME=${{media.REGION}}
AWS_QUERYSTRING_AUTH=true
```

Bucket приватный: Django выдаёт подписанные ссылки на час. Проверено: и virtual-host, и path
адресация работают, `AWS_S3_ADDRESSING_STYLE` не нужен.

**R2 / AWS S3:** те же переменные со значениями; для R2 `AWS_S3_REGION_NAME=auto`,
для AWS — свой регион, endpoint можно оставить пустым.
Оставьте `AWS_S3_CUSTOM_DOMAIN` пустым и `AWS_QUERYSTRING_AUTH=true`.
API уже формирует абсолютные URL через storage и `request.build_absolute_uri`:
при S3 это подписанные HTTPS-ссылки, при локальной разработке — абсолютные `/media/...`.
Поддержка хранения реализована через
[django-storages S3 backend](https://django-storages.readthedocs.io/en/latest/backends/amazon-S3.html).

Для чтения GLB и фото браузером задайте CORS **на самом bucket**, независимо от Django CORS.
У Railway Bucket редактора CORS в интерфейсе нет — задайте через S3 API, запустив скрипт с
переменными backend (`railway run --service backend python set_cors.py`):

```python
import os, boto3
e = os.environ
s3 = boto3.client("s3", endpoint_url=e["AWS_S3_ENDPOINT_URL"], region_name=e["AWS_S3_REGION_NAME"],
                  aws_access_key_id=e["AWS_ACCESS_KEY_ID"], aws_secret_access_key=e["AWS_SECRET_ACCESS_KEY"])
s3.put_bucket_cors(Bucket=e["AWS_STORAGE_BUCKET_NAME"], CORSConfiguration={"CORSRules": [{
    "AllowedOrigins": ["https://<frontend-domain>", "https://<mobile-domain>"],
    "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"], "MaxAgeSeconds": 3600}]})
```

То же правило в формате R2:

```json
[
  {
    "AllowedOrigins": ["https://<frontend-domain>", "https://<mobile-domain>"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

Это формат R2; в AWS S3 используйте соответствующий редактор CORS bucket.
При локальной работе с этим bucket добавьте `http://localhost:5174` и `http://localhost:5175` в origins.
См. [Cloudflare: CORS](https://developers.cloudflare.com/r2/buckets/cors/).
Загрузка из Django admin идёт сервером и не требует браузерного PUT к bucket.

После истечения `AWS_QUERYSTRING_EXPIRE` обновите план в интерфейсе для новых URL.
Не логируйте подписанные ссылки как публичные данные. Для публичного CDN можно
задать `AWS_S3_CUSTOM_DOMAIN=media.example.com`, `AWS_QUERYSTRING_AUTH=false`
и разрешить публичное чтение. Это другой режим: R2 не поддерживает подписанные
S3 URL на custom domain — см.
[Cloudflare: presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).


## Перенос данных с локальной машины

Так перенесён стенд 2026-11-02 (SQLite → Railway Postgres, `media/` → bucket).
Делать в **только что созданную** базу: после первого деплоя backend (`migrate` уже прошёл).

1. **Копия локальной базы** (безопасно и при запущенном сервере):

   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -c "import sqlite3; s=sqlite3.connect('db.sqlite3'); d=sqlite3.connect('db.sqlite3-before-railway'); s.backup(d)"
   ```

2. **Выгрузка** (`PYTHONUTF8=1`, иначе Windows испортит кириллицу):

   ```powershell
   $env:PYTHONUTF8 = "1"
   .\.venv\Scripts\python.exe manage.py dumpdata --natural-foreign --natural-primary `
     --exclude contenttypes --exclude auth.permission --exclude sessions `
     --exclude admin.logentry --exclude token_blacklist --indent 1 -o data.json
   ```

   | Исключено | Почему |
   | --- | --- |
   | `contenttypes`, `auth.permission` | создаёт `migrate`; номера в новой базе другие — пользователи и группы ссылаются на права по именам (`--natural-foreign`) |
   | `sessions` | временные |
   | `admin.logentry` | история админки, ссылается на contenttypes по номерам |
   | `token_blacklist` | JWT подписаны старым `SECRET_KEY`, всё равно недействительны; все входят заново |

   Пользователи переносятся с хэшами паролей — после переноса смените пароли. `data.json`
   содержит хэши паролей и ключей устройств: не коммитить, удалить после переноса.

3. **Загрузка — внутри сети Railway** (база не открыта наружу). Через `railway ssh` файл
   передаётся в контейнер backend через stdin:

   ```sh
   railway ssh --service backend -- 'cat > /tmp/data.json' < data.json
   railway ssh --service backend -- 'sha256sum /tmp/data.json'   # сверить с локальным
   ```

   Две миграции (`equipment` 0003 и 0008) сами создают `Asset` и `EquipmentType` с кодом
   `oven` — в дампе они тоже есть, и `loaddata` упадёт на уникальном коде. Поэтому загрузка —
   одной транзакцией: проверить, что в `plants`/`equipment`/`rounds` нет других строк, удалить
   эти две, `loaddata /tmp/data.json`, сверить количество по каждой модели с дампом; при
   несовпадении — откат. Последовательности Postgres `loaddata` выставляет сам.
   Перед загрузкой в Railway прогоните тот же скрипт на пустой SQLite
   (`DATABASE_URL=sqlite:///rehearsal.sqlite3`, `migrate`, загрузка). После — удалить
   `/tmp/data.json` в контейнере.

4. **Файлы** — в bucket с теми же ключами, что в базе (`assets/…glb`, `models/…glb`,
   `inspection-photos/…`, `condition-photos/…`): скрипт boto3 с переменными backend
   (`railway run --service backend python upload.py`), `ContentType` `model/gltf-binary`
   для GLB. Переносятся только файлы, на которые ссылается дамп; файлы без ссылок не нужны.

5. **Проверка:** количество строк в Postgres, `head_object` каждого файла, план и GLB во frontend.


## Android-приложение «Обход» (mobile/)

Приложение — отдельный APK, сборка и установка описаны в
[mobile/README.md](../mobile/README.md). На сервер его не выкладывают: интерфейс
лежит внутри APK, а адрес backend каждый телефон хранит у себя (экран «Настройки»).

Что нужно от backend:

| Режим | Что сделать |
| --- | --- |
| Локальная сеть, `DEBUG=true` | Запустить Django на всех интерфейсах: `python manage.py runserver 0.0.0.0:8000`; задать `LOCAL_IP=<IP компьютера>` (адрес попадёт в `ALLOWED_HOSTS`); открыть порт 8000 в брандмауэре Windows для частной сети. CORS для приложения (`http://localhost`, `https://localhost`, `capacitor://localhost`) добавляется автоматически. |
| Production, `DEBUG=false` | Добавить `http://localhost` в `CORS_ALLOWED_ORIGINS` — это origin интерфейса внутри APK. На телефоне указать публичный `https://` адрес backend. |

Почему `http://localhost`: Capacitor открывает интерфейс из APK по адресу
`http://localhost` (`server.androidScheme: "http"` в `mobile/capacitor.config.json`),
и браузерный движок телефона отправляет этот origin в каждом запросе к API.
