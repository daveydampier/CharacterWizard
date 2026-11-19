import type { SyncedKind } from '../storage';

/** How many live characters one account may hold. The database enforces it; the app checks first. */
export const CHARACTER_LIMIT = 10;
/** How many imports one player may make in an hour. */
export const IMPORTS_PER_HOUR = 30;

export interface Profile {
  id: string;
  /** The player's name on Discord. */
  displayName: string;
  approved: boolean;
  isTableAdmin: boolean;
}

/** A row of the `characters` table. */
export interface RemoteCharacter {
  id: string;
  ownerId: string;
  ddbId: string;
  name: string;
  /** Null once the character is deleted. */
  rawJson: unknown;
  importedAt: string;
  updatedAt: string;
  deleted: boolean;
  /** Stamped by the account on every accepted write. Higher means later. */
  rev: number;
}

/** A row of the `character_items` table. */
export interface RemoteItem {
  characterId: string;
  kind: SyncedKind;
  key: string;
  /** Null once the item is deleted. */
  data: unknown;
  updatedAt: string;
  deleted: boolean;
  rev: number;
}

/** What a device sends. The account decides the owner (whoever creates the row) and the rev. */
export type CharacterPush = Omit<RemoteCharacter, 'rev' | 'ownerId'>;
export type ItemPush = Omit<RemoteItem, 'rev'>;

/**
 * Characters the account would not take. `limit`: the owner already has ten. `refused`: not the
 * caller's to write. A write that is merely older than what the account holds is not listed.
 */
export interface PushResult {
  rejected: { id: string; reason: 'limit' | 'refused' }[];
}

export type ImportResult =
  | { status: 'ok'; raw: unknown }
  | { status: 'private' | 'not-found' | 'upstream-error' | 'unreachable' | 'unauthorized' | 'not-approved' | 'rate-limited' };

/** What the account's own check says before an import is allowed. */
export type ImportAllowance = 'ok' | 'not-approved' | 'rate-limited';

/**
 * `offline`: the account could not be reached. `unauthorized`: nobody is signed in, or the session
 * is no longer valid. `refused`: the account understood and said no. `other`: anything else.
 */
export type RemoteErrorKind = 'offline' | 'unauthorized' | 'refused' | 'other';

export class RemoteError extends Error {
  constructor(public readonly kind: RemoteErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'RemoteError';
  }
}

/**
 * Everything the app asks of the account. `supabaseRemote` talks to Supabase; `memoryServer` keeps
 * the same rules in memory for tests and for local development. Every method except `start`,
 * `signIn` and `signOut` rejects with a RemoteError when it cannot do what was asked.
 */
export interface Remote {
  /**
   * Reads the session kept on this device, completing a sign-in that has just returned to the
   * page. Calls `onUser` with the signed-in user's ID (or null) once before it resolves, and
   * again whenever that changes.
   */
  start(onUser: (userId: string | null) => void): Promise<void>;
  /** Starts sign-in. With Supabase this leaves the page for Discord. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** The signed-in user's own profile; null if it does not exist yet. */
  profile(): Promise<Profile | null>;
  /** Every profile for a table admin; only their own for anyone else. Ordered by name. */
  listProfiles(): Promise<Profile[]>;
  /** Table admins only, and never on their own profile. */
  setApproved(userId: string, approved: boolean): Promise<void>;
  pushCharacters(rows: CharacterPush[]): Promise<PushResult>;
  /** Items whose character the caller cannot see, or that is deleted, are skipped without an error. */
  pushItems(rows: ItemPush[]): Promise<void>;
  /** Visible characters with a rev above `afterRev`, lowest rev first. */
  pullCharacters(afterRev: number): Promise<RemoteCharacter[]>;
  pullItems(afterRev: number): Promise<RemoteItem[]>;
  /** Fetches a character from D&D Beyond through the import function. Never rejects. */
  importCharacter(ddbId: string): Promise<ImportResult>;
}
