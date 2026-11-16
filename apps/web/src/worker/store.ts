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
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Storing was aborted'));
  });
}

export type ActivityStore = {
  /** Every stored activity. */
  readAll(): Promise<Track[]>;
  /** Stores the activities, replacing any with the same id. */
  put(activities: Track[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  deleteAll(): Promise<void>;
};

export async function openActivityStore(): Promise<ActivityStore> {
  const opening = indexedDB.open(DATABASE, VERSION);
  opening.onupgradeneeded = () => opening.result.createObjectStore(ACTIVITIES, { keyPath: 'id' });
  const db = await done(opening);
  const transaction = (mode: IDBTransactionMode) => db.transaction(ACTIVITIES, mode);

  return {
    async readAll() {
      return done(transaction('readonly').objectStore(ACTIVITIES).getAll() as IDBRequest<Track[]>);
    },
    async put(activities) {
      const t = transaction('readwrite');
      for (const activity of activities) t.objectStore(ACTIVITIES).put(activity);
      await committed(t);
    },
    async delete(ids) {
      const t = transaction('readwrite');
      for (const id of ids) t.objectStore(ACTIVITIES).delete(id);
      await committed(t);
    },
    async deleteAll() {
      const t = transaction('readwrite');
      t.objectStore(ACTIVITIES).clear();
      await committed(t);
    },
  };
}
