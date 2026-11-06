from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from plants.models import Zone
from .models import Asset, Equipment, EquipmentType
from .services import save_equipment


class ZoneCodeField(serializers.SlugRelatedField):
    def to_internal_value(self, data):
        try:
            return super().to_internal_value(data)
        except Zone.MultipleObjectsReturned:
            raise serializers.ValidationError("Код зоны неоднозначен между заводами.")


class EquipmentWriteSerializer(serializers.ModelSerializer):
    type = serializers.SlugRelatedField(slug_field="code", queryset=EquipmentType.objects.all())
    zone = ZoneCodeField(slug_field="code", queryset=Zone.objects.all())
    asset = serializers.SlugRelatedField(slug_field="code", queryset=Asset.objects.all(), allow_null=True, required=False)

    class Meta:
        model = Equipment
        fields = ["code", "name", "zone", "type", "asset", "pos_x", "pos_y", "pos_z", "rotation_deg", "is_active"]

    def validate(self, attrs):
        if "device_id" in self.initial_data:
            raise serializers.ValidationError({"device_id": "Привязка доступна только в админке Django."})
        if self.instance and "pos_y" in attrs and attrs["pos_y"] != self.instance.pos_y:
            raise serializers.ValidationError({"pos_y": "Height cannot be changed."})
        if self.instance is None or {"zone", "pos_x", "pos_z", "rotation_deg"} & attrs.keys():
            import math
            zone = attrs.get("zone") or self.instance.zone
            for field, limit in (("pos_x", "size_x"), ("pos_z", "size_z"), ("rotation_deg", None)):
                value = attrs.get(field, getattr(self.instance, field, 0))
                maximum = 360 if limit is None else getattr(zone, limit)
                if maximum is None:
                    raise serializers.ValidationError({field: "Configure zone dimensions in Django admin."})
                if isinstance(self.initial_data.get(field), bool) or not math.isfinite(value) or not 0 <= value <= maximum:
                    raise serializers.ValidationError({field: f"Expected a number between 0 and {maximum}."})
        return attrs

    def create(self, validated_data):
        return self.save_instance(validated_data)

    def update(self, instance, validated_data):
        return self.save_instance(validated_data, instance)

    def save_instance(self, data, instance=None):
        try:
            return save_equipment(data, instance)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
