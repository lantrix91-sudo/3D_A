# Simulator

`simulate.py` шлёт тестовую телеметрию в `POST /api/v1/readings/` для списка
`device_id`. Нужна только стандартная библиотека Python 3.10+.

```bash
python manage.py issue_device_key --all --name simulator > ../simulator/sim-keys.json   # из backend/
python simulator/simulate.py --devices oven-01,oven-02 --keys-file simulator/sim-keys.json
python simulator/simulate.py --help
```

Режимы: остановка устройства (`--stop-device`), неисправность датчиков
(`--fault-rate`), потеря пакетов (`--drop-rate`), обрыв связи с досылкой буфера
(`--outage-device`). Подробности и формат пакета — в
[docs/TELEMETRY.md](../docs/TELEMETRY.md).

Ключи передаются через `--keys-file`, `--keys` или переменную `DEVICE_API_KEYS`
(JSON `device_id → ключ`). Не храните их в git.
