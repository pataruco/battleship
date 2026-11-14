const dbs = new Map<string, Promise<IDBDatabase>>();

export function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Opens (once per name) the v1 database: profile, games, fleets. */
export function openDb(name = 'bship'): Promise<IDBDatabase> {
  let p = dbs.get(name);
  if (!p) {
    p = new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore('profile');
        db.createObjectStore('games', { keyPath: 'id' });
        db.createObjectStore('fleets');
      };
      open.onsuccess = () => {
        const db = open.result;
        // The browser may drop the connection (storage pressure) or another tab may upgrade it:
        // forget it so the next call reopens.
        db.onclose = () => forget(name, p!);
        db.onversionchange = () => {
          db.close();
          forget(name, p!);
        };
        resolve(db);
      };
      open.onerror = () => reject(open.error);
    });
    p.catch(() => dbs.delete(name));
    dbs.set(name, p);
  }
  return p;
}

function forget(name: string, p: Promise<IDBDatabase>): void {
  if (dbs.get(name) === p) dbs.delete(name);
}

/** A closed or broken connection: worth one retry on a fresh one. */
function isStale(e: unknown): boolean {
  const n = (e as { name?: unknown } | null)?.name;
  return n === 'InvalidStateError' || n === 'UnknownError';
}

/** Runs `fn` on the cached connection; if that connection went stale, reopens once and retries. */
export async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>, name = 'bship'): Promise<T> {
  const p = openDb(name);
  try {
    return await fn(await p);
  } catch (e) {
    if (!isStale(e)) throw e;
    forget(name, p);
    return fn(await openDb(name));
  }
}

/** Test-only: closes every cached connection and forgets them. */
export async function closeDb(): Promise<void> {
  const open = [...dbs.values()];
  dbs.clear();
  for (const p of open) {
    try {
      (await p).close();
    } catch {
      /* failed opens have nothing to close */
    }
  }
}
