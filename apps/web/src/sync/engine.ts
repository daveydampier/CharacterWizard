import type { PushResult, Remote, RemoteCharacter, RemoteItem } from '../remote/types';
import { SYNCED_KINDS, type AppStorage, type StoredCharacter, type SyncedKind } from '../storage';

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
 *
 * If the device already holds a character under that ID, the two are merged the way everything
 * else is: record by record, the later change wins, and nothing that is only on one side is lost.
 */
export async function claimLocalCharacters(storage: AppStorage, userId: string): Promise<void> {
  const all = await storage.listCharacters();
  const held = new Map(all.filter((c) => c.ownerId !== null).map((c) => [c.id, c]));
  for (const character of all.filter((c) => c.ownerId === null)) {
    const id = character.ddbId === '0' ? character.id : characterId(character.ddbId, userId);
    const claimed: StoredCharacter = { ...character, id, ownerId: userId, dirty: true };
    const existing = held.get(id);
    if (!existing) {
      await storage.rekeyCharacter(character.id, claimed);
      held.set(id, claimed);
      continue;
    }
    const theirs = await storage.listItems(id);
    for (const item of await storage.listItems(character.id)) {
      const other = theirs.find((i) => i.kind === item.kind && i.key === item.key);
      if (other && !later(item.updatedAt, other.updatedAt)) continue;
      // A synced item that moves must be sent; the turn never is.
      await storage.putItem({ ...item, characterId: id, dirty: isSynced(item.kind) ? true : item.dirty });
    }
    await storage.removeCharacter(character.id);
    if (later(character.updatedAt, existing.updatedAt)) {
      await storage.putCharacter(claimed);
      held.set(id, claimed);
    }
  }
}

function fromRemote(row: RemoteCharacter): StoredCharacter {
  const { rev: _rev, ...rest } = row;
  return { ...rest, dirty: false };
}

/**
 * Fetches everything changed in the account since the last fetch and merges it into this device.
 * A fetched record replaces the device's copy unless the device's copy is dirty and newer.
 * Each record is looked at and written in one storage step.
 */
export async function pull({ storage, remote }: SyncDeps): Promise<Set<string>> {
  const changed = new Set<string>();

  const characters = await remote.pullCharacters(await cursor(storage, CURSOR_CHARACTERS));
  for (const row of characters) {
    const found = { revived: false };
    // Looked at and written in one step, so a change made on this device in between is not lost.
    await storage.updateCharacter(row.id, (mine) => {
      if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) {
        found.revived = row.deleted && !mine.deleted;
        return 'keep';
      }
      if (row.deleted) {
        if (!mine) return 'keep';
        changed.add(row.id);
        return 'remove';
      }
      if (!mine || mine.updatedAt !== row.updatedAt || mine.deleted) changed.add(row.id);
      return { put: fromRemote(row) };
    });
    if (found.revived) {
      // The account deleted it and threw away its items; this device has since brought it back.
      for (const item of await storage.listItems(row.id)) {
        if (!isSynced(item.kind)) continue;
        await storage.updateItem(item.characterId, item.kind, item.key, (now) => (now ? { put: { ...now, dirty: true } } : 'keep'));
      }
    }
  }
  if (characters.length > 0) await storage.setMeta(CURSOR_CHARACTERS, characters[characters.length - 1].rev);

  const items = await remote.pullItems(await cursor(storage, CURSOR_ITEMS));
  for (const row of items) {
    await storage.updateItem(row.characterId, row.kind, row.key, (mine, character) => {
      // An item for a character this device does not hold (deleted here, or not fetched) is left out.
      if (!character || character.deleted) return 'keep';
      if (mine?.dirty && later(mine.updatedAt, row.updatedAt)) return 'keep';
      if (row.deleted) {
        if (!mine) return 'keep';
        changed.add(row.characterId);
        return 'remove';
      }
      if (!mine || mine.updatedAt !== row.updatedAt) changed.add(row.characterId);
      const { rev: _rev, ...rest } = row satisfies RemoteItem;
      return { put: { ...rest, dirty: false } };
    });
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
    await storage.updateCharacter(sent.id, (now) => {
      if (!now || now.updatedAt !== sent.updatedAt) return 'keep';
      return now.deleted ? 'remove' : { put: { ...now, dirty: false } };
    });
  }

  // Items wait for their character: the account skips an item whose character it does not have.
  const settled = new Set((await storage.listCharacters()).filter((c) => !c.dirty && !c.deleted).map((c) => c.id));
  const dirtyItems = (await storage.listItems()).filter(
    (i) => i.dirty && isSynced(i.kind) && settled.has(i.characterId),
  );
  if (dirtyItems.length > 0) {
    await remote.pushItems(dirtyItems.map(({ dirty: _dirty, ...row }) => ({ ...row, kind: row.kind as SyncedKind })));
    for (const sent of dirtyItems) {
      await storage.updateItem(sent.characterId, sent.kind, sent.key, (now) => {
        if (!now || now.updatedAt !== sent.updatedAt) return 'keep';
        return now.deleted ? 'remove' : { put: { ...now, dirty: false } };
      });
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
