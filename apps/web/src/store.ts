import { convertCharacter } from '@cw/ddb-import';
import type { Ability, AbilityEdit, CharacterEdits, CustomAbility, OrderName, PlayState } from '@cw/model';
import {
  adjustPool, applyEdits, applyUse, buildSheet, clampState, emptyEdits, emptyPlayState, endConcentration,
  isEmptyEdit, normaliseCustom, normaliseEdit, normaliseOrder, normalisePlayItem, normaliseTurn, pools, rest,
  startTurn, togglePill, useSummary, withGroupOrder, type PlayItem, type Sheet, type TurnTiming, type ViewMode,
} from '@cw/rules';
import { create } from 'zustand';
import { CHARACTER_LIMIT, RemoteError, defaultRemote, type ImportResult, type Profile, type Remote } from './remote';
import {
  STATE_KEY, memoryStorage, openStorage, type AppStorage, type StoredCharacter, type StoredItem, type SyncedKind,
} from './storage';
import { characterId, claimLocalCharacters, hasUnsynced, nextStamp, resetCursors, syncOnce } from './sync/engine';
import { createScheduler, type Scheduler } from './sync/scheduler';

export interface Undo {
  /** The play state to go back to. */
  state: PlayState;
  message: string;
}

/** Who is signed in on this device. The profile is null until the account has been asked once. */
export interface Session {
  userId: string;
  profile: Profile | null;
}

/**
 * `saved`: the account has everything. `waiting`: changes are still to be sent, or the account
 * cannot be reached. `signin`: the session has ended and the player must sign in again to sync.
 * `limit`: the account already holds ten characters, so one on this device cannot be sent.
 */
export type SyncState = 'saved' | 'waiting' | 'signin' | 'limit';

export interface AppStore {
  /** False until this device's own copy has been loaded. */
  ready: boolean;
  /** False when the device is not saving: IndexedDB is unavailable or a write failed. */
  persistent: boolean;
  /** Null when nobody is signed in on this device. */
  session: Session | null;
  syncState: SyncState;
  /** Every character on this device that is not deleted: the player's own and, for a table admin, everyone's. */
  characters: StoredCharacter[];
  /** The character on screen, its sheet and its play state. */
  openId: string | null;
  /** The sheet the views show: the imported sheet with the player's edits applied. */
  sheet: Sheet | null;
  /** The sheet as imported, with no edits. The editor compares against it. */
  baseSheet: Sheet | null;
  /** The open character's edits. */
  edits: CharacterEdits;
  play: PlayState;
  /** False while the open character's saved play state is still being read. Nothing can be changed until it is. */
  loaded: boolean;
  /** One step, held in memory only. */
  undo: Undo | null;

  /**
   * Loads this device's copy, then finds out who is signed in and syncs. `ready` turns true as
   * soon as the device's copy is loaded; the returned promise also waits for the account.
   * Tests pass a storage and a remote; the app lets both be chosen.
   */
  init(storage?: AppStorage, remote?: Remote): Promise<void>;
  signIn(): Promise<void>;
  /**
   * Signs out and removes this device's copy of everything. If changes are still waiting to sync
   * and `discard` is not true, it does nothing and resolves false.
   */
  signOut(discard?: boolean): Promise<boolean>;
  /** Asks the account for this user's profile, then syncs. */
  syncNow(): Promise<void>;
  listProfiles(): Promise<Profile[]>;
  setApproved(userId: string, approved: boolean): Promise<void>;
  /** Fetches a character from D&D Beyond through the account. Never rejects. */
  importCharacter(ddbId: string): Promise<ImportResult>;
  /** False when the signed-in player already has ten characters. */
  canAddCharacter(): boolean;
  /**
   * Adds a character, or replaces the signed-in player's copy of the same D&D Beyond character.
   * `replaceId` re-imports that character in place, whoever owns it. Null if `raw` is not a
   * character, nobody is signed in, or the player already has ten.
   */
  saveImported(raw: unknown, replaceId?: string): Promise<StoredCharacter | null>;
  remove(id: string): Promise<void>;
  open(id: string): Promise<void>;
  use(ability: Ability, mode: ViewMode, slot?: string): void;
  startTurn(): void;
  rest(kind: 'short' | 'long'): void;
  adjust(poolKey: string, delta: number): void;
  togglePill(timing: TurnTiming): void;
  endConcentration(): void;
  undoLast(): void;
  /** Replaces the open character's edits to one ability or feature. An edit that changes nothing removes them. */
  setEdit(abilityKey: string, edit: AbilityEdit): void;
  /** Adds a custom ability to the open character, or replaces the one with the same key. */
  saveCustom(custom: CustomAbility): void;
  /** Deletes a custom ability and any edits stored under its key. */
  deleteCustom(abilityKey: string): void;
  /** Records the order the player gave one group of a view or of the Features page. `groupKeys` is the whole group, in order. */
  setOrder(view: OrderName, groupKeys: string[]): void;
}

/** A key for a new custom ability. */
export const newCustomKey = (): string => `own:${newId()}`;

const META_SESSION = 'session';

let storage: AppStorage = memoryStorage();
let remote: Remote | null = null;
let scheduler: Scheduler | null = null;
/** Counts local changes to play state, so a fetch can tell that one happened while it was running. */
let localChanges = 0;
/** Counts local changes to edits, so a read of them can tell that one happened while it was running. */
let localEdits = 0;

/** One sheet per character: a re-import replaces it and a delete drops it. */
const sheetCache = new Map<string, { importedAt: string; sheet: Sheet }>();

/** The calculated sheet for a stored character. Converted from the raw JSON on first use. */
export function sheetFor(character: StoredCharacter): Sheet {
  const cached = sheetCache.get(character.id);
  if (cached && cached.importedAt === character.importedAt) return cached.sheet;
  const sheet = buildSheet(convertCharacter(character.rawJson));
  sheetCache.set(character.id, { importedAt: character.importedAt, sheet });
  return sheet;
}

/** How many sheets are cached. For tests. */
export const cachedSheetCount = (): number => sheetCache.size;

const playItem = (state: PlayState): PlayItem => ({ spent: state.spent, concentrationKey: state.concentrationKey });
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const live = (all: StoredCharacter[]): StoredCharacter[] => all.filter((c) => !c.deleted);

/** A session as kept on the device, repaired where it is malformed. Null when there is none. */
function sessionFrom(value: unknown): Session | null {
  if (value === null || typeof value !== 'object') return null;
  const { userId, profile } = value as Record<string, unknown>;
  if (typeof userId !== 'string' || userId === '') return null;
  const p = profile !== null && typeof profile === 'object' ? (profile as Record<string, unknown>) : null;
  return {
    userId,
    profile: p && typeof p.displayName === 'string'
      ? { id: userId, displayName: p.displayName, approved: p.approved === true, isTableAdmin: p.isTableAdmin === true }
      : null,
  };
}

/** The play state held in a character's items, repaired where it is malformed. Empty when nothing is saved. */
function playFrom(items: StoredItem[]): PlayState {
  const data = (kind: 'play' | 'turn'): unknown =>
    items.find((item) => item.kind === kind && item.key === STATE_KEY && !item.deleted)?.data;
  return { ...normalisePlayItem(data('play')), turn: normaliseTurn(data('turn')) };
}

/** The edits held in a character's items, each checked and repaired. A deleted item is not an edit. */
export function editsFrom(items: StoredItem[]): CharacterEdits {
  const edits = emptyEdits();
  for (const item of items) {
    if (item.deleted) continue;
    if (item.kind === 'edit') {
      const edit = normaliseEdit(item.data);
      if (!isEmptyEdit(edit)) edits.abilities[item.key] = edit;
    } else if (item.kind === 'custom') {
      const custom = normaliseCustom(item.data, item.key);
      if (custom) edits.custom.push(custom);
    } else if (item.kind === 'order' && (item.key === 'combat' || item.key === 'explore' || item.key === 'features')) {
      edits.order[item.key] = normaliseOrder(item.data);
    }
  }
  // Items come back in no particular order; custom abilities are shown by name.
  edits.custom.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return edits;
}

/**
 * A character's saved play state and edits. Empty when nothing is saved. Rejects when what is
 * saved cannot be read, so that nobody mistakes an unreadable state for an empty one.
 */
async function loadSaved(id: string): Promise<{ play: PlayState; edits: CharacterEdits }> {
  const items = await storage.listItems(id);
  return { play: playFrom(items), edits: editsFrom(items) };
}

/**
 * Saves a play state as its two items: what is spent (which syncs) and the turn (which does not).
 * An item is written only when it differs from `previous`, so flipping a pill does not touch the
 * synced item. Both writes are started before this returns. Resolves true when the synced item
 * was written.
 */
async function savePlay(id: string, next: PlayState, previous: PlayState | null): Promise<boolean> {
  // Stamped and written in one step, later than whatever the device holds at that moment.
  const write = (kind: 'play' | 'turn', data: unknown, dirty: boolean): Promise<void> =>
    storage.updateItem(id, kind, STATE_KEY, (current) => ({
      put: { characterId: id, kind, key: STATE_KEY, data, updatedAt: nextStamp(current?.updatedAt), deleted: false, dirty },
    }));
  const playChanged = !previous || !same(playItem(next), playItem(previous));
  const writes: Promise<void>[] = [];
  if (playChanged) writes.push(write('play', playItem(next), true));
  if (!previous || !same(next.turn, previous.turn)) writes.push(write('turn', next.turn, false));
  await Promise.all(writes);
  return playChanged;
}

/**
 * A random version 4 UUID. Browsers offer `crypto.randomUUID` only on secure pages, so a phone
 * reaching the dev server over the local network builds one from random bytes instead.
 */
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const closed = {
  openId: null as string | null,
  sheet: null as Sheet | null,
  baseSheet: null as Sheet | null,
  edits: emptyEdits(),
  play: emptyPlayState(),
  loaded: false,
  undo: null as Undo | null,
};

const initial = {
  ready: false,
  persistent: true,
  session: null as Session | null,
  syncState: 'saved' as SyncState,
  characters: [] as StoredCharacter[],
  ...closed,
};

export const useStore = create<AppStore>()((set, get) => {
  /** Runs a storage write. A failure turns on the "not saving" banner instead of breaking the app. */
  const save = async <T>(write: Promise<T>): Promise<T | undefined> => {
    try {
      return await write;
    } catch {
      set({ persistent: false });
      return undefined;
    }
  };

  /** Something on this device now differs from the account: say so, and sync soon. */
  const changedLocally = (): void => {
    if (get().syncState === 'saved') set({ syncState: 'waiting' });
    scheduler?.changed();
  };

  /** Applies a play change to the open character and saves it. */
  const change = (next: PlayState, undo: Undo | null): void => {
    const { openId, play, loaded } = get();
    if (openId === null || !loaded || next === play) return;
    // Only a change to what is spent counts. The turn never syncs, so flipping a pill during a
    // fetch must not make this device's older spending win over what was fetched.
    if (!same(playItem(next), playItem(play))) localChanges += 1;
    set({ play: next, undo });
    void save(savePlay(openId, next, play)).then((synced) => {
      if (synced) changedLocally();
    });
  };

  /**
   * Stores one item of the open character's edits, or marks it deleted when `data` is null, then
   * rebuilds the sheet from the edits as they now stand. What was spent is clamped to the new
   * sheet, because an edit can lower a maximum or remove a pool. Every write is started before
   * this returns, each stamped and written in one step, so a read made afterwards sees them.
   */
  const changeEdits = (next: CharacterEdits, writes: { kind: SyncedKind; key: string; data: unknown }[]): void => {
    const { openId, baseSheet, play, loaded } = get();
    if (openId === null || baseSheet === null || !loaded) return;
    const sheet = applyEdits(baseSheet, next);
    const clamped = clampState(play, sheet);
    const playChanged = !same(playItem(clamped), playItem(play));
    localEdits += 1;
    if (playChanged) localChanges += 1;
    set({ edits: next, sheet, play: playChanged ? clamped : play, undo: playChanged ? null : get().undo });
    const started: Promise<unknown>[] = writes.map((write) =>
      storage.updateItem(openId, write.kind, write.key, (current) => ({
        put: {
          characterId: openId, kind: write.kind, key: write.key, data: write.data,
          updatedAt: nextStamp(current?.updatedAt), deleted: write.data === null, dirty: true,
        },
      })));
    if (playChanged) started.push(savePlay(openId, clamped, play));
    void save(Promise.all(started)).then(() => changedLocally());
  };

  /**
   * After a round with the account: show what the device now holds. `changed` are the characters
   * a fetch altered; `sent` is true when characters were waiting to be sent, whose records are
   * now marked clean.
   */
  const showSynced = async (changed: Set<string>, sent: boolean, changesBefore: number): Promise<void> => {
    if (changed.size === 0 && !sent) return;
    const characters = live(await storage.listCharacters());
    set({ characters });
    const { openId } = get();
    if (openId === null || !changed.has(openId)) return;
    const character = characters.find((c) => c.id === openId);
    if (!character) {
      // Deleted on another device.
      sheetCache.delete(openId);
      set({ ...closed });
      return;
    }
    let baseSheet: Sheet;
    try {
      baseSheet = sheetFor(character);
    } catch {
      // What was fetched cannot be turned into a sheet (a record damaged in the account, say).
      sheetCache.delete(openId);
      set({ ...closed });
      return;
    }
    // The device's copy of the edits is the newest: every edit made here is written as it is
    // made, and a fetched edit replaces one only when it is later. So the edits are read back,
    // and read again if the player made one during the read.
    let saved: { play: PlayState; edits: CharacterEdits };
    let editsSeen: number;
    do {
      editsSeen = localEdits;
      try {
        saved = await loadSaved(openId);
      } catch {
        // What was fetched could not be read back: what is on screen stays, and is not replaced by nothing.
        set({ persistent: false });
        return;
      }
      if (get().openId !== openId) return;
    } while (editsSeen !== localEdits);
    const sheet = applyEdits(baseSheet, saved.edits);
    if (localChanges !== changesBefore) {
      // The player changed what is spent while the fetch was running, or while its result was
      // being read back. What is on screen is the newest copy: it is written again, stamped later
      // than what was fetched, and sent.
      const kept = clampState(get().play, sheet);
      set({ baseSheet, sheet, edits: saved.edits, play: kept });
      await save(savePlay(openId, kept, null));
      changedLocally();
      return;
    }
    // The turn never syncs, so the one in memory is the newest.
    set({ baseSheet, sheet, edits: saved.edits, play: { ...clampState(saved.play, sheet), turn: get().play.turn }, undo: null });
  };

  /** No longer a table admin: the other players' characters leave this device. */
  const dropOthers = async (userId: string): Promise<void> => {
    for (const character of await storage.listCharacters()) {
      if (character.ownerId === userId) continue;
      await storage.removeCharacter(character.id);
      sheetCache.delete(character.id);
      if (get().openId === character.id) set({ ...closed });
    }
    set({ characters: get().characters.filter((c) => c.ownerId === userId) });
  };

  /** One round with the account: who am I, then fetch and send. Never rejects. */
  const runSync = async (): Promise<void> => {
    const session = get().session;
    if (!session || !remote) return;
    try {
      const profile = await remote.profile();
      const before = session.profile;
      if (!same(profile, before)) {
        // What this user may see has changed: fetch from the beginning.
        if (profile?.approved !== before?.approved || profile?.isTableAdmin !== before?.isTableAdmin) await resetCursors(storage);
        if (before?.isTableAdmin && !profile?.isTableAdmin) await dropOthers(session.userId);
        const next = { userId: session.userId, profile };
        await save(storage.setMeta(META_SESSION, next));
        if (get().session?.userId === session.userId) set({ session: next });
      }
      if (!profile?.approved) return;
      const changesBefore = localChanges;
      const sent = get().characters.some((c) => c.dirty);
      const { changed, rejected } = await syncOnce({ storage, remote });
      if (get().session?.userId !== session.userId) return;
      await showSynced(changed, sent, changesBefore);
      const full = rejected.some((r) => r.reason === 'limit');
      set({ syncState: full ? 'limit' : (await hasUnsynced(storage)) ? 'waiting' : 'saved' });
    } catch (error) {
      if (get().session?.userId !== session.userId) return;
      set({ syncState: error instanceof RemoteError && error.kind === 'unauthorized' ? 'signin' : 'waiting' });
    }
  };

  /** The account says who is signed in: at start, after sign-in, and when a session ends. */
  const onUser = async (userId: string | null): Promise<void> => {
    let session = get().session;
    if (userId === null) {
      // The device believes someone is signed in but their session has ended. It keeps working
      // from its own copy; only signing in again will sync.
      if (session) set({ syncState: 'signin' });
      return;
    }
    if (session && session.userId !== userId) {
      // A different account on this device: the previous account's copy must not be shown to it.
      // No sync for the previous account may write to this device after it has been emptied.
      await scheduler?.stop();
      await save(storage.clear());
      sheetCache.clear();
      set({ characters: [], ...closed });
      session = null;
    }
    if (!session) {
      session = { userId, profile: null };
      await save(storage.setMeta(META_SESSION, session));
      set({ session });
    }
    await save(claimLocalCharacters(storage, userId));
    const characters = await storage.listCharacters().catch(() => [] as StoredCharacter[]);
    set({ characters: live(characters), syncState: 'waiting' });
    scheduler?.start();
    await scheduler?.now();
  };

  /** Calls to `onUser` run one after another, and `init` and `signIn` wait for them. */
  let userChanges: Promise<void> = Promise.resolve();
  /** The app's own start-up while it is running. */
  let starting: Promise<void> | null = null;

  const start = async (storageOverride?: AppStorage, remoteOverride?: Remote): Promise<void> => {
    await scheduler?.stop();
    let persistent = true;
    if (storageOverride) storage = storageOverride;
    else ({ storage, persistent } = await openStorage());
    remote = remoteOverride ?? defaultRemote();
    let characters: StoredCharacter[] = [];
    let session: Session | null = null;
    try {
      session = sessionFrom(await storage.getMeta(META_SESSION));
      characters = live(await storage.listCharacters());
    } catch {
      persistent = false;
    }
    sheetCache.clear();
    localChanges = 0;
    localEdits = 0;
    scheduler = createScheduler(runSync);
    userChanges = Promise.resolve();
    // Ready now: a signed-in device opens from its own copy without waiting for the account.
    set({ ...initial, ready: true, persistent, session, characters, syncState: session ? 'waiting' : 'saved' });
    await remote
      .start((userId) => {
        userChanges = userChanges.then(() => onUser(userId)).catch(() => undefined);
      })
      .catch(() => undefined);
    await userChanges;
  };

  return {
    ...initial,

    async init(storageOverride, remoteOverride) {
      // In development React runs the app's start-up effect twice. A second start would reset
      // what the first has already put on screen, so it joins the first instead.
      const own = storageOverride === undefined && remoteOverride === undefined;
      if (own && starting) return starting;
      const run = start(storageOverride, remoteOverride);
      if (!own) return run;
      starting = run;
      try {
        await run;
      } finally {
        starting = null;
      }
    },

    async signIn() {
      await remote?.signIn();
      await userChanges;
    },

    async signOut(discard = false) {
      if (!get().session) return true;
      if (!discard) {
        await scheduler?.now();
        if (await hasUnsynced(storage).catch(() => false)) return false;
      }
      // No sync may write to this device after it has been emptied: wait for one that is running.
      await scheduler?.stop();
      const { persistent } = get();
      // Signed out on this device first, so the account's own "nobody is signed in" is not news.
      set({ ...initial, ready: true, persistent });
      sheetCache.clear();
      await save(storage.clear());
      await remote?.signOut().catch(() => undefined);
      await userChanges;
      return true;
    },

    async syncNow() {
      await scheduler?.now();
    },

    async listProfiles() {
      if (!remote) throw new RemoteError('unauthorized');
      return remote.listProfiles();
    },

    async setApproved(userId, approved) {
      if (!remote) throw new RemoteError('unauthorized');
      await remote.setApproved(userId, approved);
    },

    async importCharacter(ddbId) {
      return remote ? remote.importCharacter(ddbId) : { status: 'unreachable' };
    },

    canAddCharacter() {
      const { session, characters } = get();
      if (!session) return false;
      return characters.filter((c) => c.ownerId === session.userId).length < CHARACTER_LIMIT;
    },

    async saveImported(raw, replaceId) {
      const { session, characters } = get();
      if (!session) return null;
      const converted = convertCharacter(raw);
      if (converted.name === '' && converted.classes.length === 0) return null;
      const ddbId = String(converted.id);
      // An ID of 0 means the JSON had none, so it can never match a stored character.
      const id = replaceId ?? (ddbId === '0' ? newId() : characterId(ddbId, session.userId));
      const existing = characters.find((c) => c.id === id);
      if (replaceId !== undefined && !existing) return null;
      if (!existing && !get().canAddCharacter()) return null;
      const stamp = nextStamp(existing?.updatedAt);
      const record: StoredCharacter = {
        id,
        ownerId: existing?.ownerId ?? session.userId,
        ddbId,
        name: converted.name || 'Unnamed character',
        rawJson: raw,
        importedAt: stamp,
        updatedAt: stamp,
        deleted: false,
        dirty: true,
      };
      try {
        sheetFor(record);
      } catch {
        // Converted, but the sheet cannot be built from it: treat it as not a character.
        return null;
      }
      await save(storage.putCharacter(record));
      set({ characters: [...get().characters.filter((c) => c.id !== record.id), record] });
      if (existing) {
        // Re-import: what was spent stays spent, within the new maximums.
        if (get().openId === record.id) {
          // The open character's play state in memory is the newest copy. Its edits are kept.
          const baseSheet = sheetFor(record);
          const sheet = applyEdits(baseSheet, get().edits);
          const before = get().play;
          const play = clampState(before, sheet);
          set({ baseSheet, sheet, play, undo: null });
          await save(savePlay(record.id, play, before));
        } else {
          // Clamped to the new sheet with its edits: an edited maximum is the one that counts.
          const saved = await loadSaved(record.id).catch(() => null);
          if (saved) {
            const sheet = applyEdits(sheetFor(record), saved.edits);
            await save(savePlay(record.id, clampState(saved.play, sheet), saved.play));
          }
        }
      }
      changedLocally();
      return record;
    },

    async remove(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) return;
      // The record stays, marked deleted, until the account has been told. Its items go now.
      const tombstone: StoredCharacter = {
        ...character, rawJson: null, deleted: true, dirty: true, updatedAt: nextStamp(character.updatedAt),
      };
      await save((async () => {
        await storage.removeCharacter(id);
        await storage.putCharacter(tombstone);
      })());
      sheetCache.delete(id);
      set({ characters: get().characters.filter((c) => c.id !== id) });
      if (get().openId === id) set({ ...closed });
      changedLocally();
    },

    async open(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) {
        set({ ...closed });
        return;
      }
      // Already open: the play state in memory is the newest copy, even if saving it failed.
      if (get().openId === id && get().sheet) return;
      let baseSheet: Sheet;
      try {
        baseSheet = sheetFor(character);
      } catch {
        // Stored, but no sheet can be built from it (a record damaged in the account, say).
        set({ ...closed });
        return;
      }
      set({ ...closed, openId: id, sheet: baseSheet, baseSheet });
      let saved: { play: PlayState; edits: CharacterEdits };
      try {
        saved = await loadSaved(id);
      } catch {
        // What is saved could not be read. Opening with an empty state would let the next change
        // overwrite it, here and in the account, so the character stays closed.
        if (get().openId === id) set({ ...closed, persistent: false });
        return;
      }
      // Ignore the answer if the player has already moved to another character.
      if (get().openId !== id) return;
      const sheet = applyEdits(baseSheet, saved.edits);
      set({ sheet, edits: saved.edits, play: clampState(saved.play, sheet), loaded: true });
    },

    use(ability, mode, slot) {
      const { sheet, play } = get();
      if (!sheet) return;
      const next = applyUse(ability, sheet, play, mode, slot);
      change(next, { state: play, message: useSummary(ability, sheet, play, next) });
    },

    startTurn() {
      const { play } = get();
      change(startTurn(play), { state: play, message: 'Started a new turn.' });
    },

    rest(kind) {
      const { sheet, play } = get();
      if (!sheet) return;
      change(rest(kind, sheet, play), {
        state: play,
        message: kind === 'long' ? 'Took a Long Rest.' : 'Took a Short Rest.',
      });
    },

    // The three manual controls below clear the undo step: undo only ever reverses the last change.
    adjust(poolKey, delta) {
      const { sheet, play } = get();
      const pool = sheet ? pools(sheet).find((p) => p.key === poolKey) : undefined;
      if (pool) change(adjustPool(play, pool, delta), null);
    },

    togglePill(timing) {
      change(togglePill(get().play, timing), null);
    },

    endConcentration() {
      change(endConcentration(get().play), null);
    },

    undoLast() {
      const { undo } = get();
      if (undo) change(undo.state, null);
    },

    setEdit(abilityKey, edit) {
      const { edits } = get();
      const abilities = { ...edits.abilities };
      const empty = isEmptyEdit(edit);
      if (empty && !(abilityKey in abilities)) return;
      if (empty) delete abilities[abilityKey];
      else abilities[abilityKey] = edit;
      changeEdits({ ...edits, abilities }, [{ kind: 'edit', key: abilityKey, data: empty ? null : edit }]);
    },

    saveCustom(custom) {
      const { edits } = get();
      const others = edits.custom.filter((c) => c.key !== custom.key);
      const { key: _key, ...data } = custom;
      const next = [...others, custom].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
      changeEdits({ ...edits, custom: next }, [{ kind: 'custom', key: custom.key, data }]);
    },

    deleteCustom(abilityKey) {
      const { edits } = get();
      if (!edits.custom.some((c) => c.key === abilityKey)) return;
      const abilities = { ...edits.abilities };
      const writes: { kind: SyncedKind; key: string; data: unknown }[] = [{ kind: 'custom', key: abilityKey, data: null }];
      if (abilityKey in abilities) {
        delete abilities[abilityKey];
        writes.push({ kind: 'edit', key: abilityKey, data: null });
      }
      changeEdits({ ...edits, abilities, custom: edits.custom.filter((c) => c.key !== abilityKey) }, writes);
    },

    setOrder(view, groupKeys) {
      const { edits } = get();
      const order = withGroupOrder(edits.order[view], groupKeys);
      if (same(order, edits.order[view])) return;
      changeEdits({ ...edits, order: { ...edits.order, [view]: order } }, [{ kind: 'order', key: view, data: order }]);
    },
  };
});
