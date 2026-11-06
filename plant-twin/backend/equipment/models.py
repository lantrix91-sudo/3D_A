from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models, transaction
from django.utils import timezone
from uuid import uuid4

from plants.models import code_validator
from plants.validators import validate_finite
from .validators import validate_attachment_size, validate_photo_size, validate_key_signals, validate_asset_size, validate_signal_templates, validate_status_rules


PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"]
# Картинка станка показывается в браузере и на телефоне — только форматы, которые везде открываются.
IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]


def equipment_image_path(instance, filename):
    # Новое имя при каждой замене: старая копия на телефоне не путается с новой, файл в bucket не перезаписывается.
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    return f"equipment-images/{instance.code}-{uuid4().hex[:8]}.{extension}"


class Asset(models.Model):
    rotation_speed_deg_s = models.FloatField(default=0, validators=[validate_finite])
    animation_node_name = models.CharField(max_length=200, blank=True, help_text="Узел вращения вокруг локальной Y; пусто — rotor или tray.")
    code = models.SlugField("Код", max_length=80, unique=True)
    name = models.CharField("Название", max_length=200)
    glb_file = models.FileField("Модель GLB", upload_to="assets/", blank=True, validators=[
        FileExtensionValidator(["glb"]), validate_asset_size,
    ], help_text="До 20 МБ. Метры, +Y вверх, origin в центре основания.")
    led_node_name = models.CharField("Имя узла индикатора", max_length=200, default="led")
    size_x = models.FloatField("Размер X, м", default=1, validators=[validate_finite, MinValueValidator(0.001)])
    size_z = models.FloatField("Размер Z, м", default=1, validators=[validate_finite, MinValueValidator(0.001)])
    size_y = models.FloatField("Размер Y, м", default=1, validators=[validate_finite, MinValueValidator(0.001)])

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "Ассет оборудования"
        verbose_name_plural = "Ассеты оборудования"
        constraints = [models.CheckConstraint(
            condition=models.Q(size_x__gt=0, size_z__gt=0, size_y__gt=0), name="positive_asset_size",
        )]

    def __str__(self):
        return f"{self.code} — {self.name}"


class EquipmentType(models.Model):
    key_signals = models.JSONField(default=list, blank=True, validators=[validate_key_signals])
    code = models.SlugField("Код", max_length=80, unique=True)
    name = models.CharField("Название", max_length=200)
    default_asset = models.ForeignKey(Asset, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Ассет по умолчанию")
    signal_templates = models.JSONField("Шаблоны сигналов", default=list, blank=True, validators=[validate_signal_templates])
    status_rules = models.JSONField("Правила статуса", default=dict, blank=True, validators=[validate_status_rules],
                                    help_text="Пусто — статус по первому state-сигналу. Формат в docs/TELEMETRY.md.")
    offline_seconds = models.PositiveIntegerField("Таймаут offline, с", null=True, blank=True, validators=[MinValueValidator(1)],
                                                  help_text="Пусто — STATUS_OFFLINE_SECONDS из настроек.")

    class Meta:
        ordering = ["code"]
        verbose_name = "Тип оборудования"
        verbose_name_plural = "Типы оборудования"

    def __str__(self):
        return f"{self.code} — {self.name}"

    def clean(self):
        # Django пропускает валидаторы для пустого {}, хотя нужен именно список.
        validate_signal_templates(self.signal_templates)
        validate_key_signals(self.key_signals)
        validate_status_rules(self.status_rules)


class Equipment(models.Model):
    class Kind(models.TextChoices):
        MACHINE = "machine", "Станок"
        ROOM = "room", "Помещение"
        VALVE = "valve", "Клапан"
        CONVEYOR = "conveyor", "Конвейер"
        OTHER = "other", "Другое"

    class Condition(models.TextChoices):
        # Техническое состояние задают люди (обход, ремонт, ТО); телеметрийный status — устройства.
        WORKING = "working", "Работает"
        IDLE = "idle", "Простой"
        FAULTY = "faulty", "Неисправно"
        MAINTENANCE = "maintenance", "На ТО"
        REPAIR = "repair", "В ремонте"
        DECOMMISSIONED = "decommissioned", "Выведено из работы"

    class ImageSource(models.TextChoices):
        RENDER = "render", "Снимок 3D-модели"
        PHOTO = "photo", "Фото"

    class Status(models.TextChoices):
        RUN = "run", "Работает"
        STOP = "stop", "Остановлено"
        ALARM = "alarm", "Авария"
        OFFLINE = "offline", "Нет связи"
        UNKNOWN = "unknown", "Неизвестно"

    # Глобальный код нужен маршрутам API и поиску узлов GLB без неоднозначности.
    code = models.SlugField("Код", max_length=80, unique=True)
    name = models.CharField("Название", max_length=200)
    kind = models.CharField("Тип", max_length=20, choices=Kind.choices, default=Kind.MACHINE)
    subtype = models.CharField("Подтип", max_length=80, blank=True)
    zone = models.ForeignKey("plants.Zone", on_delete=models.PROTECT, related_name="equipment", verbose_name="Зона")
    size_w = models.FloatField("Ширина, м", default=1, validators=[validate_finite, MinValueValidator(0.001)])
    size_d = models.FloatField("Глубина, м", default=1, validators=[validate_finite, MinValueValidator(0.001)])
    size_h = models.FloatField("Высота, м", default=1, validators=[validate_finite, MinValueValidator(0.001)])
    pos_x = models.FloatField("X в зоне, м", default=0, validators=[validate_finite])
    pos_y = models.FloatField("Высота над полом, м", default=0, validators=[validate_finite])
    pos_z = models.FloatField("Z в зоне, м", default=0, validators=[validate_finite])
    rotation_deg = models.FloatField("Поворот вокруг Y, °", default=0, validators=[validate_finite])
    asset = models.ForeignKey(Asset, on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="equipment", verbose_name="Ассет")
    type = models.ForeignKey(EquipmentType, on_delete=models.PROTECT, related_name="equipment", verbose_name="Тип оборудования")
    device_id = models.CharField("ID устройства", max_length=200, unique=True, null=True, blank=True)
    is_active = models.BooleanField("Активно", default=True)
    status = models.CharField("Статус", max_length=10, choices=Status.choices, default=Status.UNKNOWN, editable=False)
    last_seen = models.DateTimeField("Последние данные", null=True, blank=True, editable=False)
    status_changed_at = models.DateTimeField("Статус изменён", null=True, blank=True, editable=False)
    condition = models.CharField("Техническое состояние", max_length=20, choices=Condition.choices,
                                 default=Condition.WORKING, editable=False)
    condition_changed_at = models.DateTimeField("Состояние изменено", null=True, blank=True, editable=False)
    # Паспорт оборудования.
    manufacturer = models.CharField("Производитель", max_length=200, blank=True)
    model_name = models.CharField("Модель", max_length=200, blank=True)
    serial_number = models.CharField("Серийный номер", max_length=100, blank=True)
    inventory_number = models.CharField("Инвентарный номер", max_length=100, blank=True)
    commissioned_on = models.DateField("Дата ввода в эксплуатацию", null=True, blank=True)
    service_contact = models.CharField("Сервисная организация / контакт", max_length=300, blank=True)
    notes = models.TextField("Примечания", blank=True)
    # Картинка в карточке и в «Обходе»: снимок 3D-модели (frontend) или настоящее фото станка.
    image = models.FileField("Изображение", upload_to=equipment_image_path, blank=True, validators=[
        FileExtensionValidator(IMAGE_EXTENSIONS), validate_photo_size])
    image_source = models.CharField("Источник изображения", max_length=10, choices=ImageSource.choices, blank=True)
    image_updated_at = models.DateTimeField("Изображение обновлено", null=True, blank=True, editable=False)
    created = models.DateTimeField(default=timezone.now, editable=False)
    updated = models.DateTimeField(auto_now=True)

    @property
    def effective_asset(self):
        return self.asset or self.type.default_asset

    def save(self, *args, **kwargs):
        # Пустая строка устройства эквивалентна отсутствию привязки.
        self.device_id = self.device_id.strip() if self.device_id else None
        self.device_id = self.device_id or None
        with transaction.atomic():
            super().save(*args, **kwargs)
            from .services import ensure_signals
            ensure_signals(self)


    class Meta:
        ordering = ["code"]
        verbose_name = "Оборудование"
        verbose_name_plural = "Оборудование"
        constraints = [models.CheckConstraint(
            condition=models.Q(size_w__gt=0, size_d__gt=0, size_h__gt=0), name="positive_equipment_size",
        )]

    def __str__(self):
        return f"{self.code} — {self.name}"


class Signal(models.Model):
    class Kind(models.TextChoices):
        STATE = "state", "Состояние"
        NUMBER = "number", "Число"
        BOOL = "bool", "Логический"

    class ValueType(models.TextChoices):
        BOOL = "bool", "Логическое"
        FLOAT = "float", "Вещественное"
        INT = "int", "Целое"

    class Source(models.TextChoices):
        HTTP = "http", "HTTP"
        MQTT = "mqtt", "MQTT"
        S7 = "s7", "S7"
        OPCUA = "opcua", "OPC UA"
        MODBUS = "modbus", "Modbus"
        MANUAL = "manual", "Ручной ввод"

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="signals", verbose_name="Оборудование")
    key = models.SlugField("Ключ", max_length=80)
    device_key = models.CharField("Ключ устройства", max_length=80, blank=True)
    name = models.CharField("Название", max_length=200)
    kind = models.CharField("Тип", max_length=20, choices=Kind.choices, default=Kind.NUMBER)
    unit = models.CharField("Единица", max_length=30, blank=True)
    value_type = models.CharField("Тип значения", max_length=10, choices=ValueType.choices, default=ValueType.FLOAT)
    source = models.CharField("Источник", max_length=10, choices=Source.choices, default="", blank=True)
    source_address = models.CharField("Адрес источника", max_length=500, blank=True)
    min_value = models.FloatField("Минимум", null=True, blank=True, validators=[validate_finite])
    max_value = models.FloatField("Максимум", null=True, blank=True, validators=[validate_finite])
    nominal_value = models.FloatField("Номинал", null=True, blank=True, validators=[validate_finite])
    offline_after_seconds = models.PositiveIntegerField("Таймаут, с", default=10, validators=[MinValueValidator(1)])
    last_value = models.FloatField("Последнее значение", null=True, blank=True, validators=[validate_finite])
    last_seen = models.DateTimeField("Последнее обновление", null=True, blank=True)
    last_text = models.CharField("Последнее состояние", max_length=64, blank=True)
    sensor_fault = models.BooleanField("Неисправность датчика", default=False)
    last_reading_at = models.DateTimeField("Последняя запись истории", null=True, blank=True, editable=False)

    class Meta:
        ordering = ["key"]
        constraints = [models.UniqueConstraint(fields=["equipment", "key"], name="unique_signal_in_equipment")]
        verbose_name = "Сигнал"
        verbose_name_plural = "Сигналы"

    def clean(self):
        if self.min_value is not None and self.max_value is not None and self.min_value > self.max_value:
            raise ValidationError({"max_value": "Максимум должен быть не меньше минимума."})

    def __str__(self):
        return f"{self.equipment.code}/{self.key}"

    def save(self, *args, **kwargs):
        if not self.device_key:
            self.device_key = self.key
        super().save(*args, **kwargs)


class EquipmentMoveLog(models.Model):
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="move_logs")
    actor = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    old_values = models.JSONField()
    new_values = models.JSONField()

    class Meta:
        ordering = ["-created_at"]


class Reading(models.Model):
    """История измерений. Пишется при изменении значения или раз в READING_MIN_INTERVAL_SECONDS."""
    signal = models.ForeignKey(Signal, on_delete=models.CASCADE, related_name="readings", verbose_name="Сигнал")
    ts = models.DateTimeField("Время измерения")
    value = models.FloatField("Значение", null=True, blank=True)
    value_text = models.CharField("Состояние", max_length=64, blank=True)
    sensor_fault = models.BooleanField("Неисправность датчика", default=False)
    source = models.CharField("Источник", max_length=20, blank=True)
    received_at = models.DateTimeField("Принято", auto_now_add=True)

    class Meta:
        ordering = ["-ts"]
        indexes = [models.Index(fields=["signal", "ts"], name="reading_signal_ts")]
        verbose_name = "Измерение"
        verbose_name_plural = "Измерения"

    def __str__(self):
        return f"{self.signal} @ {self.ts:%Y-%m-%d %H:%M:%S}"


class IngestPacket(models.Model):
    """Журнал принятых пакетов для идемпотентности: (оборудование, seq) или (оборудование, ts)."""
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="ingest_packets")
    seq = models.BigIntegerField(null=True, blank=True)
    ts = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["equipment", "seq"], condition=models.Q(seq__isnull=False), name="unique_packet_seq"),
            models.UniqueConstraint(fields=["equipment", "ts"], condition=models.Q(seq__isnull=True), name="unique_packet_ts"),
        ]
        indexes = [models.Index(fields=["ts"], name="ingest_packet_ts")]


class DeviceKey(models.Model):
    """Ключ устройства. Хранится только SHA-256; открытый ключ показывается один раз при создании."""
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="device_keys", verbose_name="Оборудование")
    name = models.CharField("Описание", max_length=200, blank=True)
    prefix = models.CharField("Префикс", max_length=12, editable=False)
    key_hash = models.CharField(max_length=64, unique=True, editable=False)
    created_at = models.DateTimeField("Создан", auto_now_add=True)
    last_used_at = models.DateTimeField("Использован", null=True, blank=True, editable=False)
    revoked_at = models.DateTimeField("Отозван", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Ключ устройства"
        verbose_name_plural = "Ключи устройств"

    def __str__(self):
        return f"{self.equipment.code}: {self.prefix}…"

    @property
    def is_active(self):
        return self.revoked_at is None


class ConditionEvent(models.Model):
    """Журнал смены технического состояния: кто, когда, почему, с какими фото."""
    class Source(models.TextChoices):
        MANUAL = "manual", "Вручную"
        ROUND = "round", "Обход"
        MAINTENANCE = "maintenance", "ТО"

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="condition_events", verbose_name="Оборудование")
    previous = models.CharField("Было", max_length=20, choices=Equipment.Condition.choices, blank=True)
    condition = models.CharField("Стало", max_length=20, choices=Equipment.Condition.choices)
    comment = models.TextField("Комментарий", blank=True, max_length=2000)
    source = models.CharField("Источник", max_length=20, choices=Source.choices, default=Source.MANUAL)
    actor = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Автор")
    created_at = models.DateTimeField("Время", default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        verbose_name = "Изменение состояния"
        verbose_name_plural = "История состояний"

    def __str__(self):
        return f"{self.equipment.code}: {self.previous or '—'} → {self.condition}"


class ConditionPhoto(models.Model):
    event = models.ForeignKey(ConditionEvent, on_delete=models.CASCADE, related_name="photos")
    file = models.FileField("Фото", upload_to="condition-photos/%Y/%m/", validators=[
        FileExtensionValidator(PHOTO_EXTENSIONS), validate_photo_size])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["pk"]
        verbose_name = "Фото"
        verbose_name_plural = "Фото"


class EquipmentDocument(models.Model):
    """Инструкции, паспорта, схемы — загружаются в админке, видны в карточке."""
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name="documents", verbose_name="Оборудование")
    title = models.CharField("Название", max_length=200)
    file = models.FileField("Файл", upload_to="equipment-docs/", validators=[validate_attachment_size])
    uploaded_at = models.DateTimeField("Загружен", auto_now_add=True)

    class Meta:
        ordering = ["title"]
        verbose_name = "Документ оборудования"
        verbose_name_plural = "Документы оборудования"

    def __str__(self):
        return self.title
