import type { AppStorage, StoredCharacter, StoredItem } from './types';

const itemId = (characterId: string, kind: string, key: string): string => JSON.stringify([characterId, kind, key]);

/** Keeps everything in memory. Used in tests, and as the fallback when IndexedDB is unavailable. */
export function memoryStorage(): AppStorage {
  const characters = new Map<string, StoredCharacter>();
  const items = new Map<string, StoredItem>();
  const meta = new Map<string, unknown>();
  const itemsOf = (characterId: string): StoredItem[] => [...items.values()].filter((i) => i.characterId === characterId);
  const copy = <T>(value: T | undefined): T | null => (value === undefined ? null : structuredClone(value));
  return {
    async listCharacters() {
      return structuredClone([...characters.values()]);
    },
    async putCharacter(character) {
      characters.set(character.id, structuredClone(character));
    },
    async updateCharacter(id, decide) {
      const update = decide(copy(characters.get(id)));
      if (update === 'keep') return;
      if (update === 'remove') {
        characters.delete(id);
        for (const item of itemsOf(id)) items.delete(itemId(item.characterId, item.kind, item.key));
      } else {
        characters.set(update.put.id, structuredClone(update.put));
      }
    },
    async removeCharacter(id) {
      characters.delete(id);
      for (const item of itemsOf(id)) items.delete(itemId(item.characterId, item.kind, item.key));
    },
    async rekeyCharacter(oldId, character) {
      const moved = itemsOf(oldId);
      characters.delete(oldId);
      for (const item of moved) items.delete(itemId(item.characterId, item.kind, item.key));
      characters.set(character.id, structuredClone(character));
      for (const item of moved) items.set(itemId(character.id, item.kind, item.key), { ...item, characterId: character.id });
    },
    async listItems(characterId) {
      return structuredClone(characterId === undefined ? [...items.values()] : itemsOf(characterId));
    },
    async putItem(item) {
      items.set(itemId(item.characterId, item.kind, item.key), structuredClone(item));
    },
    async updateItem(characterId, kind, key, decide) {
      const id = itemId(characterId, kind, key);
      const update = decide(copy(items.get(id)), copy(characters.get(characterId)));
      if (update === 'keep') return;
      if (update === 'remove') items.delete(id);
      else items.set(itemId(update.put.characterId, update.put.kind, update.put.key), structuredClone(update.put));
    },
    async removeItem(characterId, kind, key) {
      items.delete(itemId(characterId, kind, key));
    },
    async getMeta(name) {
      return meta.has(name) ? structuredClone(meta.get(name)) : null;
    },
    async setMeta(name, value) {
      meta.set(name, structuredClone(value));
    },
    async clear() {
      characters.clear();
      items.clear();
      meta.clear();
    },
  };
}
