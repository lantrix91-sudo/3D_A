from django.db import migrations

# Измерено совмещением стен чертежа двойника (plant-layout.json) со стенами Koktal_1.glb:
# поворота и масштаба нет, нуль зоны лежит на чертеже в 0,68 м к западу от оси 1 и в 6,07 м к югу от оси А.
# Точность около 0,05 м. Значения можно поправить в админке: «Зоны» → «Чертёж: …».
KOKTAL_ZONE = "K_1"
OFFSET_X = -0.68
OFFSET_Z = -6.07


def set_koktal_offset(apps, schema_editor):
    Zone = apps.get_model("plants", "Zone")
    # Только ненастроенные зоны: повторный запуск не затирает значения, заданные в админке.
    Zone.objects.filter(code=KOKTAL_ZONE, plan_offset_x=0, plan_offset_z=0, plan_rotation_deg=0).update(
        plan_offset_x=OFFSET_X, plan_offset_z=OFFSET_Z)


class Migration(migrations.Migration):
    dependencies = [("plants", "0004_zone_plan_binding")]
    operations = [migrations.RunPython(set_koktal_offset, migrations.RunPython.noop)]
