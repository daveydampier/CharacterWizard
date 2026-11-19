import {
  RemoteError,
  type CharacterPush, type ItemPush, type Profile, type PushResult, type RemoteCharacter, type RemoteItem,
} from './types';

// The database's column names on one side, the app's field names on the other. Used by
// supabaseRemote and by the database tests, so the tests exercise the same mapping.

type Row = Record<string, unknown>;

/** A timestamp as the database returns it (a string from the API, a Date from a driver), as ISO 8601. */
const iso = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export const characterToRow = (c: CharacterPush): Row => ({
  id: c.id,
  ddb_character_id: c.ddbId,
  name: c.name,
  raw_json: c.deleted ? null : c.rawJson,
  imported_at: c.importedAt,
  updated_at: c.updatedAt,
  deleted: c.deleted,
});

export const characterFromRow = (row: Row): RemoteCharacter => ({
  id: text(row.id),
  ownerId: text(row.owner_id),
  ddbId: text(row.ddb_character_id),
  name: text(row.name),
  rawJson: row.raw_json ?? null,
  importedAt: iso(row.imported_at),
  updatedAt: iso(row.updated_at),
  deleted: row.deleted === true,
  rev: Number(row.rev),
});

export const itemToRow = (i: ItemPush): Row => ({
  character_id: i.characterId,
  kind: i.kind,
  key: i.key,
  data: i.deleted ? null : i.data,
  updated_at: i.updatedAt,
  deleted: i.deleted,
});

export const itemFromRow = (row: Row): RemoteItem => ({
  characterId: text(row.character_id),
  kind: text(row.kind) as RemoteItem['kind'],
  key: text(row.key),
  data: row.data ?? null,
  updatedAt: iso(row.updated_at),
  deleted: row.deleted === true,
  rev: Number(row.rev),
});

export const profileFromRow = (row: Row): Profile => ({
  id: text(row.id),
  displayName: text(row.display_name),
  approved: row.approved === true,
  isTableAdmin: row.is_table_admin === true,
});

/** What push_characters returns, checked: a list of { id, reason }. */
export function rejectedFromJson(value: unknown): PushResult['rejected'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Row => entry !== null && typeof entry === 'object')
    .map((entry) => ({ id: text(entry.id), reason: entry.reason === 'limit' ? 'limit' as const : 'refused' as const }));
}

/**
 * A database or API error as a RemoteError. 42501 is "insufficient privilege", which is also what
 * set_player_approved raises. PGRST301 and 401 mean the token is missing, invalid or expired.
 */
export function remoteErrorFrom(error: { code?: string; status?: number; message?: string }): RemoteError {
  if (error.code === '42501') return new RemoteError('refused', error.message);
  if (error.code === 'PGRST301' || error.code === 'PGRST302' || error.status === 401) {
    return new RemoteError('unauthorized', error.message);
  }
  return new RemoteError('other', error.message);
}
