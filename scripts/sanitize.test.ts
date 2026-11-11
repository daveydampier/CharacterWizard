import { describe, expect, it } from 'vitest';
import { parseCharacterId } from './fetch-character';
import { sanitize } from './sanitize';
import { SLUGS, loadRaw } from '../test-utils/fixtures';

describe('sanitize', () => {
  it('removes personal data and rules text, and keeps everything else', () => {
    const input = {
      success: true,
      data: {
        id: 5, name: 'Test', username: 'someone', userId: 123,
        campaign: { id: 9, name: 'Secret Campaign' },
        decorations: { avatarUrl: 'https://example.com/a.png' },
        notes: { backstory: 'private' }, traits: { ideals: 'private' }, socialName: 'x',
        race: { fullName: 'Human', description: '<p>Long rules text</p>', portraitAvatarUrl: 'https://example.com/b.png' },
        actions: { class: [{ name: 'Thing', snippet: 'Rules text', description: '' }] },
        inventory: [{ limitedUse: { resetTypeDescription: 'Regains charges at dawn' }, definition: { name: 'Sword' } }],
      },
    };
    const out = sanitize(input) as any;
    expect(out.data).toMatchObject({
      id: 1, name: 'Test', username: 'redacted', userId: 0,
      campaign: null, decorations: null, notes: null, traits: null, socialName: null,
    });
    expect(out.data.race).toEqual({ fullName: 'Human', description: '[removed]', portraitAvatarUrl: null });
    expect(out.data.actions.class[0]).toEqual({ name: 'Thing', snippet: '[removed]', description: '' });
    expect(out.data.inventory[0].limitedUse.resetTypeDescription).toBe('[removed]');
    expect(out.data.inventory[0].definition.name).toBe('Sword');
    expect(input.data.username).toBe('someone');
  });

  it('removes the character ID, user ID, username, sheet link and descriptive fields everywhere', () => {
    const input = {
      data: {
        id: 155000001, userId: 777000111, username: 'someplayer', name: 'Test',
        readonlyUrl: 'https://dndbeyond.com/characters/155000001',
        age: 30, eyes: 'green', hair: 'red', skin: 'pale', height: '6ft', weight: 180, gender: 'M', faith: 'None',
        inventory: [{ id: 42, equippedEntityId: 155000001, quantity: 3 }],
        modifiers: { race: [{ componentId: 155000001, value: 2 }] },
        providedFrom: 'shared by someplayer (777000111) at /characters/155000001/builder',
        stats: [{ id: 1, value: 15 }],
      },
    };
    const out = sanitize(input) as any;
    expect(out.data).toMatchObject({
      id: 1, userId: 0, username: 'redacted', name: 'Test', readonlyUrl: null,
      age: null, eyes: null, hair: null, skin: null, height: null, weight: null, gender: null, faith: null,
    });
    expect(out.data.inventory[0]).toEqual({ id: 42, equippedEntityId: 1, quantity: 3 });
    expect(out.data.modifiers.race[0]).toEqual({ componentId: 1, value: 2 });
    expect(out.data.stats).toEqual([{ id: 1, value: 15 }]);
    const text = JSON.stringify(out);
    for (const secret of ['155000001', '777000111', 'someplayer']) expect(text).not.toContain(secret);
  });

  it('leaves unrelated numbers alone when the character ID is small', () => {
    const out = sanitize({ data: { id: 5, userId: 3, level: 5, slots: [3, 5] } }) as any;
    expect(out.data).toEqual({ id: 1, userId: 0, level: 5, slots: [3, 5], username: 'redacted' });
  });

  it('removes prose under other free-text keys', () => {
    const text = {
      summary: 'a', highlights: 'b', iconicGear: 'c', details: 'd', tagline: 'e', subclassFlavorText: 'f', exception: 'g',
    };
    const out = sanitize({ data: { classes: [{ definition: { ...text, name: 'Wizard' } }], summary: '', details: null } }) as any;
    expect(out.data.classes[0].definition).toEqual({
      summary: '[removed]', highlights: '[removed]', iconicGear: '[removed]', details: '[removed]',
      tagline: '[removed]', subclassFlavorText: '[removed]', exception: '[removed]', name: 'Wizard',
    });
    expect(out.data).toMatchObject({ summary: '', details: null });
  });

  it('removes personal data from a bare character object', () => {
    const out = sanitize({
      id: 5, name: 'Test', username: 'someone', userId: 123, campaign: { id: 9 }, notes: { backstory: 'private' },
    }) as any;
    expect(out).toEqual({ id: 1, name: 'Test', username: 'redacted', userId: 0, campaign: null, notes: null });
  });

  it('clears notes on custom items and character values', () => {
    const out = sanitize({
      data: {
        customItems: [{ name: 'Twig', notes: 'my note' }, { name: 'Rock', notes: null }],
        characterValues: [{ typeId: 26, value: 4, notes: 'why' }],
      },
    }) as any;
    expect(out.data.customItems).toEqual([{ name: 'Twig', notes: null }, { name: 'Rock', notes: null }]);
    expect(out.data.characterValues).toEqual([{ typeId: 26, value: 4, notes: null }]);
  });

  it.each(SLUGS)('leaves an already clean fixture unchanged: %s', (slug) => {
    const raw = loadRaw(slug);
    expect(sanitize(raw)).toEqual(raw);
  });
});

describe('parseCharacterId', () => {
  it('accepts a bare ID or a D&D Beyond character URL', () => {
    expect(parseCharacterId('123456789')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789/builder')).toBe('123456789');
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'abc', 'https://example.com/characters/1', '12 34', '../etc/passwd', '-5']) {
      expect(parseCharacterId(bad)).toBeNull();
    }
  });
});
