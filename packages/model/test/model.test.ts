import { describe, expect, it } from 'vitest';
import { ABILITIES, ABILITY_FULL, SKILLS, SKILL_ABILITY } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe('model constants', () => {
  it('has six abilities with full names', () => {
    expect(ABILITIES).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    expect(ABILITY_FULL.wis).toBe('wisdom');
  });

  it('has eighteen skills, each tied to an ability', () => {
    expect(SKILLS).toHaveLength(18);
    expect(SKILL_ABILITY['sleight-of-hand']).toBe('dex');
    expect(SKILL_ABILITY.investigation).toBe('int');
  });
});

describe('fixtures', () => {
  it.each(SLUGS)('%s has a character and an expected file', (slug) => {
    expect(loadRaw(slug).data.name).toBeTypeOf('string');
    expect(Object.keys(loadExpected(slug).skills)).toHaveLength(18);
  });
});
