import type { Modifier } from '@cw/model';
import { abilityFromStatId, arr, num, obj, str, type Raw } from './raw';

const GROUPS = ['race', 'class', 'background', 'item', 'feat', 'condition'] as const;

/** Definition IDs of items whose modifiers are in effect: equipped, and attuned if attunable. */
export function activeItemIds(d: Raw): Set<number> {
  const ids = new Set<number>();
  for (const item of arr(d.inventory)) {
    const def = obj(item?.definition);
    const id = num(def.id);
    if (id === null || item?.equipped !== true) continue;
    if (def.canAttune === true && item?.isAttuned !== true) continue;
    ids.add(id);
  }
  return ids;
}

export function convertModifiers(d: Raw): Modifier[] {
  const active = activeItemIds(d);
  const groups = obj(d.modifiers);
  const out: Modifier[] = [];
  for (const group of GROUPS) {
    for (const m of arr(groups[group])) {
      const fromItem = group === 'item';
      const componentId = num(m?.componentId);
      if (fromItem && (componentId === null || !active.has(componentId))) continue;
      out.push({
        type: str(m?.type),
        subType: str(m?.subType),
        value: num(m?.value) ?? num(m?.fixedValue),
        ability: abilityFromStatId(m?.statId),
        dice: str(obj(m?.dice).diceString) || null,
        addProficiency: arr(m?.bonusTypes).includes(1),
        restriction: str(m?.restriction),
        fromItem,
        componentId,
      });
    }
  }
  return out;
}
