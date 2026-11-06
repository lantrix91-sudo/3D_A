import django.db.models.deletion
from django.db import migrations, models


def seed_types(apps, schema_editor):
    Asset = apps.get_model("equipment", "Asset")
    EquipmentType = apps.get_model("equipment", "EquipmentType")
    Equipment = apps.get_model("equipment", "Equipment")
    Signal = apps.get_model("equipment", "Signal")
    db = schema_editor.connection.alias
    old_asset = Asset.objects.using(db).filter(code="oven-miwe").first()
    oven_asset, _ = Asset.objects.using(db).get_or_create(code="oven", defaults={
        "name": "Ротационная печь MIWE", "glb_file": old_asset.glb_file.name if old_asset else "",
        "led_node_name": "led", "size_x": 1.85, "size_y": 1.9, "size_z": 1.55,
    })
    templates = [
        {"key": "state", "name": "Состояние", "unit": "", "kind": "state"},
        {"key": "power", "name": "Мощность", "unit": "кВт", "kind": "number"},
        {"key": "temperature", "name": "Температура", "unit": "°C", "kind": "number"},
    ]
    oven, _ = EquipmentType.objects.using(db).get_or_create(code="oven", defaults={
        "name": "Ротационная печь", "default_asset": oven_asset, "signal_templates": templates,
    })
    Signal.objects.using(db).exclude(kind="state").update(kind="number")
    for item in Equipment.objects.using(db).all().iterator():
        if item.subtype == "oven":
            item.type_id = oven.pk
        else:
            kind, _ = EquipmentType.objects.using(db).get_or_create(code=item.kind, defaults={"name": item.kind, "signal_templates": []})
            item.type_id = kind.pk
        item.save(using=db, update_fields=["type"])
        for template in (templates if item.type_id == oven.pk else []):
            Signal.objects.using(db).get_or_create(equipment_id=item.pk, key=template["key"], defaults={
                "name": template["name"], "unit": template["unit"], "kind": template["kind"],
            })


class Migration(migrations.Migration):
    dependencies = [("equipment", "0002_equipment_pos_y_equipment_rotation_deg_asset_and_more")]
    operations = [
        migrations.RemoveConstraint("asset", "positive_asset_size"),
        migrations.RemoveConstraint("signal", "unique_signal_in_equipment"),
        migrations.RenameField("asset", "model_file", "glb_file"),
        migrations.RenameField("asset", "default_w", "size_x"),
        migrations.RenameField("asset", "default_h", "size_y"),
        migrations.RenameField("asset", "default_d", "size_z"),
        migrations.RenameField("equipment", "active", "is_active"),
        migrations.RenameField("signal", "code", "key"),
        migrations.AddConstraint("asset", models.CheckConstraint(condition=models.Q(size_x__gt=0, size_y__gt=0, size_z__gt=0), name="positive_asset_size")),
        migrations.AddConstraint("signal", models.UniqueConstraint(fields=["equipment", "key"], name="unique_signal_in_equipment")),
        migrations.CreateModel(name="EquipmentType", fields=[
            ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
            ("code", models.SlugField(max_length=80, unique=True, verbose_name="Код")),
            ("name", models.CharField(max_length=200, verbose_name="Название")),
            ("signal_templates", models.JSONField(default=list, blank=True, verbose_name="Шаблоны сигналов")),
            ("default_asset", models.ForeignKey("equipment.asset", on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, verbose_name="Ассет по умолчанию")),
        ], options={"ordering": ["code"], "verbose_name": "Тип оборудования", "verbose_name_plural": "Типы оборудования"}),
        migrations.AddField("equipment", "type", models.ForeignKey("equipment.equipmenttype", on_delete=django.db.models.deletion.PROTECT, null=True, related_name="equipment", verbose_name="Тип оборудования")),
        migrations.RunPython(seed_types, migrations.RunPython.noop),
        migrations.AlterField("equipment", "type", models.ForeignKey("equipment.equipmenttype", on_delete=django.db.models.deletion.PROTECT, related_name="equipment", verbose_name="Тип оборудования")),
    ]
