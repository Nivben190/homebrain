// Lists that work offline (roadmap 2.5). A write that can't reach the database
// while offline is kept as data in IndexedDB and replayed, in order, once the
// connection returns. New rows carry client-side UUIDs, so a replay that
// repeats a write that did land is harmless.

export interface QueuedWrite {
  table: "items" | "checkins";
  action: "upsert" | "update" | "delete";
  values?: Record<string, unknown>;
  /** Equality filters for update and delete. */
  match?: Record<string, string>;
  onConflict?: string;
}

export interface QueueStore {
  all(): Promise<{ key: number; op: QueuedWrite }[]>;
  add(op: QueuedWrite): Promise<void>;
  remove(key: number): Promise<void>;
}

/** Network failures, as opposed to the database refusing the write. */
export function isNetworkError(error: unknown, online = typeof navigator === "undefined" || navigator.onLine !== false) {
  if (!online) return true;
  const msg = String((error as { message?: unknown })?.message ?? error);
  return /failed to fetch|network|load failed|fetch failed/i.test(msg);
}

/**
 * Replays queued writes oldest first. Stops at the first network failure (still
 * offline), and drops a write the database refuses, since retrying it can't help.
 * Returns how many are left.
 */
export async function replay(store: QueueStore, run: (op: QueuedWrite) => Promise<{ error: unknown }>, onDropped?: (op: QueuedWrite, error: unknown) => void) {
  const queued = await store.all();
  for (const [n, { key, op }] of queued.entries()) {
    let error: unknown;
    try {
      ({ error } = await run(op));
    } catch (e) {
      error = e;
    }
    if (error && isNetworkError(error)) return queued.length - n;
    if (error) onDropped?.(op, error);
    await store.remove(key);
  }
  return 0;
}

const DB = "home-brain-offline";
const STORE = "writes";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
      }),
  );
}

export const idbQueue: QueueStore = {
  async all() {
    const out: { key: number; op: QueuedWrite }[] = [];
    await tx("readonly", (s) => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        out.push({ key: c.key as number, op: c.value as QueuedWrite });
        c.continue();
      };
    });
    return out;
  },
  async add(op) {
    await tx("readwrite", (s) => s.add(op));
    window.dispatchEvent(new Event(QUEUE_CHANGED));
  },
  async remove(key) {
    await tx("readwrite", (s) => s.delete(key));
    window.dispatchEvent(new Event(QUEUE_CHANGED));
  },
};

export const QUEUE_CHANGED = "offline-queue-changed";
