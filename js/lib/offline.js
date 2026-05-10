// Offline write queue. Backed by IndexedDB.
// Public API:
//   await enqueue({ table, op, payload, match })
//   await drain()    — try to flush queued writes against Supabase
//   queueSize()
//
// op = 'insert' | 'update' | 'upsert' | 'delete'
// match is the WHERE clause for update/delete: { column: value }
//
// This is intentionally simple — the main use case is logging bouts in a
// gym with bad wifi. Reads still go to the network when online; offline
// reads are not required for MVP.

import { supa } from './supa.js';

const DB_NAME = 'en-garde-tsui';
const DB_VERSION = 1;
const STORE = 'queue';

let _dbPromise;

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

async function tx(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        Promise.resolve(fn(store))
            .then((r) => { result = r; })
            .catch(reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
    });
}

export async function enqueue(entry) {
    entry = { ...entry, queuedAt: new Date().toISOString() };
    return tx('readwrite', (store) =>
        new Promise((res, rej) => {
            const r = store.add(entry);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        })
    );
}

export async function queueSize() {
    return tx('readonly', (store) =>
        new Promise((res, rej) => {
            const r = store.count();
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        })
    );
}

async function getAll() {
    return tx('readonly', (store) =>
        new Promise((res, rej) => {
            const r = store.getAll();
            r.onsuccess = () => res(r.result || []);
            r.onerror = () => rej(r.error);
        })
    );
}

async function remove(id) {
    return tx('readwrite', (store) =>
        new Promise((res, rej) => {
            const r = store.delete(id);
            r.onsuccess = () => res();
            r.onerror = () => rej(r.error);
        })
    );
}

async function applyOne(entry) {
    const { table, op, payload, match } = entry;
    const t = supa.from(table);
    if (op === 'insert') return t.insert(payload).select();
    if (op === 'upsert') return t.upsert(payload).select();
    if (op === 'update') {
        let q = t.update(payload);
        for (const [k, v] of Object.entries(match || {})) q = q.eq(k, v);
        return q.select();
    }
    if (op === 'delete') {
        let q = t.delete();
        for (const [k, v] of Object.entries(match || {})) q = q.eq(k, v);
        return q;
    }
    throw new Error('unknown op: ' + op);
}

let _draining = false;

export async function drain() {
    if (_draining) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    _draining = true;
    try {
        const all = await getAll();
        for (const entry of all) {
            try {
                const { error } = await applyOne(entry);
                if (error) {
                    console.warn('[queue] entry failed, leaving in queue:', entry, error);
                    break; // stop on first failure to preserve order
                }
                await remove(entry.id);
            } catch (e) {
                console.warn('[queue] exception, leaving in queue:', e);
                break;
            }
        }
    } finally {
        _draining = false;
    }
}

export async function safeWrite(entry) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue(entry);
        return { offline: true };
    }
    try {
        const { data, error } = await applyOne(entry);
        if (error) throw error;
        return { data };
    } catch (e) {
        // Network or transient failure → enqueue
        if (e?.message && /Failed to fetch|NetworkError/i.test(e.message)) {
            await enqueue(entry);
            return { offline: true };
        }
        throw e;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { drain(); });
}
