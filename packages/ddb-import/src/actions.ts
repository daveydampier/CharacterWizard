import type { ActionDice, ActionEntry } from '@cw/model';
import {
  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
} from './raw';

const SOURCES = ['class', 'race', 'feat', 'item', 'background'] as const;
type GroupSource = (typeof SOURCES)[number];

function dice(count: unknown, sides: unknown, fixed: unknown): ActionDice | null {
  const c = num(count);
  const s = num(sides);
  if (!c || !s) return null;
  return { count: c, sides: s, fixed: num(fixed) ?? 0 };
}

function fromGroup(a: Raw, source: GroupSource): ActionEntry {
  const ability = abilityFromStatId(a.abilityModifierStatId);
  const d = obj(a.dice);
  return {
    key: `action:${str(a.id) || num(a.id) || a.name}:${num(a.componentId) ?? 'base'}`,
    name: str(a.name),
    source,
    timing: timingFromActivation(a.activation),
    attack: a.attackTypeRange != null && ability ? { ability, proficient: a.isProficient === true } : null,
    saveAbility: abilityFromStatId(a.saveStatId),
    dcAbility: ability,
    fixedDc: num(a.fixedSaveDc),
    dice: dice(d.diceCount, d.diceValue, d.fixedValue),
    uses: limitedUseFrom(a.limitedUse),
    description: str(a.snippet) || str(a.description),
  };
}

function fromCustom(a: Raw): ActionEntry {
  const ability = abilityFromStatId(a.statId);
  const d = dice(a.diceCount, a.diceType, a.fixedValue);
  return {
    key: `custom:${str(a.id) || num(a.id) || a.name}:base`,
    name: str(a.name),
    source: 'custom',
    timing: timingFromActivation({ activationType: a.activationType }),
    attack: ability && d ? { ability, proficient: a.isProficient === true } : null,
    saveAbility: abilityFromStatId(a.saveStatId),
    dcAbility: ability,
    fixedDc: num(a.fixedSaveDc),
    dice: d,
    uses: null,
    description: str(a.snippet) || str(a.description),
  };
}

export function convertActions(d: Raw): ActionEntry[] {
  const groups = obj(d.actions);
  const out: ActionEntry[] = [];
  for (const [group, items] of Object.entries(groups)) {
    const source = (SOURCES as readonly string[]).includes(group) ? (group as GroupSource) : 'class';
    for (const a of arr(items)) out.push(fromGroup(obj(a), source));
  }
  for (const a of arr(d.customActions)) out.push(fromCustom(obj(a)));
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)));
}
