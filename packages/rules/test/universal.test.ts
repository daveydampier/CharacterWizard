import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { buildSheet, universalActions } from '../src/index';
import { loadRaw } from '../../../test-utils/fixtures';

describe('universalActions', () => {
  it('lists the twelve actions of the 2024 rules in order', () => {
    expect(universalActions().map((a) => a.name)).toEqual([
      'Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide',
      'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize',
    ]);
  });

  it('makes each one an Action with a description, no roll and no cost', () => {
    for (const a of universalActions()) {
      expect(a).toMatchObject({
        source: 'universal', timing: 'action', roll: { kind: 'none' }, cost: { kind: 'none' },
        poolKey: null, concentration: false, ritual: false,
      });
      expect(a.description.length).toBeGreaterThan(10);
      expect(a.key).toMatch(/^universal:[a-z]+:base$/);
    }
  });

  it('uses keys that do not collide with each other or with the sheet\'s own abilities', () => {
    const sheet = buildSheet(convertCharacter(loadRaw('vlad')));
    const keys = [...sheet.abilities, ...sheet.universal].map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(sheet.universal).toHaveLength(12);
  });
});
