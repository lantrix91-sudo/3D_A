// Офлайн-очередь осмотров: сохраняется в IndexedDB (вместе с фото), досылается при появлении связи.
// Сервер принимает повтор с тем же client_id как дубль, поэтому повторная отправка безопасна.

// crypto.randomUUID есть только в защищённом контексте; телефон в цеху открывает http://192.168…
export function uuid(random = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = random(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function memoryStore() {
  const items = new Map();
  return {
    all: async () => [...items.values()],
    put: async (value) => { items.set(value.client_id, value); },
    delete: async (key) => { items.delete(key); },
  };
}

export function idbStore(name = 'plant-twin', storeName = 'inspections') {
  let database = null;
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'client_id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const run = async (mode, action) => {
    database ||= await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  };
  return {
    all: () => run('readonly', (store) => store.getAll()),
    put: (value) => run('readwrite', (store) => store.put(value)),
    delete: (key) => run('readwrite', (store) => store.delete(key)),
  };
}

export function defaultStore(name, storeName) {
  try {
    if (globalThis.indexedDB) return idbStore(name, storeName);
  } catch { /* приватный режим без IndexedDB */ }
  return memoryStore();
}

// Ошибки, которые повтор не исправит: осмотр ждёт решения пользователя (удалить).
const PERMANENT = new Set([400, 403, 404]);
// Нет сети (0) или сеанс истёк (401): следующие осмотры тоже не уйдут — прекращаем до следующей попытки.
const STOP_ALL = new Set([0, 401]);

export function createQueue({
  store = defaultStore(), send, onChange = () => {}, isOnline = () => globalThis.navigator?.onLine !== false,
  timers = globalThis, interval = 30000,
}) {
  let syncing = null;
  let timer = null;

  async function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      const sent = [];
      const entries = (await store.all()).sort((a, b) => a.inspected_at - b.inspected_at);
      for (const entry of entries) {
        if (entry.error) continue;
        if (!isOnline()) break;
        try {
          sent.push(await send(entry));
          await store.delete(entry.client_id);
        } catch (error) {
          if (STOP_ALL.has(error.status ?? 0)) break;
          // 5xx, 413 и т. п. касаются этого осмотра: он остаётся в очереди, остальные идут дальше.
          if (!PERMANENT.has(error.status)) continue;
          await store.put({ ...entry, error: error.message });
        }
      }
      return sent;
    })().finally(() => { syncing = null; });
    const sent = await syncing;
    onChange(sent);
    return sent;
  }

  const online = () => { sync(); };
  globalThis.addEventListener?.('online', online);
  timer = timers.setInterval(() => { sync(); }, interval);

  return {
    list: () => store.all(),
    // Возвращается сразу после записи на устройство; отправка идёт в фоне.
    async add(entry) {
      await store.put(entry);
      onChange([]);
      sync().catch(() => []);
    },
    async remove(clientId) {
      await store.delete(clientId);
      onChange([]);
    },
    sync,
    dispose() {
      timers.clearInterval(timer);
      globalThis.removeEventListener?.('online', online);
    },
  };
}

// Осмотр → multipart для POST /api/v1/rounds/inspections/.
export function inspectionForm(entry) {
  const form = new FormData();
  for (const key of ['client_id', 'equipment', 'result', 'comment']) form.append(key, entry[key] ?? '');
  form.append('inspected_at', String(entry.inspected_at));
  form.append('answers', JSON.stringify(entry.answers || []));
  for (const photo of entry.photos || []) form.append('photos', photo.blob, photo.name);
  return form;
}
