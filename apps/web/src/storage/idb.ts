import type { PlayState } from '@cw/model';
import { openDB, type DBSchema } from 'idb';
import type { AppStorage, StoredCharacter } from './types';

export const DB_NAME = 'character-wizard';

interface Schema extends DBSchema {
  characters: { key: string; value: StoredCharacter };
  play: { key: string; value: PlayState & { characterId: string } };
}

/** Opens (and on first use creates) the database. Rejects where IndexedDB is unavailable. */
export async function idbStorage(): Promise<AppStorage> {
  const db = await openDB<Schema>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('characters', { keyPath: 'id' });
      database.createObjectStore('play', { keyPath: 'characterId' });
    },
    // A newer version of the app is opening the database in another tab: let it upgrade.
    blocking() {
      db.close();
    },
  });
  return {
    async listCharacters() {
      return db.getAll('characters');
    },
    async putCharacter(character) {
      await db.put('characters', character);
    },
    async deleteCharacter(id) {
      const tx = db.transaction(['characters', 'play'], 'readwrite');
      await Promise.all([tx.objectStore('characters').delete(id), tx.objectStore('play').delete(id), tx.done]);
    },
    async getPlay(characterId) {
      const row = await db.get('play', characterId);
      if (!row) return null;
      return { spent: row.spent, concentrationKey: row.concentrationKey, turn: row.turn };
    },
    async putPlay(characterId, state) {
      await db.put('play', { characterId, spent: state.spent, concentrationKey: state.concentrationKey, turn: state.turn });
    },
  };
}
