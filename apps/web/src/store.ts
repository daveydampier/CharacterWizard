import { convertCharacter } from '@cw/ddb-import';
import type { Ability, PlayState } from '@cw/model';
import {
  adjustPool, applyUse, buildSheet, clampState, emptyPlayState, endConcentration, normalisePlayItem,
  normaliseTurn, pools, rest, startTurn, togglePill, useSummary, type PlayItem, type Sheet,
  type TurnTiming, type ViewMode,
} from '@cw/rules';
import { create } from 'zustand';
import { STATE_KEY, memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './storage';

export interface Undo {
  /** The play state to go back to. */
  state: PlayState;
  message: string;
}

export interface AppStore {
  /** False until stored characters have been loaded. */
  ready: boolean;
  /** False when the device is not saving: IndexedDB is unavailable or a write failed. */
  persistent: boolean;
  characters: StoredCharacter[];
  /** The character on screen, its sheet and its play state. */
  openId: string | null;
  sheet: Sheet | null;
  play: PlayState;
  /** False while the open character's saved play state is still being read. Nothing can be changed until it is. */
  loaded: boolean;
  /** One step, held in memory only. */
  undo: Undo | null;

  /** Loads stored characters. Tests pass a storage; the app lets it choose. */
  init(storage?: AppStorage): Promise<void>;
  /** Adds a character, or replaces the one with the same D&D Beyond ID. Null if `raw` is not a character. */
  saveImported(raw: unknown): Promise<StoredCharacter | null>;
  remove(id: string): Promise<void>;
  open(id: string): Promise<void>;
  use(ability: Ability, mode: ViewMode, slot?: string): void;
  startTurn(): void;
  rest(kind: 'short' | 'long'): void;
  adjust(poolKey: string, delta: number): void;
  togglePill(timing: TurnTiming): void;
  endConcentration(): void;
  undoLast(): void;
}

let storage: AppStorage = memoryStorage();

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

/** A character's saved play state, repaired where it is malformed. Empty when nothing is saved. */
async function loadPlay(id: string): Promise<PlayState> {
  const items = await storage.listItems(id);
  const data = (kind: 'play' | 'turn'): unknown =>
    items.find((item) => item.kind === kind && item.key === STATE_KEY && !item.deleted)?.data;
  return { ...normalisePlayItem(data('play')), turn: normaliseTurn(data('turn')) };
}

/**
 * Saves a play state as its two items: what is spent (which syncs) and the turn (which does not).
 * An item is written only when it differs from `previous`, so flipping a pill does not touch the
 * synced item.
 */
async function savePlay(id: string, next: PlayState, previous: PlayState | null): Promise<void> {
  const updatedAt = new Date().toISOString();
  if (!previous || !same(playItem(next), playItem(previous))) {
    await storage.putItem({
      characterId: id, kind: 'play', key: STATE_KEY, data: playItem(next), updatedAt, deleted: false, dirty: true,
    });
  }
  if (!previous || !same(next.turn, previous.turn)) {
    await storage.putItem({
      characterId: id, kind: 'turn', key: STATE_KEY, data: next.turn, updatedAt, deleted: false, dirty: false,
    });
  }
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

const initial = {
  ready: false,
  persistent: true,
  characters: [] as StoredCharacter[],
  openId: null as string | null,
  sheet: null as Sheet | null,
  play: emptyPlayState(),
  loaded: false,
  undo: null as Undo | null,
};

export const useStore = create<AppStore>()((set, get) => {
  /** Runs a storage write. A failure turns on the "not saving" banner instead of breaking the app. */
  const save = async (write: Promise<void>): Promise<void> => {
    try {
      await write;
    } catch {
      set({ persistent: false });
    }
  };

  /** Applies a play change to the open character and saves it. */
  const change = (next: PlayState, undo: Undo | null): void => {
    const { openId, play, loaded } = get();
    if (openId === null || !loaded || next === play) return;
    set({ play: next, undo });
    void save(savePlay(openId, next, play));
  };

  return {
    ...initial,

    async init(override) {
      let persistent = true;
      if (override) storage = override;
      else ({ storage, persistent } = await openStorage());
      let characters: StoredCharacter[] = [];
      try {
        characters = await storage.listCharacters();
      } catch {
        persistent = false;
      }
      set({ ...initial, ready: true, persistent, characters });
    },

    async saveImported(raw) {
      const converted = convertCharacter(raw);
      if (converted.name === '' && converted.classes.length === 0) return null;
      const ddbId = String(converted.id);
      // An ID of 0 means the JSON had none, so it can never match a stored character.
      const existing = ddbId === '0' ? undefined : get().characters.find((c) => c.ddbId === ddbId);
      const importedAt = new Date().toISOString();
      const record: StoredCharacter = {
        id: existing?.id ?? newId(),
        ownerId: existing?.ownerId ?? null,
        ddbId,
        name: converted.name || 'Unnamed character',
        rawJson: raw,
        importedAt,
        updatedAt: importedAt,
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
          // The open character's play state in memory is the newest copy.
          const sheet = sheetFor(record);
          const before = get().play;
          const play = clampState(before, sheet);
          set({ sheet, play, undo: null });
          await save(savePlay(record.id, play, before));
        } else {
          const saved = await loadPlay(record.id).catch(() => null);
          if (saved) await save(savePlay(record.id, clampState(saved, sheetFor(record)), saved));
        }
      }
      return record;
    },

    async remove(id) {
      await save(storage.removeCharacter(id));
      sheetCache.delete(id);
      set({ characters: get().characters.filter((c) => c.id !== id) });
      if (get().openId === id) set({ openId: null, sheet: null, play: emptyPlayState(), loaded: false, undo: null });
    },

    async open(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) {
        set({ openId: null, sheet: null, play: emptyPlayState(), loaded: false, undo: null });
        return;
      }
      // Already open: the play state in memory is the newest copy, even if saving it failed.
      if (get().openId === id && get().sheet) return;
      const sheet = sheetFor(character);
      set({ openId: id, sheet, play: emptyPlayState(), loaded: false, undo: null });
      const saved = await loadPlay(id).catch(() => emptyPlayState());
      // Ignore the answer if the player has already moved to another character.
      if (get().openId === id) set({ play: clampState(saved, sheet), loaded: true });
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
  };
});
