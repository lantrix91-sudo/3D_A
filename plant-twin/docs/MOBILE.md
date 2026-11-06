# Мобильное приложение «Обход»

Актуальный клиент находится в `mobile/`: Vite, Capacitor для Android и PWA. Проверено по `mobile/package.json`, `src/pwa/register.js`, `vite.config.js`, `src/api/server.js`.

## Разработка

Из `mobile/`: `npm ci`, затем `npm run dev`. Адрес — http://localhost:5175. Vite проксирует `/api`, `/health`, `/media` на `VITE_BACKEND_URL` (по умолчанию http://127.0.0.1:8000). Переменную можно задать в `mobile/.env`; пример — `.env.example`. Сохранённый пользователем адрес сервера имеет приоритет: проверьте экран «Настройки» после смены порта.

## PWA и Android

`npm run build` создаёт `dist/` и service worker. Регистрация SW включена только в production-сборке, в защищённом контексте и вне APK. Для телефона используйте HTTPS; в dev SW отключён. Android: меню браузера → установка приложения; iPhone: Safari → «Поделиться» → «На экран Домой».

`npm run sync` собирает клиент и синхронизирует Android-проект; `npm run open` открывает Android Studio. В APK интерфейс находится внутри приложения. Инструкции сборки — [mobile/README.md](../mobile/README.md).

Для production-сборки задайте `VITE_API_URL=https://backend.example.com`. В настройках телефона можно изменить сервер. В коде ещё остаётся запасной LAN-адрес; эта уборка его не меняет. `VITE_BACKEND_URL` управляет только dev-прокси, не заменяет `VITE_API_URL`.

## Без сети

Маршруты и история сохраняются клиентом, осмотры и фотографии ожидают отправки в IndexedDB. Service worker хранит оболочку приложения. Первый вход и загрузка маршрутов требуют связи. Перед сменой аккаунта/сервера нужно отправить очередь: её изоляция пока не реализована (см. [AUDIT.md](AUDIT.md)).

Развёртывание backend и PWA — [DEPLOYMENT.md](DEPLOYMENT.md). Старые инструкции по 3D-PWA сохранены отдельно: [old/MOBILE-frontend.md](old/MOBILE-frontend.md). Их функции нельзя приписывать frontend-twin.
