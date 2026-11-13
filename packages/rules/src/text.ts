import { ABILITY_FULL, type AbilityName, type DamagePart, type Roll, type SkillName } from '@cw/model';

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "strength" for 'str', capitalised: the name a player hears at the table. */
export const abilityLabel = (ability: AbilityName): string => capitalise(ABILITY_FULL[ability]);

/** "Sleight of Hand" for 'sleight-of-hand'. */
export function skillLabel(skill: SkillName): string {
  return skill.split('-').map((word, index) => (index > 0 && word === 'of' ? word : capitalise(word))).join(' ');
}

/** "1d8+3" becomes "1d8 + 3". A flat number is returned unchanged. */
export function spacedDice(dice: string): string {
  return dice.trim().replace(/(?<=\S)\s*([+-])\s*/g, ' $1 ');
}

/** "Roll d20 + 5." With no bonus it is "Roll d20.", and a penalty reads "Roll d20 - 1." */
function d20(bonus: number): string {
  if (bonus === 0) return 'Roll d20.';
  return `Roll d20 ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}.`;
}

const isZero = (dice: string): boolean => /^0+$/.test(dice.trim());

/** The parts that deal something, joined: "1d8 + 3 piercing + 1d6 poison". Null when nothing is dealt. */
function damageText(parts: DamagePart[]): string | null {
  const real = parts.filter((p) => p.dice.trim() !== '' && !isZero(p.dice));
  if (real.length === 0) return null;
  return real.map((p) => `${spacedDice(p.dice)}${p.type ? ` ${p.type.toLowerCase()}` : ''}`).join(' + ');
}

/** "an Intelligence" before a vowel, "a Strength" otherwise. */
const article = (label: string): string => (/^[aeiou]/i.test(label) ? 'an' : 'a') + ` ${label}`;

/** The plain-English sentence for a roll. Empty when there is nothing to roll. */
export function rollLine(roll: Roll): string {
  switch (roll.kind) {
    case 'attack': {
      let line = d20(roll.bonus);
      if (roll.damage.length > 0) line += ` Hit: ${damageText(roll.damage) ?? 'no damage'}.`;
      const extra = damageText(roll.optionalDamage);
      if (extra) line += ` Extra: ${extra} (see the item).`;
      return line;
    }
    case 'save': {
      const damage = damageText(roll.damage);
      return `They roll ${article(abilityLabel(roll.ability))} save against DC ${roll.dc}.${damage ? ` Fail: ${damage}.` : ''}`;
    }
    case 'damage': {
      const damage = damageText(roll.damage);
      return damage ? `Damage: ${damage}.` : '';
    }
    case 'dice':
      return roll.dice.trim() === '' ? '' : `Roll ${spacedDice(roll.dice)}.`;
    case 'check':
      return d20(roll.bonus);
    default:
      return '';
  }
}
