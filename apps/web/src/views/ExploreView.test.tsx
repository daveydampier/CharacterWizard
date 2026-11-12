import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';

async function openExplore(slug: Slug) {
  const record = await seed(slug);
  render(<CharacterScreen id={record.id} view="explore" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const region = (name: string) => screen.getByRole('region', { name });
const labels = (name: string) =>
  within(region(name)).getAllByRole('article').map((a) => a.getAttribute('aria-label'));

describe('Explore view', () => {
  it('lists proficient skills first with the full roll, then the rest', async () => {
    await openExplore('vlad');
    const skills = labels('Skill checks');
    expect(skills).toHaveLength(18);
    expect(skills.slice(0, 5)).toEqual(['Arcana', 'Investigation', 'Perception', 'Sleight of Hand', 'Stealth']);
    expect(skills.indexOf('Athletics')).toBeGreaterThan(skills.indexOf('Stealth'));
    const investigation = within(region('Skill checks')).getByRole('article', { name: 'Investigation' });
    expect(investigation).toHaveTextContent('expertise');
    expect(investigation).toHaveTextContent('Roll d20 + 7.');
    expect(within(region('Skill checks')).getByRole('article', { name: 'Athletics' })).toHaveTextContent('Roll d20 - 1.');
    expect(screen.getByText('13 more skills')).toBeInTheDocument();
  });

  it('puts a note on the skill it belongs to', async () => {
    await openExplore('vlad');
    expect(within(region('Skill checks')).getByRole('article', { name: 'Intimidation' }))
      .toHaveTextContent('Advantage (roll twice, keep the higher).');
    expect(within(region('Keep in mind')).getByText('No other notes on this sheet.')).toBeInTheDocument();
  });

  it('lists saving throws in the same format, with their notes', async () => {
    await openExplore('danger');
    const saves = labels('Saving throws');
    expect(saves).toHaveLength(6);
    expect(saves.slice(0, 2)).toEqual(['Strength save', 'Constitution save']);
    expect(within(region('Saving throws')).getByRole('article', { name: 'Constitution save' }))
      .toHaveTextContent('Advantage: saving throws that you make to maintain Concentration.');
    expect(screen.getByText('4 more saves')).toBeInTheDocument();
  });

  it('puts notes that belong to no row under Keep in mind', async () => {
    await openExplore('franny');
    const items = within(region('Keep in mind')).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Damage 1d12, bludgeoning: DC 14 Dex Save.', 'Immunity, charmed: Raging.', 'Immunity, frightened: Raging.']);
  });

  it('lists out of combat abilities and has no turn tracker', async () => {
    await openExplore('vlad');
    expect(labels('Out of combat abilities')).toEqual([
      'Charm Person', 'Misty Step', 'Phantasmal Force', 'Misty Step', 'Magical Cunning',
    ]);
    expect(screen.queryByRole('button', { name: 'Start my turn' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Action: / })).toBeNull();
  });

  it('deducts the cost on Use and leaves the turn alone', async () => {
    await openExplore('vlad');
    const charm = within(region('Out of combat abilities')).getByRole('article', { name: 'Charm Person' });
    await userEvent.click(within(charm).getByRole('button', { name: 'Use Charm Person' }));
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(useStore.getState().play.turn).toEqual({ action: false, bonus: false, reaction: false, slotSpentThisTurn: false });
    expect(screen.getByText('Used Charm Person. Spent: a pact slot.')).toBeInTheDocument();
  });

  it('filters skills, saves and abilities by the search text', async () => {
    await openExplore('vlad');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search skills and abilities' }), 'cha');
    expect(labels('Saving throws')).toEqual(['Charisma save']);
    expect(labels('Out of combat abilities')).toEqual(['Charm Person']);
    expect(screen.queryByRole('region', { name: 'Skill checks' })).toBeNull();

    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'ath');
    expect(labels('Skill checks')).toEqual(['Athletics']);
    expect(screen.queryByText(/more skills/)).toBeNull();

    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Nothing matches "zzz".')).toBeInTheDocument();
  });

  it('takes a Short Rest and a Long Rest, each of which can be undone', async () => {
    await openExplore('danger');
    const surge = ability('Action Surge');
    const wind = ability('Second Wind');
    useStore.getState().use(surge, 'explore');
    useStore.getState().use(wind, 'explore');

    await userEvent.click(screen.getByRole('button', { name: 'Short Rest' }));
    expect(useStore.getState().play.spent).toEqual({ [wind.key]: 1 });
    expect(screen.getByText('Took a Short Rest.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Long Rest' }));
    expect(useStore.getState().play.spent).toEqual({});
    expect(screen.getByText('Took a Long Rest.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useStore.getState().play.spent).toEqual({ [wind.key]: 1 });
  });

  it('shows concentration started here, and ends it', async () => {
    await openExplore('vlad');
    const force = within(region('Out of combat abilities')).getByRole('article', { name: 'Phantasmal Force' });
    await userEvent.click(within(force).getByRole('button', { name: 'Use Phantasmal Force' }));
    expect(screen.getByText('Concentrating on Phantasmal Force')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(screen.queryByText('Concentrating on Phantasmal Force')).toBeNull();
    expect(useStore.getState().play.concentrationKey).toBeNull();
  });

  it('keeps concentration endable when it names no ability on the sheet', async () => {
    const record = await seed('vlad');
    useStore.setState({ play: { ...useStore.getState().play, concentrationKey: 'not-there' } });
    render(<CharacterScreen id={record.id} view="explore" />);
    expect(await screen.findByText('Concentrating')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(screen.queryByText('Concentrating')).toBeNull();
    expect(useStore.getState().play.concentrationKey).toBeNull();
  });

  it('marks rituals and abilities that take a minute or more', async () => {
    await openExplore('minkis');
    const list = region('Out of combat abilities');
    expect(within(list).getByRole('article', { name: 'Detect Magic' })).toHaveTextContent('ritual');
    expect(within(list).getByRole('article', { name: 'Identify' })).toHaveTextContent('takes a minute or more');
  });
});
