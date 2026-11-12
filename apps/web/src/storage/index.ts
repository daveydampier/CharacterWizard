import { idbStorage } from './idb';
import { memoryStorage } from './memory';
import type { AppStorage } from './types';

export type { AppStorage, StoredCharacter } from './types';
export { memoryStorage } from './memory';
export { idbStorage } from './idb';

/**
 * IndexedDB when it works. Otherwise (private browsing, storage blocked) an in-memory store, with
 * `persistent: false` so the app can say that nothing will be saved.
 */
export async function openStorage(): Promise<{ storage: AppStorage; persistent: boolean }> {
  try {
    return { storage: await idbStorage(), persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}
