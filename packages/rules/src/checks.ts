import {
  ABILITIES, ABILITY_FULL, SKILLS, SKILL_ABILITY,
  type AbilityName, type Character, type ProficiencyLevel, type SkillName,
} from '@cw/model';
import { abilityMod, abilityScores, bonusTotal, hasModifier, proficiencyBonus } from './core';

export function savingThrows(c: Character): Record<AbilityName, number> {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  const out = {} as Record<AbilityName, number>;
  for (const ability of ABILITIES) {
    const subType = `${ABILITY_FULL[ability]}-saving-throws`;
    out[ability] =
      abilityMod(scores[ability]) +
      (hasModifier(c, 'proficiency', subType) ? pb : 0) +
      bonusTotal(c, [subType, 'saving-throws']);
  }
  return out;
}

export function skillLevel(c: Character, skill: SkillName): ProficiencyLevel {
  const custom = c.skillCustom[skill]?.proficiency;
  if (custom) return custom;
  if (hasModifier(c, 'expertise', skill)) return 'expertise';
  if (hasModifier(c, 'proficiency', skill)) return 'proficient';
  if (hasModifier(c, 'half-proficiency', skill) || hasModifier(c, 'half-proficiency', 'ability-checks')) {
    return 'half';
  }
  return 'none';
}

export function skills(c: Character): Record<SkillName, number> {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  const proficiencyPart: Record<ProficiencyLevel, number> = {
    none: 0,
    half: Math.floor(pb / 2),
    proficient: pb,
    expertise: pb * 2,
  };
  const out = {} as Record<SkillName, number>;
  for (const skill of SKILLS) {
    const ability = c.skillCustom[skill]?.ability ?? SKILL_ABILITY[skill];
    out[skill] =
      abilityMod(scores[ability]) +
      proficiencyPart[skillLevel(c, skill)] +
      bonusTotal(c, [skill, 'ability-checks']);
  }
  return out;
}
