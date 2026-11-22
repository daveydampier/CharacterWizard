import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';
import { moved } from './EditList';

async function open(slug: Slug, view: View = 'combat') {
  const record = await seed(slug);
  const screenOf = render(<CharacterScreen id={record.id} view={view} />);
  await screen.findByRole('heading', { name: record.name });
  return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
}

const button = (name: string) => screen.getByRole('button', { name });
const tap = (name: string) => userEvent.click(button(name));
const arrange = () => tap('Edit list');
const done = () => tap('Done');

/** The rows of one section while arranging, by accessible name, in order. */
const arranged = (section: string) =>
  within(screen.getByRole('region', { name: section })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));

/** The rows of one group while playing, by accessible name, in order. */
const played = (group: string) =>
  within(screen.getByRole('region', { name: group })).getAllByRole('article').map((a) => a.getAttribute('aria-label'));

const state = () => useStore.getState();

describe('moved', () => {
  it('puts the dragged key where the key it was dropped on is', () => {
    expect(moved(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(['a', 'b', 'c'], 'b', 'c')).toEqual(['a', 'c', 'b']);
  });

  it('changes nothing when dropped on itself or on a key that is not in the list', () => {
    const keys = ['a', 'b', 'c'];
    expect(moved(keys, 'b', 'b')).toEqual(keys);
    expect(moved(keys, 'b', 'z')).toEqual(keys);
    expect(moved(keys, 'z', 'a')).toEqual(keys);
  });

  it('leaves the list it was given as it was', () => {
    const keys = ['a', 'b', 'c'];
    moved(keys, 'a', 'c');
    expect(keys).toEqual(['a', 'b', 'c']);
  });
});

describe('Edit list', () => {
  it('shows each row with a handle and no Use button, under the same headings as the view', async () => {
    await open('vlad');
    expect(button('Use Hex')).toBeInTheDocument();
    await arrange();
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label')))
      .toEqual(['Resources', 'Action', 'Bonus Action', 'Reaction', 'No action needed', 'Anyone can do this']);
    expect(arranged('Bonus Action')).toEqual([
      'Hex', 'Misty Step (pact slot)', 'Misty Step (free cast)', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond',
    ]);
    for (const control of ['Drag Hex', 'Move Hex up', 'Move Hex down', 'Edit Hex', 'Hide Hex', 'Drag Misty Step (free cast)']) {
      expect(button(control)).toBeInTheDocument();
    }
    const hex = within(screen.getByRole('region', { name: 'Bonus Action' })).getAllByRole('listitem')[0];
    expect(hex).toHaveTextContent('Hex');
    expect(hex).not.toHaveTextContent('Damage:');
    expect(screen.queryByText(/^Hidden/)).toBeNull();
  });

  it('keeps the turn pills, the resources and concentration in sight while arranging in Combat', async () => {
    await open('vlad');
    await tap('Use Hex');
    await arrange();
    expect(screen.getByRole('button', { name: 'Bonus Action: spent' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Pact slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Hex')).toBeInTheDocument();
  });

  it('goes back to playing on Done', async () => {
    await open('vlad');
    await arrange();
    await done();
    expect(button('Use Hex')).toBeInTheDocument();
    expect(button('Edit list')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Drag Hex' })).toBeNull();
  });

  it('moves a row down and up with the buttons, and keeps the order after Done', async () => {
    await open('vlad');
    await arrange();
    await tap('Move Hex down');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Hex', 'Misty Step (free cast)']);
    await tap('Move Hex down');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Misty Step (free cast)', 'Hex']);
    await tap('Move Misty Step (free cast) up');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (free cast)', 'Misty Step (pact slot)', 'Hex']);
    await done();
    expect(played('Bonus Action')).toEqual([
      'Misty Step (free cast)', 'Misty Step (pact slot)', 'Hex', 'Pact of the Blade: Conjure', 'Pact of the Blade: Bond',
    ]);
    expect(played('Action').slice(0, 2)).toEqual(['Wurms Claw - Sword', 'Wurms Claw - Axe']);
  });

  it('disables moving the first row up and the last row down', async () => {
    await open('vlad');
    await arrange();
    expect(button('Move Hex up')).toBeDisabled();
    expect(button('Move Hex down')).toBeEnabled();
    expect(button('Move Pact of the Blade: Bond up')).toBeEnabled();
    expect(button('Move Pact of the Blade: Bond down')).toBeDisabled();
    await tap('Move Hex down');
    expect(button('Move Hex up')).toBeEnabled();
    expect(button('Move Misty Step (pact slot) up')).toBeDisabled();
  });

  it('keeps an order for each view: arranging Combat leaves Explore alone, and the other way round', async () => {
    const { show } = await open('vlad');
    expect(played('Action').filter((n) => n === 'Charm Person' || n === 'Phantasmal Force')).toEqual(['Charm Person', 'Phantasmal Force']);
    await arrange();
    await tap('Move Phantasmal Force up');
    await done();
    expect(played('Action').filter((n) => n === 'Charm Person' || n === 'Phantasmal Force')).toEqual(['Phantasmal Force', 'Charm Person']);

    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    expect(played('Out of combat abilities')).toEqual([
      'Charm Person', 'Misty Step (pact slot)', 'Phantasmal Force', 'Misty Step (free cast)', 'Magical Cunning',
    ]);
    await arrange();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Abilities']);
    expect(screen.queryByRole('searchbox')).toBeNull();
    await tap('Move Magical Cunning up');
    await tap('Move Magical Cunning up');
    expect(arranged('Abilities')).toEqual([
      'Charm Person', 'Misty Step (pact slot)', 'Magical Cunning', 'Phantasmal Force', 'Misty Step (free cast)',
    ]);
    await done();
    expect(played('Out of combat abilities')).toEqual([
      'Charm Person', 'Misty Step (pact slot)', 'Magical Cunning', 'Phantasmal Force', 'Misty Step (free cast)',
    ]);
    expect(state().edits.order.explore).toHaveLength(5);

    show('combat');
    await screen.findByRole('region', { name: 'Action' });
    expect(played('Action').filter((n) => n === 'Charm Person' || n === 'Phantasmal Force')).toEqual(['Phantasmal Force', 'Charm Person']);
    expect(played('Bonus Action')[0]).toBe('Hex');
  });

  it('hides a row into the Hidden drawer and restores it from there', async () => {
    await open('vlad');
    await arrange();
    await tap('Hide Hex');
    expect(arranged('Bonus Action')).not.toContain('Hex');
    expect(screen.getByText('Hidden (1)')).toBeInTheDocument();
    expect(state().edits.abilities).toEqual({ [state().sheet?.hidden[0].key ?? '']: { hidden: true } });
    await done();
    expect(screen.queryByRole('article', { name: 'Hex' })).toBeNull();

    await arrange();
    await tap('Restore Hex');
    expect(screen.queryByText(/^Hidden/)).toBeNull();
    expect(arranged('Bonus Action')).toContain('Hex');
    expect(state().edits.abilities).toEqual({});
    await done();
    expect(screen.getByRole('article', { name: 'Hex' })).toBeInTheDocument();
  });

  it('keeps the rest of an edit when hiding and restoring', async () => {
    await open('vlad');
    const key = ability('Hex').key;
    state().setEdit(key, { tags: ['debuff'] });
    await arrange();
    await tap('Hide Hex');
    expect(state().edits.abilities[key]).toEqual({ tags: ['debuff'], hidden: true });
    await tap('Restore Hex');
    expect(state().edits.abilities[key]).toEqual({ tags: ['debuff'] });
  });

  it('counts every hidden ability, whichever view hid it', async () => {
    const { show } = await open('vlad');
    await arrange();
    await tap('Hide Hex');
    await tap('Hide Dash');
    expect(screen.getByText('Hidden (2)')).toBeInTheDocument();
    await done();
    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    await arrange();
    expect(screen.getByText('Hidden (2)')).toBeInTheDocument();
    expect(button('Restore Hex')).toBeInTheDocument();
    expect(button('Restore Dash')).toBeInTheDocument();
  });

  it('arranges and hides the universal actions like any other row', async () => {
    await open('vlad');
    await arrange();
    expect(arranged('Anyone can do this').slice(0, 3)).toEqual(['Attack', 'Dash', 'Disengage']);
    await tap('Move Dash up');
    await tap('Hide Disengage');
    expect(arranged('Anyone can do this').slice(0, 3)).toEqual(['Dash', 'Attack', 'Dodge']);
    await done();
    const universal = screen.getByText('Anyone can do this').closest('details');
    if (!universal) throw new Error('no universal group');
    expect(within(universal).getAllByRole('article').map((a) => a.getAttribute('aria-label')).slice(0, 3)).toEqual(['Dash', 'Attack', 'Dodge']);
  });

  it('opens the editor from a row, and shows the change in the list', async () => {
    await open('vlad');
    await arrange();
    await tap('Edit Hex');
    const dialog = screen.getByRole('dialog', { name: 'Edit Hex' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Reaction');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(arranged('Bonus Action')).not.toContain('Hex');
    expect(arranged('Reaction')).toContain('Hex');
    expect(button('Drag Hex')).toBeInTheDocument();
  });

  it('lists only the groups that have rows', async () => {
    await open('franny');
    await arrange();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label')))
      .toEqual(['Resources', 'Action', 'Bonus Action', 'Other', 'Anyone can do this']);
    expect(arranged('Other')).toEqual(['Twig Attack', 'Twig Attack']);
  });

  it('is reached from Explore even when no ability is listed there', async () => {
    await open('franny', 'explore');
    for (const name of ['Beast Sense', 'Speak with Animals']) state().setEdit(ability(name).key, { inExplore: false });
    await arrange();
    expect(screen.queryByRole('region')).toBeNull();
    await done();
    expect(screen.getByText('Nothing on this sheet is marked for use outside combat.')).toBeInTheDocument();
  });
});

describe('dragging with the keyboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** jsdom lays nothing out, so each row is given a place by its position in its list. */
  function layOutRows() {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: Element) {
      const li = this.closest('li');
      const index = li?.parentElement ? Array.from(li.parentElement.children).indexOf(li) : 0;
      const top = index * 50;
      return { x: 0, y: top, top, bottom: top + 50, left: 0, right: 300, width: 300, height: 50, toJSON: () => ({}) };
    });
  }

  it('picks a row up by its handle, moves it with the arrow keys and drops it', async () => {
    layOutRows();
    await open('vlad');
    await arrange();
    button('Drag Hex').focus();
    await userEvent.keyboard('[Space]');
    await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[Space]');
    expect(arranged('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Misty Step (free cast)', 'Hex']);
    expect(arranged('Action').slice(0, 2)).toEqual(['Wurms Claw - Sword', 'Wurms Claw - Axe']);
    await done();
    expect(played('Bonus Action').slice(0, 3)).toEqual(['Misty Step (pact slot)', 'Misty Step (free cast)', 'Hex']);
  });

  it('keeps a row in its section however far it is moved', async () => {
    layOutRows();
    await open('vlad');
    await arrange();
    button('Drag Hellish Rebuke (pact slot)').focus();
    await userEvent.keyboard('[Space]');
    for (let presses = 0; presses < 4; presses += 1) await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[Space]');
    expect(arranged('Reaction')).toEqual(['Hellish Rebuke (free cast)', 'Hellish Rebuke (pact slot)']);
    expect(arranged('No action needed')).not.toContain('Hellish Rebuke (pact slot)');
  });

  it('puts the row back on Escape', async () => {
    layOutRows();
    await open('vlad');
    await arrange();
    button('Drag Hex').focus();
    await userEvent.keyboard('[Space]');
    await userEvent.keyboard('[ArrowDown]');
    await userEvent.keyboard('[Escape]');
    expect(arranged('Bonus Action')[0]).toBe('Hex');
    expect(state().edits.order.combat).toEqual([]);
  });
});
