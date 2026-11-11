import type { AbilityName, LimitedUse, ResetType, Timing } from '@cw/model';

export type Raw = Record<string, any>;

export const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
export const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const obj = (v: unknown): Raw =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};

/** table[key], looking only at the table's own properties, so "constructor" is not found. */
export function own<K extends PropertyKey, T>(table: Record<K, T>, key: unknown): T | undefined {
  const k = String(key);
  return Object.hasOwn(table, k) ? (table as Record<string, T>)[k] : undefined;
}

const STAT_IDS: Record<number, AbilityName> = {
  1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha',
};

export const abilityFromStatId = (id: unknown): AbilityName | null =>
  typeof id === 'number' ? (STAT_IDS[id] ?? null) : null;

/** D&D Beyond activationType: 1 Action, 2 No Action, 3 Bonus Action, 4 Reaction, 6 Minute, 7 Hour, 8 Special. */
export function timingFromActivation(activation: unknown): Timing {
  switch (obj(activation).activationType) {
    case 1: return 'action';
    case 3: return 'bonus';
    case 4: return 'reaction';
    case 2:
    case 8: return 'free';
    case 6:
    case 7: return 'long';
    default: return 'unknown';
  }
}

/** Numeric on features (1 Short Rest, 2 Long Rest); strings on items. Dawn counts as a Long Rest. */
export function resetFrom(v: unknown): ResetType {
  if (v === 1 || v === 'ShortRest') return 'short';
  if (v === 2 || v === 'LongRest' || v === 'Dawn') return 'long';
  if (v === 'Consumable') return 'never';
  return 'unknown';
}

/** A pool with no positive maxUses and no ability or proficiency scaling is a placeholder: null. */
export function limitedUseFrom(lu: unknown): LimitedUse | null {
  if (lu === null || typeof lu !== 'object') return null;
  const l = lu as Raw;
  const base = num(l.maxUses) ?? 0;
  const ability = abilityFromStatId(l.statModifierUsesId);
  const addProficiency = l.useProficiencyBonus === true;
  if (base <= 0 && ability === null && !addProficiency) return null;
  return { base, ability, addProficiency, reset: resetFrom(l.resetType) };
}

export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
