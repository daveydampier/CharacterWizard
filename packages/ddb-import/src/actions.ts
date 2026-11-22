import type { ActionDice, ActionEntry } from '@cw/model';
import { numberDuplicates, textHash } from './keys';
import {
  abilityFromStatId, arr, componentRef, limitedUseFrom, num, obj, str, timingFromActivation,
  type Linked, type Raw,
} from './raw';

const SOURCES = ['class', 'race', 'feat', 'item', 'background'] as const;
type GroupSource = (typeof SOURCES)[number];

function dice(count: unknown, sides: unknown, fixed: unknown): ActionDice | null {
  const c = num(count);
  const s = num(sides);
  if (!c || !s) return null;
  return { count: c, sides: s, fixed: num(fixed) ?? 0 };
}

/**
 * The id, else the name, else a hash of what the entry says. An entry with neither an id nor a
 * name keeps its key when D&D Beyond reorders the list, which a position would not.
 */
const keyId = (a: Raw): string | number =>
  str(a.id) ||
  num(a.id) ||
  str(a.name) ||
  `anon-${textHash(`${str(a.snippet)}|${str(a.description)}|${obj(a.activation).activationType ?? a.activationType ?? ''}`)}`;

function fromGroup(a: Raw, source: GroupSource, key: string | number): ActionEntry {
  const ability = abilityFromStatId(a.abilityModifierStatId);
  const d = obj(a.dice);
  return {
    key: `action:${key}:${num(a.componentId) ?? 'base'}`,
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

function fromCustom(a: Raw, key: string | number): ActionEntry {
  const ability = abilityFromStatId(a.statId);
  const d = dice(a.diceCount, a.diceType, a.fixedValue);
  return {
    key: `custom:${key}:base`,
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

/** Every action on the sheet, each with the component the sheet says grants it. */
export function linkedActions(d: Raw): Linked<ActionEntry>[] {
  const groups = obj(d.actions);
  const entries: ActionEntry[] = [];
  const components: (string | null)[] = [];
  for (const [group, items] of Object.entries(groups)) {
    const source = (SOURCES as readonly string[]).includes(group) ? (group as GroupSource) : 'class';
    for (const item of arr(items)) {
      const a = obj(item);
      entries.push(fromGroup(a, source, keyId(a)));
      components.push(componentRef(a.componentTypeId, a.componentId));
    }
  }
  for (const item of arr(d.customActions)) {
    const a = obj(item);
    entries.push(fromCustom(a, keyId(a)));
    components.push(null);
  }
  // Two actions can share an id and a granting component; both are kept.
  return numberDuplicates(entries).map((entry, index) => ({ entry, component: components[index] }));
}
