import { connectionAlert, type ConnectionAlert } from '../../services/connectionAlert';
import { useClock } from '../../store/appStore';
import { useServer } from '../../store/serverStore';

/** Состояние индикатора связи; пересчитывается раз в секунду вместе с часами */
export function useConnectionAlert(): ConnectionAlert {
  const connection = useServer((s) => s.connection);
  const offlineSince = useServer((s) => s.offlineSince);
  const everOnline = useServer((s) => s.everOnline);
  const now = useClock((s) => s.now);
  return connectionAlert(connection, offlineSince, everOnline, now);
}
