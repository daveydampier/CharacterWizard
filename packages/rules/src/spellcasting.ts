import type { AbilityName, Character } from '@cw/model';
import { abilityMod, abilityScores, bonusTotal, proficiencyBonus } from './core';

const kebab = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function spellAttackBonus(c: Character, ability: AbilityName, className: string | null = null): number {
  const subTypes = ['spell-attacks'];
  if (className) subTypes.push(`${kebab(className)}-spell-attacks`);
  return proficiencyBonus(c.level) + abilityMod(abilityScores(c)[ability]) + bonusTotal(c, subTypes);
}

export function spellSaveDc(c: Character, ability: AbilityName, className: string | null): number {
  const subTypes = ['spell-save-dc'];
  if (className) subTypes.push(`${kebab(className)}-spell-save-dc`);
  return 8 + proficiencyBonus(c.level) + abilityMod(abilityScores(c)[ability]) + bonusTotal(c, subTypes);
}

/** The headline spellcasting numbers, from the first class with the Spellcasting or Pact Magic feature. */
export function spellcasting(c: Character): { ability: AbilityName; attack: number; saveDc: number } | null {
  const cls = c.classes.find((k) => k.hasSpellcasting && k.spellcastingAbility);
  if (!cls || !cls.spellcastingAbility) return null;
  const ability = cls.spellcastingAbility;
  return { ability, attack: spellAttackBonus(c, ability, cls.name), saveDc: spellSaveDc(c, ability, cls.name) };
}

export function spellSlots(c: Character): {
  slots: Record<string, number>;
  pact: { level: number; count: number } | null;
} {
  const slots: Record<string, number> = {};
  let pact: { level: number; count: number } | null = null;
  for (const cls of c.classes) {
    if (!cls.hasSpellcasting) continue;
    if (cls.isPactMagic) {
      const index = cls.slots.findIndex((n) => n > 0);
      if (index >= 0) pact = { level: index + 1, count: cls.slots[index] };
      continue;
    }
    cls.slots.forEach((count, index) => {
      if (count > 0) slots[String(index + 1)] = (slots[String(index + 1)] ?? 0) + count;
    });
  }
  return { slots, pact };
}
