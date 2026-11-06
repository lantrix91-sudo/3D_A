import type { AppEvent, Breakdown, MaintenancePlan, MaintenanceRecord } from '../domain/types';
import type { Repository } from './repository';

/** Хранилище в памяти браузера. Данные теряются при перезагрузке страницы. */
export function createMemoryRepository(): Repository {
  let events: AppEvent[] = [];
  const breakdowns = new Map<string, Breakdown>();
  const plans = new Map<string, MaintenancePlan>();
  const records = new Map<string, MaintenanceRecord>();
  const meta = new Map<string, unknown>();

  return {
    async addEvents(list) { events.push(...list); },
    async listEvents(limit, eq) {
      return [...events].filter((e) => !eq || e.equipmentId === eq).sort((a, b) => b.ts - a.ts).slice(0, limit);
    },
    async listBreakdowns() { return [...breakdowns.values()]; },
    async putBreakdown(b) { breakdowns.set(b.id, b); },
    async listPlans() { return [...plans.values()]; },
    async putPlan(p) { plans.set(p.id, p); },
    async listRecords() { return [...records.values()]; },
    async putRecord(r) { records.set(r.id, r); },
    async getMeta<T>(k: string) { return meta.get(k) as T | undefined; },
    async setMeta<T>(k: string, v: T) { meta.set(k, v); },
    async trimEvents(maxEvents) { events = events.sort((a, b) => a.ts - b.ts).slice(-maxEvents); },
  };
}
