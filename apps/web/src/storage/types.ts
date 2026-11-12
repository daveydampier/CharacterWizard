import type { PlayState } from '@cw/model';

/** One imported character. Mirrors the `characters` table that milestone 3 adds. */
export interface StoredCharacter {
  /** Local UUID. */
  id: string;
  /** The D&D Beyond character ID, as a string. Re-import finds the record by it. */
  ddbId: string;
  name: string;
  /** The D&D Beyond response exactly as it was imported. Converted on load, never stored converted. */
  rawJson: unknown;
  /** ISO 8601 date and time. */
  importedAt: string;
}

/**
 * Where characters and play state are kept. Named AppStorage because `Storage` is already the
 * browser's own type for localStorage. Milestone 3 adds sync behind this same interface.
 */
export interface AppStorage {
  listCharacters(): Promise<StoredCharacter[]>;
  putCharacter(character: StoredCharacter): Promise<void>;
  /** Also deletes the character's play state. */
  deleteCharacter(id: string): Promise<void>;
  getPlay(characterId: string): Promise<PlayState | null>;
  putPlay(characterId: string, state: PlayState): Promise<void>;
}
