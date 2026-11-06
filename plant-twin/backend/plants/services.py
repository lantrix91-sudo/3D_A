from django.db.models import Prefetch
from rest_framework.exceptions import NotFound
from equipment.services import equipment_payload, equipment_queryset
from .models import Plant


def select_plant(code=None):
    plants = Plant.objects.all()
    if code:
        plant = plants.filter(code=code).first()
        if plant is None:
            raise NotFound("Завод не найден.")
        return plant
    return plants.first()


def get_plan(plant_code, absolute_url, staff=False):
    plant = select_plant(plant_code)
    if plant is None:
        return {"plant": None, "zones": []}
    equipment = equipment_queryset().filter(is_active=True)
    zones = [{
        "id": zone.pk, "code": zone.code, "name": zone.name,
        "model_url": absolute_url(zone.model_file.url) if zone.model_file else None,
        "offset": {"x": zone.offset_x, "z": zone.offset_z},
        "rotation_deg": zone.rotation_deg, "model_rotation_deg": zone.model_rotation_deg,
        "visible_by_default": zone.visible_by_default,
        "size_x": zone.size_x, "size_z": zone.size_z,
        "plan_offset": {"x": zone.plan_offset_x, "z": zone.plan_offset_z},
        "plan_rotation_deg": zone.plan_rotation_deg,
        "equipment": [equipment_payload(item, absolute_url, staff) for item in zone.equipment.all()],
    } for zone in plant.zones.prefetch_related(Prefetch("equipment", queryset=equipment))]
    return {"plant": {"code": plant.code, "name": plant.name}, "zones": zones}
