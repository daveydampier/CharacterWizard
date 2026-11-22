import {
  ABILITIES, RESET_TYPES, TAGS, TIMINGS,
  type AbilityEdit, type AbilityName, type CustomAbility, type DamagePart, type PlayState, type ResetType,
  type Roll, type Tag, type Timing, type TurnState, type UsesEdit,
} from '@cw/model';

/** The part of the play state that syncs: what is spent and what is being concentrated on. */
export type PlayItem = Pick<PlayState, 'spent' | 'concentrationKey'>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null;

const wholeNumber = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : null;

/**
 * Stored and synced records are checked and repaired before use, because they may have been
 * written by an older version of the app, by another device, or by hand in the database.
 * These functions never throw.
 */
export function normalisePlayItem(data: unknown): PlayItem {
  const source = isRecord(data) ? data : {};
  const spent: Record<string, number> = {};
  if (isRecord(source.spent)) {
    for (const [key, value] of Object.entries(source.spent)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) spent[key] = Math.floor(value);
    }
  }
  const concentrationKey = typeof source.concentrationKey === 'string' ? source.concentrationKey : null;
  return { spent, concentrationKey };
}

export function normaliseTurn(data: unknown): TurnState {
  const source = isRecord(data) ? data : {};
  return {
    action: source.action === true,
    bonus: source.bonus === true,
    reaction: source.reaction === true,
    slotSpentThisTurn: source.slotSpentThisTurn === true,
  };
}

function damageParts(data: unknown): DamagePart[] {
  if (!Array.isArray(data)) return [];
  const out: DamagePart[] = [];
  for (const part of data) {
    if (!isRecord(part) || typeof part.dice !== 'string' || part.dice.trim() === '') continue;
    out.push({ dice: part.dice.trim(), type: typeof part.type === 'string' && part.type.trim() !== '' ? part.type.trim() : null });
  }
  return out;
}

/** A roll as stored, or null if it is not one. Bonuses and DCs are whole numbers within sane bounds. */
export function normaliseRoll(data: unknown): Roll | null {
  if (!isRecord(data)) return null;
  switch (data.kind) {
    case 'none':
      return { kind: 'none' };
    case 'attack': {
      const bonus = wholeNumber(data.bonus, -20, 40);
      return bonus === null
        ? null
        : { kind: 'attack', bonus, damage: damageParts(data.damage), optionalDamage: damageParts(data.optionalDamage) };
    }
    case 'save': {
      const ability = oneOf<AbilityName>(ABILITIES, data.ability);
      const dc = wholeNumber(data.dc, 1, 40);
      return ability === null || dc === null ? null : { kind: 'save', ability, dc, damage: damageParts(data.damage) };
    }
    case 'check': {
      const bonus = wholeNumber(data.bonus, -20, 40);
      return bonus === null ? null : { kind: 'check', bonus };
    }
    case 'damage': {
      const damage = damageParts(data.damage);
      return damage.length === 0 ? null : { kind: 'damage', damage };
    }
    case 'dice':
      return typeof data.dice === 'string' && data.dice.trim() !== '' ? { kind: 'dice', dice: data.dice.trim() } : null;
    default:
      return null;
  }
}

function tagList(data: unknown): Tag[] | null {
  if (!Array.isArray(data)) return null;
  const out: Tag[] = [];
  for (const value of data) {
    const tag = oneOf<Tag>(TAGS, value);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function usesEdit(data: unknown): UsesEdit | null {
  if (!isRecord(data)) return null;
  const max = wholeNumber(data.max, 1, 99);
  const reset = oneOf<ResetType>(RESET_TYPES, data.reset);
  return max === null || reset === null ? null : { max, reset };
}

/** One ability's edits. A field that is missing or malformed is left out, which means "as imported". */
export function normaliseEdit(data: unknown): AbilityEdit {
  const source = isRecord(data) ? data : {};
  const edit: AbilityEdit = {};
  const timing = oneOf<Timing>(TIMINGS, source.timing);
  if (timing) edit.timing = timing;
  if (source.uses === 'none') edit.uses = 'none';
  else {
    const uses = usesEdit(source.uses);
    if (uses) edit.uses = uses;
  }
  const tags = tagList(source.tags);
  if (tags) edit.tags = tags;
  const roll = normaliseRoll(source.roll);
  if (roll) edit.roll = roll;
  if (typeof source.inCombat === 'boolean') edit.inCombat = source.inCombat;
  if (typeof source.inExplore === 'boolean') edit.inExplore = source.inExplore;
  if (source.hidden === true) edit.hidden = true;
  return edit;
}

/** An ability the player added, or null if it has no name and so cannot be shown. */
export function normaliseCustom(data: unknown, key: string): CustomAbility | null {
  if (!isRecord(data) || typeof data.name !== 'string' || data.name.trim() === '') return null;
  const cost = isRecord(data.cost) ? data.cost : {};
  const uses = cost.kind === 'uses' ? usesEdit(cost) : null;
  const minLevel = cost.kind === 'slot' ? wholeNumber(cost.minLevel, 1, 9) : null;
  return {
    key,
    name: data.name.trim(),
    timing: oneOf<Timing>(TIMINGS, data.timing) ?? 'unknown',
    roll: normaliseRoll(data.roll) ?? { kind: 'none' },
    cost: uses ? { kind: 'uses', ...uses } : minLevel !== null ? { kind: 'slot', minLevel } : { kind: 'none' },
    tags: tagList(data.tags) ?? [],
    concentration: data.concentration === true,
    description: typeof data.description === 'string' ? data.description : '',
  };
}

/** A view's order: a list of ability keys with no repeats. */
export function normaliseOrder(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const key of data) {
    if (typeof key === 'string' && key !== '' && !out.includes(key)) out.push(key);
  }
  return out;
}
