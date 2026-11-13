import { describe, expect, it } from 'vitest';
import { convertCharacter } from '@cw/ddb-import';
import type { Ability, PlayState } from '@cw/model';
import {
  PACT_KEY, adjustPool, applyUse, availability, buildSheet, clampState, concentrationName, costLabel, emptyPlayState,
  endConcentration, pools, remaining, rest, slotKey, startTurn, togglePill, useSummary, type Sheet,
} from '../src/index';
import { SLUGS, loadRaw, type Slug } from '../../../test-utils/fixtures';

const sheetOf = (slug: Slug): Sheet => buildSheet(convertCharacter(loadRaw(slug)));

/** The ability with this name; `cost` picks between two abilities that share a name. */
function find(sheet: Sheet, name: string, cost?: Ability['cost']['kind']): Ability {
  const found = [...sheet.abilities, ...sheet.universal].find(
    (a) => a.name === name && (cost === undefined || a.cost.kind === cost),
  );
  if (!found) throw new Error(`no ability ${name}${cost ? ` with cost ${cost}` : ''}`);
  return found;
}

const poolOf = (sheet: Sheet, name: string) => {
  const pool = pools(sheet).find((p) => p.name === name);
  if (!pool) throw new Error(`no pool ${name}`);
  return pool;
};

describe('pools', () => {
  it('lists pact slots as a short-rest pool before the other pools', () => {
    const list = pools(sheetOf('vlad'));
    expect(list[0]).toEqual({ key: PACT_KEY, name: 'Pact slots', max: 2, reset: 'short', kind: 'pact' });
    expect(list.map((p) => p.name)).toContain('Wurms Claw - Sword');
  });

  it('lists each spell slot level, lowest first, as a long-rest pool', () => {
    expect(pools(sheetOf('minkis')).slice(0, 2)).toEqual([
      { key: slotKey(1), name: 'Level 1 slots', max: 4, reset: 'long', kind: 'slot' },
      { key: slotKey(2), name: 'Level 2 slots', max: 2, reset: 'long', kind: 'slot' },
    ]);
  });

  it.each(SLUGS)('has unique keys and no empty pool: %s', (slug) => {
    const list = pools(sheetOf(slug));
    expect(new Set(list.map((p) => p.key)).size).toBe(list.length);
    expect(list.filter((p) => p.max <= 0)).toEqual([]);
  });

  it('counts what is left from what is spent', () => {
    const sheet = sheetOf('vlad');
    const pact = poolOf(sheet, 'Pact slots');
    expect(remaining(pact, emptyPlayState())).toBe(2);
    expect(remaining(pact, { ...emptyPlayState(), spent: { [PACT_KEY]: 5 } })).toBe(0);
  });
});

describe('availability and applyUse in combat', () => {
  const vlad = sheetOf('vlad');
  const hex = find(vlad, 'Hex');
  const blast = find(vlad, 'Eldritch Blast');
  const arms = find(vlad, 'Arms of Hadar');
  const freeMisty = find(vlad, 'Misty Step', 'uses');
  const slotMisty = find(vlad, 'Misty Step', 'slot');
  const rebuke = find(vlad, 'Hellish Rebuke', 'slot');

  it('allows Hex and then Eldritch Blast', () => {
    const afterHex = applyUse(hex, vlad, emptyPlayState());
    expect(afterHex).toEqual({
      spent: { [PACT_KEY]: 1 },
      concentrationKey: hex.key,
      turn: { action: false, bonus: true, reaction: false, slotSpentThisTurn: true },
    });
    expect(availability(blast, vlad, afterHex)).toMatchObject({ hasUse: true, canUse: true, reason: null });
    expect(applyUse(blast, vlad, afterHex).turn.action).toBe(true);
  });

  it('blocks Hex and then Arms of Hadar: two spell slots in one turn', () => {
    const afterHex = applyUse(hex, vlad, emptyPlayState());
    expect(availability(arms, vlad, afterHex)).toMatchObject({
      canUse: false, reason: 'You already spent a spell slot this turn.',
    });
    expect(applyUse(arms, vlad, afterHex)).toBe(afterHex);
  });

  it('allows a free Misty Step and then Arms of Hadar', () => {
    const afterStep = applyUse(freeMisty, vlad, emptyPlayState());
    expect(afterStep.spent).toEqual({ [freeMisty.key]: 1 });
    expect(afterStep.turn).toMatchObject({ bonus: true, slotSpentThisTurn: false });
    expect(availability(arms, vlad, afterStep).canUse).toBe(true);
  });

  it('blocks a second Bonus Action and says why', () => {
    const afterStep = applyUse(freeMisty, vlad, emptyPlayState());
    expect(availability(slotMisty, vlad, afterStep)).toMatchObject({
      canUse: false, reason: 'You already used your Bonus Action this turn.',
    });
  });

  it('blocks a second Action and a second Reaction and says why', () => {
    const afterBlast = applyUse(blast, vlad, emptyPlayState());
    expect(availability(find(vlad, 'Dash'), vlad, afterBlast)).toMatchObject({
      canUse: false, reason: 'You already used your Action this turn.',
    });
    const afterRebuke = applyUse(rebuke, vlad, emptyPlayState());
    expect(availability(find(vlad, 'Hellish Rebuke', 'uses'), vlad, afterRebuke)).toMatchObject({
      canUse: false, reason: 'You already used your Reaction this round.',
    });
  });

  it('names the ability being concentrated on, or nothing when the key matches none', () => {
    expect(concentrationName(vlad, hex.key)).toBe('Hex');
    expect(concentrationName(vlad, 'not-there')).toBeNull();
  });

  it('lets a Reaction spell ignore and not set the one-slot rule', () => {
    const afterHex = applyUse(hex, vlad, emptyPlayState());
    expect(availability(rebuke, vlad, afterHex).canUse).toBe(true);
    const afterRebuke = applyUse(rebuke, vlad, emptyPlayState());
    expect(afterRebuke.turn).toMatchObject({ reaction: true, slotSpentThisTurn: false });
    expect(afterRebuke.spent).toEqual({ [PACT_KEY]: 1 });
  });

  it('blocks a slot spell when no slot is left', () => {
    const state: PlayState = { ...emptyPlayState(), spent: { [PACT_KEY]: 2 } };
    expect(availability(arms, vlad, state)).toMatchObject({ canUse: false, reason: 'No spell slots left.', slotOptions: [] });
  });

  it('blocks a limited-use ability when no use is left', () => {
    const state: PlayState = { ...emptyPlayState(), spent: { [freeMisty.key]: 3 } };
    expect(availability(freeMisty, vlad, state)).toMatchObject({ canUse: false, reason: 'No uses left.' });
  });

  it('warns that a second concentration spell ends the first, and switches', () => {
    const darkness = find(vlad, 'Darkness');
    const afterHex = startTurn(applyUse(hex, vlad, emptyPlayState()));
    expect(availability(darkness, vlad, afterHex)).toMatchObject({ canUse: true, ends: 'Hex' });
    expect(availability(hex, vlad, afterHex).ends).toBeNull();
    expect(applyUse(darkness, vlad, afterHex).concentrationKey).toBe(darkness.key);
  });

  it('gives no Use button to an ability with nothing to spend or track', () => {
    const sid = sheetOf('sid');
    expect(availability(find(sid, 'Sneak Attack'), sid, emptyPlayState())).toMatchObject({
      hasUse: false, canUse: false, reason: null,
    });
  });

  it('uses a free-timing feature without touching the turn', () => {
    const danger = sheetOf('danger');
    const surge = find(danger, 'Action Surge');
    const after = applyUse(surge, danger, emptyPlayState());
    expect(after.spent).toEqual({ [surge.key]: 1 });
    expect(after.turn).toEqual(emptyPlayState().turn);
    expect(availability(surge, danger, after)).toMatchObject({ canUse: false, reason: 'No uses left.' });
  });

  it('spends the Action for a universal action and for a weapon, never the weapon\'s charges', () => {
    const afterDash = applyUse(find(vlad, 'Dash'), vlad, emptyPlayState());
    expect(afterDash).toMatchObject({ spent: {}, turn: { action: true } });
    const afterSword = applyUse(find(vlad, 'Wurms Claw - Sword'), vlad, emptyPlayState());
    expect(afterSword).toMatchObject({ spent: {}, turn: { action: true } });
  });
});

describe('slot choice', () => {
  const minkis = sheetOf('minkis');
  const orb = find(minkis, 'Chromatic Orb');
  const spike = find(minkis, 'Mind Spike');

  it('offers every slot level that could pay, lowest first', () => {
    expect(availability(orb, minkis, emptyPlayState()).slotOptions).toEqual([
      { key: 'slot:1', label: 'Level 1 slot', remaining: 4 },
      { key: 'slot:2', label: 'Level 2 slot', remaining: 2 },
    ]);
    expect(availability(spike, minkis, emptyPlayState()).slotOptions).toEqual([
      { key: 'slot:2', label: 'Level 2 slot', remaining: 2 },
    ]);
  });

  it('spends the lowest slot unless told otherwise', () => {
    expect(applyUse(orb, minkis, emptyPlayState()).spent).toEqual({ 'slot:1': 1 });
    expect(applyUse(orb, minkis, emptyPlayState(), 'combat', 'slot:2').spent).toEqual({ 'slot:2': 1 });
    expect(applyUse(orb, minkis, emptyPlayState(), 'combat', 'slot:9').spent).toEqual({ 'slot:1': 1 });
  });

  it('leaves out a level with nothing left', () => {
    const state: PlayState = { ...emptyPlayState(), spent: { 'slot:1': 4 } };
    expect(availability(orb, minkis, state).slotOptions.map((o) => o.key)).toEqual(['slot:2']);
  });

  it('offers the pact slot when its level is high enough', () => {
    const vlad = sheetOf('vlad');
    expect(availability(find(vlad, 'Hex'), vlad, emptyPlayState()).slotOptions).toEqual([
      { key: PACT_KEY, label: 'Pact slot (level 2)', remaining: 2 },
    ]);
  });
});

describe('explore mode', () => {
  const vlad = sheetOf('vlad');

  it('deducts the cost and sets concentration but leaves the turn alone', () => {
    const charm = find(vlad, 'Charm Person');
    const spentTurn: PlayState = {
      ...emptyPlayState(), turn: { action: true, bonus: true, reaction: true, slotSpentThisTurn: true },
    };
    expect(availability(charm, vlad, spentTurn, 'explore').canUse).toBe(true);
    const after = applyUse(charm, vlad, spentTurn, 'explore');
    expect(after.spent).toEqual({ [PACT_KEY]: 1 });
    expect(after.turn).toEqual(spentTurn.turn);
  });

  it('gives no Use button to an ability that costs nothing', () => {
    expect(availability(find(vlad, 'Thaumaturgy'), vlad, emptyPlayState(), 'explore').hasUse).toBe(false);
    expect(availability(find(vlad, 'Thaumaturgy'), vlad, emptyPlayState(), 'combat').hasUse).toBe(true);
  });
});

describe('startTurn, togglePill and endConcentration', () => {
  it('resets the turn and keeps everything else', () => {
    const vlad = sheetOf('vlad');
    const afterHex = applyUse(find(vlad, 'Hex'), vlad, emptyPlayState());
    const next = startTurn(afterHex);
    expect(next.turn).toEqual(emptyPlayState().turn);
    expect(next.spent).toEqual(afterHex.spent);
    expect(next.concentrationKey).toBe(afterHex.concentrationKey);
  });

  it('flips one pill', () => {
    const once = togglePill(emptyPlayState(), 'action');
    expect(once.turn).toMatchObject({ action: true, bonus: false, reaction: false });
    expect(togglePill(once, 'action').turn.action).toBe(false);
  });

  it('ends concentration', () => {
    expect(endConcentration({ ...emptyPlayState(), concentrationKey: 'x' }).concentrationKey).toBeNull();
  });
});

describe('rest', () => {
  const danger = sheetOf('danger');
  const surge = poolOf(danger, 'Action Surge');
  const wind = poolOf(danger, 'Second Wind');
  const used: PlayState = {
    spent: { [surge.key]: 1, [wind.key]: 2, 'slot:1': 3 },
    concentrationKey: 'something',
    turn: { action: true, bonus: true, reaction: true, slotSpentThisTurn: true },
  };

  it('restores only short-rest pools on a Short Rest', () => {
    expect(rest('short', danger, used)).toEqual({
      spent: { [wind.key]: 2, 'slot:1': 3 },
      concentrationKey: 'something',
      turn: emptyPlayState().turn,
    });
  });

  it('restores everything and ends concentration on a Long Rest', () => {
    expect(rest('long', danger, used)).toEqual(emptyPlayState());
  });

  it('restores pact slots on a Short Rest', () => {
    const vlad = sheetOf('vlad');
    const state: PlayState = { ...emptyPlayState(), spent: { [PACT_KEY]: 2, [poolOf(vlad, 'Luck Points').key]: 1 } };
    expect(rest('short', vlad, state).spent).toEqual({ [poolOf(vlad, 'Luck Points').key]: 1 });
  });

  it('never restores a consumable or a pool with an unknown reset', () => {
    const sheet = sheetOf('vlad');
    sheet.resources = [
      { key: 'potion', name: 'Potion', max: 1, reset: 'never' },
      { key: 'mystery', name: 'Mystery', max: 2, reset: 'unknown' },
    ];
    const state: PlayState = { ...emptyPlayState(), spent: { potion: 1, mystery: 2 } };
    expect(rest('long', sheet, state).spent).toEqual({ potion: 1, mystery: 2 });
  });

  it.each(SLUGS)('a Long Rest after spending everything restores every restorable pool: %s', (slug) => {
    const sheet = sheetOf(slug);
    const spent = Object.fromEntries(pools(sheet).map((p) => [p.key, p.max]));
    const rested = rest('long', sheet, { ...emptyPlayState(), spent });
    for (const pool of pools(sheet)) {
      const restorable = pool.reset === 'short' || pool.reset === 'long';
      expect(remaining(pool, rested)).toBe(restorable ? pool.max : 0);
    }
  });
});

describe('adjustPool', () => {
  const vlad = sheetOf('vlad');
  const sword = poolOf(vlad, 'Wurms Claw - Sword');

  it('spends and restores one, and never leaves the pool\'s range', () => {
    const one = adjustPool(emptyPlayState(), sword, 1);
    expect(one.spent).toEqual({ [sword.key]: 1 });
    expect(adjustPool(one, sword, -1).spent).toEqual({});
    expect(adjustPool(emptyPlayState(), sword, -1).spent).toEqual({});
    const full = adjustPool(adjustPool(adjustPool(one, sword, 1), sword, 1), sword, 1);
    expect(full.spent).toEqual({ [sword.key]: 3 });
  });
});

describe('clampState', () => {
  it('clamps to the new maximum, drops unknown pools and forgets a missing concentration', () => {
    const vlad = sheetOf('vlad');
    const state: PlayState = {
      spent: { [PACT_KEY]: 7, 'slot:3': 1, gone: 2, [poolOf(vlad, 'Luck Points').key]: 1 },
      concentrationKey: 'spell:not-there',
      turn: { action: true, bonus: false, reaction: false, slotSpentThisTurn: false },
    };
    expect(clampState(state, vlad)).toEqual({
      spent: { [PACT_KEY]: 2, [poolOf(vlad, 'Luck Points').key]: 1 },
      concentrationKey: null,
      turn: state.turn,
    });
  });

  it('keeps a concentration that still exists', () => {
    const vlad = sheetOf('vlad');
    const hex = find(vlad, 'Hex');
    expect(clampState({ ...emptyPlayState(), concentrationKey: hex.key }, vlad).concentrationKey).toBe(hex.key);
  });
});

describe('costLabel', () => {
  it('tells the two Misty Steps apart', () => {
    const vlad = sheetOf('vlad');
    expect(costLabel(find(vlad, 'Misty Step', 'slot'), vlad, emptyPlayState())).toBe('pact slot');
    expect(costLabel(find(vlad, 'Misty Step', 'uses'), vlad, emptyPlayState())).toBe('free cast, 3 left');
  });

  it('labels spell slots, feature uses and item charges, and nothing for a free ability', () => {
    const minkis = sheetOf('minkis');
    expect(costLabel(find(minkis, 'Chromatic Orb'), minkis, emptyPlayState())).toBe('spell slot');
    const danger = sheetOf('danger');
    const wind = find(danger, 'Second Wind');
    expect(costLabel(wind, danger, { ...emptyPlayState(), spent: { [wind.key]: 1 } })).toBe('2 left');
    const maya = sheetOf('maya');
    expect(costLabel(find(maya, 'Scorching Ray'), maya, emptyPlayState())).toBe('1 charge of Shepherds Staff, 1 left');
    const vlad = sheetOf('vlad');
    expect(costLabel(find(vlad, 'Eldritch Blast'), vlad, emptyPlayState())).toBeNull();
  });
});

describe('useSummary', () => {
  it('says what a Use spent', () => {
    const vlad = sheetOf('vlad');
    const hex = find(vlad, 'Hex');
    const before = emptyPlayState();
    expect(useSummary(hex, vlad, before, applyUse(hex, vlad, before))).toBe('Used Hex. Spent: Bonus Action, a pact slot.');
    const step = find(vlad, 'Misty Step', 'uses');
    expect(useSummary(step, vlad, before, applyUse(step, vlad, before)))
      .toBe('Used Misty Step. Spent: Bonus Action, one use of Misty Step.');
    const minkis = sheetOf('minkis');
    const orb = find(minkis, 'Chromatic Orb');
    expect(useSummary(orb, minkis, before, applyUse(orb, minkis, before, 'combat', 'slot:2')))
      .toBe('Used Chromatic Orb. Spent: Action, a level 2 slot.');
    expect(useSummary(hex, vlad, before, before)).toBe('Used Hex.');
  });
});
