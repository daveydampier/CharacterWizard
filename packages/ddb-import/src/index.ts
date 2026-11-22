import type { Character } from '@cw/model';
import { linkedActions } from './actions';
import { convertClasses } from './classes';
import { convertFeatures, playLinks } from './features';
import { convertArmor, convertChargedItems, convertWeapons } from './items';
import { convertModifiers } from './modifiers';
import { num, obj, str } from './raw';
import { baseScores, scoreOverrides } from './scores';
import { convertSkillCustom } from './skills';
import { linkedSpells } from './spells';

export { parseCharacterId } from './id';

/** Accepts the API envelope ({ data }) or the inner character object. Never throws. */
export function convertCharacter(input: unknown): Character {
  const outer = obj(input);
  const d = 'data' in outer ? obj(outer.data) : outer;
  const classes = convertClasses(d);
  const level = classes.reduce((sum, c) => sum + c.level, 0);
  const spells = linkedSpells(d, level);
  const actions = linkedActions(d);
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
    spells: spells.map((l) => l.entry),
    actions: actions.map((l) => l.entry),
    features: convertFeatures(d, playLinks([...actions, ...spells])),
  };
}
