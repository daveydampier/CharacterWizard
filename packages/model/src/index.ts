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
export const TIMINGS = ['action', 'bonus', 'reaction', 'free', 'passive', 'long', 'unknown'] as const;
export type Timing = (typeof TIMINGS)[number];

export const TAGS = [
  'damage', 'healing', 'buff', 'debuff', 'control', 'movement', 'defence', 'utility', 'social',
] as const;
export type Tag = (typeof TAGS)[number];

export const RESET_TYPES = ['short', 'long', 'never', 'unknown'] as const;
export type ResetType = (typeof RESET_TYPES)[number];
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

/**
 * Something the sheet says the character has: a class or subclass feature, a feat, a species trait,
 * an option chosen within one of those, or the background's own feature. Most have no ability.
 */
export interface Feature {
  /**
   * `feature:{entityTypeId}:{id}`. Stable across re-imports. A feature with no ID has a key of the
   * form `feature:anon-{hash}`. An option's key ends `@{entityTypeId}:{id}` of the entry it is
   * attached to. A second feature with the same key gets `#2` added.
   */
  key: string;
  name: string;
  origin: 'class' | 'subclass' | 'feat' | 'species' | 'background';
  /** The class, subclass, species or background by name. Empty for a feat. */
  originName: string;
  /** Position of the granting class in `Character.classes`. Null outside a class. */
  classIndex: number | null;
  /** The class level that grants it. Null outside a class, and for an option. */
  level: number | null;
  /** For an option, the key of the feature that offers it. */
  parentKey: string | null;
  /** From the player's own sheet. HTML. */
  description: string;
  /** Keys of the actions and spells the sheet attaches to this feature. */
  playKeys: string[];
  /** D&D Beyond's own flag: it does not show this entry on its sheet. */
  hiddenOnSheet: boolean;
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
  features: Feature[];
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

/** Which parts of the current turn are used up. True means spent. */
export interface TurnState {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  /** A spell slot was spent this turn; only one may be. */
  slotSpentThisTurn: boolean;
}

/** Everything the app tracks during play. A new character starts with nothing spent. */
export interface PlayState {
  /** Pool key to the number spent. Keys: an ability or item key, `slot:1`..`slot:9`, or `pact`. */
  spent: Record<string, number>;
  /** Key of the ability being concentrated on. */
  concentrationKey: string | null;
  turn: TurnState;
}

/** The two views. Each keeps its own order of abilities. */
export type ViewName = 'combat' | 'explore';

/** A list the player can put in order: the two views, and the Features page. */
export type OrderName = ViewName | 'features';

/** A limited-use pool as the player sets it: how many, and when they come back. */
export interface UsesEdit {
  max: number;
  reset: ResetType;
}

/**
 * A player's changes to one ability, stored beside the imported sheet and applied each time the
 * sheet is built. An absent field means "as imported". A feature takes the same edit under its
 * own key: for a feature, `inCombat` and `inExplore` are what put it in a view at all.
 */
export interface AbilityEdit {
  timing?: Timing;
  /** 'none' removes the ability's limited uses. */
  uses?: UsesEdit | 'none';
  tags?: Tag[];
  roll?: Roll;
  inCombat?: boolean;
  inExplore?: boolean;
  /** Absent, an ability is shown, and a feature is hidden only if D&D Beyond hides it on its own sheet. */
  hidden?: boolean;
}

/** An ability the player added. Its key is `own:<uuid>`. */
export interface CustomAbility {
  key: string;
  name: string;
  timing: Timing;
  roll: Roll;
  cost:
    | { kind: 'none' }
    | { kind: 'uses'; max: number; reset: ResetType }
    | { kind: 'slot'; minLevel: number };
  tags: Tag[];
  concentration: boolean;
  /** Plain text, escaped before it is shown. */
  description: string;
}

/** Everything a player has changed on one character. */
export interface CharacterEdits {
  /** By ability key. */
  abilities: Record<string, AbilityEdit>;
  custom: CustomAbility[];
  /** Keys in the order the player arranged them: ability keys for each view, feature keys for the Features page. */
  order: Record<OrderName, string[]>;
}
