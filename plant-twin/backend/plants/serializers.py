from rest_framework import serializers


class PlantSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class PositionSerializer(serializers.Serializer):
    x = serializers.FloatField()
    z = serializers.FloatField()


class VectorSerializer(PositionSerializer):
    y = serializers.FloatField()


class AssetSerializer(serializers.Serializer):
    code = serializers.CharField()
    url = serializers.URLField(allow_null=True)
    led_node_name = serializers.CharField()
    rotation_speed_deg_s = serializers.FloatField()
    animation_node_name = serializers.CharField(allow_blank=True)
    size = VectorSerializer()


class EquipmentSerializer(PlantSerializer):
    key_signals = serializers.ListField(child=serializers.CharField())
    type = serializers.CharField()
    zone = serializers.CharField()
    asset = AssetSerializer(allow_null=True)
    pos = VectorSerializer()
    size = VectorSerializer()
    rotation_deg = serializers.FloatField()
    status = serializers.ChoiceField(choices=["run", "stop", "alarm", "offline", "unknown"])
    last_seen = serializers.FloatField(allow_null=True, help_text="Unix-время последних данных, секунды UTC.")
    offline_seconds = serializers.IntegerField()
    is_active = serializers.BooleanField()
    condition = serializers.ChoiceField(choices=["working", "idle", "faulty", "maintenance", "repair", "decommissioned"],
                                        help_text="Техническое состояние, задают инженеры.")
    has_telemetry = serializers.BooleanField(help_text="У оборудования есть device_id и ожидаются данные датчиков.")
    image = serializers.URLField(allow_null=True, help_text="Снимок 3D-модели или фото станка; null — картинки нет.")
    image_source = serializers.ChoiceField(choices=["render", "photo"], allow_null=True)
    image_updated_at = serializers.FloatField(allow_null=True)
    device_id = serializers.CharField(allow_null=True, required=False, read_only=True, help_text="Только для staff; поле полностью отсутствует в ответах остальных пользователей.")


class ZoneSerializer(PlantSerializer):
    id = serializers.IntegerField()
    plan_offset = PositionSerializer(help_text="Координаты нуля зоны на чертеже двойника: x — на восток, z — на север, метры.")
    plan_rotation_deg = serializers.FloatField(help_text="Поворот осей зоны относительно чертежа, против часовой стрелки.")
    size_x = serializers.FloatField(allow_null=True)
    size_z = serializers.FloatField(allow_null=True)
    model_url = serializers.URLField(allow_null=True)
    offset = PositionSerializer()
    rotation_deg = serializers.FloatField()
    model_rotation_deg = serializers.FloatField()
    visible_by_default = serializers.BooleanField()
    equipment = EquipmentSerializer(many=True)


class WallSerializer(serializers.Serializer):
    id = serializers.CharField()
    x1 = serializers.FloatField()
    z1 = serializers.FloatField()
    x2 = serializers.FloatField()
    z2 = serializers.FloatField()
    t = serializers.FloatField(help_text="Толщина, м.")
    kind = serializers.ChoiceField(choices=["outer", "inner", "new", "partition"])


class ColumnSerializer(serializers.Serializer):
    id = serializers.CharField()
    x = serializers.FloatField()
    z = serializers.FloatField()


class WallsDataSerializer(serializers.Serializer):
    walls = WallSerializer(many=True)
    columns = ColumnSerializer(many=True)
    seq = serializers.IntegerField(help_text="Счётчик номеров новых стен.")


class PlanWallsSerializer(serializers.Serializer):
    zone = serializers.IntegerField()
    version = serializers.IntegerField(help_text="0 — на сервере стен ещё нет, клиент показывает стены проекта.")
    data = WallsDataSerializer(allow_null=True)
    updated_by = serializers.CharField(allow_null=True)
    updated_at = serializers.FloatField(allow_null=True)


class PlanWallsWriteSerializer(serializers.Serializer):
    base_version = serializers.IntegerField(min_value=0, help_text="Версия, на основе которой сделаны правки.")
    data = WallsDataSerializer()


class PlanWallsHistorySerializer(serializers.Serializer):
    version = serializers.IntegerField()
    walls = serializers.IntegerField(help_text="Сколько стен в этой версии.")
    columns = serializers.IntegerField(help_text="Сколько колонн в этой версии.")
    updated_by = serializers.CharField(allow_null=True)
    updated_at = serializers.FloatField()


class PlanSerializer(serializers.Serializer):
    can_edit_layout = serializers.BooleanField()
    can_edit_walls = serializers.BooleanField()
    can_change_condition = serializers.BooleanField()
    can_change_image = serializers.BooleanField()
    plant = PlantSerializer(allow_null=True)
    zones = ZoneSerializer(many=True)
