import { describe, expect, it } from 'vitest';
import { parseCharacterId } from '../src/index';

describe('parseCharacterId', () => {
  it('accepts a bare ID or a D&D Beyond character URL', () => {
    expect(parseCharacterId('123456789')).toBe('123456789');
    expect(parseCharacterId('  123456789\n')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789')).toBe('123456789');
    expect(parseCharacterId('https://dndbeyond.com/characters/123456789/')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789/builder')).toBe('123456789');
  });

  it('accepts a URL with a query string or a fragment', () => {
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789?utm_source=share')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789/builder?x=1#home')).toBe('123456789');
    expect(parseCharacterId('https://www.dndbeyond.com/characters/123456789#spells')).toBe('123456789');
  });

  it('rejects anything else', () => {
    for (const bad of [
      '', 'abc', '12 34', '../etc/passwd', '-5', '1234567890123',
      'https://example.com/characters/1',
      'http://www.dndbeyond.com/characters/1',
      'https://www.dndbeyond.com.evil.example/characters/1',
      'https://www.dndbeyond.com/characters/abc',
      'https://www.dndbeyond.com/characters/1/../2',
    ]) {
      expect(parseCharacterId(bad)).toBeNull();
    }
  });
});
