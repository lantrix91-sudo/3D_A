# Архив прежнего развёртывания frontend/

Исторические разделы, включая общий контекст прежней схемы сервисов. Не применять к frontend-twin. Текущая инструкция: [DEPLOYMENT.md](../DEPLOYMENT.md).

## Railway: по шагам

1. В Railway создайте проект, добавьте **PostgreSQL** и **Redis** (наружу их не открывайте:
   без TCP Proxy они доступны только backend по внутренней сети), **Bucket** с именем `media`
   и три пустых сервиса: `backend`, `frontend`, `mobile`.

   Изменения в интерфейсе Railway сначала «застейдживаются»: переменная или bucket появятся
   только после кнопки **Deploy / Apply changes** вверху холста. Проверить из CLI:
   `railway bucket list`, `railway variables --service backend --json` (смотрите имена, не значения).

2. Настройте пути. Git-корень — папка `plant-twin/`:

   | Сервис | Root Directory | Dockerfile | Healthcheck |
   | --- | --- | --- | --- |
   | backend | `/backend` | `Dockerfile` | `/health/`, 120 с; Start Command `sh start.sh` |
   | frontend | `/frontend` | `Dockerfile` | `/`, 60 с |
   | mobile | `/mobile` | `Dockerfile` | `/`, 60 с |

   Restart policy — On failure, 3 попытки. Те же значения записаны в `railway.json` каждой папки,
   но Railway объявил Config as Code устаревшим и больше не даёт указать путь к нему —
   задайте настройки в Settings сервиса (или через API `serviceInstanceUpdate`). Build context
   каждого Dockerfile — папка сервиса.

   **Выкладка без GitHub** — из чистой копии коммита (так не попадут `.env`, база и `media/`;
   кроме того, `railway up` из рабочей папки падает на занятых файлах):

   ```sh
   cd plant-twin
   rm -rf ../deploy && mkdir ../deploy && git archive HEAD | tar -x -C ../deploy
   railway up ../deploy --path-as-root -p <project-id> -e production --service backend --ci
   ```

   Повторите для `frontend` и `mobile`. **Всегда указывайте `-p` и `-e`:** запуск `railway up`
   из папки, не связанной с проектом (`railway link`), создаёт новый проект. Root Directory
   применяется к загруженному архиву, поэтому выкладывается весь `plant-twin`.
   С GitHub: `railway service source connect --repo owner/repo --branch main --service backend`.

3. Создайте публичные домены трёх сервисов (`railway domain --service <имя>`), затем задайте backend Variables:
   `SECRET_KEY`, `DEBUG=false`, `ALLOWED_HOSTS=<backend-domain>,healthcheck.railway.app`,
   `CSRF_TRUSTED_ORIGINS=https://<backend-domain>,https://<frontend-domain>,https://<mobile-domain>`,
   `CORS_ALLOWED_ORIGINS=https://<frontend-domain>,https://<mobile-domain>`, `DEVICE_API_KEYS={}`,
   `TIME_ZONE=Asia/Qyzylorda`, `JWT_REFRESH_DAYS` (не меньше 2).
   Подключите `DATABASE_URL=${{Postgres.DATABASE_URL}}` и
   `REDIS_URL=${{Redis.REDIS_URL}}`; имена сервисов в ссылках должны совпадать
   с вашими. Не используйте SQLite в Railway: диск контейнера непостоянный.
   `DJANGO_READ_DOT_ENV=false` уже установлен в Dockerfile.
   Хост `healthcheck.railway.app` нужен для
   [проверок Railway](https://docs.railway.com/deployments/healthchecks).

4. Подключите bucket по разделу ниже **до загрузки моделей**. Без bucket работает
   только локальное хранилище: при DEBUG=false Django не раздаёт `/media/`,
   а пересоздание контейнера потеряет локальные загрузки. WhiteNoise обслуживает
   только собранную статику, не пользовательские файлы.

5. Разверните backend. `railway.json` запускает `sh start.sh`:

   ```sh
   python manage.py migrate --noinput
   python manage.py collectstatic --noinput
   python manage.py check_offline --loop "${STATUS_CHECK_INTERVAL:-15}" &
   exec daphne -b 0.0.0.0 -p "$PORT" config.asgi:application
   ```

   Daphne обслуживает ASGI: HTTP и WebSocket `/ws/v1/live/` (`config/asgi.py`,
   consumer `equipment.consumers.LiveConsumer`, авторизация по `?token=<access JWT>`).
   По нему браузеры получают статусы телеметрии, смены состояния и осмотры обхода.
   Channel layer — Redis из `REDIS_URL`. `check_offline` работает в том же контейнере
   в фоне: переводит оборудование без данных в offline и рассылает событие через
   Redis. Gunicorn установлен как HTTP/WSGI-альтернатива
   (`gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`), но без WebSocket:
   живые статусы, кольца обхода и перекраска у других пользователей работать не будут.
   Railway proxy пропускает WebSocket без дополнительной настройки.
   При ошибке миграций/collectstatic запуск прерывается. Сначала используйте одну
   реплику. Перед масштабированием вынесите миграции в отдельный pre-deploy шаг,
   оставив collectstatic в запускаемом контейнере, чтобы избежать одновременных
   миграций. Файлы pre-deploy контейнера не заменяют файлы рабочего контейнера.

6. Проверьте `https://<backend-domain>/health/`: без токена возвращается
   `{"status":"ok"}`. Это проверка работоспособности HTTP, не диагностика БД/Redis/S3.
   Через Railway SSH/терминал запущенного backend выполните:

   ```sh
   python manage.py check --deploy
   python manage.py showmigrations
   ```

   HTTPS завершается на Railway proxy; Django доверяет его `X-Forwarded-Proto`.
   Secure session/CSRF cookies включаются автоматически при DEBUG=false.
   HSTS includeSubDomains/preload по умолчанию выключены намеренно; Django может
   сообщить об этом в `check --deploy`. Включайте их только для готового домена.

7. Для администратора временно добавьте три `DJANGO_SUPERUSER_*` переменные из таблицы,
   примените их к сервису, затем в его терминале выполните:

   ```sh
   python manage.py createsuperuser --noinput
   ```

   Это отдельная штатная команда Django, не часть старта и не код автосоздания.
   После успеха удалите `DJANGO_SUPERUSER_PASSWORD` из Variables. Повторный запуск
   с существующим username не нужен. Не запускайте `railway run` на локальном ПК
   с приватными адресами БД: команда должна выполняться внутри Railway-сети.

8. В frontend **и mobile** Variables задайте `VITE_API_URL=https://<backend-domain>` и
   `VITE_WS_URL=wss://<backend-domain>`. Dockerfile передаёт их через `ARG`
   в `npm run build`; Nginx раздаёт результат `dist/` и слушает `$PORT`.
   После изменения этих адресов нужна **пересборка**, не только перезапуск.
   Отдельный Start Command для frontend не задавайте: используется запуск Nginx
   из образа. Принцип передачи переменных описан в
   [Railway: Dockerfiles](https://docs.railway.com/builds/dockerfiles).

9. Откройте frontend, войдите, проверьте в DevTools запрос плана и GLB, а также
   WebSocket `wss://<backend-domain>/ws/v1/live/?token=…` со статусом 101 и первым
   сообщением `snapshot`. Если в шапке горит «Нет связи», проверьте `VITE_WS_URL`
   (нужна пересборка frontend) и `REDIS_URL`.
   Через `/admin/` создайте завод/зоны и загрузите модели — или перенесите локальные
   данные по разделу «Перенос данных с локальной машины» ниже. Переменные/ключи не включайте в экспорт данных
   для Git. Для bucket настройте резервирование/версионирование и ограничьте
   ключ доступа нужным bucket.


## Приложение на телефоне

**PWA «Обход»** (сервис `mobile`, папка `mobile/`) — приложение обхода для iPhone и Android
без APK: ставится с экрана «Домой», открывается без сети. Сборка как у frontend
(Dockerfile → Nginx, `VITE_API_URL` при сборке), подробности и установка на телефон —
[mobile/README.md](../../mobile/README.md#pwa-iphone-и-android-без-apk).

Frontend тоже собирается как PWA: `npm run build` кладёт в `dist/` service worker (`sw.js`)
и манифест. Установка на телефон и работа без сети требуют HTTPS, подробности
в [MOBILE.md](../MOBILE.md). При раздаче не через `nginx.conf.template` отдавайте
`/sw.js` и `/manifest.webmanifest` с `Cache-Control: no-cache` (у frontend и mobile).


## Раздача frontend вне Railway

С заданными `VITE_API_URL`/`VITE_WS_URL` выполните `npm ci && npm run build`.
Содержимое `frontend/dist/` можно раздавать любым статическим сервером.
Для Nginx есть `nginx.conf.template`: в обычной установке замените `${PORT}`
на порт, настройте TLS на внешнем reverse proxy; для SPA сохраните
`try_files $uri $uri/ /index.html`. API расположен на отдельном origin.

Для Docker из каталога frontend:

```sh
docker build --build-arg VITE_API_URL=https://backend.example.com --build-arg VITE_WS_URL=wss://backend.example.com -t plant-twin-frontend .
docker run --rm -p 8080:8080 -e PORT=8080 plant-twin-frontend
```

Nginx отдаёт статические assets с долгим кешем, HTML — с перепроверкой.
`vite dev` и `vite preview` не используются как production-серверы.
