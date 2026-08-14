const STORAGE_KEY = 'dubapp.jobs.v2';

class LocalStore {
  constructor(storage) { this.storage = storage; }
  async loadAll() {
    try { return JSON.parse(this.storage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }
  async put(item) {
    const all = await this.loadAll();
    const index = all.findIndex(entry => entry.id === item.id);
    if (index >= 0) all[index] = item; else all.push(item);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  async remove(id) {
    const all = await this.loadAll();
    this.storage.setItem(STORAGE_KEY, JSON.stringify(all.filter(item => item.id !== id)));
  }
}

class IndexedStore {
  constructor(indexedDB) { this.indexedDB = indexedDB; this.dbPromise = null; }
  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open('doblaje-rapido-pro', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('jobs', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }
  async transaction(mode, action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('jobs', mode);
      const request = action(tx.objectStore('jobs'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async loadAll() { return (await this.transaction('readonly', store => store.getAll())) || []; }
  async put(item) { await this.transaction('readwrite', store => store.put(item)); }
  async remove(id) { await this.transaction('readwrite', store => store.delete(id)); }
}

export function createJobStore(env = globalThis) {
  if (env.indexedDB) return new IndexedStore(env.indexedDB);
  if (env.localStorage) return new LocalStore(env.localStorage);
  const items = new Map();
  return { loadAll: async () => [...items.values()], put: async item => items.set(item.id, item), remove: async id => items.delete(id) };
}
