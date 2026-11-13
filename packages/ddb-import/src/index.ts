import type { Character } from '@cw/model';
import { convertActions } from './actions';
import { convertClasses } from './classes';
import { convertArmor, convertChargedItems, convertWeapons } from './items';
import { convertModifiers } from './modifiers';
import { num, obj, str } from './raw';
import { baseScores, scoreOverrides } from './scores';
import { convertSkillCustom } from './skills';
import { convertSpells } from './spells';

export { parseCharacterId } from './id';

/** Accepts the API envelope ({ data }) or the inner character object. Never throws. */
export function convertCharacter(input: unknown): Character {
  const outer = obj(input);
  const d = 'data' in outer ? obj(outer.data) : outer;
  const classes = convertClasses(d);
  const level = classes.reduce((sum, c) => sum + c.level, 0);
  return {
    id: num(d.id) ?? 0,
    name: str(d.name),
    level,
    baseScores: baseScores(d),
    scoreOverrides: scoreOverrides(d),
    classes,
    modifiers: convertModifiers(d),
    skillCustom: convertSkillCustom(d),
    weapons: convertWeapons(d),
    armor: convertArmor(d),
    chargedItems: convertChargedItems(d),
    spells: convertSpells(d, level),
    actions: convertActions(d),
  };
}
