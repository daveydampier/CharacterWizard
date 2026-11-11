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
      id: 5, name: 'Test', username: 'redacted', userId: 0,
      campaign: null, decorations: null, notes: null, traits: null, socialName: null,
    });
    expect(out.data.race).toEqual({ fullName: 'Human', description: '[removed]', portraitAvatarUrl: null });
    expect(out.data.actions.class[0]).toEqual({ name: 'Thing', snippet: '[removed]', description: '' });
    expect(out.data.inventory[0].limitedUse.resetTypeDescription).toBe('[removed]');
    expect(out.data.inventory[0].definition.name).toBe('Sword');
    expect(input.data.username).toBe('someone');
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
