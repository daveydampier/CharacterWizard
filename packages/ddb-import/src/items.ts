import type { Armor, ChargedItem, DamagePart, Weapon } from '@cw/model';
import { activeItemIds } from './modifiers';
import { arr, limitedUseFrom, num, obj, own, slug, str, type Raw } from './raw';

/** characterValues rows with this typeId and value true mark an inventory item as a pact weapon. */
const PACT_WEAPON_TYPE = 28;

const ARMOR_KINDS: Record<number, Armor['kind']> = { 1: 'light', 2: 'medium', 3: 'heavy', 4: 'shield' };

function pactWeaponInventoryIds(d: Raw): Set<string> {
  const ids = new Set<string>();
  for (const v of arr(d.characterValues)) {
    if (v?.typeId === PACT_WEAPON_TYPE && v?.value === true) ids.add(String(v.valueId));
  }
  return ids;
}

function grantedBonus(def: Raw, subType: string): number {
  return arr(def.grantedModifiers)
    .filter((m) => m?.type === 'bonus' && m?.subType === subType)
    .reduce((sum, m) => sum + (num(m.value) ?? num(m.fixedValue) ?? 0), 0);
}

function extraDamage(def: Raw): DamagePart[] {
  return arr(def.grantedModifiers)
    .filter((m) => m?.type === 'damage' && str(obj(m.dice).diceString) !== '')
    .map((m) => ({ dice: str(m.dice.diceString), type: str(m.subType) || null }));
}

/**
 * The key of every equipped inventory entry, by its position in the inventory. The first equipped
 * copy of an item is `item:<definitionId>:base`; later copies get `#2`, `#3`.
 */
function itemKeys(d: Raw): Map<number, string> {
  const copies = new Map<number, number>();
  const keys = new Map<number, string>();
  arr(d.inventory).forEach((item, index) => {
    if (item?.equipped !== true) return;
    const id = num(obj(item.definition).id) ?? 0;
    const count = (copies.get(id) ?? 0) + 1;
    copies.set(id, count);
    keys.set(index, count === 1 ? `item:${id}:base` : `item:${id}:base#${count}`);
  });
  return keys;
}

export function convertWeapons(d: Raw): Weapon[] {
  const pact = pactWeaponInventoryIds(d);
  const keys = itemKeys(d);
  const out: Weapon[] = [];
  for (const [index, item] of arr(d.inventory).entries()) {
    const key = keys.get(index);
    if (key === undefined) continue;
    const def = obj(item.definition);
    // Granted modifiers only apply when the item is attuned, if it needs attunement.
    const effective = !(def.canAttune === true && item.isAttuned !== true);
    const shared = {
      key,
      name: str(def.name),
      magicBonus: effective ? grantedBonus(def, 'magic') : 0,
      isPactWeapon: pact.has(String(item.id)),
      extraDamage: effective ? extraDamage(def) : [],
      uses: effective ? limitedUseFrom(item.limitedUse) : null,
      unattuned: !effective,
    };
    if (def.filterType === 'Weapon') {
      const properties = arr(def.properties).map((p) => str(p?.name));
      out.push({
        ...shared,
        melee: def.attackType !== 2,
        category: def.categoryId === 1 ? 'simple' : def.categoryId === 2 ? 'martial' : 'other',
        typeSlug: slug(str(def.type)),
        finesse: properties.includes('Finesse'),
        versatile: properties.includes('Versatile'),
        damageDice: str(obj(def.damage).diceString),
        damageType: str(def.damageType) || null,
        properties,
      });
    } else if (def.filterType === 'Staff') {
      // A magic staff can be wielded as a quarterstaff; D&D Beyond's data omits the weapon stats.
      out.push({
        ...shared,
        melee: true,
        category: 'simple',
        typeSlug: 'quarterstaff',
        finesse: false,
        versatile: true,
        damageDice: '1d6',
        damageType: 'Bludgeoning',
        properties: ['Versatile'],
      });
    }
  }
  return out;
}

/** Every active item (equipped, and attuned if attunable) that has a real limited-use pool. */
export function convertChargedItems(d: Raw): ChargedItem[] {
  const active = activeItemIds(d);
  const keys = itemKeys(d);
  const out: ChargedItem[] = [];
  for (const [index, item] of arr(d.inventory).entries()) {
    const def = obj(item?.definition);
    const id = num(def.id);
    const key = keys.get(index);
    const uses = limitedUseFrom(item?.limitedUse);
    // An attunable item that is not attuned has no pool, equipped or not.
    const attuned = !(def.canAttune === true && item?.isAttuned !== true);
    if (id === null || key === undefined || !active.has(id) || !attuned || !uses) continue;
    out.push({ key, name: str(def.name), uses });
  }
  return out;
}

export function convertArmor(d: Raw): Armor[] {
  const out: Armor[] = [];
  for (const item of arr(d.inventory)) {
    if (item?.equipped !== true) continue;
    const def = obj(item.definition);
    if (def.filterType !== 'Armor') continue;
    const kind = own(ARMOR_KINDS, def.armorTypeId);
    const baseAc = num(def.armorClass);
    if (!kind || baseAc === null) continue;
    out.push({ name: str(def.name), kind, baseAc });
  }
  return out;
}
