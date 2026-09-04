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
    const { table, op, payload, match, onConflict } = entry;
    const t = supa.from(table);
    if (op === 'insert') return t.insert(payload).select();
    // onConflict names the unique key an upsert should merge on. Without it
    // PostgREST resolves on the primary key alone, and since these payloads
    // never carry an id the second save of a day was a plain insert into
    // a (profile_id, date) unique key - rejected, so the edit never landed.
    // enqueue() spreads the whole entry, so a queued upsert keeps its key.
    if (op === 'upsert') return t.upsert(payload, onConflict ? { onConflict } : undefined).select();
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
        // A row-level-security refusal on a write almost always means the tab
        // is holding a profile that no longer exists - the page was left open
        // across a change. "violates row-level security policy" tells a
        // thirteen-year-old nothing; say what to actually do about it.
        const msg = String(e?.message || '');
        if (/row-level security|row level security|42501/i.test(msg)) {
            const friendly = new Error(
                'This page is out of date - reload it and sign in again, then re-enter this. Nothing you saved before is lost.'
            );
            friendly.cause = e;
            friendly.isStaleSession = true;
            throw friendly;
        }
        throw e;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { drain(); });
}
