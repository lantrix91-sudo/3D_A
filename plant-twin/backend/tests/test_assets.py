import importlib
import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.forms import modelform_factory
from django.urls import clear_url_caches
from equipment.models import Asset, Equipment, EquipmentType, Signal
from plants.models import Plant, Zone

pytestmark = pytest.mark.django_db


@pytest.fixture
def item():
    zone = Zone.objects.create(plant=Plant.objects.create(code="factory",name="Завод"),code="main",name="Цех")
    return Equipment.objects.create(code="o1",name="Печь",zone=zone,type=EquipmentType.objects.get(code="oven"))


@pytest.mark.parametrize("filename,size,valid", [("oven.glb",20*1024*1024,True),("oven.glb",20*1024*1024+1,False),("oven.txt",100,False),("oven.GLB",100,True)])
def test_asset_file_validation(filename,size,valid):
    upload=SimpleUploadedFile(filename,b"test")
    upload.size=size
    form=modelform_factory(Asset,fields=["glb_file"])(data={},files={"glb_file":upload})
    assert form.is_valid() is valid


@pytest.mark.parametrize("filename,size,valid", [("hall.glb",50*1024*1024,True),("hall.glb",50*1024*1024+1,False),("hall.txt",10,False)])
def test_zone_file_validation(filename,size,valid):
    upload=SimpleUploadedFile(filename,b"test")
    upload.size=size
    form=modelform_factory(Zone,fields=["model_file"])(data={},files={"model_file":upload})
    assert form.is_valid() is valid


def test_unique_device_and_blank_normalization(item):
    other=Equipment.objects.create(code="o2",name="Печь",zone=item.zone,type=item.type,device_id="")
    assert other.device_id is None
    item.device_id="esp-1"
    item.save()
    with pytest.raises(IntegrityError), transaction.atomic():
        other.device_id="esp-1"
        other.save()
    other.refresh_from_db()
    assert other.device_id is None
    other.device_id="   "
    other.save()
    assert other.device_id is None


def test_unique_signal_key_and_default_device_key(item):
    with pytest.raises(IntegrityError), transaction.atomic():
        Signal.objects.create(equipment=item,key="state",name="Повтор")
    signal=Signal.objects.create(equipment=item,key="pressure",name="Давление")
    assert signal.device_key == "pressure"


@pytest.mark.parametrize("templates", [{},[{"key":"bad"}],[{"key":"x","name":"X","unit":"","kind":"wrong"}],[{"key":"x","name":"X","unit":"","kind":"state"}]*2])
def test_template_validation(templates):
    with pytest.raises(ValidationError):
        EquipmentType(code="bad",name="Тип",signal_templates=templates).full_clean()


def test_asset_override_and_null_fallback(item):
    explicit=Asset.objects.create(code="custom",name="Ассет")
    item.asset=explicit
    item.save()
    assert item.effective_asset == explicit
    explicit.delete()
    item.refresh_from_db()
    assert item.effective_asset == item.type.default_asset
    item.type.default_asset=None
    item.type.save()
    assert item.effective_asset is None


@pytest.mark.parametrize("debug,expected",[(True,200),(False,404)])
def test_media_debug(client,settings,tmp_path,debug,expected):
    import config.urls
    settings.DEBUG=debug
    settings.MEDIA_ROOT=tmp_path
    (tmp_path/'hall.glb').write_bytes(b'glTF')
    importlib.reload(config.urls)
    clear_url_caches()
    try:
        response=client.get('/media/hall.glb',HTTP_ORIGIN='http://localhost:5173')
        assert response.status_code == expected
        if debug:
            assert b''.join(response.streaming_content) == b'glTF'
            assert response['Access-Control-Allow-Origin'] == 'http://localhost:5173'
            response.close()
    finally:
        settings.DEBUG=False
        importlib.reload(config.urls)
        clear_url_caches()
