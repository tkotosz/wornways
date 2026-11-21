// The activity library, kept in the browser's IndexedDB so it is there on the next visit.
// One record per activity: its id, name, sport, start time and points.

import type { Track } from '@wornways/engine';

const DATABASE = 'wornways';
const VERSION = 1;
const ACTIVITIES = 'activities';

/** Turns an IndexedDB request into a promise of its result. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Waits until a transaction has written everything. */
function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new DOMException('Storing was aborted', 'AbortError'));
  });
}

export class ActivityStoreUnavailable extends Error {
  constructor(cause: DOMException) {
    super(
      'The browser lost access to the activity library. Try again. If it still fails, close and reopen this tab.',
      { cause },
    );
  }
}

export type ActivityStore = {
  /** Every stored activity. */
  readAll(): Promise<Track[]>;
  /** Stores the activities, replacing any with the same id. */
  put(activities: Track[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  deleteAll(): Promise<void>;
};

/** Use a fresh connection for each operation, including after the file picker closes. */
async function withDatabase<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let db: IDBDatabase | undefined;
    try {
      const opening = indexedDB.open(DATABASE, VERSION);
      opening.onupgradeneeded = () =>
        opening.result.createObjectStore(ACTIVITIES, { keyPath: 'id' });
      db = await done(opening);
      return await operation(db);
    } catch (error) {
      if (
        !(error instanceof DOMException) ||
        !['InvalidStateError', 'AbortError', 'UnknownError'].includes(error.name)
      )
        throw error;
      if (attempt > 0) throw new ActivityStoreUnavailable(error);
    } finally {
      db?.close();
    }
  }
}

/** Enqueue all writes synchronously and wait for commit or rollback. */
async function write(db: IDBDatabase, enqueue: (store: IDBObjectStore) => void): Promise<void> {
  const transaction = db.transaction(ACTIVITIES, 'readwrite');
  const completion = committed(transaction);
  try {
    enqueue(transaction.objectStore(ACTIVITIES));
  } catch (error) {
    transaction.abort();
    await completion.catch(() => {});
    throw error;
  }
  await completion;
}

export function createActivityStore(): ActivityStore {
  // A retry must finish before the next operation, so a failed write can't overtake a delete.
  let pending: Promise<unknown> = Promise.resolve();
  function access<T>(operation: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const result = pending.then(() => withDatabase(operation));
    pending = result.catch(() => {});
    return result;
  }

  return {
    readAll() {
      return access((db) =>
        done(
          db.transaction(ACTIVITIES, 'readonly').objectStore(ACTIVITIES).getAll() as IDBRequest<
            Track[]
          >,
        ),
      );
    },
    put(activities) {
      return access((db) =>
        write(db, (store) => {
          for (const activity of activities) store.put(activity);
        }),
      );
    },
    delete(ids) {
      return access((db) =>
        write(db, (store) => {
          for (const id of ids) store.delete(id);
        }),
      );
    },
    deleteAll() {
      return access((db) => write(db, (store) => store.clear()));
    },
  };
}

/** A store that keeps activities in memory only, such as the demo's: nothing is saved. */
export function createMemoryStore(activities: Track[]): ActivityStore {
  const stored = new Map(activities.map((a) => [a.id, a]));
  return {
    readAll: async () => [...stored.values()],
    put: async (added) => {
      for (const activity of added) stored.set(activity.id, activity);
    },
    delete: async (ids) => {
      for (const id of ids) stored.delete(id);
    },
    deleteAll: async () => stored.clear(),
  };
}
