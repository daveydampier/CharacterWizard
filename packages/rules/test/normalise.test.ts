import { describe, expect, it } from 'vitest';
import { normalisePlayItem, normaliseTurn } from '../src/normalise';

describe('normalisePlayItem', () => {
  it('keeps a well-formed item as it is', () => {
    const item = { spent: { pact: 1, 'slot:1': 2 }, concentrationKey: 'spell:1:base:slot' };
    expect(normalisePlayItem(item)).toEqual(item);
  });

  it.each([null, undefined, 7, 'text', [], {}])('turns %j into an empty item', (data) => {
    expect(normalisePlayItem(data)).toEqual({ spent: {}, concentrationKey: null });
  });

  it('drops counts that are not positive whole numbers and rounds the rest down', () => {
    const data = { spent: { a: 2.9, b: 0, c: -1, d: 'three', e: Number.NaN, f: null }, concentrationKey: 5 };
    expect(normalisePlayItem(data)).toEqual({ spent: { a: 2 }, concentrationKey: null });
  });

  it('ignores a spent value that is not an object', () => {
    expect(normalisePlayItem({ spent: [1, 2], concentrationKey: 'k' })).toEqual({ spent: {}, concentrationKey: 'k' });
  });
});

describe('normaliseTurn', () => {
  it('keeps a well-formed turn as it is', () => {
    const turn = { action: true, bonus: false, reaction: true, slotSpentThisTurn: true };
    expect(normaliseTurn(turn)).toEqual(turn);
  });

  it.each([null, undefined, 'text', [], { action: 'yes', bonus: 1 }])('turns %j into a fresh turn', (data) => {
    expect(normaliseTurn(data)).toEqual({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });
  });
});
