import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { loadRaw } from '../../../test-utils/fixtures';

describe('weapons', () => {
  it('reads an equipped weapon with properties and extra damage', () => {
    const sword = convertCharacter(loadRaw('vlad')).weapons.find((w) => w.name === 'Wurms Claw - Sword');
    expect(sword).toMatchObject({
      melee: true, category: 'martial', typeSlug: 'rapier', finesse: true, versatile: false,
      damageDice: '1d8', damageType: 'Piercing', magicBonus: 0, isPactWeapon: true,
      extraDamage: [{ dice: '1d6', type: 'poison' }],
      uses: { base: 3, ability: null, addProficiency: false, reset: 'long' },
    });
  });

  it('reads a ranged weapon', () => {
    const bow = convertCharacter(loadRaw('sid')).weapons.find((w) => w.name === 'Shortbow');
    expect(bow).toMatchObject({ melee: false, category: 'simple', typeSlug: 'shortbow', isPactWeapon: false });
  });

  it('treats an equipped staff as a quarterstaff', () => {
    const staff = convertCharacter(loadRaw('maya')).weapons.find((w) => w.name === 'Shepherds Staff');
    expect(staff).toMatchObject({
      melee: true, category: 'simple', typeSlug: 'quarterstaff', versatile: true, damageDice: '1d6', damageType: 'Bludgeoning',
    });
  });

  it('skips weapons that are not equipped', () => {
    const raw = loadRaw('franny');
    for (const item of raw.data.inventory) item.equipped = false;
    expect(convertCharacter(raw).weapons).toEqual([]);
  });
});

describe('armour', () => {
  it('reads body armour and a shield', () => {
    const armor = convertCharacter(loadRaw('danger')).armor;
    expect(armor).toContainEqual({ name: 'Adamantine Breastplate', kind: 'medium', baseAc: 14 });
    expect(armor).toContainEqual({ name: 'Mr Bungle', kind: 'shield', baseAc: 2 });
  });
});

describe('weapon attunement', () => {
  /** A copy of a real fixture whose first equipped weapon is rewritten for the test. */
  function withWeapon(grant: Record<string, unknown>, canAttune: boolean, isAttuned: boolean) {
    const raw = loadRaw('vlad');
    const item = raw.data.inventory.find((i: any) => i.equipped === true && i.definition.filterType === 'Weapon');
    item.definition.grantedModifiers = [grant];
    item.definition.canAttune = canAttune;
    item.isAttuned = isAttuned;
    return { raw, name: item.definition.name as string };
  }
  const weaponOf = (raw: unknown, name: string) => convertCharacter(raw).weapons.find((w) => w.name === name);
  const extra = { type: 'damage', subType: 'fire', dice: { diceString: '1d4' } };
  const plusOne = { type: 'bonus', subType: 'magic', value: 1 };

  it('drops extra damage from an attunable weapon that is not attuned', () => {
    const { raw, name } = withWeapon(extra, true, false);
    expect(weaponOf(raw, name)).toMatchObject({ extraDamage: [], damageDice: '1d8' });
  });

  it('keeps extra damage when attuned or not attunable', () => {
    const a = withWeapon(extra, true, true);
    expect(weaponOf(a.raw, a.name)?.extraDamage).toEqual([{ dice: '1d4', type: 'fire' }]);
    const b = withWeapon(extra, false, false);
    expect(weaponOf(b.raw, b.name)?.extraDamage).toEqual([{ dice: '1d4', type: 'fire' }]);
  });

  it('ignores a magic bonus until the attunable weapon is attuned', () => {
    const off = withWeapon(plusOne, true, false);
    expect(weaponOf(off.raw, off.name)?.magicBonus).toBe(0);
    const on = withWeapon(plusOne, true, true);
    expect(weaponOf(on.raw, on.name)?.magicBonus).toBe(1);
    const plain = withWeapon(plusOne, false, false);
    expect(weaponOf(plain.raw, plain.name)?.magicBonus).toBe(1);
  });
});
