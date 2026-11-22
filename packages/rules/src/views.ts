import type { Ability } from '@cw/model';
import { sortByOrder, viewsOf } from './edits';
import type { Sheet } from './sheet';

export interface CombatGroups {
  action: Ability[];
  bonus: Ability[];
  reaction: Ability[];
  /** "No action needed": timing free or passive. */
  free: Ability[];
  /** Timing the import could not tell, and abilities the player put in Combat that have no group there. */
  other: Ability[];
  /** "Anyone can do this": the universal actions. */
  universal: Ability[];
}

export type CombatGroupName = keyof CombatGroups;

/**
 * The Combat view's groups, each in the player's order. An ability is listed unless it takes a
 * minute or more, or the player has chosen otherwise.
 */
export function combatGroups(sheet: Sheet): CombatGroups {
  const groups: CombatGroups = { action: [], bonus: [], reaction: [], free: [], other: [], universal: [] };
  for (const a of sheet.abilities) {
    if (!viewsOf(sheet, a).combat) continue;
    if (a.timing === 'action' || a.timing === 'bonus' || a.timing === 'reaction') groups[a.timing].push(a);
    else if (a.timing === 'free' || a.timing === 'passive') groups.free.push(a);
    else groups.other.push(a);
  }
  groups.universal = sheet.universal.filter((a) => viewsOf(sheet, a).combat);
  const order = sheet.layout.order.combat;
  for (const name of Object.keys(groups) as CombatGroupName[]) groups[name] = sortByOrder(groups[name], order);
  return groups;
}

/**
 * The Explore view's abilities, in the player's order: those tagged utility, social or movement,
 * rituals, anything taking a minute or more, and whatever the player has put there.
 */
export function exploreAbilities(sheet: Sheet): Ability[] {
  const listed = [...sheet.abilities, ...sheet.universal].filter((a) => viewsOf(sheet, a).explore);
  return sortByOrder(listed, sheet.layout.order.explore);
}
