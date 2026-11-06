import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PlanEquipment } from '../api/types';
import { Modal } from './common/Modal';
import { useServer } from '../store/serverStore';

/** Архив не добавляется в реестр активной сцены. */
export function EquipmentArchive({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<PlanEquipment[]>([]);
  const [selected, setSelected] = useState<PlanEquipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canRestore = useServer((s) => s.canEdit);
  useEffect(() => {
    let cancelled = false;
    api.getEquipment().then((data) => {
      if (!cancelled) setItems(data.filter((item) => !item.is_active));
    }).catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function restore() {
    if (!selected || !canRestore || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.patchEquipment(selected.code, { is_active: true });
      // Повторный запуск загружает план и WS-снимок, включая восстановленный станок.
      location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return <Modal title="Архив оборудования" onClose={onClose}>
    {loading && <p>Загрузка архива…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && items.length === 0 && <p>Архив пуст.</p>}
    <ul>{items.map((item) => <li key={item.code}>
      <button type="button" className="btn btn--ghost" onClick={() => setSelected(item)}>
        {item.name} · {item.code}
      </button>
    </li>)}</ul>
    {selected && <section aria-label="Карточка архивного оборудования">
      <h3>{selected.name}</h3>
      <p>{selected.code} · тип {selected.type} · зона {selected.zone}</p>
      <p>В архиве. История и шаги маршрутов сохранены.</p>
      {canRestore && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void restore()}>
        {busy ? 'Восстановление…' : 'Вернуть из архива'}
      </button>}
    </section>}
  </Modal>;
}
