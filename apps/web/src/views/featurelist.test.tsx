import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { memoryStorage } from '../storage';
import { useStore } from '../store';
import { seed } from '../test/helpers';

const state = () => useStore.getState();

async function open(slug: Slug, storage = memoryStorage()) {
  const record = await seed(slug, storage);
  render(<CharacterScreen id={record.id} view="features" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const group = (heading: string) => screen.getByRole('region', { name: heading });
const key = (name: string): string => {
  const found = state().sheet?.featureSource.list.find((f) => f.name === name);
  if (!found) throw new Error(`no feature ${name}`);
  return found.key;
};
const edits = () => state().edits.abilities;
const tap = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const arrange = () => tap('Edit list');
/** The rows of a group while arranging: the features that can be moved. */
const arranged = (heading: string) =>
  within(group(heading)).getAllByRole('listitem').map((row) => row.getAttribute('aria-label'));
/** The rows of a group while reading. */
const read = (heading: string) =>
  within(group(heading)).getAllByRole('article').map((row) => row.getAttribute('aria-label'));

describe('Edit list on the Features page', () => {
  it('shows each feature with a handle, arrows, Edit and Hide, and each option under its feature with Edit and Hide', async () => {
    await open('vlad');
    await arrange();
    expect(arranged('Warlock 3')).toEqual([
      'Core Warlock Traits', 'Eldritch Invocations', 'Pact Magic', 'Magical Cunning', 'Warlock Subclass',
      'Tatzelwurm Spells', 'Shadowy Form', 'The Cost',
    ]);
    for (const control of ['Drag Alert', 'Move Alert up', 'Move Alert down', 'Edit Alert', 'Hide Alert']) {
      expect(within(group('Feats')).getByRole('button', { name: control })).toBeInTheDocument();
    }
    const options = within(group('Warlock 3')).getByRole('group', { name: 'Eldritch Invocations options' });
    expect(within(options).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Edit Pact of the Blade', 'Hide Pact of the Blade', 'Edit Armor of Shadows', 'Hide Armor of Shadows',
      'Edit Fiendish Vigor', 'Hide Fiendish Vigor',
    ]);
    // The options sit inside their feature's row, so they move with it.
    expect(within(within(group('Warlock 3')).getByRole('listitem', { name: 'Eldritch Invocations' })).getByRole('group')).toBe(options);
    expect(screen.queryByRole('button', { name: 'Add an ability' })).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    await tap('Done');
    expect(read('Feats')[0]).toBe('Alert');
    expect(screen.getByRole('button', { name: 'Edit list' })).toBeInTheDocument();
  });

  it('moves a feature within its group with the arrows, keeps the order after Done, and stores it', async () => {
    const storage = memoryStorage();
    const record = await open('vlad', storage);
    await arrange();
    expect(within(group('Feats')).getByRole('button', { name: 'Move Alert up' })).toBeDisabled();
    await tap('Move Lucky up');
    expect(arranged('Feats')).toEqual(['Alert', 'Lucky', 'Criminal Ability Score Improvements', 'Dark Bargain']);
    await tap('Move Eldritch Invocations down');
    expect(arranged('Warlock 3').slice(0, 3)).toEqual(['Core Warlock Traits', 'Pact Magic', 'Eldritch Invocations']);
    await tap('Done');
    expect(read('Feats')).toEqual(['Alert', 'Lucky', 'Criminal Ability Score Improvements', 'Increase three scores (+1 / +1 / +1)', 'Dark Bargain']);
    expect(read('Warlock 3').slice(0, 6)).toEqual([
      'Core Warlock Traits', 'Pact Magic', 'Eldritch Invocations', 'Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor',
    ]);
    // Each group that was arranged is recorded whole; the views' own orders are untouched.
    expect(state().edits.order.combat).toEqual([]);
    expect(state().edits.order.features).toEqual([
      key('Alert'), key('Lucky'), key('Criminal Ability Score Improvements'), key('Dark Bargain'),
      key('Core Warlock Traits'), key('Pact Magic'), key('Eldritch Invocations'), key('Magical Cunning'),
      key('Warlock Subclass'), key('Tatzelwurm Spells'), key('Shadowy Form'), key('The Cost'),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = (await storage.listItems(record.id)).filter((item) => item.kind === 'order');
    expect(stored).toMatchObject([{ key: 'features', data: state().edits.order.features, dirty: true }]);
  });

  it('hides a feature into the drawer, which starts with what D&D Beyond hides, and restores from it', async () => {
    await open('vlad');
    await arrange();
    expect(screen.getByText('Hidden (2)')).toBeInTheDocument();
    await tap('Hide Alert');
    expect(arranged('Feats')).not.toContain('Alert');
    expect(edits()).toEqual({ [key('Alert')]: { hidden: true } });
    await userEvent.click(screen.getByText('Hidden (3)'));
    await tap('Restore Alert');
    expect(edits()).toEqual({});
    expect(arranged('Feats')).toContain('Alert');
    await tap('Restore Languages');
    expect(edits()).toEqual({ [key('Languages')]: { hidden: false } });
    expect(arranged('Human')).toContain('Languages');
    expect(screen.getByText('Hidden (1)')).toBeInTheDocument();
    await tap('Hide Languages');
    expect(edits()).toEqual({});
    await tap('Done');
    expect(read('Human')).not.toContain('Languages');
  });

  it('lists the options of a hidden feature as rows of their own, and hides one option alone', async () => {
    await open('vlad');
    await arrange();
    await tap('Hide Armor of Shadows');
    expect(edits()).toEqual({ [key('Armor of Shadows')]: { hidden: true } });
    expect(within(screen.getByRole('group', { name: 'Eldritch Invocations options' })).queryByRole('button', { name: 'Edit Armor of Shadows' })).toBeNull();
    await tap('Hide Eldritch Invocations');
    expect(arranged('Warlock 3').slice(-2)).toEqual(['Pact of the Blade', 'Fiendish Vigor']);
    expect(screen.queryByRole('group', { name: 'Eldritch Invocations options' })).toBeNull();
    expect(within(group('Warlock 3')).getByRole('button', { name: 'Move Fiendish Vigor up' })).toBeEnabled();
  });

  it('opens the editor from a row and from an option', async () => {
    await open('vlad');
    await arrange();
    await tap('Edit Alert');
    const dialog = screen.getByRole('dialog', { name: 'Edit Alert' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Explore' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(edits()).toEqual({ [key('Alert')]: { inExplore: true } });
    await tap('Edit Fiendish Vigor');
    expect(screen.getByRole('dialog', { name: 'Edit Fiendish Vigor' })).toHaveTextContent('In play as:');
  });

  it('still offers "Edit list" when every feature is hidden, so they can be brought back', async () => {
    await open('vlad');
    act(() => {
      for (const feature of state().sheet?.featureSource.list ?? []) {
        if (!feature.hiddenOnSheet) state().setEdit(feature.key, { hidden: true });
      }
    });
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByText('Every feature is hidden. "Edit list" brings them back.')).toBeInTheDocument();
    await arrange();
    await userEvent.click(screen.getByText('Hidden (25)'));
    await tap('Restore Alert');
    await tap('Done');
    expect(read('Feats')).toEqual(['Alert']);
  });
});
