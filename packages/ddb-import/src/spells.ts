import type { DamagePart, SpellEntry } from '@cw/model';
import {
  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
} from './raw';
import { activeItemIds } from './modifiers';

function spellDamage(def: Raw, characterLevel: number): DamagePart | null {
  const mod = arr(def.modifiers).find((m) => m?.type === 'damage');
  if (!mod) return null;
  let dice = str(obj(mod.die).diceString);
  if (def.scaleType === 'characterlevel') {
    const steps = arr(obj(mod.atHigherLevels).higherLevelDefinitions)
      .filter((h) => (num(h?.level) ?? Infinity) <= characterLevel && str(obj(h?.dice).diceString) !== '')
      .sort((a, b) => a.level - b.level);
    const last = steps[steps.length - 1];
    if (last) dice = str(last.dice.diceString);
  }
  return dice ? { dice, type: str(mod.subType) || null } : null;
}

function spellRange(wrapper: Raw, def: Raw): string | null {
  const range = obj(wrapper.range ?? def.range);
  const value = num(range.rangeValue);
  if (value !== null && value > 0) return `${value} ft.`;
  return str(range.origin) || null;
}

interface GrantingItem {
  key: string;
  name: string;
}

function spellEntry(wrapper: Raw, characterLevel: number, item: GrantingItem | null): SpellEntry | null {
  const def = obj(wrapper.definition);
  const id = num(def.id);
  if (id === null) return null;
  const level = num(def.level) ?? 0;
  const uses = limitedUseFrom(wrapper.limitedUse);
  const usesSlot = level > 0 && wrapper.usesSpellSlot === true;
  const component = num(wrapper.componentId) || 'base';
  // An item-granted spell is always keyed `item`, whatever D&D Beyond's slot flag says.
  const costKind = item ? 'item' : usesSlot ? 'slot' : uses ? 'free' : 'atwill';
  return {
    key: `spell:${id}:${component}:${costKind}`,
    name: str(def.name),
    level,
    timing: timingFromActivation(wrapper.activation ?? def.activation),
    concentration: def.concentration === true,
    ritual: def.ritual === true,
    attack: def.requiresAttackRoll === true,
    saveAbility: def.requiresSavingThrow === true ? abilityFromStatId(def.saveDcAbilityId) : null,
    damage: spellDamage(def, characterLevel),
    ddbTags: arr(def.tags).map(str).filter((t) => t !== ''),
    area: obj(def.range).aoeType != null,
    range: spellRange(wrapper, def),
    usesSlot,
    castingAbility: abilityFromStatId(wrapper.spellCastingAbilityId),
    uses,
    itemKey: item?.key ?? null,
    itemName: item?.name ?? null,
    description: str(def.description),
  };
}

/** The granting item for a spell in the `spells.item` group, or null if that item is not active. */
function grantingItem(wrapper: Raw, active: Set<number>, names: Map<number, string>): GrantingItem | null {
  const id = num(wrapper.componentId);
  return id !== null && active.has(id) ? { key: `item:${id}:base`, name: names.get(id) ?? '' } : null;
}

function itemNames(d: Raw): Map<number, string> {
  const names = new Map<number, string>();
  for (const item of arr(d.inventory)) {
    const def = obj(item?.definition);
    const id = num(def.id);
    if (id !== null && !names.has(id)) names.set(id, str(def.name));
  }
  return names;
}

export function convertSpells(d: Raw, characterLevel: number): SpellEntry[] {
  const active = activeItemIds(d);
  const names = itemNames(d);
  const wrappers: { wrapper: Raw; fromItem: boolean }[] = [
    ...arr(d.classSpells).flatMap((cs) => arr(cs?.spells)).map((w) => ({ wrapper: obj(w), fromItem: false })),
    ...Object.entries(obj(d.spells)).flatMap(([group, list]) =>
      arr(list).map((w) => ({ wrapper: obj(w), fromItem: group === 'item' }))),
  ];
  const seen = new Set<string>();
  const out: SpellEntry[] = [];
  for (const { wrapper, fromItem } of wrappers) {
    const item = fromItem ? grantingItem(wrapper, active, names) : null;
    // A spell from an item that is not equipped (and attuned, if attunable) is not available.
    if (fromItem && !item) continue;
    const entry = spellEntry(wrapper, characterLevel, item);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
  }
  return out;
}
