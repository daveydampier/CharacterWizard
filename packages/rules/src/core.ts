import { ABILITIES, ABILITY_FULL, type AbilityName, type Character, type Modifier } from '@cw/model';

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

export const proficiencyBonus = (level: number): number =>
  2 + Math.floor((Math.max(1, level) - 1) / 4);

const unconditional = (m: Modifier): boolean => m.restriction.trim() === '';

export const hasModifier = (c: Character, type: string, subType: string): boolean =>
  c.modifiers.some((m) => m.type === type && m.subType === subType);

export function abilityScores(c: Character): Record<AbilityName, number> {
  const out = {} as Record<AbilityName, number>;
  for (const ability of ABILITIES) {
    const subType = `${ABILITY_FULL[ability]}-score`;
    let score = c.baseScores[ability];
    for (const m of c.modifiers) {
      if (m.type === 'bonus' && m.subType === subType && unconditional(m)) score += m.value ?? 0;
    }
    for (const m of c.modifiers) {
      if (m.type === 'set' && m.subType === subType && unconditional(m)) {
        score = Math.max(score, m.value ?? 0);
      }
    }
    out[ability] = score;
  }
  return out;
}

/** Sum of unconditional `bonus` modifiers for any of the given subTypes. */
export function bonusTotal(c: Character, subTypes: string[]): number {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  let total = 0;
  for (const m of c.modifiers) {
    if (m.type !== 'bonus' || !subTypes.includes(m.subType) || !unconditional(m)) continue;
    total += m.value ?? (m.ability ? abilityMod(scores[m.ability]) : 0);
    if (m.addProficiency) total += pb;
  }
  return total;
}
