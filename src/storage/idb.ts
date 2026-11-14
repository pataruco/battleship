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
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    p.catch(() => dbs.delete(name));
    dbs.set(name, p);
  }
  return p;
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
