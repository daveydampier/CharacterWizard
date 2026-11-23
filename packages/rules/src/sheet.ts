import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type Ability, type AbilityName, type Character, type Feature, type OrderName, type ProficiencyLevel, type SkillName,
} from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skillLevel, skills } from './checks';
import { abilityScores, hasModifier, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { arrangeFeatures, featureAbility, featureSource, hiddenOnSheet, type FeatureGroup, type FeatureSource } from './features';
import { conditionalNotes, type Note } from './notes';
import { spellSlots, spellcasting } from './spellcasting';
import { universalActions } from './universal';

/** How the player has arranged the views. Empty on a sheet with no edits. */
export interface SheetLayout {
  /** Keys in the player's order, for each view and for the Features page. What is not listed follows in sheet order. */
  order: Record<OrderName, string[]>;
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
  /** Everything the Features page is built from, hidden or not. */
  featureSource: FeatureSource;
  /** The Features page, in order, without what is hidden. Nothing here is used or spent. */
  features: FeatureGroup[];
  /** Features that are hidden: by the player, or by D&D Beyond's own flag until the player restores one. */
  hiddenFeatures: Feature[];
  /**
   * By feature key: the feature as a row in play, with the player's edits. Only for a feature with
   * no ability of its own. The ones the player ticked into a view are also in `abilities`.
   */
  featureRows: Record<string, Ability>;
  /** Pools that are not shown, because nothing listed spends them. The editor still reads them. */
  unshownResources: Resource[];
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
  const source = featureSource(c);
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
    featureSource: source,
    features: arrangeFeatures(source, hiddenOnSheet(source.list)),
    hiddenFeatures: source.list.filter((f) => f.hiddenOnSheet),
    featureRows: Object.fromEntries(source.list.filter((f) => f.playKeys.length === 0).map((f) => [f.key, featureAbility(f)])),
    unshownResources: [],
    hidden: [],
    edited: [],
    layout: { order: { combat: [], explore: [], features: [] }, show: {} },
  };
}
