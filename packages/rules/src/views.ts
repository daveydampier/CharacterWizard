import type { Ability, Tag } from '@cw/model';
import type { Sheet } from './sheet';

export interface CombatGroups {
  action: Ability[];
  bonus: Ability[];
  reaction: Ability[];
  /** "No action needed": timing free or passive. */
  free: Ability[];
  /** Timing the import could not tell. */
  other: Ability[];
}

/** Everything except abilities that take a minute or more, grouped by when they can be used. */
export function combatGroups(sheet: Sheet): CombatGroups {
  const groups: CombatGroups = { action: [], bonus: [], reaction: [], free: [], other: [] };
  for (const a of sheet.abilities) {
    if (a.timing === 'action' || a.timing === 'bonus' || a.timing === 'reaction') groups[a.timing].push(a);
    else if (a.timing === 'free' || a.timing === 'passive') groups.free.push(a);
    else if (a.timing === 'unknown') groups.other.push(a);
  }
  return groups;
}

const EXPLORE_TAGS: Tag[] = ['utility', 'social', 'movement'];

/** Abilities tagged utility, social or movement, rituals, and anything taking a minute or more. */
export function exploreAbilities(sheet: Sheet): Ability[] {
  return sheet.abilities.filter(
    (a) => a.timing === 'long' || a.ritual || a.tags.some((t) => EXPLORE_TAGS.includes(t)),
  );
}
