#!/bin/sh
set -eu
python manage.py migrate --noinput
python manage.py collectstatic --noinput
# Фоновая проверка таймаута: переводит оборудование в offline и рассылает событие.
python manage.py check_offline --loop "${STATUS_CHECK_INTERVAL:-15}" &
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" config.asgi:application
