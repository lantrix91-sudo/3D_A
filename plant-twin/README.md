# Цифровой двойник цеха

Django/DRF принимает телеметрию оборудования; `frontend-twin/` показывает 3D-план на React/Vite/Three.js; `mobile/` — обходы, PWA и Android/Capacitor. `simulator/` остаётся отдельным инструментом разработки.

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [Бэкенд](docs/BACKEND.md)
- [API](docs/API.md)
- [Фронтенд](docs/FRONTEND.md)
- [Запуск на Windows](docs/SETUP.md)
- [Мобильный клиент](docs/MOBILE.md)
- [Развёртывание и Railway](docs/DEPLOYMENT.md)
- [Ревизия](docs/AUDIT.md)
- [Исправления бэкенда и результаты тестов](docs/BACKEND_FIXES.md)

Dev-порты: backend — 8000, frontend-twin — 5174, mobile — 5175. Прокси обоих Vite-клиентов задаётся через `VITE_BACKEND_URL`, по умолчанию `http://127.0.0.1:8000`.

Историческая документация — `docs/old/`, старые e2e — `frontend-twin/tools/old/`. Они описывают прежний интерфейс и не являются инструкцией текущего приложения.
