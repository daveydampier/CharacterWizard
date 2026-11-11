import type { Armor, DamagePart, Weapon } from '@cw/model';
import { arr, limitedUseFrom, num, obj, slug, str, type Raw } from './raw';

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

export function convertWeapons(d: Raw): Weapon[] {
  const pact = pactWeaponInventoryIds(d);
  const out: Weapon[] = [];
  for (const item of arr(d.inventory)) {
    if (item?.equipped !== true) continue;
    const def = obj(item.definition);
    const shared = {
      key: `item:${num(def.id) ?? 0}:base`,
      name: str(def.name),
      magicBonus: grantedBonus(def, 'magic'),
      isPactWeapon: pact.has(String(item.id)),
      extraDamage: extraDamage(def),
      uses: limitedUseFrom(item.limitedUse),
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

export function convertArmor(d: Raw): Armor[] {
  const out: Armor[] = [];
  for (const item of arr(d.inventory)) {
    if (item?.equipped !== true) continue;
    const def = obj(item.definition);
    if (def.filterType !== 'Armor') continue;
    const kind = ARMOR_KINDS[def.armorTypeId as number];
    const baseAc = num(def.armorClass);
    if (!kind || baseAc === null) continue;
    out.push({ name: str(def.name), kind, baseAc });
  }
  return out;
}
