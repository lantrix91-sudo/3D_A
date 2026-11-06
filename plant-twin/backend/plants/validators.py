import math

from django.core.exceptions import ValidationError


def validate_finite(value):
    if not math.isfinite(value):
        raise ValidationError("Значение должно быть конечным числом.")


def validate_model_size(value):
    if value.size > 50 * 1024 * 1024:
        raise ValidationError("Размер GLB не должен превышать 50 МБ.")
