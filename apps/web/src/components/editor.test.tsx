import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Roll } from '@cw/model';
import { applyEdits, type Sheet } from '@cw/rules';
import type { Slug } from '../../../../test-utils/fixtures';
import type { View } from '../router';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';
import { RollEditor } from './RollEditor';

describe('RollEditor', () => {
  /** Holds the roll as a form would, and records each roll the editor sends. */
  function Harness({ start, onChange }: { start: Roll; onChange: (roll: Roll) => void }) {
    const [roll, setRoll] = useState(start);
    return (
      <RollEditor
        value={roll}
        onChange={(next) => {
          setRoll(next);
          onChange(next);
        }}
      />
    );
  }

  function editing(start: Roll) {
    const onChange = vi.fn<(roll: Roll) => void>();
    render(<Harness start={start} onChange={onChange} />);
    return { last: (): Roll | undefined => onChange.mock.calls.at(-1)?.[0], onChange };
  }

  const kind = () => screen.getByRole('combobox', { name: 'Roll' });
  const options = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent);

  async function retype(label: string, text: string) {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    if (text !== '') await userEvent.type(field, text);
  }

  it('offers the kinds of roll, and an ability check only for a roll that is one', () => {
    editing({ kind: 'none' });
    expect(kind()).toHaveValue('none');
    expect(options(kind())).toEqual(['No roll', 'Attack roll', 'Saving throw', 'Damage only', 'Dice only']);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('edits an attack: the bonus, the damage and its type', async () => {
    const { last } = editing({ kind: 'attack', bonus: 5, damage: [{ dice: '1d8+3', type: 'piercing' }], optionalDamage: [] });
    expect(kind()).toHaveValue('attack');
    expect(screen.getByLabelText('Attack bonus')).toHaveValue(5);
    expect(screen.getByLabelText('Damage')).toHaveValue('1d8+3');
    expect(screen.getByLabelText('Damage type')).toHaveValue('piercing');
    await retype('Attack bonus', '7');
    await retype('Damage', '2d6+4');
    await retype('Damage type', 'slashing');
    expect(last()).toEqual({ kind: 'attack', bonus: 7, damage: [{ dice: '2d6+4', type: 'slashing' }], optionalDamage: [] });
  });

  it('takes a negative attack bonus', async () => {
    const { last } = editing({ kind: 'attack', bonus: 5, damage: [], optionalDamage: [] });
    await retype('Attack bonus', '-1');
    expect(last()).toMatchObject({ kind: 'attack', bonus: -1 });
    expect(screen.getByLabelText('Attack bonus')).toHaveValue(-1);
  });

  it('edits a save: the ability by its full name, the DC and the damage', async () => {
    const { last } = editing({ kind: 'save', ability: 'str', dc: 13, damage: [{ dice: '2d6', type: 'necrotic' }] });
    const save = screen.getByRole('combobox', { name: 'Save' });
    expect(save).toHaveValue('str');
    expect(options(save)).toEqual(['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']);
    expect(screen.getByLabelText('DC')).toHaveValue(13);
    await userEvent.selectOptions(save, 'Wisdom');
    await retype('DC', '15');
    await retype('Damage type', '');
    expect(last()).toEqual({ kind: 'save', ability: 'wis', dc: 15, damage: [{ dice: '2d6', type: null }] });
  });

  it('edits damage only', async () => {
    const { last } = editing({ kind: 'damage', damage: [{ dice: '1d6', type: 'necrotic' }] });
    expect(screen.queryByLabelText('Attack bonus')).toBeNull();
    await retype('Damage', '1d10');
    expect(last()).toEqual({ kind: 'damage', damage: [{ dice: '1d10', type: 'necrotic' }] });
  });

  it('edits dice only', async () => {
    const { last } = editing({ kind: 'dice', dice: '2d6' });
    expect(screen.getByLabelText('Dice')).toHaveValue('2d6');
    await retype('Dice', '3d6');
    expect(last()).toEqual({ kind: 'dice', dice: '3d6' });
  });

  it('edits an ability check, which is offered only while the roll is one', async () => {
    const { last } = editing({ kind: 'check', bonus: 3 });
    expect(options(kind())).toContain('Ability check');
    await retype('Bonus', '4');
    expect(last()).toEqual({ kind: 'check', bonus: 4 });
    await userEvent.selectOptions(kind(), 'No roll');
    expect(last()).toEqual({ kind: 'none' });
    expect(options(kind())).not.toContain('Ability check');
  });

  it('starts each kind from blanks when the kind is switched', async () => {
    const { last } = editing({ kind: 'none' });
    await userEvent.selectOptions(kind(), 'Attack roll');
    expect(last()).toEqual({ kind: 'attack', bonus: 0, damage: [], optionalDamage: [] });
    expect(screen.getByLabelText('Attack bonus')).toHaveValue(0);
    expect(screen.getByLabelText('Damage')).toHaveValue('');
    await userEvent.selectOptions(kind(), 'Saving throw');
    expect(last()).toEqual({ kind: 'save', ability: 'str', dc: 10, damage: [] });
    await userEvent.selectOptions(kind(), 'Damage only');
    expect(last()).toEqual({ kind: 'damage', damage: [] });
    await userEvent.selectOptions(kind(), 'Dice only');
    expect(last()).toEqual({ kind: 'dice', dice: '' });
    expect(screen.getByLabelText('Dice')).toHaveValue('');
  });

  it('carries further damage parts and optional damage while the kind stays the same, and drops them when it changes', async () => {
    const { last } = editing({
      kind: 'attack',
      bonus: 5,
      damage: [{ dice: '1d8+3', type: 'piercing' }, { dice: '1d4', type: 'fire' }],
      optionalDamage: [{ dice: '1d6', type: 'poison' }],
    });
    await retype('Damage', '1d10+3');
    await retype('Attack bonus', '6');
    expect(last()).toEqual({
      kind: 'attack',
      bonus: 6,
      damage: [{ dice: '1d10+3', type: 'piercing' }, { dice: '1d4', type: 'fire' }],
      optionalDamage: [{ dice: '1d6', type: 'poison' }],
    });
    await userEvent.selectOptions(kind(), 'Saving throw');
    expect(last()).toEqual({ kind: 'save', ability: 'str', dc: 10, damage: [] });
    await userEvent.selectOptions(kind(), 'Attack roll');
    expect(last()).toEqual({ kind: 'attack', bonus: 0, damage: [], optionalDamage: [] });
  });

  it('sends a roll that is not finished yet while a field is empty', async () => {
    const { last } = editing({ kind: 'dice', dice: '2d6' });
    await retype('Dice', '');
    expect(last()).toEqual({ kind: 'dice', dice: '' });
  });
});

describe('AbilityEditor', () => {
  async function open(slug: Slug, view: View = 'combat') {
    const record = await seed(slug);
    const screenOf = render(<CharacterScreen id={record.id} view={view} />);
    await screen.findByRole('heading', { name: record.name });
    return { record, show: (next: View) => screenOf.rerender(<CharacterScreen id={record.id} view={next} />) };
  }

  const row = (label: string) => screen.getByRole('article', { name: label });
  const group = (name: string) =>
    within(screen.getByRole('region', { name })).queryAllByRole('article').map((a) => a.getAttribute('aria-label'));

  /** Opens a row and taps its Edit button. `label` is the row's accessible name, `name` the ability's. */
  async function edit(label: string, name = label) {
    const article = row(label);
    await userEvent.click(within(article).getAllByRole('button')[0]);
    await userEvent.click(within(article).getByRole('button', { name: `Edit ${label}` }));
    return screen.getByRole('dialog', { name: `Edit ${name}` });
  }

  const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const edits = () => useStore.getState().edits.abilities;

  it('opens from a row, showing the ability as it stands', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    expect(within(dialog).getByRole('combobox', { name: 'Timing' })).toHaveValue('bonus');
    expect(within(within(dialog).getByRole('combobox', { name: 'Timing' })).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Action', 'Bonus Action', 'Reaction', 'No action needed', 'Passive', 'Takes a minute or more']);
    expect(within(dialog).getByRole('button', { name: 'Damage' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Debuff' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Healing' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getAllByRole('button', { pressed: false }).map((b) => b.textContent))
      .toEqual(['Healing', 'Buff', 'Control', 'Movement', 'Defence', 'Utility', 'Social']);
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
    expect(within(dialog).getByRole('combobox', { name: 'Roll' })).toHaveValue('damage');
    expect(within(dialog).getByRole('checkbox', { name: 'Hide this ability' })).not.toBeChecked();
  });

  it('moves a row to another group when its timing changes, and marks it edited', async () => {
    await open('vlad');
    await edit('Hex');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Timing' }), 'Action');
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(group('Action')).toContain('Hex');
    expect(group('Bonus Action')).not.toContain('Hex');
    expect(row('Hex')).toHaveTextContent('edited');
    expect(edits()).toEqual({ [ability('Hex').key]: { timing: 'action' } });
  });

  it('offers an unknown timing only for an ability whose timing is unknown', async () => {
    await open('franny');
    const other = within(screen.getByRole('region', { name: 'Other' })).getAllByRole('article')[0];
    await userEvent.click(within(other).getAllByRole('button')[0]);
    await userEvent.click(within(other).getByRole('button', { name: 'Edit Twig Attack' }));
    const timing = screen.getByRole('combobox', { name: 'Timing' });
    expect(timing).toHaveValue('unknown');
    expect(within(timing).getByRole('option', { name: 'Unknown' })).toBeInTheDocument();
  });

  it('gives limited uses to an ability that had none: pips, a number left, and Use spends one', async () => {
    await open('sid');
    const dialog = await edit('Cunning Action');
    expect(within(dialog).queryByLabelText('Maximum uses')).toBeNull();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    const max = within(dialog).getByLabelText('Maximum uses');
    await userEvent.clear(max);
    await userEvent.type(max, '2');
    const reset = within(dialog).getByRole('combobox', { name: 'Comes back on' });
    expect(within(reset).getAllByRole('option').map((o) => o.textContent)).toEqual(['Short Rest', 'Long Rest', 'Never']);
    await userEvent.selectOptions(reset, 'Short Rest');
    await save();
    expect(edits()).toEqual({ [ability('Cunning Action').key]: { uses: { max: 2, reset: 'short' } } });
    expect(row('Cunning Action')).toHaveTextContent('2 left');
    expect(screen.getByRole('group', { name: 'Cunning Action: 2 of 2 left' })).toBeInTheDocument();
    await userEvent.click(within(row('Cunning Action')).getByRole('button', { name: 'Use Cunning Action' }));
    expect(row('Cunning Action')).toHaveTextContent('1 left');
    expect(screen.getByRole('group', { name: 'Cunning Action: 1 of 2 left' })).toBeInTheDocument();
  });

  it('asks for a maximum between 1 and 99 before saving limited uses', async () => {
    await open('sid');
    const dialog = await edit('Cunning Action');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    await userEvent.clear(within(dialog).getByLabelText('Maximum uses'));
    await save();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the maximum uses, from 1 to 99.');
    expect(edits()).toEqual({});
    await userEvent.type(within(dialog).getByLabelText('Maximum uses'), '100');
    await save();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Set the maximum uses, from 1 to 99.');
    expect(edits()).toEqual({});
  });

  it('changes and removes the limited uses of an ability that has them', async () => {
    await open('danger');
    const dialog = await edit('Second Wind');
    expect(within(dialog).getByRole('checkbox', { name: 'Limited uses' })).toBeChecked();
    expect(within(dialog).getByLabelText('Maximum uses')).toHaveValue(3);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Limited uses' }));
    await save();
    expect(edits()).toEqual({ [ability('Second Wind').key]: { uses: 'none' } });
    expect(row('Second Wind')).not.toHaveTextContent('left');
    expect(screen.queryByRole('group', { name: /^Second Wind:/ })).toBeNull();
  });

  it('says a spell that costs a slot has no uses to edit', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    expect(within(dialog).getByText('This ability costs a spell slot.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Limited uses' })).toBeNull();
    expect(within(dialog).queryByLabelText('Maximum uses')).toBeNull();
    expect(within(dialog).queryByRole('combobox', { name: 'Comes back on' })).toBeNull();
  });

  it('toggles a tag', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Control' }));
    expect(within(dialog).getByRole('button', { name: 'Control' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Damage' }));
    expect(within(dialog).getByRole('button', { name: 'Damage' })).toHaveAttribute('aria-pressed', 'false');
    await save();
    expect(ability('Hex').tags).toEqual(['debuff', 'control']);
    expect(row('Hex')).toHaveTextContent('pact slot · concentration · debuff · control · edited');
  });

  it('lists an ability in Explore once Explore is ticked', async () => {
    const { show } = await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Explore' }));
    await save();
    expect(edits()).toEqual({ [ability('Hex').key]: { inExplore: true } });
    expect(group('Bonus Action')).toContain('Hex');
    show('explore');
    expect(await screen.findByRole('region', { name: 'Out of combat abilities' })).toBeInTheDocument();
    expect(group('Out of combat abilities')).toContain('Hex');
  });

  it('lists an ability in Explore when it is given a tag that belongs there, without a tap on the box', async () => {
    const { show } = await open('vlad');
    const dialog = await edit('Hex');
    const explore = within(dialog).getByRole('checkbox', { name: 'Explore' });
    expect(explore).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(explore).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(explore).not.toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    await save();
    // Only the tags are recorded: where it is listed still follows the app's rule.
    expect(edits()).toEqual({ [ability('Hex').key]: { tags: ['damage', 'debuff', 'utility'] } });
    show('explore');
    expect(await screen.findByRole('region', { name: 'Out of combat abilities' })).toBeInTheDocument();
    expect(group('Out of combat abilities')).toContain('Hex');
  });

  it('leaves a box where the player put it when the tags change afterwards', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    const explore = within(dialog).getByRole('checkbox', { name: 'Explore' });
    await userEvent.click(explore);
    await userEvent.click(explore);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(explore).not.toBeChecked();
    await save();
    expect(edits()).toEqual({ [ability('Hex').key]: { tags: ['damage', 'debuff', 'utility'], inExplore: false } });
  });

  it('keeps a box set in an earlier edit where it was put', async () => {
    await open('vlad');
    useStore.getState().setEdit(ability('Hex').key, { inExplore: false });
    const dialog = await edit('Hex');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Utility' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Explore' })).not.toBeChecked();
  });

  it('takes an ability out of Combat when Combat is unticked, and edits from Explore too', async () => {
    const { show } = await open('vlad', 'explore');
    const dialog = await edit('Charm Person');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await save();
    expect(group('Out of combat abilities')).toContain('Charm Person');
    show('combat');
    expect(await screen.findByRole('region', { name: 'Action' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Charm Person' })).toBeNull();
  });

  it('replaces an attack bonus, which changes the roll line and keeps the rest of the roll', async () => {
    await open('vlad');
    expect(row('Wurms Claw - Sword')).toHaveTextContent('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    const dialog = await edit('Wurms Claw - Sword');
    const bonus = within(dialog).getByLabelText('Attack bonus');
    await userEvent.clear(bonus);
    await userEvent.type(bonus, '7');
    await save();
    expect(row('Wurms Claw - Sword')).toHaveTextContent('Roll d20 + 7. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    expect(row('Wurms Claw - Sword')).toHaveTextContent('edited');
  });

  it('does not save a roll that is not finished', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Roll' }), 'Dice only');
    await save();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Finish the roll, or choose No roll.');
    expect(screen.getByRole('dialog', { name: 'Edit Hex' })).toBeInTheDocument();
    expect(edits()).toEqual({});
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Roll' }), 'No roll');
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({ [ability('Hex').key]: { roll: { kind: 'none' } } });
  });

  it('hides an ability', async () => {
    await open('vlad');
    const key = ability('Hex').key;
    const dialog = await edit('Hex');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Hide this ability' }));
    await save();
    expect(screen.queryByRole('article', { name: 'Hex' })).toBeNull();
    expect(useStore.getState().sheet?.hidden.map((a) => a.name)).toEqual(['Hex']);
    expect(edits()).toEqual({ [key]: { hidden: true } });
  });

  it('puts an edited ability back to imported, and offers that only for an edited one', async () => {
    await open('vlad');
    const first = await edit('Hex');
    expect(within(first).queryByRole('button', { name: 'Back to imported' })).toBeNull();
    await userEvent.selectOptions(within(first).getByRole('combobox', { name: 'Timing' }), 'Reaction');
    await userEvent.click(within(first).getByRole('button', { name: 'Utility' }));
    await save();
    expect(group('Reaction')).toContain('Hex');

    const second = await edit('Hex');
    await userEvent.click(within(second).getByRole('button', { name: 'Back to imported' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(group('Bonus Action')).toContain('Hex');
    expect(row('Hex')).not.toHaveTextContent('edited');
    expect(edits()).toEqual({});
  });

  it('saves nothing on Cancel', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Action');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
    expect(group('Bonus Action')).toContain('Hex');
  });

  it('saves nothing when the dialog is closed with Escape, and starts afresh the next time', async () => {
    await open('vlad');
    const dialog = await edit('Hex');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Action');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
    await userEvent.click(within(row('Hex')).getByRole('button', { name: 'Edit Hex' }));
    expect(screen.getByRole('combobox', { name: 'Timing' })).toHaveValue('bonus');
  });

  it('saves nothing when nothing was changed', async () => {
    await open('vlad');
    await edit('Wurms Claw - Sword');
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({});
    expect(row('Wurms Claw - Sword')).not.toHaveTextContent('edited');
  });

  it('edits a universal action, which stays under "Anyone can do this"', async () => {
    await open('vlad');
    const dialog = await edit('Dash');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Movement' }));
    await save();
    expect(ability('Dash').tags).toEqual(['movement']);
    expect(row('Dash')).toHaveTextContent('edited');
    expect(row('Dash').closest('details')).toHaveTextContent('Anyone can do this');
  });

  it('takes a universal action out of Combat when Combat is unticked', async () => {
    await open('vlad');
    const dialog = await edit('Dash');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Combat' }));
    await save();
    expect(screen.queryByRole('article', { name: 'Dash' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Dodge' })).toBeInTheDocument();
  });

  /** Replaces the open character's imported sheet, as a sync or a re-import would, keeping its edits. */
  function replaceBase(change: (base: Sheet) => Sheet): void {
    const { baseSheet, edits: current } = useStore.getState();
    if (!baseSheet) throw new Error('no character is open');
    const next = change(baseSheet);
    act(() => useStore.setState({ baseSheet: next, sheet: applyEdits(next, current) }));
  }

  it('saves a change to an ability whose imported pool is above 99, leaving the uses alone', async () => {
    await open('danger');
    const key = ability('Second Wind').key;
    replaceBase((base) => ({ ...base, resources: base.resources.map((r) => (r.key === key ? { ...r, max: 100 } : r)) }));
    const dialog = await edit('Second Wind');
    expect(within(dialog).getByLabelText('Maximum uses')).toHaveValue(100);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Healing' }));
    await save();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(edits()).toEqual({ [key]: { tags: ['healing'] } });
  });

  it('records only the timing when only the timing changes, and the Combat box follows it', async () => {
    await open('vlad');
    const key = ability('Hex').key;
    const dialog = await edit('Hex');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Timing' }), 'Takes a minute or more');
    expect(within(dialog).getByRole('checkbox', { name: 'Combat' })).not.toBeChecked();
    await save();
    expect(edits()).toEqual({ [key]: { timing: 'long' } });
    expect(screen.queryByRole('article', { name: 'Hex' })).toBeNull();
  });

  it('tells twins apart on the Edit button and titles the editor with the name', async () => {
    await open('vlad');
    const dialog = await edit('Misty Step (free cast)', 'Misty Step');
    expect(within(dialog).getByRole('checkbox', { name: 'Limited uses' })).toBeChecked();
    expect(within(dialog).getByLabelText('Maximum uses')).toHaveValue(3);
  });
});
