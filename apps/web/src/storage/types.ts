/** The kinds of item that sync to the account, one row each in `character_items`. */
export const SYNCED_KINDS = ['play', 'edit', 'custom', 'order'] as const;
export type SyncedKind = (typeof SYNCED_KINDS)[number];

/** `turn` (the Action, Bonus Action and Reaction pills) never leaves the device. */
export type ItemKind = SyncedKind | 'turn';

/** The key of the one `play` item and the one `turn` item each character has. */
export const STATE_KEY = 'state';

/** One imported character. Mirrors a row of the `characters` table. */
export interface StoredCharacter {
  /** `ddb-<ddbId>-<ownerId>` for an imported character; a UUID for pasted JSON with no D&D Beyond ID. */
  id: string;
  /** The account that owns it. Null only for a character imported before accounts existed. */
  ownerId: string | null;
  /** The D&D Beyond character ID, as a string. "0" when the JSON had none. */
  ddbId: string;
  name: string;
  /** The D&D Beyond response exactly as it was imported. Null once the character is deleted. */
  rawJson: unknown;
  /** ISO 8601 date and time. */
  importedAt: string;
  /** When this record last changed, by this device's clock when it made the change. */
  updatedAt: string;
  /** A deleted character is kept until the account has been told. */
  deleted: boolean;
  /** Changed on this device and not yet accepted by the account. */
  dirty: boolean;
}

/** Something attached to a character: what is spent, one ability's edits, one view's order. */
export interface StoredItem {
  characterId: string;
  kind: ItemKind;
  key: string;
  /** Checked and repaired by whoever reads it. Null once the item is deleted. */
  data: unknown;
  updatedAt: string;
  deleted: boolean;
  dirty: boolean;
}

/** What to do with a record once it has been looked at: store this in its place, remove it, or leave it. */
export type Update<T> = { put: T } | 'remove' | 'keep';

/**
 * Where this device keeps its copy of everything. Named AppStorage because `Storage` is already
 * the browser's own type for localStorage. Every value is copied on the way in and on the way out.
 */
export interface AppStorage {
  /** Every character, including deleted ones that the account has not yet been told about. */
  listCharacters(): Promise<StoredCharacter[]>;
  putCharacter(character: StoredCharacter): Promise<void>;
  /**
   * Looks at one character and stores, removes or keeps it, as one step: no other call can change
   * the record in between. `decide` is given a copy, or null when the device holds none, and must
   * answer at once, without waiting for anything. Removing a character removes its items.
   */
  updateCharacter(id: string, decide: (current: StoredCharacter | null) => Update<StoredCharacter>): Promise<void>;
  /** Removes the character and every item it has from this device. */
  removeCharacter(id: string): Promise<void>;
  /** Stores `character` in place of the one with `oldId`, moving that character's items to it. */
  rekeyCharacter(oldId: string, character: StoredCharacter): Promise<void>;
  /** One character's items, or every item when no ID is given. */
  listItems(characterId?: string): Promise<StoredItem[]>;
  putItem(item: StoredItem): Promise<void>;
  /**
   * The same for one item. `decide` is also given the item's character, or null when the device
   * does not hold it.
   */
  updateItem(
    characterId: string, kind: ItemKind, key: string,
    decide: (current: StoredItem | null, character: StoredCharacter | null) => Update<StoredItem>,
  ): Promise<void>;
  removeItem(characterId: string, kind: ItemKind, key: string): Promise<void>;
  /** A small named value: who is signed in, how far fetching has got. Null when never set. */
  getMeta(name: string): Promise<unknown>;
  setMeta(name: string, value: unknown): Promise<void>;
  /** Empties everything. Used when signing out. */
  clear(): Promise<void>;
}
