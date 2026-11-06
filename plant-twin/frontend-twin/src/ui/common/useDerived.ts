import { useMemo } from 'react';
import { EQUIPMENT, useRegistry } from '../../domain/config';
import type { DisplayState, EquipmentId } from '../../domain/types';
import { deriveDisplayState } from '../../engine/alarmEngine';
import { useApp } from '../../store/appStore';

export function useDisplayStates(): Record<EquipmentId, DisplayState> {
  const live = useApp((s) => s.live);
  const version = useRegistry((s) => s.version);
  return useMemo(() => {
    const out = {} as Record<EquipmentId, DisplayState>;
    for (const e of EQUIPMENT) {
      const l = live?.equipment[e.id];
      out[e.id] = l ? deriveDisplayState(l) : e.kind === 'generic' ? 'no_sensors' : 'no_comm';
    }
    return out;
  }, [live, version]);
}
