import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomAbility } from '@cw/model';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { seed } from '../test/helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const state = () => useStore.getState();

const howl = (over: Partial<CustomAbility> = {}): CustomAbility => ({
  key: 'own:howl', name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' }, cost: { kind: 'none' },
  tags: ['buff'], concentration: false, description: 'Allies within 30 feet take heart.', ...over,
});

/** Opens a character, first giving it the custom abilities in `own`. */
async function open(slug: Slug, view: View = 'combat', own: CustomAbility[] = []) {
  const record = await seed(slug);
  for (const custom of own) state().saveCustom(custom);
  const screenOf = render(<CharacterScreen id={record.id} view={view} />);
  await screen.findByRole('heading', { name: record.name });
  return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
}

const button = (name: string) => screen.getByRole('button', { name });
const tap = (name: string) => userEvent.click(button(name));
const row = (label: string) => screen.getByRole('article', { name: label });
const played = (group: string) =>
  within(screen.getByRole('region', { name: group })).queryAllByRole('article').map((a) => a.getAttribute('aria-label'));
const arranged = (section: string) =>
  within(screen.getByRole('region', { name: section })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));

async function fill(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  if (text !== '') await userEvent.type(field, text);
}

const choose = (label: string, option: string) => userEvent.selectOptions(screen.getByRole('combobox', { name: label }), option);

/** From a view: into Edit list, then the empty editor. */
async function add() {
  await tap('Edit list');
  await tap('Add an ability');
  return screen.getByRole('dialog', { name: 'Add an ability' });
}

/** Opens a row while playing, unless it is open already, and taps its Edit button. */
async function edit(label: string) {
  const toggle = within(row(label)).getAllByRole('button')[0];
  if (toggle.getAttribute('aria-expanded') === 'false') await userEvent.click(toggle);
  await userEvent.click(within(row(label)).getByRole('button', { name: `Edit ${label}` }));
  return screen.getByRole('dialog', { name: `Edit ${label}` });
}

describe('adding a custom ability', () => {
  it('starts from an Action that costs nothing and rolls nothing', async () => {
    await open('franny');
    const dialog = await add();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('');
    const timing = within(dialog).getByRole('combobox', { name: 'Timing' });
    expect(timing).toHaveValue('action');
    expect(within(timing).queryByRole('option', { name: 'Unknown' })).toBeNull();
    const cost = within(dialog).getByRole('combobox', { name: 'Cost' });
    expect(cost).toHaveValue('none');
    expect(within(cost).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nothing', 'Limited uses', 'A spell slot']);
    expect(within(dialog).queryByLabelText('Maximum uses')).toBeNull();
    expect(within(dialog).queryByLabelText('Lowest slot level')).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: 'Concentration' })).not.toBeChecked();
    expect(within(dialog).getAllByRole('button', { pressed: false })).toHaveLength(9);
    expect(within(dialog).getByRole('combobox', { name: 'Roll' })).toHaveValue('none');
    // Where it is listed and whether it is hidden are for an ability that exists.
    expect(within(dialog).queryByRole('checkbox', { name: 'Combat' })).toBeNull();
    expect(within(dialog).queryByRole('checkbox', { name: 'Hide this ability' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('adds a Bonus Action with limited uses: a row with pips that Use spends', async () => {
    await open('franny');
    await add();
    await fill('Name', '  Pack Howl ');
    await choose('Timing', 'Bonus Action');
    await choose('Cost', 'Limited uses');
    await fill('Maximum uses', '2');
    await choose('Comes back on', 'Short Rest');
    await tap('Save');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(arranged('Bonus Action')).toContain('Pack Howl');
    expect(state().edits.custom).toEqual([{
      key: expect.stringMatching(/^own:/), name: 'Pack Howl', timing: 'bonus', roll: { kind: 'none' },
      cost: { kind: 'uses', max: 2, reset: 'short' }, tags: [], concentration: false, description: '',
    }]);

    await tap('Done');
    expect(played('Bonus Action')).toContain('Pack Howl');
    expect(row('Pack Howl')).toHaveTextContent('2 left');
    expect(screen.getByRole('group', { name: 'Pack Howl: 2 of 2 left' })).toBeInTheDocument();
    await tap('Use Pack Howl');
    expect(row('Pack Howl')).toHaveTextContent('1 left');
    expect(screen.getByRole('group', { name: 'Pack Howl: 1 of 2 left' })).toBeInTheDocument();
    expect(button('Bonus Action: spent')).toBeInTheDocument();
  });

  it('adds an ability that costs a spell slot, and Use offers the slots that can pay', async () => {
    await open('minkis');
    const dialog = await add();
    await fill('Name', 'Arcane Bolt');
    await choose('Cost', 'A spell slot');
    const level = within(dialog).getByRole('combobox', { name: 'Lowest slot level' });
    expect(level).toHaveValue('1');
    expect(within(level).getAllByRole('option')).toHaveLength(9);
    await tap('Save');
    await tap('Done');

    expect(state().edits.custom[0].cost).toEqual({ kind: 'slot', minLevel: 1 });
    expect(row('Arcane Bolt')).toHaveTextContent('spell slot');
    await tap('Use Arcane Bolt');
    const slots = screen.getByRole('dialog', { name: 'Cast Arcane Bolt with' });
    expect(within(slots).getByRole('button', { name: /Level 1 slot/ })).toBeInTheDocument();
    await userEvent.click(within(slots).getByRole('button', { name: /Level 2 slot/ }));
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
  });

  it('takes the lowest slot level, a roll, tags and concentration', async () => {
    await open('minkis');
    await add();
    await fill('Name', 'Arcane Bolt');
    await choose('Cost', 'A spell slot');
    await choose('Lowest slot level', '2');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Concentration' }));
    await tap('Damage');
    await tap('Utility');
    await choose('Roll', 'Attack roll');
    await fill('Attack bonus', '6');
    await fill('Damage', '2d8');
    await fill('Damage type', 'force');
    await tap('Save');
    await tap('Done');

    expect(state().edits.custom[0]).toMatchObject({
      cost: { kind: 'slot', minLevel: 2 }, concentration: true, tags: ['damage', 'utility'],
      roll: { kind: 'attack', bonus: 6, damage: [{ dice: '2d8', type: 'force' }], optionalDamage: [] },
    });
    expect(row('Arcane Bolt')).toHaveTextContent('Roll d20 + 6. Hit: 2d8 force.');
    expect(row('Arcane Bolt')).toHaveTextContent('spell slot · concentration · damage · utility');
    await tap('Use Arcane Bolt');
    // Only a level 2 slot can pay, so there is nothing to ask.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('group', { name: 'Level 2 slots: 1 of 2 left' })).toBeInTheDocument();
    expect(screen.getByText('Concentrating on Arcane Bolt')).toBeInTheDocument();
  });

  it('lists a new ability in Explore when its tags put it there', async () => {
    const { show } = await open('franny');
    await add();
    await fill('Name', 'Bear Whisper');
    await tap('Social');
    await tap('Save');
    await tap('Done');
    expect(played('Action')).toContain('Bear Whisper');
    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    expect(played('Out of combat abilities')).toContain('Bear Whisper');
  });

  it('shows the description as text, with its line break and any markup as written', async () => {
    await open('franny');
    await add();
    await fill('Name', 'Pack Howl');
    await userEvent.type(screen.getByLabelText('Description'), 'Allies take heart.{Enter}Range <b>30</b> feet & no more.');
    await tap('Save');
    await tap('Done');

    expect(state().edits.custom[0].description).toBe('Allies take heart.\nRange <b>30</b> feet & no more.');
    await userEvent.click(within(row('Pack Howl')).getAllByRole('button')[0]);
    const description = row('Pack Howl').querySelector('.description');
    expect(description).toHaveTextContent('Allies take heart.Range <b>30</b> feet & no more.');
    expect(description?.querySelector('b')).toBeNull();
    expect(description?.querySelectorAll('br')).toHaveLength(1);
  });

  it('asks for a name before saving', async () => {
    await open('franny');
    const dialog = await add();
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give the ability a name.');
    await fill('Name', '   ');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give the ability a name.');
    expect(state().edits.custom).toEqual([]);
    await fill('Name', 'Pack Howl');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await tap('Save');
    expect(state().edits.custom).toHaveLength(1);
  });

  it('asks for a finished roll and a sensible maximum before saving', async () => {
    await open('franny');
    const dialog = await add();
    await fill('Name', 'Pack Howl');
    await choose('Roll', 'Dice only');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Finish the roll, or choose No roll.');
    await fill('Dice', '1d6');
    await choose('Cost', 'Limited uses');
    await fill('Maximum uses', '0');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the maximum uses, from 1 to 99.');
    expect(state().edits.custom).toEqual([]);
    await fill('Maximum uses', '3');
    await tap('Save');
    expect(state().edits.custom[0]).toMatchObject({ roll: { kind: 'dice', dice: '1d6' }, cost: { kind: 'uses', max: 3, reset: 'long' } });
  });

  it('refuses a roll number out of range or a fraction, and a damage type with no dice', async () => {
    await open('franny');
    const dialog = await add();
    await fill('Name', 'Pack Howl');
    await choose('Roll', 'Attack roll');
    for (const text of ['41', '1.5']) {
      await fill('Attack bonus', text);
      await tap('Save');
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the attack bonus, from -20 to 40.');
    }
    await fill('Attack bonus', '4');
    await fill('Damage type', 'thunder');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give the damage its dice, or clear its type.');
    await choose('Roll', 'Saving throw');
    await fill('DC', '0');
    await tap('Save');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the DC, from 1 to 40.');
    expect(state().edits.custom).toEqual([]);
    await fill('DC', '14');
    await fill('Damage', '2d6');
    await fill('Damage type', 'thunder');
    await tap('Save');
    expect(state().edits.custom[0]).toMatchObject({
      roll: { kind: 'save', ability: 'str', dc: 14, damage: [{ dice: '2d6', type: 'thunder' }] },
    });
  });

  it('saves nothing on Cancel', async () => {
    await open('franny');
    await add();
    await fill('Name', 'Pack Howl');
    await tap('Cancel');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state().edits.custom).toEqual([]);
  });

  it('can be reached from Explore too', async () => {
    await open('franny', 'explore');
    await add();
    await fill('Name', 'Bear Whisper');
    await tap('Utility');
    await tap('Save');
    expect(arranged('Abilities')).toContain('Bear Whisper');
  });
});

describe('editing a custom ability', () => {
  it('opens its own editor from the row, filled in, and changes the row', async () => {
    await open('franny', 'combat', [howl({ cost: { kind: 'uses', max: 2, reset: 'short' } })]);
    const dialog = await edit('Pack Howl');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Pack Howl');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Allies within 30 feet take heart.');
    expect(within(dialog).getByRole('combobox', { name: 'Timing' })).toHaveValue('bonus');
    expect(within(dialog).getByRole('combobox', { name: 'Cost' })).toHaveValue('uses');
    expect(within(dialog).getByLabelText('Maximum uses')).toHaveValue(2);
    expect(within(dialog).getByRole('combobox', { name: 'Comes back on' })).toHaveValue('short');
    expect(within(dialog).getByRole('button', { name: 'Buff' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    expect(within(dialog).queryByRole('button', { name: 'Back to imported' })).toBeNull();

    await fill('Name', 'Greater Howl');
    await choose('Timing', 'Reaction');
    await choose('Cost', 'Nothing');
    await tap('Save');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(played('Reaction')).toEqual(['Greater Howl']);
    expect(row('Greater Howl')).not.toHaveTextContent('left');
    expect(state().edits.custom).toMatchObject([{ key: 'own:howl', name: 'Greater Howl', timing: 'reaction', cost: { kind: 'none' } }]);
    expect(state().edits.abilities).toEqual({});
  });

  it('opens its own editor from Edit list', async () => {
    await open('franny', 'combat', [howl()]);
    await tap('Edit list');
    await tap('Edit Pack Howl');
    expect(within(screen.getByRole('dialog', { name: 'Edit Pack Howl' })).getByLabelText('Name')).toHaveValue('Pack Howl');
  });

  it('records where it is shown only where that differs from where the app would put it', async () => {
    const { show } = await open('franny', 'combat', [howl()]);
    const first = await edit('Pack Howl');
    await userEvent.click(within(first).getByRole('checkbox', { name: 'Explore' }));
    await tap('Save');
    expect(state().edits.abilities).toEqual({ 'own:howl': { inExplore: true } });

    // Tagged utility, the app lists it in Explore by itself, so nothing needs recording.
    const second = await edit('Pack Howl');
    expect(within(second).getByRole('checkbox', { name: 'Explore' })).toBeChecked();
    await userEvent.click(within(second).getByRole('button', { name: 'Utility' }));
    await tap('Save');
    expect(state().edits.abilities).toEqual({});
    show('explore');
    await screen.findByRole('region', { name: 'Out of combat abilities' });
    expect(played('Out of combat abilities')).toContain('Pack Howl');
  });

  it('follows its tags into Explore without a tap on the box', async () => {
    await open('franny', 'combat', [howl()]);
    const dialog = await edit('Pack Howl');
    const explore = within(dialog).getByRole('checkbox', { name: 'Explore' });
    expect(explore).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(explore).toBeChecked();
    await tap('Save');
    expect(state().edits.abilities).toEqual({});
    expect(state().edits.custom[0].tags).toEqual(['buff', 'utility']);
  });

  it('hides from its editor', async () => {
    await open('franny', 'combat', [howl()]);
    const dialog = await edit('Pack Howl');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Hide this ability' }));
    await tap('Save');
    expect(screen.queryByRole('article', { name: 'Pack Howl' })).toBeNull();
    expect(state().edits.abilities).toEqual({ 'own:howl': { hidden: true } });
    expect(state().edits.custom).toHaveLength(1);
  });

  it('hides and restores from Edit list', async () => {
    await open('franny', 'combat', [howl()]);
    await tap('Edit list');
    await tap('Hide Pack Howl');
    expect(arranged('Bonus Action')).not.toContain('Pack Howl');
    expect(screen.getByText('Hidden (1)')).toBeInTheDocument();
    await tap('Restore Pack Howl');
    expect(arranged('Bonus Action')).toContain('Pack Howl');
    expect(state().edits.abilities).toEqual({});
    await tap('Done');
    expect(row('Pack Howl')).toBeInTheDocument();
  });

  it('deletes after asking, by the name it was saved under', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await open('franny', 'combat', [howl()]);
    state().setEdit('own:howl', { inExplore: true });
    await edit('Pack Howl');
    await fill('Name', 'Something else');
    await tap('Delete');
    expect(confirm).toHaveBeenCalledWith("Delete Pack Howl? This can't be undone.");
    expect(screen.getByRole('dialog', { name: 'Edit Pack Howl' })).toBeInTheDocument();
    expect(state().edits.custom).toHaveLength(1);

    confirm.mockReturnValue(true);
    await tap('Delete');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('article', { name: 'Pack Howl' })).toBeNull();
    expect(state().edits).toMatchObject({ custom: [], abilities: {} });
  });
});

describe('a custom action from D&D Beyond', () => {
  it('opens the ordinary editor, and can be put back to imported', async () => {
    await open('franny');
    const twig = state().sheet?.abilities.find((a) => a.name === 'Twig Attack' && a.source === 'custom');
    if (!twig) throw new Error('no custom action on the fixture');
    const article = within(screen.getByRole('region', { name: 'Other' })).getAllByRole('article')[1];
    await userEvent.click(within(article).getAllByRole('button')[0]);
    await userEvent.click(within(article).getByRole('button', { name: 'Edit Twig Attack' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Twig Attack' });
    expect(within(dialog).queryByLabelText('Name')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: 'Limited uses' })).not.toBeChecked();

    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Action');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(state().edits.abilities).toEqual({ [twig.key]: { timing: 'action' } });
    expect(played('Action')).toContain('Twig Attack');

    const moved = within(screen.getByRole('region', { name: 'Action' })).getByRole('article', { name: 'Twig Attack' });
    await userEvent.click(within(moved).getAllByRole('button')[0]);
    await userEvent.click(within(moved).getByRole('button', { name: 'Edit Twig Attack' }));
    await tap('Back to imported');
    expect(state().edits.abilities).toEqual({});
    expect(played('Other')).toEqual(['Twig Attack', 'Twig Attack']);
  });
});
