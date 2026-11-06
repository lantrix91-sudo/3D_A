import { useState, type FormEvent } from 'react';
import { EQUIPMENT_BY_ID } from '../domain/config';
import { addServerEquipment, updateServerEquipment } from '../services/serverHub';
import { useServer } from '../store/serverStore';
import { Field } from './common/Field';
import { Modal } from './common/Modal';

// Такой же формат, как у Equipment.code на сервере (SlugField)
const CODE_RE = /^[-a-zA-Z0-9_]+$/;

/**
 * Добавление и правка оборудования на сервере: POST /api/v1/equipment/ и PATCH /api/v1/equipment/<code>/.
 * Поля соответствуют API: у оборудования на сервере есть код, тип, зона и ассет,
 * а загрузка GLB выполняется только через админку Django.
 */
export function ServerEquipmentForm({ editId, onClose }: { editId?: string; onClose: () => void }) {
  const zones = useServer((s) => s.zones);
  const types = useServer((s) => s.types);
  const assets = useServer((s) => s.assets);
  const cur = editId ? EQUIPMENT_BY_ID[editId] : undefined;
  const [code, setCode] = useState(cur?.id ?? '');
  const [name, setName] = useState(cur?.name ?? '');
  const [type, setType] = useState(cur?.server?.type ?? types[0] ?? '');
  const [zone, setZone] = useState(cur?.server?.zone ?? zones[0]?.code ?? '');
  // В плане приходит итоговый ассет. Явная ли это ссылка или значение типа, клиент не знает,
  // поэтому при правке поле asset отправляем, только если его действительно поменяли
  const initialAsset = cur?.server?.assetCode ?? '';
  const [asset, setAsset] = useState(initialAsset);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Укажите наименование');
    if (!type.trim()) return setError('Укажите тип оборудования');
    if (!editId && !CODE_RE.test(code)) return setError('Код: только латинские буквы, цифры, дефис и подчёркивание');
    setBusy(true);
    let res: string | null;
    if (editId) {
      res = await updateServerEquipment(editId, {
        ...(name.trim() !== cur?.name ? { name: name.trim() } : {}),
        ...(type.trim() !== cur?.server?.type ? { type: type.trim() } : {}),
        ...(asset !== initialAsset ? { asset: asset || null } : {}),
      });
    } else {
      res = await addServerEquipment({ code, name: name.trim(), type: type.trim(), zone, asset: asset || null });
    }
    if (res) {
      setError(res);
      setBusy(false);
      return;
    }
    onClose();
  };

  return (
    <Modal
      title={editId ? `Оборудование ${editId}` : 'Добавить оборудование'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Отмена</button>
          <button type="submit" form="server-eq-form" className="btn btn--primary" disabled={busy}>
            {busy ? 'Сохранение…' : editId ? 'Сохранить' : 'Добавить и расставить'}
          </button>
        </>
      }
    >
      <form id="server-eq-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Наименование *" htmlFor="srv-name" full>
          <input id="srv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Код *" htmlFor="srv-code" hint={editId ? 'Код не меняется' : 'Латиница, цифры, дефис; например oven-11'}>
          <input id="srv-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!editId} maxLength={80} />
        </Field>
        <Field label="Тип *" htmlFor="srv-type" hint="Код типа; новый тип создаётся в админке Django">
          <input id="srv-type" className="input" list="srv-types" value={type} onChange={(e) => setType(e.target.value)} />
          <datalist id="srv-types">
            {types.map((t) => <option key={t} value={t} />)}
          </datalist>
        </Field>
        <Field label="Зона" htmlFor="srv-zone" hint={editId ? 'Зона при правке не меняется' : undefined}>
          <select id="srv-zone" className="select" value={zone} onChange={(e) => setZone(e.target.value)} disabled={!!editId}>
            {zones.map((z) => <option key={z.code} value={z.code}>{z.name}</option>)}
          </select>
        </Field>
        <Field label="3D-модель" htmlFor="srv-asset" hint="Новые GLB загружаются в админке Django">
          <select id="srv-asset" className="select" value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="">По умолчанию для типа</option>
            {assets.map((a) => <option key={a.code} value={a.code}>{a.code}{a.url ? '' : ' (файла нет)'}</option>)}
          </select>
        </Field>
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
