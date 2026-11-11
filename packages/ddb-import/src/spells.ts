import type { DamagePart, SpellEntry } from '@cw/model';
import {
  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
} from './raw';

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

function spellEntry(wrapper: Raw, characterLevel: number): SpellEntry | null {
  const def = obj(wrapper.definition);
  const id = num(def.id);
  if (id === null) return null;
  const level = num(def.level) ?? 0;
  const uses = limitedUseFrom(wrapper.limitedUse);
  const usesSlot = level > 0 && wrapper.usesSpellSlot === true;
  const component = num(wrapper.componentId) || 'base';
  const costKind = usesSlot ? 'slot' : uses ? 'free' : 'atwill';
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
    description: str(def.description),
  };
}

export function convertSpells(d: Raw, characterLevel: number): SpellEntry[] {
  const wrappers = [
    ...arr(d.classSpells).flatMap((cs) => arr(cs?.spells)),
    ...Object.values(obj(d.spells)).flatMap((group) => arr(group)),
  ];
  const seen = new Set<string>();
  const out: SpellEntry[] = [];
  for (const wrapper of wrappers) {
    const entry = spellEntry(obj(wrapper), characterLevel);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
  }
  return out;
}
