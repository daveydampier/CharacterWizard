import type { AppStorage } from './types';

/**
 * Runs every call to the storage one after another, in the order they were made. A delete therefore
 * waits for the writes that were started before it, and cannot leave one of them behind.
 * A call that fails rejects for its own caller and does not stop the calls behind it.
 */
export function serial(storage: AppStorage): AppStorage {
  let tail: Promise<unknown> = Promise.resolve();
  const queued = <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> => {
      const result = tail.then(() => call(...args));
      tail = result.catch(() => undefined);
      return result;
    };
  return {
    listCharacters: queued(() => storage.listCharacters()),
    putCharacter: queued((character) => storage.putCharacter(character)),
    removeCharacter: queued((id) => storage.removeCharacter(id)),
    rekeyCharacter: queued((oldId, character) => storage.rekeyCharacter(oldId, character)),
    listItems: queued((characterId?: string) => storage.listItems(characterId)),
    putItem: queued((item) => storage.putItem(item)),
    removeItem: queued((characterId, kind, key) => storage.removeItem(characterId, kind, key)),
    getMeta: queued((name) => storage.getMeta(name)),
    setMeta: queued((name, value) => storage.setMeta(name, value)),
    clear: queued(() => storage.clear()),
  };
}
