import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { STATE_KEY, type AppStorage, type StoredCharacter, type StoredItem } from './types';

export const DB_NAME = 'character-wizard';
export const DB_VERSION = 2;

interface Schema extends DBSchema {
  characters: { key: string; value: StoredCharacter };
  items: { key: [string, string, string]; value: StoredItem; indexes: { byCharacter: string } };
  meta: { key: string; value: unknown };
}

type UpgradeTx = IDBPTransaction<Schema, ArrayLike<StoreNames<Schema>>, 'versionchange'>;

/**
 * Version 1 (milestone 2) had `characters` without the sync fields and one `play` record per
 * character. Each character gains the sync fields and is marked dirty so that it uploads after
 * the first sign-in; each play record becomes a `play` item and a `turn` item.
 */
async function upgradeFromVersion1(database: IDBPDatabase<Schema>, tx: UpgradeTx): Promise<void> {
  // The version 1 stores are not in the version 2 schema, so they are read untyped.
  const old = tx as unknown as IDBPTransaction<unknown, string[], 'versionchange'>;
  const characters = tx.objectStore('characters');
  for (const row of (await old.objectStore('characters').getAll()) as Record<string, unknown>[]) {
    const importedAt = typeof row.importedAt === 'string' ? row.importedAt : new Date(0).toISOString();
    await characters.put({
      id: String(row.id),
      ownerId: null,
      ddbId: typeof row.ddbId === 'string' ? row.ddbId : '0',
      name: typeof row.name === 'string' ? row.name : 'Unnamed character',
      rawJson: row.rawJson,
      importedAt,
      updatedAt: importedAt,
      deleted: false,
      dirty: true,
    });
  }
  const items = tx.objectStore('items');
  for (const row of (await old.objectStore('play').getAll()) as Record<string, unknown>[]) {
    const characterId = String(row.characterId);
    const updatedAt = new Date().toISOString();
    await items.put({
      characterId, kind: 'play', key: STATE_KEY,
      data: { spent: row.spent, concentrationKey: row.concentrationKey },
      updatedAt, deleted: false, dirty: true,
    });
    await items.put({ characterId, kind: 'turn', key: STATE_KEY, data: row.turn, updatedAt, deleted: false, dirty: false });
  }
  (database as unknown as IDBDatabase).deleteObjectStore('play');
}

/** Opens (and on first use creates or upgrades) the database. Rejects where IndexedDB is unavailable. */
export async function idbStorage(): Promise<AppStorage> {
  const db = await openDB<Schema>(DB_NAME, DB_VERSION, {
    async upgrade(database, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) database.createObjectStore('characters', { keyPath: 'id' });
      if (oldVersion < 2) {
        const items = database.createObjectStore('items', { keyPath: ['characterId', 'kind', 'key'] });
        items.createIndex('byCharacter', 'characterId');
        database.createObjectStore('meta');
        if (oldVersion === 1) await upgradeFromVersion1(database, tx);
      }
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
    async removeCharacter(id) {
      const tx = db.transaction(['characters', 'items'], 'readwrite');
      const keys = await tx.objectStore('items').index('byCharacter').getAllKeys(id);
      await Promise.all([
        tx.objectStore('characters').delete(id),
        ...keys.map((key) => tx.objectStore('items').delete(key)),
        tx.done,
      ]);
    },
    async rekeyCharacter(oldId, character) {
      const tx = db.transaction(['characters', 'items'], 'readwrite');
      const items = tx.objectStore('items');
      const moved = await items.index('byCharacter').getAll(oldId);
      await Promise.all([
        tx.objectStore('characters').delete(oldId),
        tx.objectStore('characters').put(character),
        ...moved.map((item) => items.delete([oldId, item.kind, item.key])),
        ...moved.map((item) => items.put({ ...item, characterId: character.id })),
        tx.done,
      ]);
    },
    async listItems(characterId) {
      return characterId === undefined ? db.getAll('items') : db.getAllFromIndex('items', 'byCharacter', characterId);
    },
    async putItem(item) {
      await db.put('items', item);
    },
    async removeItem(characterId, kind, key) {
      await db.delete('items', [characterId, kind, key]);
    },
    async getMeta(name) {
      return (await db.get('meta', name)) ?? null;
    },
    async setMeta(name, value) {
      await db.put('meta', value, name);
    },
    async clear() {
      const tx = db.transaction(['characters', 'items', 'meta'], 'readwrite');
      await Promise.all([
        tx.objectStore('characters').clear(), tx.objectStore('items').clear(), tx.objectStore('meta').clear(), tx.done,
      ]);
    },
  };
}
