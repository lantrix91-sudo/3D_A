/** Стабильные уникальные идентификаторы с префиксом сущности, например BRK-…, PPR-… */
export function newId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}
