import type { Character } from '@cw/model';
import { abilityMod, abilityScores, bonusTotal } from './core';

export function initiative(c: Character): number {
  return abilityMod(abilityScores(c).dex) + bonusTotal(c, ['initiative']);
}

export function armorClass(c: Character): number {
  const scores = abilityScores(c);
  const dex = abilityMod(scores.dex);
  const body = c.armor.find((a) => a.kind !== 'shield');
  const shield = c.armor.find((a) => a.kind === 'shield');
  let base: number;
  if (body) {
    base = body.baseAc + (body.kind === 'light' ? dex : body.kind === 'medium' ? Math.min(dex, 2) : 0);
  } else {
    const unarmored = c.modifiers
      .filter((m) => m.type === 'set' && m.subType === 'unarmored-armor-class')
      .map((m) => (m.ability ? abilityMod(scores[m.ability]) : (m.value ?? 0)));
    base = 10 + dex + Math.max(0, ...unarmored);
  }
  return base + (shield?.baseAc ?? 0) + bonusTotal(c, ['armor-class']);
}

export function attacksPerAction(c: Character): number {
  const extra = c.modifiers
    .filter((m) => m.type === 'set' && m.subType === 'extra-attacks')
    .map((m) => m.value ?? 0);
  return 1 + Math.max(0, ...extra);
}
