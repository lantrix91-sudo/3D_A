from django.conf import settings
from django.core.validators import FileExtensionValidator, RegexValidator, MinValueValidator
from django.db import models

from .validators import validate_finite, validate_model_size

code_validator = RegexValidator(r"^[a-zA-Z0-9_-]+$", "Используйте латиницу, цифры, _ и -.")


class Plant(models.Model):
    code = models.CharField("Код", max_length=80, unique=True, validators=[code_validator])
    name = models.CharField("Название", max_length=200)

    class Meta:
        ordering = ["code"]
        verbose_name = "Завод"
        verbose_name_plural = "Заводы"

    def __str__(self):
        return f"{self.code} — {self.name}"


class Zone(models.Model):
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="zones", verbose_name="Завод")
    code = models.CharField("Код", max_length=80, validators=[code_validator])
    name = models.CharField("Название", max_length=200)
    model_file = models.FileField("Модель GLB", upload_to="models/", blank=True, validators=[
        FileExtensionValidator(["glb"]), validate_model_size,
    ], help_text="GLB до 50 МБ, метры, +Y вверх.")
    size_x = models.FloatField(null=True, blank=True, validators=[validate_finite, MinValueValidator(0.01)])
    size_z = models.FloatField(null=True, blank=True, validators=[validate_finite, MinValueValidator(0.01)])
    offset_x = models.FloatField("Смещение X, м", default=0, validators=[validate_finite])
    offset_z = models.FloatField("Смещение Z, м", default=0, validators=[validate_finite])
    rotation_deg = models.FloatField("Поворот вокруг Y, °", default=0, validators=[validate_finite])
    model_rotation_deg = models.FloatField("Поворот только GLB, °", default=0, validators=[validate_finite], help_text="Коррекция экспорта модели; оборудование не поворачивает.")
    # Привязка чертежа двойника (стены, оси) к координатам зоны. Отдельно от offset_*, которые двигают всю зону в сцене.
    plan_offset_x = models.FloatField("Чертёж: X нуля зоны, м", default=0, validators=[validate_finite],
                                      help_text="Где на чертеже двойника находится точка pos_x=0, pos_z=0: на восток от оси 1.")
    plan_offset_z = models.FloatField("Чертёж: Z нуля зоны, м", default=0, validators=[validate_finite],
                                      help_text="Где на чертеже находится нуль зоны: на север от оси А (к югу — отрицательное).")
    plan_rotation_deg = models.FloatField("Чертёж: поворот зоны, °", default=0, validators=[validate_finite],
                                          help_text="Поворот осей зоны относительно чертежа вокруг вертикали, против часовой стрелки.")
    order = models.IntegerField("Порядок", default=0)
    visible_by_default = models.BooleanField("Показывать по умолчанию", default=True)

    class Meta:
        ordering = ["order", "code"]
        constraints = [models.UniqueConstraint(fields=["plant", "code"], name="unique_zone_in_plant")]
        verbose_name = "Зона"
        verbose_name_plural = "Зоны"

    def __str__(self):
        return f"{self.plant.code}/{self.code} — {self.name}"


class PlanWalls(models.Model):
    """Текущие стены и колонны плана зоны. Формат data — walls.v1, координаты — в системе чертежа двойника."""
    zone = models.OneToOneField(Zone, on_delete=models.CASCADE, related_name="plan_walls", verbose_name="Зона")
    data = models.JSONField("Стены и колонны")
    version = models.PositiveIntegerField("Версия", default=0)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+", verbose_name="Кто изменил")
    updated_at = models.DateTimeField("Изменено", auto_now=True)

    class Meta:
        verbose_name = "Стены плана"
        verbose_name_plural = "Стены плана"

    def __str__(self):
        return f"{self.zone.code}, версия {self.version}"


class PlanWallsVersion(models.Model):
    """История: последние версии стен (см. plants.walls.HISTORY_LIMIT)."""
    plan_walls = models.ForeignKey(PlanWalls, on_delete=models.CASCADE, related_name="versions", verbose_name="Стены плана")
    version = models.PositiveIntegerField("Версия")
    data = models.JSONField("Стены и колонны")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+", verbose_name="Кто изменил")
    updated_at = models.DateTimeField("Изменено", auto_now_add=True)

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["plan_walls", "version"], name="unique_plan_walls_version")]
        verbose_name = "Версия стен плана"
        verbose_name_plural = "История стен плана"

    def __str__(self):
        return f"{self.plan_walls.zone.code}, версия {self.version}"
