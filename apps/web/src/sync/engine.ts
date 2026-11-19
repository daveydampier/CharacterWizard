import type { PushResult, Remote, RemoteCharacter, RemoteItem } from '../remote/types';
import { SYNCED_KINDS, type AppStorage, type StoredCharacter, type StoredItem, type SyncedKind } from '../storage';

const CURSOR_CHARACTERS = 'cursor:characters';
const CURSOR_ITEMS = 'cursor:items';

export interface SyncDeps {
  storage: AppStorage;
  remote: Remote;
}

export interface SyncResult {
  /** IDs of characters whose record or items on this device were changed by what was fetched. */
  changed: Set<string>;
  /** Characters the account would not take. */
  rejected: PushResult['rejected'];
}

/** The ID of an imported character: the same on every device that imports it into the same account. */
export const characterId = (ddbId: string, ownerId: string): string => `ddb-${ddbId}-${ownerId}`;

/**
 * The time to record for a change made now. Always later than `previous`, even if this device's
 * clock has gone backwards, so the account never mistakes a newer change for an older one.
 */
export function nextStamp(previous?: string, now: number = Date.now()): string {
  const before = previous === undefined ? Number.NaN : Date.parse(previous);
  return new Date(Number.isFinite(before) ? Math.max(now, before + 1) : now).toISOString();
}

const isSynced = (kind: string): kind is SyncedKind => (SYNCED_KINDS as readonly string[]).includes(kind);
const later = (a: string, b: string): boolean => Date.parse(a) > Date.parse(b);
const cursor = async (storage: AppStorage, name: string): Promise<number> => {
  const value = await storage.getMeta(name);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

/** Forgets how far fetching has got, so the next fetch asks for everything the user may see. */
export async function resetCursors(storage: AppStorage): Promise<void> {
  await storage.setMeta(CURSOR_CHARACTERS, 0);
  await storage.setMeta(CURSOR_ITEMS, 0);
}

/**
 * First sign-in on a device: characters imported before accounts existed have no owner. Each is
 * given the signed-in user and the ID an import by that user would have, and is marked dirty so
 * that it uploads. Its items move with it.
 */
export async function claimLocalCharacters(storage: AppStorage, userId: string): Promise<void> {
  const all = await storage.listCharacters();
  for (const character of all.filter((c) => c.ownerId === null)) {
    const id = character.ddbId === '0' ? character.id : characterId(character.ddbId, userId);
    if (id !== character.id && all.some((c) => c.id === id)) {
      // The account's copy of this character is already here: the ownerless one gives way.
      await storage.removeCharacter(character.id);
      continue;
    }
    await storage.rekeyCharacter(character.id, { ...character, id, ownerId: userId, dirty: true });
  }
}

function fromRemote(row: RemoteCharacter): StoredCharacter {
  const { rev: _rev, ...rest } = row;
  return { ...rest, dirty: false };
}

/**
 * Fetches everything changed in the account since the last fetch and merges it into this device.
 * A fetched record replaces the device's copy unless the device's copy is dirty and newer.
 */
export async function pull({ storage, remote }: SyncDeps): Promise<Set<string>> {
  const changed = new Set<string>();

  const characterCursor = await cursor(storage, CURSOR_CHARACTERS);
  const characters = await remote.pullCharacters(characterCursor);
  const local = new Map((await storage.listCharacters()).map((c) => [c.id, c]));
  for (const row of characters) {
    const mine = local.get(row.id);
    if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) {
      if (row.deleted && !mine.deleted) {
        // The account deleted it and threw away its items; this device has since brought it back.
        for (const item of await storage.listItems(row.id)) {
          if (isSynced(item.kind)) await storage.putItem({ ...item, dirty: true });
        }
      }
      continue;
    }
    if (row.deleted) {
      if (mine) {
        await storage.removeCharacter(row.id);
        local.delete(row.id);
        changed.add(row.id);
      }
      continue;
    }
    if (!mine || mine.updatedAt !== row.updatedAt || mine.deleted) changed.add(row.id);
    const stored = fromRemote(row);
    await storage.putCharacter(stored);
    local.set(row.id, stored);
  }
  if (characters.length > 0) await storage.setMeta(CURSOR_CHARACTERS, characters[characters.length - 1].rev);

  const itemCursor = await cursor(storage, CURSOR_ITEMS);
  const items = await remote.pullItems(itemCursor);
  const localItems = new Map<string, StoredItem>();
  const idOf = (i: { characterId: string; kind: string; key: string }): string => JSON.stringify([i.characterId, i.kind, i.key]);
  for (const item of await storage.listItems()) localItems.set(idOf(item), item);
  for (const row of items) {
    const character = local.get(row.characterId);
    // An item for a character this device does not hold (deleted here, or not fetched) is left out.
    if (!character || character.deleted) continue;
    const mine = localItems.get(idOf(row));
    if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) continue;
    if (row.deleted) {
      if (mine) {
        await storage.removeItem(row.characterId, row.kind, row.key);
        changed.add(row.characterId);
      }
      continue;
    }
    if (!mine || mine.updatedAt !== row.updatedAt) changed.add(row.characterId);
    const { rev: _rev, ...rest } = row satisfies RemoteItem;
    await storage.putItem({ ...rest, dirty: false });
  }
  if (items.length > 0) await storage.setMeta(CURSOR_ITEMS, items[items.length - 1].rev);

  return changed;
}

/**
 * Sends every dirty record to the account. A record stops being dirty once the account has
 * answered, whether it took the change or already held a newer one, unless it changed again
 * on this device while the request was in flight.
 */
export async function push({ storage, remote }: SyncDeps): Promise<PushResult['rejected']> {
  const rejected: PushResult['rejected'] = [];

  // One character per request: each carries the whole imported sheet.
  for (const sent of (await storage.listCharacters()).filter((c) => c.dirty && c.ownerId !== null)) {
    const { ownerId: _ownerId, dirty: _dirty, ...row } = sent;
    const result = await remote.pushCharacters([row]);
    rejected.push(...result.rejected);
    // Over the limit: it stays dirty and is offered again once there is room.
    if (result.rejected.some((r) => r.reason === 'limit')) continue;
    const now = (await storage.listCharacters()).find((c) => c.id === sent.id);
    if (!now || now.updatedAt !== sent.updatedAt) continue;
    if (now.deleted) await storage.removeCharacter(now.id);
    else await storage.putCharacter({ ...now, dirty: false });
  }

  // Items wait for their character: the account skips an item whose character it does not have.
  const settled = new Set((await storage.listCharacters()).filter((c) => !c.dirty && !c.deleted).map((c) => c.id));
  const dirtyItems = (await storage.listItems()).filter(
    (i) => i.dirty && isSynced(i.kind) && settled.has(i.characterId),
  );
  if (dirtyItems.length > 0) {
    await remote.pushItems(dirtyItems.map(({ dirty: _dirty, ...row }) => ({ ...row, kind: row.kind as SyncedKind })));
    const after = new Map((await storage.listItems()).map((i) => [JSON.stringify([i.characterId, i.kind, i.key]), i]));
    for (const sent of dirtyItems) {
      const now = after.get(JSON.stringify([sent.characterId, sent.kind, sent.key]));
      if (!now || now.updatedAt !== sent.updatedAt) continue;
      if (now.deleted) await storage.removeItem(now.characterId, now.kind, now.key);
      else await storage.putItem({ ...now, dirty: false });
    }
  }
  return rejected;
}

/** One round: fetch, then send. Rejects with a RemoteError if the account cannot be reached. */
export async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  const changed = await pull(deps);
  const rejected = await push(deps);
  return { changed, rejected };
}

/** True while this device holds a change the account has not yet answered for. */
export async function hasUnsynced(storage: AppStorage): Promise<boolean> {
  if ((await storage.listCharacters()).some((c) => c.dirty)) return true;
  return (await storage.listItems()).some((i) => i.dirty && isSynced(i.kind));
}
