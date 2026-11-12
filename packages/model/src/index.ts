export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityName = (typeof ABILITIES)[number];

export const ABILITY_FULL: Record<AbilityName, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

export const SKILL_ABILITY = {
  acrobatics: 'dex',
  'animal-handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight-of-hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
} as const satisfies Record<string, AbilityName>;

export type SkillName = keyof typeof SKILL_ABILITY;
export const SKILLS = Object.keys(SKILL_ABILITY) as SkillName[];

/** 'free' = usable without an Action, Bonus Action or Reaction. 'long' = a minute or more. */
export type Timing = 'action' | 'bonus' | 'reaction' | 'free' | 'passive' | 'long' | 'unknown';

export type Tag =
  | 'damage' | 'healing' | 'buff' | 'debuff' | 'control'
  | 'movement' | 'defence' | 'utility' | 'social';

export type ResetType = 'short' | 'long' | 'never' | 'unknown';
export type ProficiencyLevel = 'none' | 'half' | 'proficient' | 'expertise';

/** One D&D Beyond modifier row that is currently in effect. */
export interface Modifier {
  type: string;
  subType: string;
  value: number | null;
  /** When set and value is null, the bonus is this ability's modifier. */
  ability: AbilityName | null;
  dice: string | null;
  addProficiency: boolean;
  /** Non-empty means the modifier is conditional and must not be applied automatically. */
  restriction: string;
  fromItem: boolean;
  componentId: number | null;
}

export interface LimitedUse {
  base: number;
  ability: AbilityName | null;
  addProficiency: boolean;
  reset: ResetType;
}

export interface CharacterClass {
  name: string;
  level: number;
  subclassName: string | null;
  spellcastingAbility: AbilityName | null;
  /** True when the class or subclass has the Spellcasting or Pact Magic feature at this level. */
  hasSpellcasting: boolean;
  isPactMagic: boolean;
  /** Slot counts at this class level; index 0 is spell level 1. Empty without spellcasting. */
  slots: number[];
}

export interface DamagePart {
  /** A dice expression ("1d8+3") or a flat number ("4", "0"). */
  dice: string;
  type: string | null;
}

export interface Weapon {
  key: string;
  name: string;
  melee: boolean;
  category: 'simple' | 'martial' | 'other';
  /** Kebab-case base weapon type, e.g. "rapier", "crossbow-hand". */
  typeSlug: string;
  finesse: boolean;
  versatile: boolean;
  damageDice: string;
  damageType: string | null;
  magicBonus: number;
  isPactWeapon: boolean;
  extraDamage: DamagePart[];
  properties: string[];
  /** Null when the weapon has no charge pool, or needs attunement and is not attuned. */
  uses: LimitedUse | null;
  /** True when the item needs attunement and is not attuned: its magic properties are off. */
  unattuned: boolean;
}

export interface Armor {
  name: string;
  kind: 'light' | 'medium' | 'heavy' | 'shield';
  baseAc: number;
}

export interface SpellEntry {
  key: string;
  name: string;
  level: number;
  timing: Timing;
  concentration: boolean;
  ritual: boolean;
  attack: boolean;
  saveAbility: AbilityName | null;
  damage: DamagePart | null;
  ddbTags: string[];
  area: boolean;
  range: string | null;
  usesSlot: boolean;
  /** Casting ability stated on this spell; null means use the class's. */
  castingAbility: AbilityName | null;
  uses: LimitedUse | null;
  /** Key of the item that grants this spell (`item:<definitionId>:base`); null if not item-granted. */
  itemKey: string | null;
  /** Name of the item that grants this spell; null if not item-granted. */
  itemName: string | null;
  description: string;
}

/** An active inventory item with charges, keyed like weapons (`item:<definitionId>:base`). */
export interface ChargedItem {
  key: string;
  name: string;
  uses: LimitedUse;
}

export interface ActionDice {
  count: number;
  sides: number;
  fixed: number;
}

export interface ActionEntry {
  key: string;
  name: string;
  source: 'class' | 'race' | 'feat' | 'item' | 'background' | 'custom';
  timing: Timing;
  attack: { ability: AbilityName; proficient: boolean } | null;
  saveAbility: AbilityName | null;
  dcAbility: AbilityName | null;
  fixedDc: number | null;
  dice: ActionDice | null;
  uses: LimitedUse | null;
  description: string;
}

export interface SkillCustom {
  proficiency?: ProficiencyLevel;
  ability?: AbilityName;
}

/** The app's own character format. Importers produce it; the rules engine consumes it. */
export interface Character {
  id: number;
  name: string;
  level: number;
  /** Scores before modifier bonuses. */
  baseScores: Record<AbilityName, number>;
  /** Scores set outright on the sheet. Each replaces the computed score, after all modifiers. */
  scoreOverrides: Partial<Record<AbilityName, number>>;
  classes: CharacterClass[];
  modifiers: Modifier[];
  skillCustom: Partial<Record<SkillName, SkillCustom>>;
  weapons: Weapon[];
  armor: Armor[];
  chargedItems: ChargedItem[];
  spells: SpellEntry[];
  actions: ActionEntry[];
}

export type Roll =
  | { kind: 'attack'; bonus: number; damage: DamagePart[]; optionalDamage: DamagePart[] }
  | { kind: 'save'; ability: AbilityName; dc: number; damage: DamagePart[] }
  | { kind: 'check'; bonus: number }
  /** A spell with damage but no attack roll or saving throw. */
  | { kind: 'damage'; damage: DamagePart[] }
  /** A feature's dice whose meaning (damage, healing, a bonus) the import does not state. */
  | { kind: 'dice'; dice: string }
  | { kind: 'none' };

export type Cost =
  | { kind: 'none' }
  | { kind: 'slot'; minLevel: number; pact: boolean }
  | { kind: 'uses'; resourceKey: string };

export interface Ability {
  key: string;
  name: string;
  /** The import cannot tell a subclass feature from a class feature; both are 'class'. */
  source: 'spell' | 'class' | 'item' | 'feat' | 'species' | 'background' | 'universal' | 'custom';
  timing: Timing;
  roll: Roll;
  cost: Cost;
  /** A pool shown on the row and spent by hand (a weapon's charges). Use never spends it. */
  poolKey: string | null;
  tags: Tag[];
  concentration: boolean;
  ritual: boolean;
  range: string | null;
  area: boolean;
  description: string;
  /** Short facts from the sheet, shown on the row. */
  notes: string[];
  tagSource: 'import' | 'curated' | 'user' | 'none';
}
