# Milestone 1: Import and Sheet Maths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert a D&D Beyond character JSON into our own `Character` format and calculate every number a player rolls with, proven against eight real character sheets.

**Architecture:** A pnpm TypeScript monorepo with three packages. `@cw/model` holds shared types only. `@cw/ddb-import` converts raw D&D Beyond JSON into a `Character` and is the only code that knows D&D Beyond's field names. `@cw/rules` takes a `Character` and returns derived numbers (a `Sheet`) and a list of `Ability` records. Everything is pure functions; there is no UI, database or network code except one fixture-fetching script.

**Tech Stack:** Node 24, pnpm 11 workspaces, TypeScript (strict), Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-11-11-character-wizard-design.md` (sections 3, 4, 5.1, 7, 14, 15)

## Global Constraints

- No code may branch on a specific character, subclass, item, campaign or table. Branching on SRD rule names is allowed (the features `Spellcasting`, `Pact Magic`; the property names `Finesse`, `Versatile`; the item category `Staff`).
- Unknown input must never throw. Unknown activation types become timing `unknown`; unknown reset types become `unknown`; unknown tags become `utility`; missing arrays are treated as empty.
- Fixtures in `fixtures/characters/*.json` and `fixtures/expected/*.json` are already committed. Never edit `fixtures/expected/*.json` to make a test pass: those values were read from D&D Beyond's own sheets on 2026-11-11 and are the ground truth. If a test disagrees, the code is wrong.
- Rules text must not be committed. The fixture sanitizer replaces every non-empty `description` and `snippet` string with `"[removed]"`.
- Only `@cw/ddb-import` may read D&D Beyond field names. `@cw/rules` reads only `@cw/model` types.
- Single-class characters only. Multiclass slot calculation is out of scope.
- Package names: `@cw/model`, `@cw/ddb-import`, `@cw/rules`. Packages have no build step: `main` and `types` point at `src/index.ts`.
- Commit after every task. End every commit message with: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`

## Scope notes

- The spec lists four parts. This plan adds `@cw/model` so that importers and the rules engine share types without depending on each other.
- The import Edge Function is not in this milestone. It is built in milestone 2, where a browser first needs it. This milestone fetches fixtures with a Node script.
- Spell keys carry a cost suffix (`slot`, `free`, `atwill`) because one feature can grant the same spell twice with different costs. The spec's key format is updated in Task 7.

## File structure

```
package.json                      workspace root, scripts
pnpm-workspace.yaml
tsconfig.json
vitest.config.ts
.gitignore
.gitattributes                    force LF so fixtures do not churn
README.md                         what this is, SRD attribution
test-utils/fixtures.ts            loadRaw(slug), loadExpected(slug), SLUGS
fixtures/                         already committed
packages/model/src/index.ts       all shared types and constants
packages/ddb-import/src/raw.ts        defensive accessors, ID mappings
packages/ddb-import/src/scores.ts     base ability scores
packages/ddb-import/src/modifiers.ts  modifiers in effect
packages/ddb-import/src/classes.ts    classes, spellcasting flags, slot rows
packages/ddb-import/src/skills.ts     per-skill customisations
packages/ddb-import/src/items.ts      weapons and armour
packages/ddb-import/src/spells.ts     spells
packages/ddb-import/src/actions.ts    actions and custom actions
packages/ddb-import/src/index.ts      convertCharacter
packages/rules/src/core.ts            modifiers, proficiency, scores, bonus totals
packages/rules/src/checks.ts          saving throws and skills
packages/rules/src/defence.ts         initiative, armour class, attacks per action
packages/rules/src/attacks.ts         weapon, unarmed and action attacks
packages/rules/src/spellcasting.ts    spell attack, save DC, slots
packages/rules/src/resources.ts       limited-use maximums
packages/rules/src/tags.ts            D&D Beyond tag mapping
packages/rules/src/abilities.ts       Ability[] builder
packages/rules/src/sheet.ts           buildSheet
packages/rules/src/index.ts           re-exports
scripts/sanitize.ts               fixture sanitizer
scripts/fetch-character.ts        fetch + sanitize one character
scripts/sheet.ts                  print a character's sheet
```

## Background the implementer needs

- **Ability modifier:** `floor((score - 10) / 2)`. **Proficiency bonus:** `2 + floor((level - 1) / 4)`.
- **D&D Beyond modifiers** are rows like `{ type: "bonus", subType: "constitution-saving-throws", value: 2 }`. A row with `value: null` and a `statId` means "add that ability's modifier". A row whose `bonusTypes` contains `1` means "add the proficiency bonus".
- **Item modifiers** count only when the item is equipped, and attuned if it can be attuned.
- **Ability IDs:** 1 Strength, 2 Dexterity, 3 Constitution, 4 Intelligence, 5 Wisdom, 6 Charisma.
- **Expected file shape** (`fixtures/expected/<slug>.json`): `level`, `proficiencyBonus`, `scores`, `saves`, `skills`, `initiative`, `armorClass`, `attacksPerAction`, `spellcasting` (`{attack, saveDc}` or `null`), `slots` (spell level as string key to count), `pactSlots` (`{level, count}` or `null`), `weapons` (`name`, `attack`, `damage`, `versatile`), `unarmed` (`attack`, `damage`), `actionAttacks` (`name`, `source`, `attack`, `damage`), `limitedUses` (name to maximum).
- Fixture slugs: `anastasia` (Sorcerer 3), `danger` (Fighter 9, Eldritch Knight), `franny` (Barbarian 3), `maya` (Cleric 3), `milton` (Bard 3), `minkis` (Wizard 3), `sid` (Rogue 3), `vlad` (Warlock 3).

---

### Task 1: Workspace and shared model

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.gitattributes`
- Create: `packages/model/package.json`, `packages/model/src/index.ts`
- Create: `test-utils/fixtures.ts`
- Test: `packages/model/test/model.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type and constant in `packages/model/src/index.ts` below; `SLUGS`, `loadRaw(slug)`, `loadExpected(slug)`, `Expected` from `test-utils/fixtures.ts`.

- [ ] **Step 1: Create the workspace files**

`package.json`:

```json
{
  "name": "character-wizard",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "sheet": "tsx scripts/sheet.ts",
    "fetch-character": "tsx scripts/fetch-character.ts"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["packages/*/src", "packages/*/test", "scripts", "test-utils", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
```

`.gitignore`:

```
node_modules/
```

`.gitattributes`:

```
* text=auto eol=lf
```

`packages/model/package.json`:

```json
{
  "name": "@cw/model",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

- [ ] **Step 2: Install tooling**

Run: `pnpm add -Dw typescript vitest tsx @types/node`
Expected: a `pnpm-lock.yaml` is created and `node_modules/` exists.

- [ ] **Step 3: Write the failing test**

`packages/model/test/model.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL, cannot resolve `../src/index`.

- [ ] **Step 5: Write the model**

`packages/model/src/index.ts`:

```ts
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityName = (typeof ABILITIES)[number];

export const ABILITY_FULL: Record<AbilityName, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

export const SKILL_ABILITY = {
  acrobatics: 'dex',
  'animal-handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight-of-hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
} as const satisfies Record<string, AbilityName>;

export type SkillName = keyof typeof SKILL_ABILITY;
export const SKILLS = Object.keys(SKILL_ABILITY) as SkillName[];

/** 'free' = usable without an Action, Bonus Action or Reaction. 'long' = a minute or more. */
export type Timing = 'action' | 'bonus' | 'reaction' | 'free' | 'passive' | 'long' | 'unknown';

export type Tag =
  | 'damage' | 'healing' | 'buff' | 'debuff' | 'control'
  | 'movement' | 'defence' | 'utility' | 'social';

export type ResetType = 'short' | 'long' | 'never' | 'unknown';
export type ProficiencyLevel = 'none' | 'half' | 'proficient' | 'expertise';

/** One D&D Beyond modifier row that is currently in effect. */
export interface Modifier {
  type: string;
  subType: string;
  value: number | null;
  /** When set and value is null, the bonus is this ability's modifier. */
  ability: AbilityName | null;
  dice: string | null;
  addProficiency: boolean;
  /** Non-empty means the modifier is conditional and must not be applied automatically. */
  restriction: string;
  fromItem: boolean;
  componentId: number | null;
}

export interface LimitedUse {
  base: number;
  ability: AbilityName | null;
  addProficiency: boolean;
  reset: ResetType;
}

export interface CharacterClass {
  name: string;
  level: number;
  subclassName: string | null;
  spellcastingAbility: AbilityName | null;
  /** True when the class or subclass has the Spellcasting or Pact Magic feature at this level. */
  hasSpellcasting: boolean;
  isPactMagic: boolean;
  /** Slot counts at this class level; index 0 is spell level 1. Empty without spellcasting. */
  slots: number[];
}

export interface DamagePart {
  dice: string;
  type: string | null;
}

export interface Weapon {
  key: string;
  name: string;
  melee: boolean;
  category: 'simple' | 'martial' | 'other';
  /** Kebab-case base weapon type, e.g. "rapier", "crossbow-hand". */
  typeSlug: string;
  finesse: boolean;
  versatile: boolean;
  damageDice: string;
  damageType: string | null;
  magicBonus: number;
  isPactWeapon: boolean;
  extraDamage: DamagePart[];
  properties: string[];
  uses: LimitedUse | null;
}

export interface Armor {
  name: string;
  kind: 'light' | 'medium' | 'heavy' | 'shield';
  baseAc: number;
}

export interface SpellEntry {
  key: string;
  name: string;
  level: number;
  timing: Timing;
  concentration: boolean;
  ritual: boolean;
  attack: boolean;
  saveAbility: AbilityName | null;
  damage: DamagePart | null;
  ddbTags: string[];
  area: boolean;
  range: string | null;
  usesSlot: boolean;
  /** Casting ability stated on this spell; null means use the class's. */
  castingAbility: AbilityName | null;
  uses: LimitedUse | null;
  description: string;
}

export interface ActionDice {
  count: number;
  sides: number;
  fixed: number;
}

export interface ActionEntry {
  key: string;
  name: string;
  source: 'class' | 'race' | 'feat' | 'item' | 'background' | 'custom';
  timing: Timing;
  attack: { ability: AbilityName; proficient: boolean } | null;
  saveAbility: AbilityName | null;
  dcAbility: AbilityName | null;
  fixedDc: number | null;
  dice: ActionDice | null;
  uses: LimitedUse | null;
  description: string;
}

export interface SkillCustom {
  proficiency?: ProficiencyLevel;
  ability?: AbilityName;
}

/** The app's own character format. Importers produce it; the rules engine consumes it. */
export interface Character {
  id: number;
  name: string;
  level: number;
  /** Scores before modifier bonuses. */
  baseScores: Record<AbilityName, number>;
  classes: CharacterClass[];
  modifiers: Modifier[];
  skillCustom: Partial<Record<SkillName, SkillCustom>>;
  weapons: Weapon[];
  armor: Armor[];
  spells: SpellEntry[];
  actions: ActionEntry[];
}

export type Roll =
  | { kind: 'attack'; bonus: number; damage: DamagePart[]; optionalDamage: DamagePart[] }
  | { kind: 'save'; ability: AbilityName; dc: number; damage: DamagePart[] }
  | { kind: 'check'; bonus: number }
  | { kind: 'none' };

export type Cost =
  | { kind: 'none' }
  | { kind: 'slot'; minLevel: number; pact: boolean }
  | { kind: 'uses'; resourceKey: string };

export interface Ability {
  key: string;
  name: string;
  source: 'spell' | 'class' | 'subclass' | 'item' | 'feat' | 'species' | 'universal' | 'custom';
  timing: Timing;
  roll: Roll;
  cost: Cost;
  tags: Tag[];
  concentration: boolean;
  range: string | null;
  area: boolean;
  description: string;
  tagSource: 'import' | 'curated' | 'user' | 'none';
}
```

`test-utils/fixtures.ts`:

```ts
import { readFileSync } from 'node:fs';
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

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));

export function loadRaw(slug: Slug): any {
  return JSON.parse(readFileSync(`${root}characters/${slug}.json`, 'utf8'));
}

export function loadExpected(slug: Slug): Expected {
  return JSON.parse(readFileSync(`${root}expected/${slug}.json`, 'utf8'));
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `pnpm test`
Expected: PASS, 10 tests.

Run: `pnpm typecheck`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add workspace, shared model types and fixture loader

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 2: Convert identity, scores, classes, modifiers and skill customisations

**Files:**
- Create: `packages/ddb-import/package.json`
- Create: `packages/ddb-import/src/raw.ts`, `scores.ts`, `modifiers.ts`, `classes.ts`, `skills.ts`, `index.ts`
- Test: `packages/ddb-import/test/convert-core.test.ts`

**Interfaces:**
- Consumes: `@cw/model` types; `loadRaw`, `loadExpected`, `SLUGS`.
- Produces:
  - `convertCharacter(input: unknown): Character` from `@cw/ddb-import`. Accepts either the API envelope `{ data: {...} }` or the inner object. In this task `weapons`, `armor`, `spells` and `actions` are empty arrays.
  - From `raw.ts`: `type Raw = Record<string, any>`, `arr(v): any[]`, `num(v): number | null`, `str(v): string`, `abilityFromStatId(id): AbilityName | null`, `timingFromActivation(activation): Timing`, `resetFrom(v): ResetType`, `limitedUseFrom(lu): LimitedUse | null`, `slug(s: string): string`.
  - From `modifiers.ts`: `activeItemIds(d: Raw): Set<number>`, `convertModifiers(d: Raw): Modifier[]`.

- [ ] **Step 1: Create the package**

`packages/ddb-import/package.json`:

```json
{
  "name": "@cw/ddb-import",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@cw/model": "workspace:*"
  }
}
```

Run: `pnpm install`
Expected: completes; `packages/ddb-import/node_modules/@cw/model` exists.

- [ ] **Step 2: Write the failing test**

`packages/ddb-import/test/convert-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { resetFrom, timingFromActivation } from '../src/raw';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe.each(SLUGS)('convertCharacter core: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));

  it('reads identity and level', () => {
    expect(c.name.length).toBeGreaterThan(0);
    expect(c.id).toBeGreaterThan(0);
    expect(c.level).toBe(loadExpected(slug).level);
  });

  it('reads six base scores', () => {
    expect(Object.keys(c.baseScores)).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
    for (const v of Object.values(c.baseScores)) expect(v).toBeGreaterThan(0);
  });
});

describe('classes', () => {
  it('marks a Warlock as Pact Magic with its slot row', () => {
    const cls = convertCharacter(loadRaw('vlad')).classes[0];
    expect(cls).toMatchObject({
      name: 'Warlock', level: 3, hasSpellcasting: true, isPactMagic: true, spellcastingAbility: 'cha',
    });
    expect(cls.slots.slice(0, 3)).toEqual([0, 2, 0]);
  });

  it('gives a subclass caster the subclass ability and the class slot row', () => {
    const cls = convertCharacter(loadRaw('danger')).classes[0];
    expect(cls).toMatchObject({ name: 'Fighter', level: 9, hasSpellcasting: true, isPactMagic: false, spellcastingAbility: 'int' });
    expect(cls.slots.slice(0, 3)).toEqual([4, 2, 0]);
  });

  it('gives no slots to a class without the Spellcasting feature', () => {
    const sid = convertCharacter(loadRaw('sid')).classes[0];
    expect(sid.hasSpellcasting).toBe(false);
    expect(sid.slots).toEqual([]);
    expect(sid.spellcastingAbility).toBe('cha');
    expect(convertCharacter(loadRaw('franny')).classes[0].slots).toEqual([]);
  });
});

describe('modifiers', () => {
  it('keeps modifiers from an equipped item', () => {
    const mods = convertCharacter(loadRaw('maya')).modifiers;
    expect(mods).toContainEqual(expect.objectContaining({ type: 'bonus', subType: 'armor-class', value: 1, fromItem: true }));
  });

  it('flags a bonus that adds the proficiency bonus', () => {
    const mods = convertCharacter(loadRaw('vlad')).modifiers;
    expect(mods).toContainEqual(expect.objectContaining({ type: 'bonus', subType: 'initiative', value: null, addProficiency: true }));
  });

  it('reads a bonus that is an ability modifier', () => {
    const mods = convertCharacter(loadRaw('maya')).modifiers;
    expect(mods).toContainEqual(expect.objectContaining({ type: 'bonus', subType: 'arcana', value: null, ability: 'wis' }));
  });

  it('drops modifiers from an item that is not equipped', () => {
    const raw = loadRaw('maya');
    for (const item of raw.data.inventory) item.equipped = false;
    const mods = convertCharacter(raw).modifiers;
    expect(mods.filter((m) => m.fromItem)).toEqual([]);
  });
});

describe('skill customisations', () => {
  it('reads a per-skill proficiency level and ability override', () => {
    const custom = convertCharacter(loadRaw('vlad')).skillCustom;
    expect(custom.investigation).toEqual({ proficiency: 'expertise', ability: 'cha' });
    expect(custom.perception).toEqual({ proficiency: 'expertise' });
  });
});

describe('unknown input', () => {
  it('never throws on empty or malformed input', () => {
    for (const input of [undefined, null, 42, 'x', {}, { data: null }, { data: {} }, { data: { classes: 'nope', modifiers: 7 } }]) {
      const c = convertCharacter(input);
      expect(c.level).toBe(0);
      expect(c.classes).toEqual([]);
      expect(c.modifiers).toEqual([]);
    }
  });

  it('maps unknown activation and reset values to unknown', () => {
    expect(timingFromActivation({ activationType: 99 })).toBe('unknown');
    expect(timingFromActivation(null)).toBe('unknown');
    expect(timingFromActivation({ activationType: 8 })).toBe('free');
    expect(timingFromActivation({ activationType: 7 })).toBe('long');
    expect(resetFrom('Weird')).toBe('unknown');
    expect(resetFrom('Dawn')).toBe('long');
    expect(resetFrom('Consumable')).toBe('never');
    expect(resetFrom(1)).toBe('short');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test packages/ddb-import`
Expected: FAIL, cannot resolve `../src/index`.

- [ ] **Step 4: Write the implementation**

`packages/ddb-import/src/raw.ts`:

```ts
import type { AbilityName, LimitedUse, ResetType, Timing } from '@cw/model';

export type Raw = Record<string, any>;

export const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
export const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const obj = (v: unknown): Raw =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};

const STAT_IDS: Record<number, AbilityName> = {
  1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha',
};

export const abilityFromStatId = (id: unknown): AbilityName | null =>
  typeof id === 'number' ? (STAT_IDS[id] ?? null) : null;

/** D&D Beyond activationType: 1 Action, 2 No Action, 3 Bonus Action, 4 Reaction, 6 Minute, 7 Hour, 8 Special. */
export function timingFromActivation(activation: unknown): Timing {
  switch (obj(activation).activationType) {
    case 1: return 'action';
    case 3: return 'bonus';
    case 4: return 'reaction';
    case 2:
    case 8: return 'free';
    case 6:
    case 7: return 'long';
    default: return 'unknown';
  }
}

/** Numeric on features (1 Short Rest, 2 Long Rest); strings on items. Dawn counts as a Long Rest. */
export function resetFrom(v: unknown): ResetType {
  if (v === 1 || v === 'ShortRest') return 'short';
  if (v === 2 || v === 'LongRest' || v === 'Dawn') return 'long';
  if (v === 'Consumable') return 'never';
  return 'unknown';
}

export function limitedUseFrom(lu: unknown): LimitedUse | null {
  if (lu === null || typeof lu !== 'object') return null;
  const l = lu as Raw;
  return {
    base: num(l.maxUses) ?? 0,
    ability: abilityFromStatId(l.statModifierUsesId),
    addProficiency: l.useProficiencyBonus === true,
    reset: resetFrom(l.resetType),
  };
}

export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
```

`packages/ddb-import/src/scores.ts`:

```ts
import { ABILITIES, type AbilityName } from '@cw/model';
import { arr, num, type Raw } from './raw';

/** stats + bonusStats, unless overrideStats sets the score outright. */
export function baseScores(d: Raw): Record<AbilityName, number> {
  const byId = (list: unknown, id: number): number | null =>
    num(arr(list).find((s) => s?.id === id)?.value);
  const out = {} as Record<AbilityName, number>;
  ABILITIES.forEach((ability, i) => {
    const id = i + 1;
    const override = byId(d.overrideStats, id);
    out[ability] = override ?? (byId(d.stats, id) ?? 0) + (byId(d.bonusStats, id) ?? 0);
  });
  return out;
}
```

`packages/ddb-import/src/modifiers.ts`:

```ts
import type { Modifier } from '@cw/model';
import { abilityFromStatId, arr, num, obj, str, type Raw } from './raw';

const GROUPS = ['race', 'class', 'background', 'item', 'feat', 'condition'] as const;

/** Definition IDs of items whose modifiers are in effect: equipped, and attuned if attunable. */
export function activeItemIds(d: Raw): Set<number> {
  const ids = new Set<number>();
  for (const item of arr(d.inventory)) {
    const def = obj(item?.definition);
    const id = num(def.id);
    if (id === null || item?.equipped !== true) continue;
    if (def.canAttune === true && item?.isAttuned !== true) continue;
    ids.add(id);
  }
  return ids;
}

export function convertModifiers(d: Raw): Modifier[] {
  const active = activeItemIds(d);
  const groups = obj(d.modifiers);
  const out: Modifier[] = [];
  for (const group of GROUPS) {
    for (const m of arr(groups[group])) {
      const fromItem = group === 'item';
      const componentId = num(m?.componentId);
      if (fromItem && (componentId === null || !active.has(componentId))) continue;
      out.push({
        type: str(m?.type),
        subType: str(m?.subType),
        value: num(m?.value) ?? num(m?.fixedValue),
        ability: abilityFromStatId(m?.statId),
        dice: str(obj(m?.dice).diceString) || null,
        addProficiency: arr(m?.bonusTypes).includes(1),
        restriction: str(m?.restriction),
        fromItem,
        componentId,
      });
    }
  }
  return out;
}
```

`packages/ddb-import/src/classes.ts`:

```ts
import type { CharacterClass } from '@cw/model';
import { abilityFromStatId, arr, num, obj, str, type Raw } from './raw';

export function convertClasses(d: Raw): CharacterClass[] {
  return arr(d.classes).map((c) => {
    const cd = obj(c?.definition);
    const sd = c?.subclassDefinition ? obj(c.subclassDefinition) : null;
    const level = num(c?.level) ?? 0;
    const featureNames = arr(c?.classFeatures)
      .map((f) => obj(f?.definition))
      .filter((f) => (num(f.requiredLevel) ?? 0) <= level)
      .map((f) => str(f.name));
    const isPactMagic = featureNames.includes('Pact Magic');
    const hasSpellcasting = isPactMagic || featureNames.includes('Spellcasting');
    const row = arr(arr(obj(cd.spellRules).levelSpellSlots)[level]).map((n) => num(n) ?? 0);
    return {
      name: str(cd.name),
      level,
      subclassName: sd ? str(sd.name) : null,
      spellcastingAbility:
        abilityFromStatId(cd.spellCastingAbilityId) ?? abilityFromStatId(sd?.spellCastingAbilityId),
      hasSpellcasting,
      isPactMagic,
      slots: hasSpellcasting ? row : [],
    };
  });
}
```

`packages/ddb-import/src/skills.ts`:

```ts
import type { ProficiencyLevel, SkillCustom, SkillName } from '@cw/model';
import { abilityFromStatId, arr, type Raw } from './raw';

/** characterValues rows whose valueTypeId is this are per-skill customisations. */
const SKILL_ENTITY_TYPE = '1958004211';
const PROFICIENCY_LEVEL_TYPE = 26;
const ABILITY_OVERRIDE_TYPE = 27;

const SKILL_IDS: Record<string, SkillName> = {
  '2': 'athletics', '3': 'acrobatics', '4': 'sleight-of-hand', '5': 'stealth',
  '6': 'arcana', '7': 'history', '8': 'investigation', '9': 'nature', '10': 'religion',
  '11': 'animal-handling', '12': 'insight', '13': 'medicine', '14': 'perception',
  '15': 'survival', '16': 'deception', '17': 'intimidation', '18': 'performance',
  '19': 'persuasion',
};

/** Only 4 (expertise) is confirmed by fixtures; 1 to 3 follow the same ordering. */
const PROFICIENCY_LEVELS: Record<number, ProficiencyLevel> = {
  1: 'none', 2: 'half', 3: 'proficient', 4: 'expertise',
};

export function convertSkillCustom(d: Raw): Partial<Record<SkillName, SkillCustom>> {
  const out: Partial<Record<SkillName, SkillCustom>> = {};
  for (const v of arr(d.characterValues)) {
    if (String(v?.valueTypeId) !== SKILL_ENTITY_TYPE) continue;
    const skill = SKILL_IDS[String(v?.valueId)];
    if (!skill) continue;
    const entry = (out[skill] ??= {});
    if (v.typeId === PROFICIENCY_LEVEL_TYPE) {
      const level = PROFICIENCY_LEVELS[v.value as number];
      if (level) entry.proficiency = level;
    } else if (v.typeId === ABILITY_OVERRIDE_TYPE) {
      const ability = abilityFromStatId(v.value);
      if (ability) entry.ability = ability;
    }
  }
  return out;
}
```

`packages/ddb-import/src/index.ts`:

```ts
import type { Character } from '@cw/model';
import { convertClasses } from './classes';
import { convertModifiers } from './modifiers';
import { num, obj, str } from './raw';
import { baseScores } from './scores';
import { convertSkillCustom } from './skills';

/** Accepts the API envelope ({ data }) or the inner character object. Never throws. */
export function convertCharacter(input: unknown): Character {
  const outer = obj(input);
  const d = 'data' in outer ? obj(outer.data) : outer;
  const classes = convertClasses(d);
  return {
    id: num(d.id) ?? 0,
    name: str(d.name),
    level: classes.reduce((sum, c) => sum + c.level, 0),
    baseScores: baseScores(d),
    classes,
    modifiers: convertModifiers(d),
    skillCustom: convertSkillCustom(d),
    weapons: [],
    armor: [],
    spells: [],
    actions: [],
  };
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `pnpm test packages/ddb-import`
Expected: PASS.

Run: `pnpm typecheck`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Convert identity, scores, classes, modifiers and skill customisations

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 3: Ability scores, proficiency bonus, saving throws and skills

**Files:**
- Create: `packages/rules/package.json`
- Create: `packages/rules/src/core.ts`, `packages/rules/src/checks.ts`, `packages/rules/src/index.ts`
- Test: `packages/rules/test/checks.test.ts`

**Interfaces:**
- Consumes: `Character`, `Modifier`, `ABILITIES`, `ABILITY_FULL`, `SKILLS`, `SKILL_ABILITY` from `@cw/model`; `convertCharacter` from `@cw/ddb-import` (tests only).
- Produces, all exported from `@cw/rules`:
  - `abilityMod(score: number): number`
  - `proficiencyBonus(level: number): number`
  - `abilityScores(c: Character): Record<AbilityName, number>`
  - `hasModifier(c: Character, type: string, subType: string): boolean`
  - `bonusTotal(c: Character, subTypes: string[]): number` — sums unconditional `bonus` modifiers.
  - `savingThrows(c: Character): Record<AbilityName, number>`
  - `skillLevel(c: Character, skill: SkillName): ProficiencyLevel`
  - `skills(c: Character): Record<SkillName, number>`

- [ ] **Step 1: Create the package**

`packages/rules/package.json`:

```json
{
  "name": "@cw/rules",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@cw/model": "workspace:*"
  },
  "devDependencies": {
    "@cw/ddb-import": "workspace:*"
  }
}
```

Run: `pnpm install`
Expected: completes.

- [ ] **Step 2: Write the failing test**

`packages/rules/test/checks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { abilityMod, abilityScores, proficiencyBonus, savingThrows, skills } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe('core formulas', () => {
  it('computes ability modifiers', () => {
    expect([1, 8, 9, 10, 11, 16, 20].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 3, 5]);
  });

  it('computes proficiency bonus by level', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });
});

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);

  it('proficiency bonus', () => expect(proficiencyBonus(c.level)).toBe(e.proficiencyBonus));
  it('ability scores', () => expect(abilityScores(c)).toEqual(e.scores));
  it('saving throws', () => expect(savingThrows(c)).toEqual(e.saves));
  it('skills', () => expect(skills(c)).toEqual(e.skills));
});

describe('conditional bonuses', () => {
  it('ignores a bonus that has a restriction', () => {
    const c = convertCharacter(loadRaw('vlad'));
    const before = savingThrows(c).con;
    c.modifiers.push({
      type: 'bonus', subType: 'constitution-saving-throws', value: 5, ability: null, dice: null,
      addProficiency: false, restriction: 'against poison', fromItem: false, componentId: null,
    });
    expect(savingThrows(c).con).toBe(before);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test packages/rules`
Expected: FAIL, cannot resolve `../src/index`.

- [ ] **Step 4: Write the implementation**

`packages/rules/src/core.ts`:

```ts
import { ABILITIES, ABILITY_FULL, type AbilityName, type Character, type Modifier } from '@cw/model';

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

export const proficiencyBonus = (level: number): number =>
  2 + Math.floor((Math.max(1, level) - 1) / 4);

const unconditional = (m: Modifier): boolean => m.restriction.trim() === '';

export const hasModifier = (c: Character, type: string, subType: string): boolean =>
  c.modifiers.some((m) => m.type === type && m.subType === subType);

export function abilityScores(c: Character): Record<AbilityName, number> {
  const out = {} as Record<AbilityName, number>;
  for (const ability of ABILITIES) {
    const subType = `${ABILITY_FULL[ability]}-score`;
    let score = c.baseScores[ability];
    for (const m of c.modifiers) {
      if (m.type === 'bonus' && m.subType === subType && unconditional(m)) score += m.value ?? 0;
    }
    for (const m of c.modifiers) {
      if (m.type === 'set' && m.subType === subType && unconditional(m)) {
        score = Math.max(score, m.value ?? 0);
      }
    }
    out[ability] = score;
  }
  return out;
}

/** Sum of unconditional `bonus` modifiers for any of the given subTypes. */
export function bonusTotal(c: Character, subTypes: string[]): number {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  let total = 0;
  for (const m of c.modifiers) {
    if (m.type !== 'bonus' || !subTypes.includes(m.subType) || !unconditional(m)) continue;
    total += m.value ?? (m.ability ? abilityMod(scores[m.ability]) : 0);
    if (m.addProficiency) total += pb;
  }
  return total;
}
```

`packages/rules/src/checks.ts`:

```ts
import {
  ABILITIES, ABILITY_FULL, SKILLS, SKILL_ABILITY,
  type AbilityName, type Character, type ProficiencyLevel, type SkillName,
} from '@cw/model';
import { abilityMod, abilityScores, bonusTotal, hasModifier, proficiencyBonus } from './core';

export function savingThrows(c: Character): Record<AbilityName, number> {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  const out = {} as Record<AbilityName, number>;
  for (const ability of ABILITIES) {
    const subType = `${ABILITY_FULL[ability]}-saving-throws`;
    out[ability] =
      abilityMod(scores[ability]) +
      (hasModifier(c, 'proficiency', subType) ? pb : 0) +
      bonusTotal(c, [subType, 'saving-throws']);
  }
  return out;
}

export function skillLevel(c: Character, skill: SkillName): ProficiencyLevel {
  const custom = c.skillCustom[skill]?.proficiency;
  if (custom) return custom;
  if (hasModifier(c, 'expertise', skill)) return 'expertise';
  if (hasModifier(c, 'proficiency', skill)) return 'proficient';
  if (hasModifier(c, 'half-proficiency', skill) || hasModifier(c, 'half-proficiency', 'ability-checks')) {
    return 'half';
  }
  return 'none';
}

export function skills(c: Character): Record<SkillName, number> {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  const proficiencyPart: Record<ProficiencyLevel, number> = {
    none: 0,
    half: Math.floor(pb / 2),
    proficient: pb,
    expertise: pb * 2,
  };
  const out = {} as Record<SkillName, number>;
  for (const skill of SKILLS) {
    const ability = c.skillCustom[skill]?.ability ?? SKILL_ABILITY[skill];
    out[skill] =
      abilityMod(scores[ability]) +
      proficiencyPart[skillLevel(c, skill)] +
      bonusTotal(c, [skill, 'ability-checks']);
  }
  return out;
}
```

`packages/rules/src/index.ts`:

```ts
export * from './core';
export * from './checks';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test packages/rules`
Expected: PASS for all eight characters.

If a fixture fails, print the difference and fix the rule, not the expected file. The most likely causes: a modifier type not handled (list them with `c.modifiers.filter(m => m.subType.includes('<skill or ability>'))`), or a `characterValues` proficiency value other than 4.

Run: `pnpm typecheck`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Calculate scores, proficiency, saving throws and skills

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 4: Weapons, armour, initiative, Armor Class and weapon attacks

**Files:**
- Create: `packages/ddb-import/src/items.ts`
- Modify: `packages/ddb-import/src/index.ts`
- Create: `packages/rules/src/defence.ts`, `packages/rules/src/attacks.ts`
- Modify: `packages/rules/src/index.ts`
- Test: `packages/ddb-import/test/items.test.ts`, `packages/rules/test/combat.test.ts`

**Interfaces:**
- Consumes: Task 2 `raw.ts` helpers; Task 3 `abilityMod`, `abilityScores`, `bonusTotal`, `hasModifier`, `proficiencyBonus`.
- Produces:
  - `convertWeapons(d: Raw): Weapon[]`, `convertArmor(d: Raw): Armor[]`; `convertCharacter` now fills `weapons` and `armor`.
  - From `@cw/rules`: `initiative(c): number`, `armorClass(c): number`, `attacksPerAction(c): number`, `formatDamage(dice: string, bonus: number): string`, `versatileDice(dice: string): string | null`, `weaponAttacks(c): WeaponAttack[]`, `unarmedStrike(c): { attack: number; damage: number }`.
  - `interface WeaponAttack { key: string; name: string; ability: AbilityName; attack: number; damage: string; versatile: string | null; damageType: string | null; extraDamage: DamagePart[] }`

- [ ] **Step 1: Write the failing tests**

`packages/ddb-import/test/items.test.ts`:

```ts
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
```

`packages/rules/test/combat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import {
  armorClass, attacksPerAction, formatDamage, initiative, unarmedStrike, versatileDice, weaponAttacks,
} from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe('damage formatting', () => {
  it('formats a bonus with its sign and omits zero', () => {
    expect(formatDamage('1d8', 3)).toBe('1d8+3');
    expect(formatDamage('1d4', -1)).toBe('1d4-1');
    expect(formatDamage('1d6', 0)).toBe('1d6');
  });

  it('steps a versatile die up one size', () => {
    expect(versatileDice('1d6')).toBe('1d8');
    expect(versatileDice('1d8')).toBe('1d10');
    expect(versatileDice('2d6')).toBe('2d8');
    expect(versatileDice('weird')).toBeNull();
  });
});

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);
  const byName = <T extends { name: string }>(list: T[]): T[] =>
    [...list].sort((a, b) => a.name.localeCompare(b.name));

  it('initiative', () => expect(initiative(c)).toBe(e.initiative));
  it('armor class', () => expect(armorClass(c)).toBe(e.armorClass));
  it('attacks per action', () => expect(attacksPerAction(c)).toBe(e.attacksPerAction));
  it('unarmed strike', () => expect(unarmedStrike(c)).toEqual(e.unarmed));
  it('weapon attacks', () => {
    const actual = weaponAttacks(c).map(({ name, attack, damage, versatile }) => ({ name, attack, damage, versatile }));
    expect(byName(actual)).toEqual(byName(e.weapons));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. The items tests fail because `weapons` and `armor` are empty; the combat tests fail on missing exports.

- [ ] **Step 3: Write the converter**

`packages/ddb-import/src/items.ts`:

```ts
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
```

In `packages/ddb-import/src/index.ts`, add the import and replace the two empty arrays:

```ts
import { convertArmor, convertWeapons } from './items';
```

```ts
    weapons: convertWeapons(d),
    armor: convertArmor(d),
```

- [ ] **Step 4: Write the rules**

`packages/rules/src/defence.ts`:

```ts
import type { Character } from '@cw/model';
import { abilityMod, abilityScores, bonusTotal } from './core';

export function initiative(c: Character): number {
  return abilityMod(abilityScores(c).dex) + bonusTotal(c, ['initiative']);
}

export function armorClass(c: Character): number {
  const scores = abilityScores(c);
  const dex = abilityMod(scores.dex);
  const body = c.armor.find((a) => a.kind !== 'shield');
  const shield = c.armor.find((a) => a.kind === 'shield');
  let base: number;
  if (body) {
    base = body.baseAc + (body.kind === 'light' ? dex : body.kind === 'medium' ? Math.min(dex, 2) : 0);
  } else {
    const unarmored = c.modifiers
      .filter((m) => m.type === 'set' && m.subType === 'unarmored-armor-class')
      .map((m) => (m.ability ? abilityMod(scores[m.ability]) : (m.value ?? 0)));
    base = 10 + dex + Math.max(0, ...unarmored);
  }
  return base + (shield?.baseAc ?? 0) + bonusTotal(c, ['armor-class']);
}

export function attacksPerAction(c: Character): number {
  const extra = c.modifiers
    .filter((m) => m.type === 'set' && m.subType === 'extra-attacks')
    .map((m) => m.value ?? 0);
  return 1 + Math.max(0, ...extra);
}
```

`packages/rules/src/attacks.ts`:

```ts
import type { AbilityName, Character, DamagePart, Weapon } from '@cw/model';
import { abilityMod, abilityScores, hasModifier, proficiencyBonus } from './core';

export interface WeaponAttack {
  key: string;
  name: string;
  ability: AbilityName;
  attack: number;
  damage: string;
  versatile: string | null;
  damageType: string | null;
  extraDamage: DamagePart[];
}

export function formatDamage(dice: string, bonus: number): string {
  if (bonus === 0) return dice;
  return `${dice}${bonus > 0 ? '+' : '-'}${Math.abs(bonus)}`;
}

const NEXT_DIE: Record<number, number> = { 4: 6, 6: 8, 8: 10, 10: 12 };

/** A Versatile weapon held in two hands uses the next die size up. */
export function versatileDice(dice: string): string | null {
  const match = /^(\d+)d(\d+)$/.exec(dice);
  if (!match) return null;
  const sides = Number(match[2]);
  return `${match[1]}d${NEXT_DIE[sides] ?? sides}`;
}

function weaponAbility(c: Character, w: Weapon, scores: Record<AbilityName, number>): AbilityName {
  const options: AbilityName[] = [w.melee ? 'str' : 'dex'];
  if (w.finesse) options.push('str', 'dex');
  if (w.isPactWeapon) {
    for (const m of c.modifiers) {
      if (m.type === 'replace-weapon-ability' && !m.fromItem && m.ability) options.push(m.ability);
    }
  }
  return options.reduce((best, a) => (scores[a] > scores[best] ? a : best));
}

function weaponProficient(c: Character, w: Weapon): boolean {
  return (
    w.isPactWeapon ||
    (w.category === 'simple' && hasModifier(c, 'proficiency', 'simple-weapons')) ||
    (w.category === 'martial' && hasModifier(c, 'proficiency', 'martial-weapons')) ||
    hasModifier(c, 'proficiency', w.typeSlug)
  );
}

export function weaponAttacks(c: Character): WeaponAttack[] {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  return c.weapons.map((w) => {
    const ability = weaponAbility(c, w, scores);
    const mod = abilityMod(scores[ability]);
    const versatile = w.versatile ? versatileDice(w.damageDice) : null;
    return {
      key: w.key,
      name: w.name,
      ability,
      attack: mod + (weaponProficient(c, w) ? pb : 0) + w.magicBonus,
      damage: formatDamage(w.damageDice, mod + w.magicBonus),
      versatile: versatile ? formatDamage(versatile, mod + w.magicBonus) : null,
      damageType: w.damageType,
      extraDamage: w.extraDamage,
    };
  });
}

export function unarmedStrike(c: Character): { attack: number; damage: number } {
  const mod = abilityMod(abilityScores(c).str);
  return { attack: mod + proficiencyBonus(c.level), damage: Math.max(0, 1 + mod) };
}
```

`packages/rules/src/index.ts`:

```ts
export * from './core';
export * from './checks';
export * from './defence';
export * from './attacks';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

Things the fixtures prove here, so do not "simplify" them away:
- `milton`: his weapon carries an item-granted `replace-weapon-ability`. D&D Beyond does not apply it (the sheet shows +1, Strength-based), which is why `weaponAbility` ignores modifiers with `fromItem`.
- `vlad`: a Warlock is proficient with a martial pact weapon and attacks with Charisma (+5).
- `maya`: an equipped, non-attunable staff grants +1 Armor Class (11) and attacks as a quarterstaff (+1, 1d6-1).
- `franny`: unarmoured Armor Class is 10 + Dexterity + Constitution (15).
- `danger`: medium armour caps Dexterity at +2 and a shield adds 2 (18).

Run: `pnpm typecheck`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Convert weapons and armour; calculate initiative, AC and weapon attacks

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 5: Spells, spell attack, save DC and spell slots

**Files:**
- Create: `packages/ddb-import/src/spells.ts`
- Modify: `packages/ddb-import/src/index.ts`
- Create: `packages/rules/src/spellcasting.ts`
- Modify: `packages/rules/src/index.ts`
- Test: `packages/ddb-import/test/spells.test.ts`, `packages/rules/test/spellcasting.test.ts`

**Interfaces:**
- Consumes: Task 2 `raw.ts` helpers; Task 3 core functions.
- Produces:
  - `convertSpells(d: Raw, characterLevel: number): SpellEntry[]`; `convertCharacter` now fills `spells`.
  - From `@cw/rules`: `spellAttackBonus(c, ability: AbilityName): number`, `spellSaveDc(c, ability: AbilityName, className: string | null): number`, `spellcasting(c): { ability: AbilityName; attack: number; saveDc: number } | null`, `spellSlots(c): { slots: Record<string, number>; pact: { level: number; count: number } | null }`.

- [ ] **Step 1: Write the failing tests**

`packages/ddb-import/test/spells.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

describe('spells', () => {
  const vlad = convertCharacter(loadRaw('vlad')).spells;

  it('reads timing, concentration, slot use and tags', () => {
    const hex = vlad.find((s) => s.name === 'Hex');
    expect(hex).toMatchObject({
      level: 1, timing: 'bonus', concentration: true, usesSlot: true, attack: false,
      saveAbility: null, uses: null, ddbTags: ['Damage', 'Debuff'], range: '90 ft.',
    });
  });

  it('reads an attack cantrip with its damage', () => {
    const blast = vlad.find((s) => s.name === 'Eldritch Blast');
    expect(blast).toMatchObject({ level: 0, timing: 'action', attack: true, usesSlot: false, damage: { dice: '1d10', type: 'force' } });
  });

  it('reads a save spell', () => {
    const arms = vlad.find((s) => s.name === 'Arms of Hadar');
    expect(arms).toMatchObject({ saveAbility: 'str', attack: false, area: true });
  });

  it('keeps the same spell twice when it is granted with different costs', () => {
    const misty = vlad.filter((s) => s.name === 'Misty Step');
    expect(misty).toHaveLength(2);
    expect(misty.map((s) => s.usesSlot).sort()).toEqual([false, true]);
    const free = misty.find((s) => !s.usesSlot);
    expect(free?.uses).toEqual({ base: 0, ability: 'cha', addProficiency: false, reset: 'long' });
    expect(new Set(misty.map((s) => s.key)).size).toBe(2);
  });

  it('scales cantrip damage by character level', () => {
    const fireBolt = convertCharacter(loadRaw('danger')).spells.find((s) => s.name === 'Fire Bolt');
    expect(fireBolt?.damage).toEqual({ dice: '2d10', type: 'fire' });
    expect(fireBolt?.castingAbility).toBe('int');
  });

  it.each(SLUGS)('gives every spell a unique key: %s', (slug) => {
    const keys = convertCharacter(loadRaw(slug)).spells.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

`packages/rules/test/spellcasting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { spellSaveDc, spellSlots, spellcasting } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);

  it('spell attack and save DC', () => {
    const s = spellcasting(c);
    expect(s ? { attack: s.attack, saveDc: s.saveDc } : null).toEqual(e.spellcasting);
  });

  it('spell slots', () => {
    const { slots, pact } = spellSlots(c);
    expect(slots).toEqual(e.slots);
    expect(pact).toEqual(e.pactSlots);
  });
});

describe('subclass-granted spells without the Spellcasting feature', () => {
  it('still has a save DC from the subclass ability', () => {
    const sid = convertCharacter(loadRaw('sid'));
    expect(spellSaveDc(sid, 'cha', sid.classes[0].name)).toBe(12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL on empty `spells` and missing exports.

- [ ] **Step 3: Write the converter**

`packages/ddb-import/src/spells.ts`:

```ts
import type { DamagePart, SpellEntry } from '@cw/model';
import {
  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
} from './raw';

function spellDamage(def: Raw, characterLevel: number): DamagePart | null {
  const mod = arr(def.modifiers).find((m) => m?.type === 'damage');
  if (!mod) return null;
  let dice = str(obj(mod.die).diceString);
  if (def.scaleType === 'characterlevel') {
    const steps = arr(obj(mod.atHigherLevels).higherLevelDefinitions)
      .filter((h) => (num(h?.level) ?? Infinity) <= characterLevel && str(obj(h?.dice).diceString) !== '')
      .sort((a, b) => a.level - b.level);
    const last = steps[steps.length - 1];
    if (last) dice = str(last.dice.diceString);
  }
  return dice ? { dice, type: str(mod.subType) || null } : null;
}

function spellRange(wrapper: Raw, def: Raw): string | null {
  const range = obj(wrapper.range ?? def.range);
  const value = num(range.rangeValue);
  if (value !== null && value > 0) return `${value} ft.`;
  return str(range.origin) || null;
}

function spellEntry(wrapper: Raw, characterLevel: number): SpellEntry | null {
  const def = obj(wrapper.definition);
  const id = num(def.id);
  if (id === null) return null;
  const level = num(def.level) ?? 0;
  const uses = limitedUseFrom(wrapper.limitedUse);
  const usesSlot = level > 0 && wrapper.usesSpellSlot === true;
  const component = num(wrapper.componentId) || 'base';
  const costKind = usesSlot ? 'slot' : uses ? 'free' : 'atwill';
  return {
    key: `spell:${id}:${component}:${costKind}`,
    name: str(def.name),
    level,
    timing: timingFromActivation(wrapper.activation ?? def.activation),
    concentration: def.concentration === true,
    ritual: def.ritual === true,
    attack: def.requiresAttackRoll === true,
    saveAbility: def.requiresSavingThrow === true ? abilityFromStatId(def.saveDcAbilityId) : null,
    damage: spellDamage(def, characterLevel),
    ddbTags: arr(def.tags).map(str).filter((t) => t !== ''),
    area: obj(def.range).aoeType != null,
    range: spellRange(wrapper, def),
    usesSlot,
    castingAbility: abilityFromStatId(wrapper.spellCastingAbilityId),
    uses,
    description: str(def.description),
  };
}

export function convertSpells(d: Raw, characterLevel: number): SpellEntry[] {
  const wrappers = [
    ...arr(d.classSpells).flatMap((cs) => arr(cs?.spells)),
    ...Object.values(obj(d.spells)).flatMap((group) => arr(group)),
  ];
  const seen = new Set<string>();
  const out: SpellEntry[] = [];
  for (const wrapper of wrappers) {
    const entry = spellEntry(obj(wrapper), characterLevel);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
  }
  return out;
}
```

In `packages/ddb-import/src/index.ts`, add the import and replace `spells: []`. The character level is needed, so compute it before building the object:

```ts
import { convertSpells } from './spells';
```

```ts
  const classes = convertClasses(d);
  const level = classes.reduce((sum, c) => sum + c.level, 0);
  return {
    id: num(d.id) ?? 0,
    name: str(d.name),
    level,
    baseScores: baseScores(d),
    classes,
    modifiers: convertModifiers(d),
    skillCustom: convertSkillCustom(d),
    weapons: convertWeapons(d),
    armor: convertArmor(d),
    spells: convertSpells(d, level),
    actions: [],
  };
```

- [ ] **Step 4: Write the rules**

`packages/rules/src/spellcasting.ts`:

```ts
import type { AbilityName, Character } from '@cw/model';
import { abilityMod, abilityScores, bonusTotal, proficiencyBonus } from './core';

const kebab = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function spellAttackBonus(c: Character, ability: AbilityName): number {
  return proficiencyBonus(c.level) + abilityMod(abilityScores(c)[ability]) + bonusTotal(c, ['spell-attacks']);
}

export function spellSaveDc(c: Character, ability: AbilityName, className: string | null): number {
  const subTypes = ['spell-save-dc'];
  if (className) subTypes.push(`${kebab(className)}-spell-save-dc`);
  return 8 + proficiencyBonus(c.level) + abilityMod(abilityScores(c)[ability]) + bonusTotal(c, subTypes);
}

/** The headline spellcasting numbers, from the first class with the Spellcasting or Pact Magic feature. */
export function spellcasting(c: Character): { ability: AbilityName; attack: number; saveDc: number } | null {
  const cls = c.classes.find((k) => k.hasSpellcasting && k.spellcastingAbility);
  if (!cls || !cls.spellcastingAbility) return null;
  const ability = cls.spellcastingAbility;
  return { ability, attack: spellAttackBonus(c, ability), saveDc: spellSaveDc(c, ability, cls.name) };
}

export function spellSlots(c: Character): {
  slots: Record<string, number>;
  pact: { level: number; count: number } | null;
} {
  const slots: Record<string, number> = {};
  let pact: { level: number; count: number } | null = null;
  for (const cls of c.classes) {
    if (!cls.hasSpellcasting) continue;
    if (cls.isPactMagic) {
      const index = cls.slots.findIndex((n) => n > 0);
      if (index >= 0) pact = { level: index + 1, count: cls.slots[index] };
      continue;
    }
    cls.slots.forEach((count, index) => {
      if (count > 0) slots[String(index + 1)] = (slots[String(index + 1)] ?? 0) + count;
    });
  }
  return { slots, pact };
}
```

Add to `packages/rules/src/index.ts`:

```ts
export * from './spellcasting';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

Notes on what the fixtures prove:
- `anastasia`: a class-specific `sorcerer-spell-save-dc` bonus makes her DC 14 while her attack stays +5.
- `sid` and `franny` have spells but no `Spellcasting` feature, so `spellcasting` is `null` and they have no slots.
- If the `ddbTags` assertion for Hex fails on order, compare as sets; do not change the converter to sort.

Run: `pnpm typecheck`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Convert spells; calculate spell attack, save DC and slots

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 6: Actions, custom actions, action attacks and limited uses

**Files:**
- Create: `packages/ddb-import/src/actions.ts`
- Modify: `packages/ddb-import/src/index.ts`
- Create: `packages/rules/src/resources.ts`
- Modify: `packages/rules/src/attacks.ts`, `packages/rules/src/index.ts`
- Test: `packages/ddb-import/test/actions.test.ts`, `packages/rules/test/actions.test.ts`

**Interfaces:**
- Consumes: Task 2 `raw.ts` helpers; Task 3 core functions; Task 4 `formatDamage`.
- Produces:
  - `convertActions(d: Raw): ActionEntry[]`; `convertCharacter` now fills `actions`.
  - From `@cw/rules`: `actionAttacks(c): ActionAttack[]`, `limitedUseMax(c, lu: LimitedUse): number`, `limitedUses(c): Record<string, number>`.
  - `interface ActionAttack { key: string; name: string; source: ActionEntry['source']; attack: number; damage: string | null }`

- [ ] **Step 1: Write the failing tests**

`packages/ddb-import/test/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '../src/index';
import { SLUGS, loadRaw } from '../../../test-utils/fixtures';

describe('actions', () => {
  it('reads timing and limited uses', () => {
    const actions = convertCharacter(loadRaw('danger')).actions;
    expect(actions.find((a) => a.name === 'Action Surge')).toMatchObject({
      timing: 'free', source: 'class', uses: { base: 1, ability: null, addProficiency: false, reset: 'short' },
    });
    expect(actions.find((a) => a.name === 'Second Wind')).toMatchObject({
      timing: 'bonus', attack: null, dice: { count: 1, sides: 10, fixed: 9 },
      uses: { base: 3, reset: 'long' },
    });
  });

  it('reads an attack granted by a feat', () => {
    const pole = convertCharacter(loadRaw('danger')).actions.find((a) => a.name === 'Pole Strike');
    expect(pole).toMatchObject({
      source: 'feat', timing: 'bonus', attack: { ability: 'str', proficient: true }, dice: { count: 1, sides: 4, fixed: 0 },
    });
  });

  it('reads a save-based action', () => {
    const turn = convertCharacter(loadRaw('maya')).actions.find((a) => a.name === 'Channel Divinity: Turn Undead');
    expect(turn).toMatchObject({ timing: 'action', attack: null, saveAbility: 'wis', dcAbility: 'wis' });
  });

  it('reads a use count based on an ability modifier or proficiency bonus', () => {
    const insp = convertCharacter(loadRaw('milton')).actions.find((a) => a.name === 'Bardic Inspiration');
    expect(insp?.uses).toEqual({ base: 0, ability: 'cha', addProficiency: false, reset: 'long' });
    const luck = convertCharacter(loadRaw('vlad')).actions.find((a) => a.name === 'Luck Points');
    expect(luck?.uses).toEqual({ base: 0, ability: null, addProficiency: true, reset: 'long' });
  });

  it('reads custom actions', () => {
    const custom = convertCharacter(loadRaw('franny')).actions.filter((a) => a.source === 'custom');
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({
      name: 'Twig Attack', attack: { ability: 'dex', proficient: true }, dice: { count: 1, sides: 8, fixed: 0 },
    });
  });

  it.each(SLUGS)('gives every action a unique key: %s', (slug) => {
    const keys = convertCharacter(loadRaw(slug)).actions.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

`packages/rules/test/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { actionAttacks, limitedUseMax, limitedUses } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe.each(SLUGS)('matches the D&D Beyond sheet: %s', (slug) => {
  const c = convertCharacter(loadRaw(slug));
  const e = loadExpected(slug);

  it('action attacks', () => {
    const sort = <T extends { name: string; source: string }>(list: T[]): T[] =>
      [...list].sort((a, b) => `${a.name}|${a.source}`.localeCompare(`${b.name}|${b.source}`));
    const actual = actionAttacks(c).map(({ name, source, attack, damage }) => ({ name, source, attack, damage }));
    expect(sort(actual)).toEqual(sort(e.actionAttacks));
  });

  it('limited-use maximums', () => {
    expect(limitedUses(c)).toMatchObject(e.limitedUses);
  });
});

describe('limitedUseMax', () => {
  const c = convertCharacter(loadRaw('vlad'));

  it('adds an ability modifier, with a minimum of one', () => {
    expect(limitedUseMax(c, { base: 0, ability: 'cha', addProficiency: false, reset: 'long' })).toBe(3);
    expect(limitedUseMax(c, { base: 0, ability: 'str', addProficiency: false, reset: 'long' })).toBe(1);
  });

  it('leaves a fixed count alone', () => {
    expect(limitedUseMax(c, { base: 0, ability: null, addProficiency: false, reset: 'unknown' })).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL on empty `actions` and missing exports.

- [ ] **Step 3: Write the converter**

`packages/ddb-import/src/actions.ts`:

```ts
import type { ActionDice, ActionEntry } from '@cw/model';
import {
  abilityFromStatId, arr, limitedUseFrom, num, obj, str, timingFromActivation, type Raw,
} from './raw';

const SOURCES = ['class', 'race', 'feat', 'item', 'background'] as const;
type GroupSource = (typeof SOURCES)[number];

function dice(count: unknown, sides: unknown, fixed: unknown): ActionDice | null {
  const c = num(count);
  const s = num(sides);
  if (!c || !s) return null;
  return { count: c, sides: s, fixed: num(fixed) ?? 0 };
}

function fromGroup(a: Raw, source: GroupSource): ActionEntry {
  const ability = abilityFromStatId(a.abilityModifierStatId);
  const d = obj(a.dice);
  return {
    key: `action:${str(a.id) || num(a.id) || a.name}:${num(a.componentId) ?? 'base'}`,
    name: str(a.name),
    source,
    timing: timingFromActivation(a.activation),
    attack: a.attackTypeRange != null && ability ? { ability, proficient: a.isProficient === true } : null,
    saveAbility: abilityFromStatId(a.saveStatId),
    dcAbility: ability,
    fixedDc: num(a.fixedSaveDc),
    dice: dice(d.diceCount, d.diceValue, d.fixedValue),
    uses: limitedUseFrom(a.limitedUse),
    description: str(a.snippet) || str(a.description),
  };
}

function fromCustom(a: Raw): ActionEntry {
  const ability = abilityFromStatId(a.statId);
  const d = dice(a.diceCount, a.diceType, a.fixedValue);
  return {
    key: `custom:${str(a.id) || num(a.id) || a.name}:base`,
    name: str(a.name),
    source: 'custom',
    timing: timingFromActivation({ activationType: a.activationType }),
    attack: ability && d ? { ability, proficient: a.isProficient === true } : null,
    saveAbility: abilityFromStatId(a.saveStatId),
    dcAbility: ability,
    fixedDc: num(a.fixedSaveDc),
    dice: d,
    uses: null,
    description: str(a.snippet) || str(a.description),
  };
}

export function convertActions(d: Raw): ActionEntry[] {
  const groups = obj(d.actions);
  const out: ActionEntry[] = [];
  for (const [group, items] of Object.entries(groups)) {
    const source = (SOURCES as readonly string[]).includes(group) ? (group as GroupSource) : 'class';
    for (const a of arr(items)) out.push(fromGroup(obj(a), source));
  }
  for (const a of arr(d.customActions)) out.push(fromCustom(obj(a)));
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.key) ? false : (seen.add(a.key), true)));
}
```

In `packages/ddb-import/src/index.ts`, add the import and replace `actions: []`:

```ts
import { convertActions } from './actions';
```

```ts
    actions: convertActions(d),
```

- [ ] **Step 4: Write the rules**

In `packages/rules/src/attacks.ts`, change the first import line to include `ActionEntry`:

```ts
import type { AbilityName, ActionEntry, Character, DamagePart, Weapon } from '@cw/model';
```

Then append to the end of the same file:

```ts
export interface ActionAttack {
  key: string;
  name: string;
  source: ActionEntry['source'];
  attack: number;
  damage: string | null;
}

/** Attacks that come from features, feats and custom actions rather than from weapons. */
export function actionAttacks(c: Character): ActionAttack[] {
  const scores = abilityScores(c);
  const pb = proficiencyBonus(c.level);
  const out: ActionAttack[] = [];
  for (const a of c.actions) {
    if (!a.attack) continue;
    const mod = abilityMod(scores[a.attack.ability]);
    out.push({
      key: a.key,
      name: a.name,
      source: a.source,
      attack: mod + (a.attack.proficient ? pb : 0),
      damage: a.dice ? formatDamage(`${a.dice.count}d${a.dice.sides}`, a.dice.fixed + mod) : null,
    });
  }
  return out;
}
```

`packages/rules/src/resources.ts`:

```ts
import type { Character, LimitedUse } from '@cw/model';
import { abilityMod, abilityScores, proficiencyBonus } from './core';

/** A count that depends on a modifier or the proficiency bonus is never less than one. */
export function limitedUseMax(c: Character, lu: LimitedUse): number {
  const scaled = lu.ability !== null || lu.addProficiency;
  const total =
    lu.base +
    (lu.ability ? abilityMod(abilityScores(c)[lu.ability]) : 0) +
    (lu.addProficiency ? proficiencyBonus(c.level) : 0);
  return scaled ? Math.max(1, total) : total;
}

/** Maximum uses for every limited-use action, by name. The first action with a name wins. */
export function limitedUses(c: Character): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of c.actions) {
    if (a.uses && !(a.name in out)) out[a.name] = limitedUseMax(c, a.uses);
  }
  return out;
}
```

Add to `packages/rules/src/index.ts`:

```ts
export * from './resources';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS.

What the fixtures prove:
- `franny` has two different "Twig Attack" entries, one from a homebrew subclass (`1d8+4`) and one custom action (`1d8+2`). Both must appear; they differ only in `source` and fixed damage.
- `minkis`: `Arcane Ward: Hit Points` is `6 + Intelligence modifier` = 9, proving `base` and `ability` add together.
- If the custom-action timing field is not `activationType`, the timing falls back to `unknown`. That is acceptable; no fixture asserts it.

Run: `pnpm typecheck`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Convert actions and custom actions; calculate action attacks and uses

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 7: Sheet and Ability list

**Files:**
- Create: `packages/rules/src/tags.ts`, `packages/rules/src/abilities.ts`, `packages/rules/src/sheet.ts`
- Modify: `packages/rules/src/index.ts`
- Modify: `docs/superpowers/specs/2026-11-11-character-wizard-design.md` (ability key and milestone wording)
- Test: `packages/rules/test/abilities.test.ts`

**Interfaces:**
- Consumes: everything exported by `@cw/rules` in Tasks 3 to 6; `Ability`, `Roll`, `Cost`, `Tag` from `@cw/model`.
- Produces, exported from `@cw/rules`:
  - `mapDdbTags(tags: string[]): Tag[]`
  - `buildAbilities(c: Character): Ability[]`
  - `resources(c: Character): Resource[]` with `interface Resource { key: string; name: string; max: number; reset: ResetType }`
  - `buildSheet(c: Character): Sheet` with

    ```ts
    interface Sheet {
      name: string;
      level: number;
      proficiencyBonus: number;
      scores: Record<AbilityName, number>;
      saves: Record<AbilityName, number>;
      skills: Record<SkillName, number>;
      initiative: number;
      armorClass: number;
      attacksPerAction: number;
      spellcasting: { ability: AbilityName; attack: number; saveDc: number } | null;
      slots: Record<string, number>;
      pactSlots: { level: number; count: number } | null;
      resources: Resource[];
      abilities: Ability[];
    }
    ```

- [ ] **Step 1: Write the failing test**

`packages/rules/test/abilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import { buildAbilities, buildSheet, mapDdbTags, resources } from '../src/index';
import { SLUGS, loadExpected, loadRaw } from '../../../test-utils/fixtures';

describe('mapDdbTags', () => {
  it('maps known tags, drops Combat and sends unknown tags to utility', () => {
    expect(mapDdbTags(['Damage', 'Debuff'])).toEqual(['damage', 'debuff']);
    expect(mapDdbTags(['Teleportation', 'Warding'])).toEqual(['movement', 'defence']);
    expect(mapDdbTags(['Social', 'Deception'])).toEqual(['social']);
    expect(mapDdbTags(['Combat'])).toEqual([]);
    expect(mapDdbTags(['Summoning', 'Never Seen Before'])).toEqual(['utility']);
  });
});

describe('buildAbilities: vlad', () => {
  const abilities = buildAbilities(convertCharacter(loadRaw('vlad')));
  const named = (name: string) => abilities.filter((a) => a.name === name);

  it('builds a weapon attack', () => {
    expect(named('Wurms Claw - Sword')[0]).toMatchObject({
      source: 'item', timing: 'action', tags: ['damage'], cost: { kind: 'none' },
      roll: {
        kind: 'attack', bonus: 5,
        damage: [{ dice: '1d8+3', type: 'Piercing' }],
        optionalDamage: [{ dice: '1d6', type: 'poison' }],
      },
    });
  });

  it('builds an attack cantrip', () => {
    expect(named('Eldritch Blast')[0]).toMatchObject({
      source: 'spell', timing: 'action', cost: { kind: 'none' }, tags: ['damage'], tagSource: 'import',
      roll: { kind: 'attack', bonus: 5, damage: [{ dice: '1d10', type: 'force' }], optionalDamage: [] },
    });
  });

  it('builds a pact slot spell with concentration', () => {
    expect(named('Hex')[0]).toMatchObject({
      timing: 'bonus', concentration: true, cost: { kind: 'slot', minLevel: 1, pact: true }, roll: { kind: 'none' },
    });
  });

  it('builds a save spell', () => {
    expect(named('Arms of Hadar')[0]).toMatchObject({ area: true, roll: { kind: 'save', ability: 'str', dc: 13 } });
  });

  it('keeps the slot and free versions of the same spell apart', () => {
    const costs = named('Misty Step').map((a) => a.cost.kind).sort();
    expect(costs).toEqual(['slot', 'uses']);
  });

  it('includes an unarmed strike', () => {
    expect(named('Unarmed Strike')[0]).toMatchObject({
      source: 'universal', timing: 'action', roll: { kind: 'attack', bonus: 1, damage: [{ dice: '0', type: 'Bludgeoning' }] },
    });
  });

  it('lists resources with their maximums', () => {
    const list = resources(convertCharacter(loadRaw('vlad')));
    const freeMisty = list.find((r) => r.name === 'Misty Step');
    expect(freeMisty).toMatchObject({ max: 3, reset: 'long' });
    expect(list.find((r) => r.name === 'Luck Points')).toMatchObject({ max: 2, reset: 'long' });
    expect(list.find((r) => r.name === 'Wurms Claw - Sword')).toMatchObject({ max: 3, reset: 'long' });
  });
});

describe('buildAbilities: other characters', () => {
  it('uses the spell\'s own casting ability and scaled damage', () => {
    const abilities = buildAbilities(convertCharacter(loadRaw('danger')));
    expect(abilities.find((a) => a.name === 'Fire Bolt')).toMatchObject({
      roll: { kind: 'attack', bonus: 7, damage: [{ dice: '2d10', type: 'fire' }] },
    });
    expect(abilities.find((a) => a.name === 'Action Surge')).toMatchObject({ timing: 'free', cost: { kind: 'uses' } });
  });

  it('gives a save DC to a subclass caster without the Spellcasting feature', () => {
    const abilities = buildAbilities(convertCharacter(loadRaw('sid')));
    expect(abilities.find((a) => a.name === 'Fear')).toMatchObject({ roll: { kind: 'save', ability: 'wis', dc: 12 } });
  });

  it('builds a save-based class action', () => {
    const abilities = buildAbilities(convertCharacter(loadRaw('maya')));
    expect(abilities.find((a) => a.name === 'Channel Divinity: Turn Undead')).toMatchObject({
      timing: 'action', roll: { kind: 'save', ability: 'wis', dc: 13 },
    });
  });

  it.each(SLUGS)('gives every ability a unique key: %s', (slug) => {
    const keys = buildAbilities(convertCharacter(loadRaw(slug))).map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe.each(SLUGS)('buildSheet: %s', (slug) => {
  it('agrees with the expected file on every headline number', () => {
    const sheet = buildSheet(convertCharacter(loadRaw(slug)));
    const e = loadExpected(slug);
    expect({
      level: sheet.level, proficiencyBonus: sheet.proficiencyBonus, scores: sheet.scores, saves: sheet.saves,
      skills: sheet.skills, initiative: sheet.initiative, armorClass: sheet.armorClass,
      attacksPerAction: sheet.attacksPerAction, slots: sheet.slots, pactSlots: sheet.pactSlots,
    }).toEqual({
      level: e.level, proficiencyBonus: e.proficiencyBonus, scores: e.scores, saves: e.saves,
      skills: e.skills, initiative: e.initiative, armorClass: e.armorClass,
      attacksPerAction: e.attacksPerAction, slots: e.slots, pactSlots: e.pactSlots,
    });
  });
});

describe('content the app has never seen', () => {
  it('builds a displayable sheet from an empty character', () => {
    const sheet = buildSheet(convertCharacter({}));
    expect(sheet.armorClass).toBe(5);
    expect(sheet.abilities.map((a) => a.name)).toEqual(['Unarmed Strike']);
  });

  it('shows abilities with unknown timing, reset type and tags instead of failing', () => {
    const raw = {
      data: {
        id: 1, name: 'Synthetic',
        stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: 10 })),
        classes: [{ level: 1, definition: { name: 'Homebrew Class' }, classFeatures: [] }],
        actions: {
          somethingNew: [{
            id: 'x1', name: 'Mystery Power', activation: { activationType: 99 },
            limitedUse: { maxUses: 2, resetType: 'OnAFullMoon' },
          }],
        },
        spells: {
          class: [{
            definition: { id: 77, name: 'Odd Spell', level: 1, tags: ['Never Seen Before'], activation: { activationType: 42 } },
            usesSpellSlot: true,
          }],
        },
      },
    };
    const sheet = buildSheet(convertCharacter(raw));
    expect(sheet.abilities.find((a) => a.name === 'Mystery Power')).toMatchObject({ timing: 'unknown', tags: [], tagSource: 'none' });
    expect(sheet.abilities.find((a) => a.name === 'Odd Spell')).toMatchObject({ timing: 'unknown', tags: ['utility'], roll: { kind: 'none' } });
    expect(sheet.resources.find((r) => r.name === 'Mystery Power')).toMatchObject({ max: 2, reset: 'unknown' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test packages/rules/test/abilities.test.ts`
Expected: FAIL on missing exports.

- [ ] **Step 3: Write the implementation**

`packages/rules/src/tags.ts`:

```ts
import type { Tag } from '@cw/model';

const DDB_TAGS: Record<string, Tag | null> = {
  Damage: 'damage',
  Healing: 'healing',
  Buff: 'buff',
  Debuff: 'debuff',
  Control: 'control',
  Teleportation: 'movement',
  Warding: 'defence',
  Social: 'social',
  Deception: 'social',
  Combat: null,
};

/** Unknown tags become 'utility'. Combat is dropped. Duplicates are removed, order kept. */
export function mapDdbTags(tags: string[]): Tag[] {
  const out: Tag[] = [];
  for (const raw of tags) {
    const mapped = raw in DDB_TAGS ? DDB_TAGS[raw] : 'utility';
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}
```

`packages/rules/src/abilities.ts`:

```ts
import type {
  Ability, AbilityName, ActionEntry, Character, Cost, DamagePart, ResetType, Roll, SpellEntry,
} from '@cw/model';
import { actionAttacks, formatDamage, unarmedStrike, weaponAttacks } from './attacks';
import { abilityMod, abilityScores, proficiencyBonus } from './core';
import { limitedUseMax } from './resources';
import { spellAttackBonus, spellSaveDc } from './spellcasting';
import { mapDdbTags } from './tags';

export interface Resource {
  key: string;
  name: string;
  max: number;
  reset: ResetType;
}

const ACTION_SOURCE: Record<ActionEntry['source'], Ability['source']> = {
  class: 'class',
  race: 'species',
  feat: 'feat',
  item: 'item',
  background: 'feat',
  custom: 'custom',
};

function castingContext(c: Character): { ability: AbilityName | null; className: string | null; pact: boolean } {
  const cls = c.classes.find((k) => k.spellcastingAbility);
  return {
    ability: cls?.spellcastingAbility ?? null,
    className: cls?.name ?? null,
    pact: c.classes.some((k) => k.isPactMagic),
  };
}

function spellRoll(c: Character, s: SpellEntry, ability: AbilityName | null, className: string | null): Roll {
  const damage: DamagePart[] = s.damage ? [s.damage] : [];
  if (!ability) return { kind: 'none' };
  if (s.attack) return { kind: 'attack', bonus: spellAttackBonus(c, ability), damage, optionalDamage: [] };
  if (s.saveAbility) return { kind: 'save', ability: s.saveAbility, dc: spellSaveDc(c, ability, className), damage };
  return { kind: 'none' };
}

function spellCost(s: SpellEntry, pact: boolean): Cost {
  if (s.uses) return { kind: 'uses', resourceKey: s.key };
  if (s.usesSlot) return { kind: 'slot', minLevel: s.level, pact };
  return { kind: 'none' };
}

function spellAbilities(c: Character): Ability[] {
  const ctx = castingContext(c);
  return c.spells.map((s): Ability => {
    const tags = mapDdbTags(s.ddbTags);
    return {
      key: s.key,
      name: s.name,
      source: 'spell',
      timing: s.timing,
      roll: spellRoll(c, s, s.castingAbility ?? ctx.ability, ctx.className),
      cost: spellCost(s, ctx.pact),
      tags,
      concentration: s.concentration,
      range: s.range,
      area: s.area,
      description: s.description,
      tagSource: tags.length > 0 ? 'import' : 'none',
    };
  });
}

function weaponAbilities(c: Character): Ability[] {
  const weapons: Ability[] = weaponAttacks(c).map((w): Ability => ({
    key: w.key,
    name: w.name,
    source: 'item',
    timing: 'action',
    roll: {
      kind: 'attack',
      bonus: w.attack,
      damage: [{ dice: w.damage, type: w.damageType }],
      optionalDamage: w.extraDamage,
    },
    cost: { kind: 'none' },
    tags: ['damage'],
    concentration: false,
    range: null,
    area: false,
    description: '',
    tagSource: 'import',
  }));
  const unarmed = unarmedStrike(c);
  weapons.push({
    key: 'universal:unarmed-strike:base',
    name: 'Unarmed Strike',
    source: 'universal',
    timing: 'action',
    roll: {
      kind: 'attack',
      bonus: unarmed.attack,
      damage: [{ dice: String(unarmed.damage), type: 'Bludgeoning' }],
      optionalDamage: [],
    },
    cost: { kind: 'none' },
    tags: ['damage'],
    concentration: false,
    range: null,
    area: false,
    description: '',
    tagSource: 'curated',
  });
  return weapons;
}

function actionRoll(c: Character, a: ActionEntry, attackBonus: number | undefined): Roll {
  const scores = abilityScores(c);
  const mod = a.dcAbility ? abilityMod(scores[a.dcAbility]) : 0;
  const damage: DamagePart[] = a.dice
    ? [{ dice: formatDamage(`${a.dice.count}d${a.dice.sides}`, a.dice.fixed + (a.attack ? mod : 0)), type: null }]
    : [];
  if (a.attack && attackBonus !== undefined) {
    return { kind: 'attack', bonus: attackBonus, damage, optionalDamage: [] };
  }
  if (a.saveAbility) {
    const dc = a.fixedDc ?? 8 + proficiencyBonus(c.level) + mod;
    return { kind: 'save', ability: a.saveAbility, dc, damage };
  }
  return { kind: 'none' };
}

function actionAbilities(c: Character): Ability[] {
  const attackByKey = new Map(actionAttacks(c).map((a) => [a.key, a.attack]));
  return c.actions.map((a): Ability => ({
    key: a.key,
    name: a.name,
    source: ACTION_SOURCE[a.source],
    timing: a.timing,
    roll: actionRoll(c, a, attackByKey.get(a.key)),
    cost: a.uses ? { kind: 'uses', resourceKey: a.key } : { kind: 'none' },
    tags: [],
    concentration: false,
    range: null,
    area: false,
    description: a.description,
    tagSource: 'none',
  }));
}

export function buildAbilities(c: Character): Ability[] {
  const seen = new Set<string>();
  return [...weaponAbilities(c), ...spellAbilities(c), ...actionAbilities(c)].filter((a) =>
    seen.has(a.key) ? false : (seen.add(a.key), true),
  );
}

/** Every limited-use pool on the character: features, free spell casts and item charges. */
export function resources(c: Character): Resource[] {
  const out: Resource[] = [];
  for (const a of c.actions) {
    if (a.uses) out.push({ key: a.key, name: a.name, max: limitedUseMax(c, a.uses), reset: a.uses.reset });
  }
  for (const s of c.spells) {
    if (s.uses) out.push({ key: s.key, name: s.name, max: limitedUseMax(c, s.uses), reset: s.uses.reset });
  }
  for (const w of c.weapons) {
    if (w.uses) out.push({ key: w.key, name: w.name, max: limitedUseMax(c, w.uses), reset: w.uses.reset });
  }
  return out;
}
```

`packages/rules/src/sheet.ts`:

```ts
import type { Ability, AbilityName, Character, SkillName } from '@cw/model';
import { buildAbilities, resources, type Resource } from './abilities';
import { savingThrows, skills } from './checks';
import { abilityScores, proficiencyBonus } from './core';
import { armorClass, attacksPerAction, initiative } from './defence';
import { spellSlots, spellcasting } from './spellcasting';

export interface Sheet {
  name: string;
  level: number;
  proficiencyBonus: number;
  scores: Record<AbilityName, number>;
  saves: Record<AbilityName, number>;
  skills: Record<SkillName, number>;
  initiative: number;
  armorClass: number;
  attacksPerAction: number;
  spellcasting: { ability: AbilityName; attack: number; saveDc: number } | null;
  slots: Record<string, number>;
  pactSlots: { level: number; count: number } | null;
  resources: Resource[];
  abilities: Ability[];
}

export function buildSheet(c: Character): Sheet {
  const { slots, pact } = spellSlots(c);
  return {
    name: c.name,
    level: c.level,
    proficiencyBonus: proficiencyBonus(c.level),
    scores: abilityScores(c),
    saves: savingThrows(c),
    skills: skills(c),
    initiative: initiative(c),
    armorClass: armorClass(c),
    attacksPerAction: attacksPerAction(c),
    spellcasting: spellcasting(c),
    slots,
    pactSlots: pact,
    resources: resources(c),
    abilities: buildAbilities(c),
  };
}
```

Add to `packages/rules/src/index.ts`:

```ts
export * from './tags';
export * from './abilities';
export * from './sheet';
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS.

The empty-character test expects Armor Class 5 because every score is 0 (modifier -5) and 10 - 5 = 5. That is intended: the point is that nothing throws.

Run: `pnpm typecheck`
Expected: exit code 0.

- [ ] **Step 5: Update the spec to match**

In `docs/superpowers/specs/2026-11-11-character-wizard-design.md`, replace the paragraph that begins `**Ability key:**` with:

```markdown
**Ability key:** `{kind}:{definitionId}:{grantingComponentId or "base"}`. Spells add a fourth part, `slot`, `free` or `atwill`, because one feature can grant the same spell twice with different costs: Misty Step cast with a slot and Misty Step cast free through a subclass feature. Custom abilities created in the app use a UUID.
```

In the Architecture table of the same file, add a row after `packages/ddb-import`:

```markdown
| `packages/model` | Shared types and constants: `Character`, `Ability`, ability and skill names | Nothing |
```

In the Milestones list, replace item 2 with:

```markdown
2. **Both views with turn and resource tracking**, stored on the device only. Includes the import Edge Function, which the browser needs to fetch a character.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Build the sheet and ability list; align the spec's key format

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

### Task 8: Fixture tooling, sheet printer and README

**Files:**
- Create: `scripts/sanitize.ts`, `scripts/fetch-character.ts`, `scripts/sheet.ts`
- Create: `README.md`, `fixtures/README.md`
- Test: `scripts/sanitize.test.ts`

**Interfaces:**
- Consumes: `convertCharacter` from `@cw/ddb-import`; `buildSheet` from `@cw/rules`.
- Produces:
  - `sanitize(raw: unknown): unknown` from `scripts/sanitize.ts`.
  - `parseCharacterId(input: string): string | null` from `scripts/fetch-character.ts`.
  - Commands: `pnpm sheet <path-to-json>` and `pnpm fetch-character <url-or-id> <slug>`.

- [ ] **Step 1: Add the workspace packages as root dev dependencies**

The scripts live at the repo root and import the packages by name.

Run: `pnpm add -Dw @cw/model@workspace:* @cw/ddb-import@workspace:* @cw/rules@workspace:*`
Expected: the three packages appear under `devDependencies` in the root `package.json`.

- [ ] **Step 2: Write the failing test**

`scripts/sanitize.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test scripts`
Expected: FAIL, cannot resolve `./sanitize`.

- [ ] **Step 4: Write the scripts**

`scripts/sanitize.ts`:

```ts
const TEXT_KEY = /(description|snippet)$/i;
const AVATAR_KEY = /avatarurl$/i;
const NULLED_TOP_LEVEL = ['campaign', 'decorations', 'notes', 'traits', 'socialName'];

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (AVATAR_KEY.test(key)) out[key] = null;
    else if (TEXT_KEY.test(key) && typeof v === 'string' && v !== '') out[key] = '[removed]';
    else out[key] = clean(v);
  }
  return out;
}

/**
 * Returns a copy of a D&D Beyond character response that is safe to commit:
 * no username, user ID, campaign, portraits, backstory or rules text.
 */
export function sanitize(raw: unknown): unknown {
  const copy = clean(raw) as Record<string, any>;
  const d = copy?.data;
  if (d && typeof d === 'object') {
    d.username = 'redacted';
    d.userId = 0;
    for (const key of NULLED_TOP_LEVEL) if (key in d) d[key] = null;
  }
  return copy;
}
```

`scripts/fetch-character.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sanitize } from './sanitize';

const ENDPOINT = 'https://character-service.dndbeyond.com/character/v5/character/';

/** Accepts "123456789" or a dndbeyond.com/characters/<id> URL. Returns the numeric ID or null. */
export function parseCharacterId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{1,12}$/.test(trimmed)) return trimmed;
  const match = /^https:\/\/(?:www\.)?dndbeyond\.com\/characters\/(\d{1,12})(?:\/[a-z-]*)?$/.exec(trimmed);
  return match ? match[1] : null;
}

async function main(): Promise<void> {
  const [input, slug] = process.argv.slice(2);
  const id = parseCharacterId(input ?? '');
  if (!id || !slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error('Usage: pnpm fetch-character <dndbeyond character URL or ID> <slug>');
    process.exit(1);
  }
  const response = await fetch(`${ENDPOINT}${id}`);
  if (response.status === 403) {
    console.error('This sheet is Private. Set Character Privacy to Public on D&D Beyond, then try again.');
    process.exit(1);
  }
  if (response.status === 404) {
    console.error('No character with that ID.');
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`D&D Beyond didn't respond as expected (HTTP ${response.status}).`);
    process.exit(1);
  }
  const clean = sanitize(await response.json());
  mkdirSync('fixtures/characters', { recursive: true });
  const path = `fixtures/characters/${slug}.json`;
  writeFileSync(path, JSON.stringify(clean));
  console.log(`Wrote ${path}. Add fixtures/expected/${slug}.json with values read from the D&D Beyond sheet.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
```

`scripts/sheet.ts`:

```ts
import { readFileSync } from 'node:fs';
import { convertCharacter } from '@cw/ddb-import';
import { ABILITIES, SKILLS } from '@cw/model';
import { buildSheet } from '@cw/rules';
import type { Ability } from '@cw/model';

const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

function rollLine(a: Ability): string {
  const dmg = (parts: { dice: string; type: string | null }[]): string =>
    parts.map((p) => `${p.dice}${p.type ? ` ${p.type.toLowerCase()}` : ''}`).join(' + ');
  switch (a.roll.kind) {
    case 'attack':
      return `Roll d20 ${signed(a.roll.bonus)}.${a.roll.damage.length ? ` Hit: ${dmg(a.roll.damage)}.` : ''}`;
    case 'save':
      return `They roll a ${a.roll.ability.toUpperCase()} save against ${a.roll.dc}.${a.roll.damage.length ? ` Fail: ${dmg(a.roll.damage)}.` : ''}`;
    case 'check':
      return `Roll d20 ${signed(a.roll.bonus)}.`;
    default:
      return '';
  }
}

const path = process.argv[2];
if (!path) {
  console.error('Usage: pnpm sheet <path to character JSON>');
  process.exit(1);
}

const sheet = buildSheet(convertCharacter(JSON.parse(readFileSync(path, 'utf8'))));

console.log(`${sheet.name}, level ${sheet.level}`);
console.log(`Proficiency ${signed(sheet.proficiencyBonus)}  AC ${sheet.armorClass}  Initiative ${signed(sheet.initiative)}  Attacks per action ${sheet.attacksPerAction}`);
console.log(`Scores  ${ABILITIES.map((a) => `${a.toUpperCase()} ${sheet.scores[a]}`).join('  ')}`);
console.log(`Saves   ${ABILITIES.map((a) => `${a.toUpperCase()} ${signed(sheet.saves[a])}`).join('  ')}`);
if (sheet.spellcasting) {
  console.log(`Spells  attack ${signed(sheet.spellcasting.attack)}  save DC ${sheet.spellcasting.saveDc}`);
}
const slotText = Object.entries(sheet.slots).map(([level, count]) => `L${level} x${count}`);
if (sheet.pactSlots) slotText.push(`Pact L${sheet.pactSlots.level} x${sheet.pactSlots.count}`);
if (slotText.length) console.log(`Slots   ${slotText.join('  ')}`);
console.log(`Skills  ${SKILLS.map((s) => `${s} ${signed(sheet.skills[s])}`).join(', ')}`);

for (const timing of ['action', 'bonus', 'reaction', 'free', 'long', 'unknown'] as const) {
  const group = sheet.abilities.filter((a) => a.timing === timing);
  if (group.length === 0) continue;
  console.log(`\n[${timing}]`);
  for (const a of group) console.log(`  ${a.name}${rollLine(a) ? `: ${rollLine(a)}` : ''}`);
}

if (sheet.resources.length) {
  console.log('\n[resources]');
  for (const r of sheet.resources) console.log(`  ${r.name}: ${r.max} (${r.reset})`);
}
```

- [ ] **Step 5: Write the README files**

`README.md`:

```markdown
# Character Wizard

A play aid for D&D (2024 rules). It imports a character from D&D Beyond and shows what the character can do, grouped by Action, Bonus Action and Reaction, with every roll written out.

This repository currently contains the import and sheet maths. See `docs/superpowers/specs/` for the design.

## Commands

    pnpm install
    pnpm test
    pnpm typecheck
    pnpm sheet fixtures/characters/vlad.json
    pnpm fetch-character https://www.dndbeyond.com/characters/<id> <slug>

`fetch-character` needs the sheet's Character Privacy set to Public.

## Packages

- `packages/model`: shared types.
- `packages/ddb-import`: converts D&D Beyond JSON into the app's `Character` format.
- `packages/rules`: calculates the sheet and the list of abilities.

## Licensing and attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Character Wizard is not affiliated with, endorsed by or sponsored by D&D Beyond or Wizards of the Coast.
```

`fixtures/README.md`:

```markdown
# Fixtures

Real characters used as examples to test the converter and the sheet maths. The app is not built for these characters; they exist to prove the general rules against known-correct numbers.

- `characters/<slug>.json`: a D&D Beyond character response after `scripts/sanitize.ts`. Usernames, user IDs, campaign, portraits, backstory and all rules text are removed.
- `expected/<slug>.json`: the numbers D&D Beyond's own sheet showed for that character on the date in the file's `source` field. Spell slot counts come from the class table.

## Adding a fixture

1. Set the sheet's Character Privacy to Public on D&D Beyond.
2. Run `pnpm fetch-character <url> <slug>`.
3. Open the sheet on D&D Beyond and copy its numbers into `expected/<slug>.json`, using an existing file as the template.
4. Add the slug to `SLUGS` in `test-utils/fixtures.ts`.

Never edit an expected file to make a test pass. If the maths disagrees with D&D Beyond, fix the maths.
```

- [ ] **Step 6: Run everything**

Run: `pnpm test`
Expected: PASS, every test file.

Run: `pnpm typecheck`
Expected: exit code 0.

Run: `pnpm sheet fixtures/characters/vlad.json`
Expected: output that begins:

```
Vlad, level 3
Proficiency +2  AC 10  Initiative +2  Attacks per action 1
Scores  STR 9  DEX 10  CON 12  INT 14  WIS 14  CHA 16
Saves   STR -1  DEX +0  CON +3  INT +2  WIS +4  CHA +5
Spells  attack +5  save DC 13
Slots   Pact L2 x2
```

followed by an `[action]` group that includes `Eldritch Blast: Roll d20 +5. Hit: 1d10 force.` and a `[bonus]` group that includes `Hex`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add fixture tooling, sheet printer and README

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

---

## Done when

- `pnpm test` and `pnpm typecheck` pass.
- For all eight fixtures, scores, saves, skills, initiative, Armor Class, attacks per action, weapon attacks, unarmed strike, action attacks, spell attack, save DC, slots and limited-use maximums equal the values in `fixtures/expected/`.
- `pnpm sheet` prints a readable sheet for any fixture.
- Synthetic input with unknown timing, reset types and tags produces a sheet without throwing.

## Known gaps carried forward

- Druid, Monk, Paladin and Ranger have no fixture. Their maths is unverified until one is added.
- Spell damage covers the first damage component and cantrip scaling only. Upcasting, healing bonuses and class damage bonuses are not calculated.
- All spells in the import are listed. Whether D&D Beyond hides unprepared spells for some classes is not yet checked.
- Proficiency level values 1 to 3 in skill customisations are inferred, not verified.
- Purpose tags exist only for spells. Curated tags for class features arrive in milestone 4.
- Advantage and other conditional modifiers are kept on the `Character` (with their `restriction` text) but not surfaced. The views in milestone 2 show them as notes.
- Player overrides of calculated numbers arrive with overlays in milestone 3.
- `customItems` are free-text inventory notes with no mechanics. They are not converted until a view lists inventory.
- Custom actions carry `toHitBonus` and `damageBonus` fields. No fixture sets them, so they are not read yet.
