import { convertCharacter } from '@cw/ddb-import';
import type { Ability, PlayState } from '@cw/model';
import {
  adjustPool, applyUse, buildSheet, clampState, emptyPlayState, endConcentration, pools, rest,
  startTurn, togglePill, useSummary, type Sheet, type TurnTiming, type ViewMode,
} from '@cw/rules';
import { create } from 'zustand';
import { memoryStorage, openStorage, type AppStorage, type StoredCharacter } from './storage';

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

const sheetCache = new Map<string, Sheet>();

/** The calculated sheet for a stored character. Converted from the raw JSON on first use. */
export function sheetFor(character: StoredCharacter): Sheet {
  const cacheKey = `${character.id}|${character.importedAt}`;
  let sheet = sheetCache.get(cacheKey);
  if (!sheet) {
    sheet = buildSheet(convertCharacter(character.rawJson));
    sheetCache.set(cacheKey, sheet);
  }
  return sheet;
}

const initial = {
  ready: false,
  persistent: true,
  characters: [] as StoredCharacter[],
  openId: null as string | null,
  sheet: null as Sheet | null,
  play: emptyPlayState(),
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
    const { openId, play } = get();
    if (openId === null || next === play) return;
    set({ play: next, undo });
    void save(storage.putPlay(openId, next));
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
      const record: StoredCharacter = {
        id: existing?.id ?? crypto.randomUUID(),
        ddbId,
        name: converted.name || 'Unnamed character',
        rawJson: raw,
        importedAt: new Date().toISOString(),
      };
      await save(storage.putCharacter(record));
      set({ characters: [...get().characters.filter((c) => c.id !== record.id), record] });
      if (existing) {
        // Re-import: what was spent stays spent, within the new maximums.
        if (get().openId === record.id) {
          // The open character's play state in memory is the newest copy.
          const sheet = sheetFor(record);
          const play = clampState(get().play, sheet);
          set({ sheet, play, undo: null });
          await save(storage.putPlay(record.id, play));
        } else {
          const saved = await storage.getPlay(record.id).catch(() => null);
          if (saved) await save(storage.putPlay(record.id, clampState(saved, sheetFor(record))));
        }
      }
      return record;
    },

    async remove(id) {
      await save(storage.deleteCharacter(id));
      set({ characters: get().characters.filter((c) => c.id !== id) });
      if (get().openId === id) set({ openId: null, sheet: null, play: emptyPlayState(), undo: null });
    },

    async open(id) {
      const character = get().characters.find((c) => c.id === id);
      if (!character) {
        set({ openId: null, sheet: null, play: emptyPlayState(), undo: null });
        return;
      }
      const sheet = sheetFor(character);
      set({ openId: id, sheet, play: emptyPlayState(), undo: null });
      const saved = await storage.getPlay(id).catch(() => null);
      // Ignore the answer if the player has already moved to another character.
      if (saved && get().openId === id) set({ play: clampState(saved, sheet) });
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
