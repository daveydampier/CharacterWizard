import type { AbilityName, Character, DamagePart, Weapon } from '@cw/model';
import { abilityMod, abilityScores, hasModifier, proficiencyBonus } from './core';

export interface WeaponAttack {
  key: string;
  name: string;
  ability: AbilityName;
  attack: number;
  damage: string;
  versatile: string | null;
  damageType: string | null;
  extraDamage: DamagePart[];
}

export function formatDamage(dice: string, bonus: number): string {
  if (bonus === 0) return dice;
  return `${dice}${bonus > 0 ? '+' : '-'}${Math.abs(bonus)}`;
}

const NEXT_DIE: Record<number, number> = { 4: 6, 6: 8, 8: 10, 10: 12 };

/** A Versatile weapon held in two hands uses the next die size up. */
export function versatileDice(dice: string): string | null {
  const match = /^(\d+)d(\d+)$/.exec(dice);
  if (!match) return null;
  const sides = Number(match[2]);
  return `${match[1]}d${NEXT_DIE[sides] ?? sides}`;
}

function weaponAbility(c: Character, w: Weapon, scores: Record<AbilityName, number>): AbilityName {
  const options: AbilityName[] = [w.melee ? 'str' : 'dex'];
  if (w.finesse) options.push('str', 'dex');
  if (w.isPactWeapon) {
    for (const m of c.modifiers) {
      if (m.type === 'replace-weapon-ability' && !m.fromItem && m.ability) options.push(m.ability);
    }
  }
  return options.reduce((best, a) => (scores[a] > scores[best] ? a : best));
}

function weaponProficient(c: Character, w: Weapon): boolean {
  return (
    w.isPactWeapon ||
    (w.category === 'simple' && hasModifier(c, 'proficiency', 'simple-weapons')) ||
    (w.category === 'martial' && hasModifier(c, 'proficiency', 'martial-weapons')) ||
    hasModifier(c, 'proficiency', w.typeSlug)
  );
}

export function weaponAttacks(c: Character): WeaponAttack[] {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  return c.weapons.map((w) => {
    const ability = weaponAbility(c, w, scores);
    const mod = abilityMod(scores[ability]);
    const versatile = w.versatile ? versatileDice(w.damageDice) : null;
    return {
      key: w.key,
      name: w.name,
      ability,
      attack: mod + (weaponProficient(c, w) ? pb : 0) + w.magicBonus,
      damage: formatDamage(w.damageDice, mod + w.magicBonus),
      versatile: versatile ? formatDamage(versatile, mod + w.magicBonus) : null,
      damageType: w.damageType,
      extraDamage: w.extraDamage,
    };
  });
}

export function unarmedStrike(c: Character): { attack: number; damage: number } {
  const mod = abilityMod(abilityScores(c).str);
  return { attack: mod + proficiencyBonus(c.level), damage: Math.max(0, 1 + mod) };
}
