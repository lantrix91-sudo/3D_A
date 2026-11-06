#!/usr/bin/env python3
"""Симулятор устройств plant-twin: шлёт тестовую телеметрию в POST /api/v1/readings/.

Только стандартная библиотека Python 3.10+. Примеры — в docs/TELEMETRY.md.
"""
import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

DEFAULT_SIGNALS = "state:state,power:number:0:50,temperature:number:20:250"
BATCH_LIMIT = 500


def parse_signals(text):
    """«key:kind[:min:max]» через запятую → список описаний сигналов."""
    signals = []
    for part in filter(None, (item.strip() for item in text.split(","))):
        key, kind, *limits = part.split(":")
        if kind not in ("state", "number", "bool"):
            raise SystemExit(f"Сигнал {key}: kind должен быть state, number или bool.")
        low, high = (float(limits[0]), float(limits[1])) if len(limits) == 2 else (0.0, 100.0)
        signals.append({"key": key, "kind": kind, "min": low, "max": high})
    return signals


class Http:
    def __init__(self, base_url, timeout=10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def request(self, path, body=None, headers=None, method=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(f"{self.base_url}{path}", data=data, method=method or ("POST" if data else "GET"),
                                         headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status, json.loads(response.read() or b"null")
        except urllib.error.HTTPError as error:
            payload = error.read()
            try:
                return error.code, json.loads(payload)
            except ValueError:
                return error.code, {"error": {"code": "http", "message": payload.decode(errors="replace")[:200]}}


def devices_from_plan(http, username, password):
    status, tokens = http.request("/api/v1/auth/login/", {"username": username, "password": password})
    if status != 200:
        raise SystemExit(f"Вход не удался ({status}): {tokens}")
    status, plan = http.request("/api/v1/plan/", headers={"Authorization": f"Bearer {tokens['access']}"})
    if status != 200:
        raise SystemExit(f"План недоступен ({status}): {plan}")
    devices = [item["device_id"] for zone in plan["zones"] for item in zone["equipment"] if item.get("device_id")]
    if not devices:
        raise SystemExit("В плане нет device_id. Привяжите устройства в админке; план показывает device_id только staff-пользователю.")
    return devices


class Device:
    def __init__(self, device_id, key, signals, rng):
        self.device_id = device_id
        self.key = key
        self.signals = signals
        self.rng = rng
        # seq растёт от времени запуска: перезапуск симулятора не даёт ложных дубликатов.
        self.seq = int(time.time() * 1000)
        self.state = rng.choice(["run", "stop"])
        self.values = {s["key"]: s["min"] + (s["max"] - s["min"]) * rng.random() for s in signals if s["kind"] == "number"}
        self.buffer = []

    def step(self, fault_rate):
        """Следующее измерение: состояние меняется случайно, числа — плавно к цели состояния."""
        roll = self.rng.random()
        if roll < 0.01:
            self.state = "alarm"
        elif roll < 0.06 or (self.state == "alarm" and roll < 0.3):
            self.state = "stop" if self.state == "run" else "run"
        values = {}
        for signal in self.signals:
            key = signal["key"]
            if signal["kind"] == "state":
                values[key] = self.state
            elif signal["kind"] == "bool":
                values[key] = self.state == "run"
            else:
                span = signal["max"] - signal["min"]
                target = signal["min"] + span * (0.8 if self.state == "run" else 0.9 if self.state == "alarm" else 0.1)
                value = self.values[key] + (target - self.values[key]) * 0.15 + self.rng.gauss(0, span * 0.01)
                self.values[key] = min(signal["max"], max(signal["min"], value))
                values[key] = round(self.values[key], 2)
        numeric = [s["key"] for s in self.signals if s["kind"] == "number"]
        faults = [self.rng.choice(numeric)] if numeric and self.rng.random() < fault_rate else []
        self.seq += 1
        record = {"ts": round(time.time(), 3), "seq": self.seq, "values": values}
        if faults:
            record["faults"] = faults
        return record

    def headers(self):
        return {"X-Device-Key": self.key} if self.key else {}

    def send(self, http, record):
        status, body = http.request("/api/v1/readings/", {"device_id": self.device_id, **record}, self.headers())
        return status, body

    def flush(self, http):
        """Досылка накопленного буфера пакетами до 500 записей с исходными ts и seq."""
        while self.buffer:
            chunk = self.buffer[:BATCH_LIMIT]
            status, body = http.request("/api/v1/readings/", {"device_id": self.device_id, "readings": chunk}, self.headers())
            if status not in (200, 201):
                return status, body
            print(f"[{self.device_id}] досылка буфера: принято {body['accepted']}, дубликатов {body['duplicates']}")
            del self.buffer[:len(chunk)]
        return 200, None


def load_keys(args):
    text = args.keys or (open(args.keys_file, encoding="utf-8").read() if args.keys_file else os.getenv("DEVICE_API_KEYS", "{}"))
    try:
        keys = json.loads(text or "{}")
    except ValueError:
        raise SystemExit("Ключи должны быть JSON-объектом device_id → ключ.") from None
    if not isinstance(keys, dict):
        raise SystemExit("Ключи должны быть JSON-объектом device_id → ключ.")
    return keys


def build_parser():
    parser = argparse.ArgumentParser(description="Симулятор телеметрии plant-twin (POST /api/v1/readings/).")
    parser.add_argument("--url", default=os.getenv("SIM_API_URL", "http://127.0.0.1:8000"), help="Адрес backend.")
    parser.add_argument("--devices", help="device_id через запятую. Без него — из /api/v1/plan/.")
    parser.add_argument("--username", default=os.getenv("SIM_USERNAME"), help="Staff-пользователь для чтения плана.")
    parser.add_argument("--password", default=os.getenv("SIM_PASSWORD"), help="Пароль (лучше через SIM_PASSWORD).")
    parser.add_argument("--keys", help="JSON device_id → X-Device-Key (по умолчанию env DEVICE_API_KEYS).")
    parser.add_argument("--keys-file", help="Файл с JSON ключей, например вывод issue_device_key --all.")
    parser.add_argument("--signals", default=DEFAULT_SIGNALS, help=f"key:kind[:min:max] через запятую. По умолчанию {DEFAULT_SIGNALS}")
    parser.add_argument("--interval", type=float, default=5, help="Период отправки, с.")
    parser.add_argument("--duration", type=float, default=0, help="Остановиться через N секунд (0 — бесконечно).")
    parser.add_argument("--once", action="store_true", help="Отправить по одному пакету и выйти.")
    parser.add_argument("--stop-device", help="Это устройство замолкает навсегда (проверка offline).")
    parser.add_argument("--stop-after", type=float, default=30, help="Через сколько секунд замолкает --stop-device.")
    parser.add_argument("--fault-rate", type=float, default=0, help="Вероятность sensor fault одного числового сигнала в пакете.")
    parser.add_argument("--drop-rate", type=float, default=0, help="Вероятность потерять пакет (seq всё равно растёт).")
    parser.add_argument("--outage-device", help="У устройства пропадает связь: пакеты копятся в буфере.")
    parser.add_argument("--outage-after", type=float, default=20, help="Начало обрыва связи, с от старта.")
    parser.add_argument("--outage-length", type=float, default=60, help="Длительность обрыва, с; затем досылка буфера.")
    parser.add_argument("--seed", type=int, help="Seed генератора для воспроизводимости.")
    return parser


def main(argv=None):
    # Консоль Windows (cp1251/cp866) не должна ронять симулятор на непечатаемом символе.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")
    args = build_parser().parse_args(argv)
    http = Http(args.url)
    rng = random.Random(args.seed)
    signals = parse_signals(args.signals)
    if args.devices:
        device_ids = [item.strip() for item in args.devices.split(",") if item.strip()]
    elif args.username and args.password:
        device_ids = devices_from_plan(http, args.username, args.password)
    else:
        raise SystemExit("Укажите --devices или --username/--password (SIM_USERNAME/SIM_PASSWORD) для чтения плана.")
    keys = load_keys(args)
    devices = [Device(device_id, keys.get(device_id), signals, rng) for device_id in device_ids]
    missing = [device.device_id for device in devices if not device.key]
    if missing:
        print(f"Нет ключей для {', '.join(missing)} — сработает только при ALLOW_UNAUTHENTICATED_DEVICES=true.", file=sys.stderr)
    print(f"Симуляция {len(devices)} устройств → {http.base_url}/api/v1/readings/ каждые {args.interval} с. Ctrl+C — выход.")

    started = time.monotonic()
    try:
        while True:
            elapsed = time.monotonic() - started
            for device in devices:
                if device.device_id == args.stop_device and elapsed >= args.stop_after:
                    continue
                record = device.step(args.fault_rate)
                outage = (device.device_id == args.outage_device
                          and args.outage_after <= elapsed < args.outage_after + args.outage_length)
                if outage:
                    device.buffer.append(record)
                    continue
                if rng.random() < args.drop_rate:
                    print(f"[{device.device_id}] пакет seq={record['seq']} потерян")
                    continue
                try:
                    if device.buffer:
                        status, body = device.flush(http)
                        if status not in (200, 201):
                            print(f"[{device.device_id}] досылка отклонена {status}: {body}", file=sys.stderr)
                            device.buffer.clear()
                    status, body = device.send(http, record)
                except OSError as error:  # Сервер недоступен: сохраняем пакет и дошлём позже.
                    device.buffer.append(record)
                    print(f"[{device.device_id}] нет связи с сервером ({error}); в буфере {len(device.buffer)}", file=sys.stderr)
                    continue
                if status in (200, 201):
                    faults = f" faults={record['faults']}" if "faults" in record else ""
                    print(f"[{device.device_id}] seq={record['seq']} {body['status']}{faults}")
                else:
                    print(f"[{device.device_id}] ошибка {status}: {body.get('error', body)}", file=sys.stderr)
            if args.once or (args.duration and elapsed >= args.duration):
                return 0
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
