import { idbStorage } from './idb';
import { memoryStorage } from './memory';
import { serial } from './serial';
import type { AppStorage } from './types';

export { STATE_KEY, SYNCED_KINDS } from './types';
export type { AppStorage, ItemKind, StoredCharacter, StoredItem, SyncedKind, Update } from './types';
export { memoryStorage } from './memory';
export { idbStorage } from './idb';
export { serial } from './serial';

/**
 * IndexedDB when it works. Otherwise (private browsing, storage blocked) an in-memory store, with
 * `persistent: false` so the app can say that nothing will be saved. Calls run one at a time.
 */
export async function openStorage(): Promise<{ storage: AppStorage; persistent: boolean }> {
  try {
    return { storage: serial(await idbStorage()), persistent: true };
  } catch {
    return { storage: serial(memoryStorage()), persistent: false };
  }
}
