import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type Ability, type AbilityName, type Character, type ProficiencyLevel, type SkillName,
} from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skillLevel, skills } from './checks';
import { abilityScores, hasModifier, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { conditionalNotes, type Note } from './notes';
import { spellSlots, spellcasting } from './spellcasting';

export interface Sheet {
  name: string;
  level: number;
  /** "Warlock 3". Empty when the character has no class. */
  classLine: string;
  proficiencyBonus: number;
  scores: Record<AbilityName, number>;
  saves: Record<AbilityName, number>;
  saveProficiency: Record<AbilityName, boolean>;
  skills: Record<SkillName, number>;
  skillLevels: Record<SkillName, ProficiencyLevel>;
  initiative: number;
  armorClass: number;
  attacksPerAction: number;
  spellcasting: { ability: AbilityName; attack: number; saveDc: number } | null;
  slots: Record<string, number>;
  pactSlots: { level: number; count: number } | null;
  resources: Resource[];
  abilities: Ability[];
  notes: Note[];
}

function saveProficiency(c: Character): Record<AbilityName, boolean> {
  const out = {} as Record<AbilityName, boolean>;
  for (const ability of ABILITIES) {
    out[ability] = hasModifier(c, 'proficiency', `${ABILITY_FULL[ability]}-saving-throws`);
  }
  return out;
}

function skillLevels(c: Character): Record<SkillName, ProficiencyLevel> {
  const out = {} as Record<SkillName, ProficiencyLevel>;
  for (const skill of SKILLS) out[skill] = skillLevel(c, skill);
  return out;
}

export function buildSheet(c: Character): Sheet {
  const { slots, pact } = spellSlots(c);
  return {
    name: c.name,
    level: c.level,
    classLine: c.classes.map((k) => `${k.name} ${k.level}`).join(' / '),
    proficiencyBonus: proficiencyBonus(c.level),
    scores: abilityScores(c),
    saves: savingThrows(c),
    saveProficiency: saveProficiency(c),
    skills: skills(c),
    skillLevels: skillLevels(c),
    initiative: initiative(c),
    armorClass: armorClass(c),
    attacksPerAction: attacksPerAction(c),
    spellcasting: spellcasting(c),
    slots,
    pactSlots: pact,
    resources: resources(c),
    abilities: buildAbilities(c),
    notes: conditionalNotes(c),
  };
}
