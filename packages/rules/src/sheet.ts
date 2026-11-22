import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type Ability, type AbilityName, type Character, type ProficiencyLevel, type SkillName, type ViewName,
} from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skillLevel, skills } from './checks';
import { abilityScores, hasModifier, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { featureGroups, type FeatureGroup } from './features';
import { conditionalNotes, type Note } from './notes';
import { spellSlots, spellcasting } from './spellcasting';
import { universalActions } from './universal';

/** How the player has arranged the views. Empty on a sheet with no edits. */
export interface SheetLayout {
  /** Ability keys in the player's order, for each view. Abilities not listed follow in sheet order. */
  order: Record<ViewName, string[]>;
  /** By ability key: the player's choice of which views list it. Absent means the app decides. */
  show: Record<string, { combat?: boolean; explore?: boolean }>;
}

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
  /** The actions every character can take. Kept apart from `abilities`, which come from the sheet. */
  universal: Ability[];
  notes: Note[];
  /** The Features page, in order. Kept apart from `abilities`: nothing here is used or spent. */
  features: FeatureGroup[];
  /** Abilities the player has hidden. They are in neither `abilities` nor `universal`. */
  hidden: Ability[];
  /** Keys of the abilities that carry an edit. */
  edited: string[];
  layout: SheetLayout;
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
    universal: universalActions(),
    notes: conditionalNotes(c),
    features: featureGroups(c),
    hidden: [],
    edited: [],
    layout: { order: { combat: [], explore: [] }, show: {} },
  };
}
