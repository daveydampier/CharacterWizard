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
