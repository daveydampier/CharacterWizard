import type { Ability, AbilityName, Character, SkillName } from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skills } from './checks';
import { abilityScores, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { spellSlots, spellcasting } from './spellcasting';

export interface Sheet {
  name: string;
  level: number;
  proficiencyBonus: number;
  scores: Record<AbilityName, number>;
  saves: Record<AbilityName, number>;
  skills: Record<SkillName, number>;
  initiative: number;
  armorClass: number;
  attacksPerAction: number;
  spellcasting: { ability: AbilityName; attack: number; saveDc: number } | null;
  slots: Record<string, number>;
  pactSlots: { level: number; count: number } | null;
  resources: Resource[];
  abilities: Ability[];
}

export function buildSheet(c: Character): Sheet {
  const { slots, pact } = spellSlots(c);
  return {
    name: c.name,
    level: c.level,
    proficiencyBonus: proficiencyBonus(c.level),
    scores: abilityScores(c),
    saves: savingThrows(c),
    skills: skills(c),
    initiative: initiative(c),
    armorClass: armorClass(c),
    attacksPerAction: attacksPerAction(c),
    spellcasting: spellcasting(c),
    slots,
    pactSlots: pact,
    resources: resources(c),
    abilities: buildAbilities(c),
  };
}
