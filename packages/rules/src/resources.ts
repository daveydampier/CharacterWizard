import type { Character, LimitedUse } from '@cw/model';
import { abilityMod, abilityScores, proficiencyBonus } from './core';

/** A count that depends on a modifier or the proficiency bonus is never less than one. */
export function limitedUseMax(c: Character, lu: LimitedUse): number {
  const scaled = lu.ability !== null || lu.addProficiency;
  const total =
    lu.base +
    (lu.ability ? abilityMod(abilityScores(c)[lu.ability]) : 0) +
    (lu.addProficiency ? proficiencyBonus(c.level) : 0);
  return scaled ? Math.max(1, total) : total;
}

/** Maximum uses for every limited-use action, by name. The first action with a name wins. */
export function limitedUses(c: Character): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of c.actions) {
    if (a.uses && !(a.name in out)) out[a.name] = limitedUseMax(c, a.uses);
  }
  return out;
}
