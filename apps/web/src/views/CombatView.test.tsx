import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { seed } from '../test/helpers';

async function openCombat(slug: Slug) {
  const record = await seed(slug);
  render(<CharacterScreen id={record.id} view="combat" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const row = (name: string, index = 0) => screen.getAllByRole('article', { name })[index];
const use = (name: string, index = 0) => within(row(name, index)).getByRole('button', { name: `Use ${name}` });
const pill = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}: `) });

describe('Combat view', () => {
  it('groups abilities by Action, Bonus Action and Reaction', async () => {
    await openCombat('vlad');
    const names = (group: string) =>
      within(screen.getByRole('region', { name: group })).getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(names('Action').slice(0, 4)).toEqual(['Wurms Claw - Sword', 'Wurms Claw - Axe', 'Wurms Claw - Hammer', 'Unarmed Strike']);
    expect(names('Bonus Action')).toEqual(['Hex', 'Misty Step', 'Misty Step', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond']);
    expect(names('Reaction')).toEqual(['Hellish Rebuke', 'Hellish Rebuke']);
    expect(screen.getByText('No action needed (7)')).toBeInTheDocument();
    expect(screen.getByText('Anyone can do this')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Other' })).toBeNull();
  });

  it('uses an ability: spends the pill and the slot, shows concentration and offers undo', async () => {
    await openCombat('vlad');
    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(use('Hex'));

    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Hex')).toBeInTheDocument();
    expect(screen.getByText('Used Hex. Spent: Bonus Action, a pact slot.')).toBeInTheDocument();

    expect(use('Arms of Hadar')).toBeDisabled();
    expect(row('Arms of Hadar')).toHaveTextContent('You already spent a spell slot this turn.');
    expect(use('Eldritch Blast')).toBeEnabled();
    expect(use('Misty Step', 0)).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Pact slots: 2 of 2 left' })).toBeInTheDocument();
    expect(screen.queryByText('Concentrating on Hex')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('starts a new turn: pills reset, spent resources and concentration stay', async () => {
    await openCombat('vlad');
    await userEvent.click(use('Hex'));
    await userEvent.click(use('Eldritch Blast'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Start my turn' }));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');
    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Hex')).toBeInTheDocument();
    expect(use('Arms of Hadar')).toBeEnabled();
    expect(screen.getByText('Started a new turn.')).toBeInTheDocument();
  });

  it('lets the player flip a pill, tap a pip and end concentration by hand', async () => {
    await openCombat('vlad');
    await userEvent.click(pill('Action'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
    expect(use('Eldritch Blast')).toBeDisabled();
    await userEvent.click(pill('Action'));
    expect(use('Eldritch Blast')).toBeEnabled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Spend one Pact slots' })[0]);
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore one Pact slots' }));
    expect(screen.getByRole('group', { name: 'Pact slots: 2 of 2 left' })).toBeInTheDocument();

    await userEvent.click(use('Hex'));
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(screen.queryByText('Concentrating on Hex')).toBeNull();
  });

  it('spends a weapon\'s charge from its row without spending the Action', async () => {
    await openCombat('vlad');
    const sword = row('Wurms Claw - Sword');
    await userEvent.click(within(sword).getAllByRole('button', { name: 'Spend one Wurms Claw - Sword' })[0]);
    expect(within(sword).getByRole('group', { name: 'Wurms Claw - Sword: 2 of 3 left' })).toBeInTheDocument();
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(use('Wurms Claw - Sword'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sword).getByRole('group', { name: 'Wurms Claw - Sword: 2 of 3 left' })).toBeInTheDocument();
  });

  it('asks which slot pays when more than one level could', async () => {
    await openCombat('minkis');
    await userEvent.click(use('Chromatic Orb'));
    const dialog = screen.getByRole('dialog', { name: 'Cast Chromatic Orb with' });
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(dialog).getByRole('button', { name: /Level 2 slot/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Level 1 slots: 4 of 4 left' })).toBeInTheDocument();
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
  });

  it('spends nothing when the slot question is cancelled, and does not ask when one level could pay', async () => {
    await openCombat('minkis');
    await userEvent.click(use('Chromatic Orb'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(use('Mind Spike'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
  });

  it('states the number of attacks only when it is more than one', async () => {
    await openCombat('danger');
    expect(screen.getByText('Attack action: 2 attacks')).toBeInTheDocument();
  });

  it('does not state the number of attacks for one attack', async () => {
    await openCombat('vlad');
    expect(screen.queryByText(/Attack action:/)).toBeNull();
  });

  it('spends the Action for a universal action', async () => {
    await openCombat('vlad');
    await userEvent.click(use('Dash'));
    expect(pill('Action')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Used Dash. Spent: Action.')).toBeInTheDocument();
  });

  it('lists abilities with unknown timing under Other', async () => {
    await openCombat('franny');
    expect(within(screen.getByRole('region', { name: 'Other' })).getAllByRole('article')).toHaveLength(2);
  });

  it('lists every conditional note under Keep in mind, with its subject', async () => {
    await openCombat('danger');
    expect(screen.getByText('Keep in mind (1)')).toBeInTheDocument();
    expect(screen.getByText('Constitution save: Advantage: saving throws that you make to maintain Concentration.')).toBeInTheDocument();
  });

  it('says so when the sheet has no class or level', async () => {
    await useStore.getState().init(memoryStorage());
    const record = await useStore.getState().saveImported({ data: { id: 7, name: 'Blank' } });
    if (!record) throw new Error('the blank sheet did not import');
    render(<CharacterScreen id={record.id} view="combat" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No class or level was found on this sheet');
    expect(screen.getByRole('article', { name: 'Unarmed Strike' })).toBeInTheDocument();
  });

  it('keeps play state when the view is left and opened again', async () => {
    const record = await seed('vlad');
    const { rerender } = render(<CharacterScreen id={record.id} view="combat" />);
    await screen.findByRole('heading', { name: record.name });
    await userEvent.click(use('Hex'));
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();

    rerender(<CharacterScreen id={record.id} view="explore" />);
    expect(await screen.findByRole('region', { name: 'Skill checks' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start my turn' })).toBeNull();

    rerender(<CharacterScreen id={record.id} view="combat" />);
    expect(await screen.findByRole('button', { name: 'Start my turn' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(pill('Bonus Action')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Concentrating on Hex')).toBeInTheDocument();
  });
});
