import type {
  Ability, AbilityName, ActionEntry, Character, Cost, DamagePart, ResetType, Roll, SpellEntry,
} from '@cw/model';
import { actionAttacks, formatDamage, unarmedStrike, weaponAttacks } from './attacks';
import { abilityMod, abilityScores, proficiencyBonus } from './core';
import { limitedUseMax } from './resources';
import { spellAttackBonus, spellSaveDc } from './spellcasting';
import { mapDdbTags } from './tags';

export interface Resource {
  key: string;
  name: string;
  max: number;
  reset: ResetType;
}

const ACTION_SOURCE: Record<ActionEntry['source'], Ability['source']> = {
  class: 'class',
  race: 'species',
  feat: 'feat',
  item: 'item',
  background: 'background',
  custom: 'custom',
};

export const NOT_ATTUNED_NOTE = 'Not attuned: magic properties are off';

function castingContext(c: Character): { ability: AbilityName | null; className: string | null; pact: boolean } {
  const cls = c.classes.find((k) => k.spellcastingAbility);
  return {
    ability: cls?.spellcastingAbility ?? null,
    className: cls?.name ?? null,
    pact: c.classes.some((k) => k.isPactMagic),
  };
}

function spellRoll(c: Character, s: SpellEntry, ability: AbilityName | null, className: string | null): Roll {
  const damage: DamagePart[] = s.damage ? [s.damage] : [];
  if (ability && s.attack) {
    return { kind: 'attack', bonus: spellAttackBonus(c, ability, className), damage, optionalDamage: [] };
  }
  if (ability && s.saveAbility) {
    return { kind: 'save', ability: s.saveAbility, dc: spellSaveDc(c, ability, className), damage };
  }
  // Damage with no attack roll and no saving throw (Hex): the dice are still worth showing.
  if (damage.length > 0) return { kind: 'damage', damage };
  return { kind: 'none' };
}

/**
 * A spell's own pool comes first. An item-granted spell costs one charge of its item's pool
 * (the charge amount is not modelled). Without a pool it costs a slot if the import says so,
 * and otherwise nothing.
 */
function spellCost(c: Character, s: SpellEntry, pact: boolean): Cost {
  if (s.uses) return { kind: 'uses', resourceKey: s.key };
  if (s.itemKey && c.chargedItems.some((i) => i.key === s.itemKey)) {
    return { kind: 'uses', resourceKey: s.itemKey };
  }
  if (s.usesSlot) return { kind: 'slot', minLevel: s.level, pact };
  return { kind: 'none' };
}

function spellAbilities(c: Character): Ability[] {
  const ctx = castingContext(c);
  return c.spells.map((s): Ability => {
    const tags = mapDdbTags(s.ddbTags);
    return {
      key: s.key,
      name: s.name,
      source: 'spell',
      timing: s.timing,
      roll: spellRoll(c, s, s.castingAbility ?? ctx.ability, ctx.className),
      cost: spellCost(c, s, ctx.pact),
      poolKey: null,
      tags,
      concentration: s.concentration,
      ritual: s.ritual,
      range: s.range,
      area: s.area,
      description: s.description,
      notes: s.itemName ? [`From ${s.itemName}`] : [],
      tagSource: tags.length > 0 ? 'import' : 'none',
    };
  });
}

function weaponAbilities(c: Character): Ability[] {
  const pools = new Set(c.chargedItems.map((i) => i.key));
  // weaponAttacks returns one entry per weapon, in the same order as c.weapons.
  const weapons: Ability[] = weaponAttacks(c).map((w, index): Ability => ({
    key: w.key,
    name: w.name,
    source: 'item',
    timing: 'action',
    roll: {
      kind: 'attack',
      bonus: w.attack,
      damage: [{ dice: w.damage, type: w.damageType }],
      optionalDamage: w.extraDamage,
    },
    cost: { kind: 'none' },
    // What a charge does is not in the import, so the pool is shown on the row and spent by hand.
    poolKey: pools.has(w.key) ? w.key : null,
    tags: ['damage'],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: '',
    notes: c.weapons[index]?.unattuned ? [NOT_ATTUNED_NOTE] : [],
    tagSource: 'import',
  }));
  const unarmed = unarmedStrike(c);
  weapons.push({
    key: 'universal:unarmed-strike:base',
    name: 'Unarmed Strike',
    source: 'universal',
    timing: 'action',
    roll: {
      kind: 'attack',
      bonus: unarmed.attack,
      damage: [{ dice: String(unarmed.damage), type: 'Bludgeoning' }],
      optionalDamage: [],
    },
    cost: { kind: 'none' },
    poolKey: null,
    tags: ['damage'],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: '',
    notes: [],
    tagSource: 'curated',
  });
  return weapons;
}

function actionRoll(c: Character, a: ActionEntry, attackBonus: number | undefined): Roll {
  const scores = abilityScores(c);
  const mod = a.dcAbility ? abilityMod(scores[a.dcAbility]) : 0;
  const dice = a.dice ? formatDamage(`${a.dice.count}d${a.dice.sides}`, a.dice.fixed + (a.attack ? mod : 0)) : null;
  const damage: DamagePart[] = dice ? [{ dice, type: null }] : [];
  if (a.attack && attackBonus !== undefined) {
    return { kind: 'attack', bonus: attackBonus, damage, optionalDamage: [] };
  }
  if (a.saveAbility) {
    const dc = a.fixedDc ?? 8 + proficiencyBonus(c.level) + mod;
    return { kind: 'save', ability: a.saveAbility, dc, damage };
  }
  // Dice with no attack and no save: the import does not say whether they are damage or healing.
  if (dice) return { kind: 'dice', dice };
  return { kind: 'none' };
}

function actionAbilities(c: Character): Ability[] {
  const attackByKey = new Map(actionAttacks(c).map((a) => [a.key, a.attack]));
  return c.actions.map((a): Ability => ({
    key: a.key,
    name: a.name,
    source: ACTION_SOURCE[a.source],
    timing: a.timing,
    roll: actionRoll(c, a, attackByKey.get(a.key)),
    cost: a.uses ? { kind: 'uses', resourceKey: a.key } : { kind: 'none' },
    poolKey: null,
    tags: [],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: a.description,
    notes: [],
    tagSource: 'none',
  }));
}

export function buildAbilities(c: Character): Ability[] {
  const seen = new Set<string>();
  return [...weaponAbilities(c), ...spellAbilities(c), ...actionAbilities(c)].filter((a) =>
    seen.has(a.key) ? false : (seen.add(a.key), true),
  );
}

/** Every limited-use pool on the character: features, free spell casts and item charges. */
export function resources(c: Character): Resource[] {
  const out: Resource[] = [];
  for (const a of c.actions) {
    if (a.uses) out.push({ key: a.key, name: a.name, max: limitedUseMax(c, a.uses), reset: a.uses.reset });
  }
  for (const s of c.spells) {
    if (s.uses) out.push({ key: s.key, name: s.name, max: limitedUseMax(c, s.uses), reset: s.uses.reset });
  }
  for (const i of c.chargedItems) {
    out.push({ key: i.key, name: i.name, max: limitedUseMax(c, i.uses), reset: i.uses.reset });
  }
  return out;
}
