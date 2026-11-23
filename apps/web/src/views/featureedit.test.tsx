import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { combatGroups, exploreAbilities } from '@cw/rules';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { seed } from '../test/helpers';

const state = () => useStore.getState();

async function open(slug: Slug, view: View = 'features') {
  const record = await seed(slug);
  const screenOf = render(<CharacterScreen id={record.id} view={view} />);
  await screen.findByRole('heading', { name: record.name });
  return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
}

const group = (heading: string) => screen.getByRole('region', { name: heading });
const row = (heading: string, name: string) => within(group(heading)).getByRole('article', { name });
const key = (name: string): string => {
  const found = state().sheet?.featureSource.list.find((f) => f.name === name);
  if (!found) throw new Error(`no feature ${name}`);
  return found.key;
};
const edits = () => state().edits.abilities;
const names = (list: { name: string }[]): string[] => list.map((a) => a.name);
const sheet = () => {
  const now = state().sheet;
  if (!now) throw new Error('no character is open');
  return now;
};

/** Opens a feature's row and taps its Edit button. */
async function edit(heading: string, name: string) {
  const article = row(heading, name);
  await userEvent.click(within(article).getAllByRole('button')[0]);
  await userEvent.click(within(article).getByRole('button', { name: `Edit ${name}` }));
  return screen.getByRole('dialog', { name: `Edit ${name}` });
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('editing a feature that has no ability of its own', () => {
  it('opens the editor with Passive, both boxes unticked, and nothing recorded when saved as it is', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    expect(within(dialog).getByLabelText('Timing')).toHaveValue('passive');
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Hide this feature' })).not.toBeChecked();
    expect(within(dialog).getByText('A feature is listed in Combat or Explore only when you tick it here.')).toBeInTheDocument();
    // Where it is shown is the first thing in a feature's editor; for an ability it comes after the tags.
    const text = dialog.textContent ?? '';
    expect(text.indexOf('Shown in')).toBeLessThan(text.indexOf('Timing'));
    expect(within(dialog).queryByRole('button', { name: 'Back to imported' })).toBeNull();
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
  });

  it('puts the feature under "Always on" in Combat when Combat is ticked, and keeps it on the Features page', async () => {
    const { show } = await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await save();
    expect(edits()).toEqual({ [key('Alert')]: { inCombat: true } });
    expect(row('Feats', 'Alert')).toBeInTheDocument();
    show('combat');
    await userEvent.click(await screen.findByText('Always on (1)'));
    const article = screen.getByRole('article', { name: 'Alert' });
    expect(within(article).queryByRole('button', { name: 'Use Alert' })).toBeNull();
    expect(article).not.toHaveTextContent('edited');
  });

  it('does not tick a box when the timing or the tags change', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.selectOptions(within(dialog).getByLabelText('Timing'), 'long');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    await save();
    expect(edits()).toEqual({ [key('Alert')]: { timing: 'long', tags: ['utility'] } });
    expect(names(exploreAbilities(sheet()))).not.toContain('Alert');
  });

  it('gives a ticked feature limited uses: pips in Combat, and Use spends one', async () => {
    const { show } = await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    await userEvent.clear(within(dialog).getByLabelText('Maximum uses'));
    await userEvent.type(within(dialog).getByLabelText('Maximum uses'), '2');
    await save();
    show('combat');
    // The sheet has more pools than fit on one line; the new one is behind "more".
    await userEvent.click(await screen.findByRole('button', { name: /more$/ }));
    expect(screen.getByRole('group', { name: 'Alert: 2 of 2 left' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Always on (1)'));
    await userEvent.click(screen.getByRole('button', { name: 'Use Alert' }));
    expect(screen.getByRole('group', { name: 'Alert: 1 of 2 left' })).toBeInTheDocument();
  });

  it('opens the same editor from the feature\'s row in Combat, and "Back to imported" takes the row out', async () => {
    await open('vlad', 'combat');
    act(() => state().setEdit(key('Alert'), { inCombat: true, timing: 'reaction' }));
    const article = within(group('Reaction')).getByRole('article', { name: 'Alert' });
    expect(article).toHaveTextContent('edited');
    await userEvent.click(within(article).getAllByRole('button')[0]);
    await userEvent.click(within(article).getByRole('button', { name: 'Edit Alert' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Alert' });
    expect(within(dialog).getByLabelText('Timing')).toHaveValue('reaction');
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back to imported' }));
    expect(edits()).toEqual({});
    expect(names(combatGroups(sheet()).reaction)).not.toContain('Alert');
  });

  it('hides the feature from its editor', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Alert');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Hide this feature' }));
    await save();
    expect(edits()).toEqual({ [key('Alert')]: { hidden: true } });
    expect(within(group('Feats')).queryByRole('article', { name: 'Alert' })).toBeNull();
  });
});

describe('editing a feature that already has rows in play', () => {
  it('offers only Hide, and says which rows those are', async () => {
    await open('vlad');
    const dialog = await edit('Feats', 'Lucky');
    expect(dialog).toHaveTextContent('In play as: Luck Points. Change those rows where they are listed, in Combat or Explore.');
    expect(within(dialog).queryByLabelText('Timing')).toBeNull();
    expect(within(dialog).queryByRole('checkbox', { name: 'Combat' })).toBeNull();
    await save();
    expect(edits()).toEqual({});
    // The row is still open, so its Edit button is still there.
    await userEvent.click(within(row('Feats', 'Lucky')).getByRole('button', { name: 'Edit Lucky' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Lucky' })).getByRole('checkbox', { name: 'Hide this feature' }));
    await save();
    expect(edits()).toEqual({ [key('Lucky')]: { hidden: true } });
    expect(within(group('Feats')).queryByRole('article', { name: 'Lucky' })).toBeNull();
    // Its ability is still in play: hiding a feature does not hide its rows.
    expect(names(sheet().abilities)).toContain('Luck Points');
  });

  it('names the rows of an option', async () => {
    await open('vlad');
    const dialog = await edit('Warlock 3', 'Pact of the Blade');
    expect(dialog).toHaveTextContent('In play as: Pact of the Blade: Conjure, Pact of the Blade: Bond.');
  });

  it('tells apart two rows with one name by their cost', async () => {
    await open('vlad');
    const dialog = await edit('Warlock 3', 'Tatzelwurm Spells');
    expect(dialog).toHaveTextContent('Misty Step (pact slot)');
  });
});

describe('a feature\'s row in the Combat Edit list', () => {
  it('is hidden and restored there, leaving no trace of either', async () => {
    await open('vlad', 'combat');
    act(() => state().setEdit(key('Alert'), { inCombat: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit list' }));
    await userEvent.click(within(group('Always on')).getByRole('button', { name: 'Hide Alert' }));
    expect(edits()).toEqual({ [key('Alert')]: { inCombat: true, hidden: true } });
    expect(screen.queryByRole('region', { name: 'Always on' })).toBeNull();
    await userEvent.click(screen.getByText('Hidden (1)'));
    await userEvent.click(screen.getByRole('button', { name: 'Restore Alert' }));
    expect(edits()).toEqual({ [key('Alert')]: { inCombat: true } });
    expect(within(group('Always on')).getByRole('button', { name: 'Hide Alert' })).toBeInTheDocument();
  });

  it('restores a feature that D&D Beyond hides by recording the choice to show it', async () => {
    await open('vlad', 'combat');
    act(() => state().setEdit(key('Languages'), { inCombat: true }));
    // Still hidden, as D&D Beyond has it, so it is not in play yet.
    expect(screen.queryByText(/^Always on/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit list' }));
    await userEvent.click(screen.getByText('Hidden (1)'));
    await userEvent.click(screen.getByRole('button', { name: 'Restore Languages' }));
    expect(edits()).toEqual({ [key('Languages')]: { inCombat: true, hidden: false } });
    await userEvent.click(within(group('Always on')).getByRole('button', { name: 'Hide Languages' }));
    expect(edits()).toEqual({ [key('Languages')]: { inCombat: true } });
  });
});
