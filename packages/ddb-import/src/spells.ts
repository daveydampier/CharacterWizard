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

function spellEntry(wrapper: Raw, characterLevel: number, itemKey: string | null): SpellEntry | null {
  const def = obj(wrapper.definition);
  const id = num(def.id);
  if (id === null) return null;
  const level = num(def.level) ?? 0;
  const uses = limitedUseFrom(wrapper.limitedUse);
  const usesSlot = level > 0 && wrapper.usesSpellSlot === true;
  const component = num(wrapper.componentId) || 'base';
  const costKind = usesSlot ? 'slot' : uses || itemKey ? 'free' : 'atwill';
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
    itemKey,
    description: str(def.description),
  };
}

/** The granting item's key for a spell in the `spells.item` group, or null if that item is not active. */
function grantingItemKey(wrapper: Raw, active: Set<number>): string | null {
  const id = num(wrapper.componentId);
  return id !== null && active.has(id) ? `item:${id}:base` : null;
}

export function convertSpells(d: Raw, characterLevel: number): SpellEntry[] {
  const active = activeItemIds(d);
  const wrappers: { wrapper: Raw; fromItem: boolean }[] = [
    ...arr(d.classSpells).flatMap((cs) => arr(cs?.spells)).map((w) => ({ wrapper: obj(w), fromItem: false })),
    ...Object.entries(obj(d.spells)).flatMap(([group, list]) =>
      arr(list).map((w) => ({ wrapper: obj(w), fromItem: group === 'item' }))),
  ];
  const seen = new Set<string>();
  const out: SpellEntry[] = [];
  for (const { wrapper, fromItem } of wrappers) {
    const itemKey = fromItem ? grantingItemKey(wrapper, active) : null;
    // A spell from an item that is not equipped (and attuned, if attunable) is not available.
    if (fromItem && !itemKey) continue;
    const entry = spellEntry(wrapper, characterLevel, itemKey);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
  }
  return out;
}
