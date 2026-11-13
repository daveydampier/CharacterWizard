import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLUGS = [
  'anastasia', 'danger', 'franny', 'maya', 'milton', 'minkis', 'sid', 'vlad',
] as const;
export type Slug = (typeof SLUGS)[number];

export interface Expected {
  level: number;
  proficiencyBonus: number;
  scores: Record<string, number>;
  saves: Record<string, number>;
  skills: Record<string, number>;
  initiative: number;
  armorClass: number;
  attacksPerAction: number;
  spellcasting: { attack: number; saveDc: number } | null;
  slots: Record<string, number>;
  pactSlots: { level: number; count: number } | null;
  weapons: { name: string; attack: number; damage: string; versatile: string | null }[];
  unarmed: { attack: number; damage: number };
  actionAttacks: { name: string; source: string; attack: number; damage: string }[];
  limitedUses: Record<string, number>;
}

// Built from a path, not a URL object: under jsdom the global URL is not Node's.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export function loadRaw(slug: Slug): any {
  return JSON.parse(readFileSync(join(root, 'characters', `${slug}.json`), 'utf8'));
}

export function loadExpected(slug: Slug): Expected {
  return JSON.parse(readFileSync(join(root, 'expected', `${slug}.json`), 'utf8'));
}
