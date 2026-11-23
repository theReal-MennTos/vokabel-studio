// Kleine IndexedDB-Schicht. Alle Daten bleiben auf dem Gerät.
import { DB_NAME } from './config.js';
const DB_VERSION = 1;

// store: [keyPath, [indexName, keyPath]...]
const STORES = {
  faecher: ['id'],
  lehrwerke: ['id', ['fachId', 'fachId']],
  units: ['id', ['lehrwerkId', 'lehrwerkId']],
  parts: ['id', ['unitId', 'unitId']],
  vokabeln: ['id', ['unitId', 'unitId'], ['partId', 'partId']],
  lernsaetze: ['id', ['unitId', 'unitId']],
  satzbau: ['id', ['unitId', 'unitId']],
  material: ['id', ['unitId', 'unitId']],          // später: Lückentexte, Arbeitsblätter
  importe: ['id'],
  profile: ['id'],
  lernstand: ['key', ['profilId', 'profilId'], ['vokabelId', 'vokabelId']],
  ereignisse: ['id', ['profilId', 'profilId']],
  termine: ['id', ['profilId', 'profilId']],
  tests: ['id', ['profilId', 'profilId']],
  belohnungen: ['profilId'],
  meta: ['key']
};
export const INHALT_STORES = ['faecher', 'lehrwerke', 'units', 'parts', 'vokabeln', 'lernsaetze', 'satzbau', 'material'];
export const LERN_STORES = ['lernstand', 'ereignisse', 'termine', 'tests', 'belohnungen'];

let dbPromise;
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, [keyPath, ...indexes]] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const s = db.createObjectStore(name, { keyPath });
        for (const [iname, ipath] of indexes) s.createIndex(iname, ipath);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Die Datenbank ist blockiert. Bitte alle anderen Tabs mit Vokabel-Studio schließen.'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(name, key) { return wrap((await store(name)).get(key)); }
export async function all(name) { return wrap((await store(name)).getAll()); }
export async function byIndex(name, index, value) { return wrap((await store(name)).index(index).getAll(value)); }
export async function put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); }
export async function del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); }

// Mehrere Schreibvorgänge in einer Transaktion: ops = [{store, op:'put'|'del', value|key}]
export async function batch(ops) {
  const db = await openDb();
  const names = [...new Set(ops.map((o) => o.store))];
  if (!names.length) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if (o.op === 'del') s.delete(o.key); else s.put(o.value);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
  });
}

export async function clearStores(names) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) { return put('meta', { key, value }); }

// Unit samt Inhalt löschen (Lernstände der Profile zu diesen Vokabeln mit)
export async function deleteUnit(unitId) {
  const [parts, voks, saetze, satzbau] = await Promise.all([
    byIndex('parts', 'unitId', unitId), byIndex('vokabeln', 'unitId', unitId),
    byIndex('lernsaetze', 'unitId', unitId), byIndex('satzbau', 'unitId', unitId)
  ]);
  const ops = [
    ...parts.map((x) => ({ store: 'parts', op: 'del', key: x.id })),
    ...voks.map((x) => ({ store: 'vokabeln', op: 'del', key: x.id })),
    ...saetze.map((x) => ({ store: 'lernsaetze', op: 'del', key: x.id })),
    ...satzbau.map((x) => ({ store: 'satzbau', op: 'del', key: x.id })),
    { store: 'units', op: 'del', key: unitId }
  ];
  for (const v of voks) {
    for (const ls of await byIndex('lernstand', 'vokabelId', v.id)) ops.push({ store: 'lernstand', op: 'del', key: ls.key });
  }
  return batch(ops);
}
