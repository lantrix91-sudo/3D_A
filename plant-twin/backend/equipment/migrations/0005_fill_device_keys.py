from django.db import migrations
from django.db.models import F


def fill_keys(apps, schema_editor):
    apps.get_model("equipment", "Signal").objects.using(schema_editor.connection.alias).filter(device_key="").update(device_key=F("key"))


class Migration(migrations.Migration):
    dependencies = [("equipment", "0004_alter_signal_options_asset_updated_at_and_more")]
    operations = [migrations.RunPython(fill_keys, migrations.RunPython.noop)]
