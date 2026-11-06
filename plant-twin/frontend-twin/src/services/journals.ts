import { equipmentLabel } from '../domain/config';
import type {
  Breakdown,
  BreakdownStatus,
  EquipmentId,
  MaintenancePlan,
  MaintenanceRecord,
  PlanDisplayStatus,
} from '../domain/types';
import { toast, useApp } from '../store/appStore';
import { toCsv, downloadText } from '../utils/csv';
import { newId } from '../utils/id';
import { DAY_MS, formatDate, formatDateTime, formatDuration } from '../utils/time';
import { getRepository, logJournalEvent, reloadJournals } from './telemetryHub';

/**
 * ППР и поломки: на бэкенде пока нет ни моделей, ни эндпоинтов, поэтому списки пусты.
 * Создание записей выключено: в браузере они исчезли бы при перезагрузке страницы.
 * Когда появится API, чтение и запись нужно перевести на него и включить этот флаг.
 */
export const JOURNALS_WRITABLE: boolean = false;

export const BREAKDOWN_STATUS: Record<BreakdownStatus, string> = {
  open: 'Открыта',
  in_progress: 'В работе',
  resolved: 'Устранена',
};

export const PLAN_STATUS: Record<PlanDisplayStatus, string> = {
  planned: 'Запланировано',
  overdue: 'Просрочено',
  done: 'Выполнено',
};

export function planDisplayStatus(p: MaintenancePlan, now = Date.now()): PlanDisplayStatus {
  if (p.status === 'done') return 'done';
  // просрочено, если плановая дата (конец дня по поясу цеха условно) уже прошла
  return p.plannedDate + DAY_MS / 2 < now ? 'overdue' : 'planned';
}

export function downtimeMs(b: Breakdown, now = Date.now()): number | null {
  if (b.downtimeStart == null) return null;
  return (b.downtimeEnd ?? now) - b.downtimeStart;
}

/** Проверка записи неисправности. Возвращает текст ошибки или null. */
export function validateBreakdown(b: Breakdown): string | null {
  if (!b.description.trim()) return 'Укажите описание неисправности';
  if (!b.occurredAt) return 'Укажите дату и время возникновения';
  if (b.downtimeEnd != null && b.downtimeStart == null) return 'Указано окончание простоя без начала';
  if (b.downtimeStart != null && b.downtimeEnd != null && b.downtimeEnd < b.downtimeStart)
    return 'Окончание простоя не может быть раньше начала';
  if (b.downtimeStart != null && b.downtimeStart < b.occurredAt - 60000)
    return 'Начало простоя не может быть раньше возникновения неисправности';
  if (b.status === 'resolved' && b.downtimeStart != null && b.downtimeEnd == null)
    return 'Для устранённой неисправности укажите окончание простоя';
  return null;
}

export function emptyBreakdown(equipmentId: EquipmentId): Breakdown {
  const now = Date.now();
  return {
    id: '', equipmentId, occurredAt: now, description: '', cause: '', status: 'open', worksDone: '',
    downtimeStart: now, downtimeEnd: null, responsible: '', comment: '', createdAt: now, updatedAt: now,
  };
}

export async function saveBreakdown(b: Breakdown): Promise<string | null> {
  const err = validateBreakdown(b);
  if (err) return err;
  const isNew = !b.id;
  const rec: Breakdown = { ...b, id: b.id || newId('BRK'), updatedAt: Date.now() };
  await getRepository().putBreakdown(rec);
  await reloadJournals();
  await logJournalEvent(b.equipmentId, `${isNew ? 'Зарегистрирована' : 'Изменена'} неисправность: ${rec.description} (${BREAKDOWN_STATUS[rec.status].toLowerCase()})`);
  toast(isNew ? 'Неисправность добавлена в журнал' : 'Запись неисправности сохранена');
  return null;
}

export async function closeBreakdown(b: Breakdown, worksDone: string, end: number | null): Promise<string | null> {
  const now = Date.now();
  const next: Breakdown = {
    ...b,
    status: 'resolved',
    worksDone: worksDone || b.worksDone,
    downtimeEnd: b.downtimeStart != null ? (end ?? now) : null,
  };
  return saveBreakdown(next);
}

// ---------------- ППР ----------------

export function emptyPlan(equipmentId: EquipmentId): MaintenancePlan {
  const now = Date.now();
  return {
    id: '', equipmentId, title: '', works: '', periodDays: 30, plannedDate: now + 7 * DAY_MS, responsible: '',
    status: 'planned', actualDate: null, comment: '', prevPlanId: null, createdAt: now, updatedAt: now,
  };
}

export function validatePlan(p: MaintenancePlan): string | null {
  if (!p.title.trim()) return 'Укажите название работы';
  if (!p.plannedDate) return 'Укажите плановую дату';
  if (!Number.isFinite(p.periodDays) || p.periodDays < 0 || p.periodDays > 3650) return 'Периодичность — от 0 до 3650 дней';
  return null;
}

export async function savePlan(p: MaintenancePlan): Promise<string | null> {
  const err = validatePlan(p);
  if (err) return err;
  const isNew = !p.id;
  const rec = { ...p, id: p.id || newId('PPR'), updatedAt: Date.now() };
  await getRepository().putPlan(rec);
  await reloadJournals();
  await logJournalEvent(p.equipmentId, `${isNew ? 'Запланирована' : 'Изменена'} работа ППР: ${rec.title}, на ${formatDate(rec.plannedDate)}`);
  toast(isNew ? 'Работа ППР добавлена в план' : 'Работа ППР сохранена');
  return null;
}

/**
 * Отметка выполнения. Выполненная запись остаётся в истории (статус «Выполнено» + MaintenanceRecord),
 * для периодической работы создаётся следующая плановая запись: дата = факт + периодичность.
 */
export async function completePlan(
  p: MaintenancePlan, actualDate: number, responsible: string, comment: string,
): Promise<string | null> {
  if (!actualDate) return 'Укажите фактическую дату выполнения';
  if (actualDate > Date.now() + DAY_MS / 2) return 'Фактическая дата не может быть в будущем';
  if (p.status === 'done') return 'Работа уже отмечена как выполненная';
  const repo = getRepository();
  const now = Date.now();
  const done: MaintenancePlan = {
    ...p, status: 'done', actualDate, responsible: responsible || p.responsible,
    comment: comment || p.comment, updatedAt: now,
  };
  const record: MaintenanceRecord = {
    id: newId('MNT'), planId: p.id, equipmentId: p.equipmentId, title: p.title, works: p.works,
    completedAt: actualDate, responsible: done.responsible, comment,
  };
  await repo.putPlan(done);
  await repo.putRecord(record);
  let nextMsg = '';
  if (p.periodDays > 0) {
    const next: MaintenancePlan = {
      ...p, id: newId('PPR'), status: 'planned', actualDate: null, plannedDate: actualDate + p.periodDays * DAY_MS,
      comment: '', prevPlanId: p.id, createdAt: now, updatedAt: now,
    };
    await repo.putPlan(next);
    nextMsg = `; следующая — ${formatDate(next.plannedDate)}`;
  }
  await reloadJournals();
  await logJournalEvent(p.equipmentId, `Выполнена работа ППР: ${p.title}${nextMsg}`);
  toast(`ППР «${p.title}» выполнено${nextMsg}`);
  return null;
}

// ---------------- экспорт CSV ----------------

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

export function exportBreakdownsCsv(equipmentId?: EquipmentId) {
  const { breakdowns } = useApp.getState();
  const rows = breakdowns
    .filter((b) => !equipmentId || b.equipmentId === equipmentId)
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .map((b) => [
      b.id, b.equipmentId, equipmentLabel(b.equipmentId), formatDateTime(b.occurredAt), b.description, b.cause,
      BREAKDOWN_STATUS[b.status], b.worksDone, formatDateTime(b.downtimeStart), b.downtimeEnd ? formatDateTime(b.downtimeEnd) : '',
      b.downtimeStart != null ? formatDuration(downtimeMs(b)) + (b.downtimeEnd ? '' : ' (продолжается)') : '',
      b.responsible, b.comment,
    ]);
  const csv = toCsv(
    ['ID', 'Оборудование', 'Наименование', 'Возникновение (Алматы)', 'Описание', 'Причина', 'Статус', 'Выполненные работы',
      'Начало простоя', 'Окончание простоя', 'Длительность простоя', 'Ответственный', 'Комментарий'],
    rows,
  );
  void downloadText(`polomki_${equipmentId ?? 'ceh'}_${stamp()}.csv`, csv).then((ok) => {
    if (ok) toast(`Экспорт CSV: записей — ${rows.length}`);
  });
}

export function exportPlansCsv(equipmentId?: EquipmentId) {
  const { plans } = useApp.getState();
  const now = Date.now();
  const rows = plans
    .filter((p) => !equipmentId || p.equipmentId === equipmentId)
    .sort((a, b) => a.plannedDate - b.plannedDate)
    .map((p) => [
      p.id, p.equipmentId, equipmentLabel(p.equipmentId), p.title, p.works,
      p.periodDays > 0 ? `${p.periodDays} дн.` : 'Разовая', formatDate(p.plannedDate), p.responsible,
      PLAN_STATUS[planDisplayStatus(p, now)], p.actualDate ? formatDate(p.actualDate) : '', p.comment,
    ]);
  const csv = toCsv(
    ['ID', 'Оборудование', 'Наименование', 'Работа', 'Перечень работ', 'Периодичность', 'Плановая дата', 'Ответственный',
      'Статус', 'Фактическая дата', 'Комментарий'],
    rows,
  );
  void downloadText(`ppr_${equipmentId ?? 'ceh'}_${stamp()}.csv`, csv).then((ok) => {
    if (ok) toast(`Экспорт CSV: записей — ${rows.length}`);
  });
}
