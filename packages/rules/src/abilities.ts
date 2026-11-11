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
  background: 'feat',
  custom: 'custom',
};

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
  if (!ability) return { kind: 'none' };
  if (s.attack) return { kind: 'attack', bonus: spellAttackBonus(c, ability), damage, optionalDamage: [] };
  if (s.saveAbility) return { kind: 'save', ability: s.saveAbility, dc: spellSaveDc(c, ability, className), damage };
  return { kind: 'none' };
}

function spellCost(s: SpellEntry, pact: boolean): Cost {
  if (s.uses) return { kind: 'uses', resourceKey: s.key };
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
      cost: spellCost(s, ctx.pact),
      tags,
      concentration: s.concentration,
      range: s.range,
      area: s.area,
      description: s.description,
      tagSource: tags.length > 0 ? 'import' : 'none',
    };
  });
}

function weaponAbilities(c: Character): Ability[] {
  const weapons: Ability[] = weaponAttacks(c).map((w): Ability => ({
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
    tags: ['damage'],
    concentration: false,
    range: null,
    area: false,
    description: '',
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
    tags: ['damage'],
    concentration: false,
    range: null,
    area: false,
    description: '',
    tagSource: 'curated',
  });
  return weapons;
}

function actionRoll(c: Character, a: ActionEntry, attackBonus: number | undefined): Roll {
  const scores = abilityScores(c);
  const mod = a.dcAbility ? abilityMod(scores[a.dcAbility]) : 0;
  const damage: DamagePart[] = a.dice
    ? [{ dice: formatDamage(`${a.dice.count}d${a.dice.sides}`, a.dice.fixed + (a.attack ? mod : 0)), type: null }]
    : [];
  if (a.attack && attackBonus !== undefined) {
    return { kind: 'attack', bonus: attackBonus, damage, optionalDamage: [] };
  }
  if (a.saveAbility) {
    const dc = a.fixedDc ?? 8 + proficiencyBonus(c.level) + mod;
    return { kind: 'save', ability: a.saveAbility, dc, damage };
  }
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
    tags: [],
    concentration: false,
    range: null,
    area: false,
    description: a.description,
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
  for (const w of c.weapons) {
    if (w.uses) out.push({ key: w.key, name: w.name, max: limitedUseMax(c, w.uses), reset: w.uses.reset });
  }
  return out;
}
