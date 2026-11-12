import type { PlayState } from '@cw/model';
import type { AppStorage, StoredCharacter } from './types';

/** Keeps everything in memory. Used in tests, and as the fallback when IndexedDB is unavailable. */
export function memoryStorage(): AppStorage {
  const characters = new Map<string, StoredCharacter>();
  const play = new Map<string, PlayState>();
  return {
    async listCharacters() {
      return [...characters.values()];
    },
    async putCharacter(character) {
      characters.set(character.id, character);
    },
    async deleteCharacter(id) {
      characters.delete(id);
      play.delete(id);
    },
    async getPlay(characterId) {
      return play.get(characterId) ?? null;
    },
    async putPlay(characterId, state) {
      play.set(characterId, state);
    },
  };
}
