import type { Ability, PlayState, ResetType, Timing, TurnState } from '@cw/model';
import type { Sheet } from './sheet';

/** One limited pool: a spell slot level, the pact slots, or a feature, free cast or item. */
export interface Pool {
  key: string;
  name: string;
  max: number;
  reset: ResetType;
  kind: 'slot' | 'pact' | 'uses';
}

export const PACT_KEY = 'pact';
export const slotKey = (level: number): string => `slot:${level}`;

/** Combat tracks the turn. Explore only deducts costs. */
export type ViewMode = 'combat' | 'explore';

export type TurnTiming = 'action' | 'bonus' | 'reaction';

export const TIMING_LABEL: Record<TurnTiming, string> = {
  action: 'Action',
  bonus: 'Bonus Action',
  reaction: 'Reaction',
};

const isTurnTiming = (t: Timing): t is TurnTiming => t === 'action' || t === 'bonus' || t === 'reaction';

const freshTurn = (): TurnState => ({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });

export const emptyPlayState = (): PlayState => ({ spent: {}, concentrationKey: null, turn: freshTurn() });

/** Spell slots lowest level first, then pact slots, then every other pool in sheet order. */
export function pools(sheet: Sheet): Pool[] {
  const out: Pool[] = [];
  const levels = Object.keys(sheet.slots).map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  for (const level of levels) {
    out.push({ key: slotKey(level), name: `Level ${level} slots`, max: sheet.slots[String(level)], reset: 'long', kind: 'slot' });
  }
  if (sheet.pactSlots) {
    out.push({ key: PACT_KEY, name: 'Pact slots', max: sheet.pactSlots.count, reset: 'short', kind: 'pact' });
  }
  for (const r of sheet.resources) out.push({ ...r, kind: 'uses' });
  return out;
}

export function remaining(pool: Pool, state: PlayState): number {
  return Math.max(0, pool.max - (state.spent[pool.key] ?? 0));
}

export interface SlotOption {
  key: string;
  label: string;
  remaining: number;
}

export interface Availability {
  /** The row has a Use button at all. False for an ability with nothing to spend or track. */
  hasUse: boolean;
  /** Use is allowed right now. */
  canUse: boolean;
  /** Why Use is blocked; null when it is allowed or there is no Use button. */
  reason: string | null;
  /** The slots that could pay, lowest first. Empty unless the cost is a spell slot. */
  slotOptions: SlotOption[];
  /** The name of the concentration effect that using this would end. */
  ends: string | null;
}

const SPENT_REASON: Record<TurnTiming, string> = {
  action: 'You already used your Action this turn.',
  bonus: 'You already used your Bonus Action this turn.',
  reaction: 'You already used your Reaction this round.',
};

function slotOptions(ability: Ability, sheet: Sheet, state: PlayState): SlotOption[] {
  if (ability.cost.kind !== 'slot') return [];
  const min = Math.max(1, ability.cost.minLevel);
  const out: SlotOption[] = [];
  for (const pool of pools(sheet)) {
    const left = remaining(pool, state);
    if (left === 0) continue;
    if (pool.kind === 'slot') {
      const level = Number(pool.key.slice('slot:'.length));
      if (level >= min) out.push({ key: pool.key, label: `Level ${level} slot`, remaining: left });
    } else if (pool.kind === 'pact' && sheet.pactSlots && sheet.pactSlots.level >= min) {
      out.push({ key: pool.key, label: `Pact slot (level ${sheet.pactSlots.level})`, remaining: left });
    }
  }
  return out;
}

function concentrationName(sheet: Sheet, key: string): string {
  return sheet.abilities.find((a) => a.key === key)?.name ?? 'current concentration';
}

export function availability(ability: Ability, sheet: Sheet, state: PlayState, mode: ViewMode = 'combat'): Availability {
  const turnTiming = mode === 'combat' && isTurnTiming(ability.timing) ? ability.timing : null;
  const hasUse = turnTiming !== null || ability.cost.kind !== 'none' || ability.concentration;
  const options = slotOptions(ability, sheet, state);
  const current = state.concentrationKey;
  const ends = ability.concentration && current !== null && current !== ability.key
    ? concentrationName(sheet, current)
    : null;
  const blocked = (reason: string | null): Availability => ({ hasUse, canUse: false, reason, slotOptions: options, ends });

  if (!hasUse) return blocked(null);
  if (turnTiming && state.turn[turnTiming]) return blocked(SPENT_REASON[turnTiming]);
  if (ability.cost.kind === 'uses') {
    const key = ability.cost.resourceKey;
    const pool = pools(sheet).find((p) => p.key === key);
    if (pool && remaining(pool, state) === 0) return blocked('No uses left.');
  }
  if (ability.cost.kind === 'slot') {
    if (options.length === 0) return blocked('No spell slots left.');
    // Reaction spells are exempt: they are normally cast on another creature's turn.
    if (mode === 'combat' && ability.timing !== 'reaction' && state.turn.slotSpentThisTurn) {
      return blocked('You already spent a spell slot this turn.');
    }
  }
  return { hasUse, canUse: true, reason: null, slotOptions: options, ends };
}

/**
 * The state after using the ability. `slot` picks which slot pays; without it the lowest pays.
 * Returns the same state when the ability cannot be used.
 */
export function applyUse(
  ability: Ability, sheet: Sheet, state: PlayState, mode: ViewMode = 'combat', slot?: string,
): PlayState {
  const a = availability(ability, sheet, state, mode);
  if (!a.canUse) return state;
  const next: PlayState = { spent: { ...state.spent }, concentrationKey: state.concentrationKey, turn: { ...state.turn } };
  const spend = (key: string): void => {
    next.spent[key] = (next.spent[key] ?? 0) + 1;
  };
  if (mode === 'combat' && isTurnTiming(ability.timing)) next.turn[ability.timing] = true;
  if (ability.cost.kind === 'uses') spend(ability.cost.resourceKey);
  if (ability.cost.kind === 'slot') {
    const chosen = a.slotOptions.find((o) => o.key === slot) ?? a.slotOptions[0];
    spend(chosen.key);
    if (mode === 'combat' && ability.timing !== 'reaction') next.turn.slotSpentThisTurn = true;
  }
  if (ability.concentration) next.concentrationKey = ability.key;
  return next;
}

export function startTurn(state: PlayState): PlayState {
  return { ...state, turn: freshTurn() };
}

/**
 * A Short Rest restores short-rest pools, which include pact slots. A Long Rest restores those and
 * long-rest pools, and ends concentration. Consumables and pools with an unknown reset are left alone.
 */
export function rest(kind: 'short' | 'long', sheet: Sheet, state: PlayState): PlayState {
  const spent = { ...state.spent };
  for (const pool of pools(sheet)) {
    if (pool.reset === 'short' || (kind === 'long' && pool.reset === 'long')) delete spent[pool.key];
  }
  return { spent, concentrationKey: kind === 'long' ? null : state.concentrationKey, turn: freshTurn() };
}

/** A tap on a pool's pips: `delta` +1 spends one, -1 restores one. Never leaves 0..max. */
export function adjustPool(state: PlayState, pool: Pool, delta: number): PlayState {
  const value = Math.min(pool.max, Math.max(0, (state.spent[pool.key] ?? 0) + delta));
  const spent = { ...state.spent };
  if (value === 0) delete spent[pool.key];
  else spent[pool.key] = value;
  return { ...state, spent };
}

export function togglePill(state: PlayState, timing: TurnTiming): PlayState {
  return { ...state, turn: { ...state.turn, [timing]: !state.turn[timing] } };
}

export function endConcentration(state: PlayState): PlayState {
  return { ...state, concentrationKey: null };
}

/** After a re-import: clamp to the new maximums, forget pools and concentration that no longer exist. */
export function clampState(state: PlayState, sheet: Sheet): PlayState {
  const spent: Record<string, number> = {};
  for (const pool of pools(sheet)) {
    const value = Math.min(pool.max, Math.max(0, Math.floor(state.spent[pool.key] ?? 0)));
    if (value > 0) spent[pool.key] = value;
  }
  const concentrating = state.concentrationKey !== null && sheet.abilities.some((a) => a.key === state.concentrationKey);
  return { spent, concentrationKey: concentrating ? state.concentrationKey : null, turn: { ...state.turn } };
}

/** The short label that tells two rows with the same name apart: "pact slot", "free cast, 3 left". */
export function costLabel(ability: Ability, sheet: Sheet, state: PlayState): string | null {
  if (ability.cost.kind === 'slot') {
    return sheet.pactSlots && Object.keys(sheet.slots).length === 0 ? 'pact slot' : 'spell slot';
  }
  if (ability.cost.kind === 'uses') {
    const key = ability.cost.resourceKey;
    const pool = pools(sheet).find((p) => p.key === key);
    if (!pool) return null;
    const left = `${remaining(pool, state)} left`;
    if (key !== ability.key) return `1 charge of ${pool.name}, ${left}`;
    return ability.source === 'spell' ? `free cast, ${left}` : left;
  }
  return null;
}

/** "Used Hex. Spent: Bonus Action, a pact slot." Compares the state before and after a Use. */
export function useSummary(ability: Ability, sheet: Sheet, before: PlayState, after: PlayState): string {
  const parts: string[] = [];
  for (const timing of ['action', 'bonus', 'reaction'] as const) {
    if (!before.turn[timing] && after.turn[timing]) parts.push(TIMING_LABEL[timing]);
  }
  for (const pool of pools(sheet)) {
    if ((after.spent[pool.key] ?? 0) <= (before.spent[pool.key] ?? 0)) continue;
    if (pool.kind === 'slot') parts.push(`a level ${pool.key.slice('slot:'.length)} slot`);
    else if (pool.kind === 'pact') parts.push('a pact slot');
    else parts.push(`one use of ${pool.name}`);
  }
  return parts.length > 0 ? `Used ${ability.name}. Spent: ${parts.join(', ')}.` : `Used ${ability.name}.`;
}
