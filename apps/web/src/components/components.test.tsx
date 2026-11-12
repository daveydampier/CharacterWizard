import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PlayState } from '@cw/model';
import { emptyPlayState, pools, type Pool } from '@cw/rules';
import { useStore } from '../store';
import { ability, seed } from '../test/helpers';
import { AbilityRow } from './AbilityRow';
import { Description, sanitiseDescription } from './Description';
import { NotesList } from './NotesList';
import { Pips } from './Pips';
import { ResourceChips } from './ResourceChips';

const pool = (max: number): Pool => ({ key: 'p', name: 'Luck Points', max, reset: 'long', kind: 'uses' });

describe('Pips', () => {
  it('shows one pip per use and says how many are left', () => {
    render(<Pips pool={pool(3)} left={2} onAdjust={() => {}} />);
    expect(screen.getByRole('group', { name: 'Luck Points: 2 of 3 left' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Spend one Luck Points' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Restore one Luck Points' })).toHaveLength(1);
  });

  it('spends on a filled pip and restores on an empty one', async () => {
    const onAdjust = vi.fn();
    render(<Pips pool={pool(3)} left={2} onAdjust={onAdjust} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Spend one Luck Points' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Restore one Luck Points' }));
    expect(onAdjust.mock.calls).toEqual([[1], [-1]]);
  });

  it('shows a number with minus and plus for a large pool', async () => {
    const onAdjust = vi.fn();
    render(<Pips pool={pool(9)} left={7} onAdjust={onAdjust} />);
    expect(screen.getByText('7 / 9')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Spend one Luck Points' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restore one Luck Points' }));
    expect(onAdjust.mock.calls).toEqual([[1], [-1]]);
  });
});

describe('ResourceChips', () => {
  it('folds pools beyond the first four behind a button', async () => {
    await seed('vlad');
    const sheet = useStore.getState().sheet;
    if (!sheet) throw new Error('no sheet');
    const all = pools(sheet);
    render(<ResourceChips pools={all} state={emptyPlayState()} onAdjust={() => {}} />);
    const region = screen.getByRole('region', { name: 'Resources' });
    expect(within(region).getAllByRole('group')).toHaveLength(4);
    await userEvent.click(within(region).getByRole('button', { name: `+${all.length - 4} more` }));
    expect(within(region).getAllByRole('group')).toHaveLength(all.length);
    expect(within(region).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
  });

  it('renders nothing for a character with no pools', () => {
    const { container } = render(<ResourceChips pools={[]} state={emptyPlayState()} onAdjust={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Description', () => {
  it('keeps formatting and removes everything that could run or load', () => {
    const dirty = '<p onclick="steal()">Deal <strong>fire</strong> damage.</p>'
      + '<script>alert(1)</script><img src="x" onerror="alert(2)">'
      + '<a href="javascript:alert(3)">link text</a><iframe src="https://evil.example"></iframe>'
      + '<ul><li style="background:url(x)">one</li></ul>';
    const clean = sanitiseDescription(dirty);
    expect(clean).toBe('<p>Deal <strong>fire</strong> damage.</p>link text<ul><li>one</li></ul>');
    expect(sanitiseDescription('<p data-x="1" aria-hidden="true">hi</p>')).toBe('<p>hi</p>');
  });

  it.each(['<script>alert(1)</script>', '<p></p>'])('says so when nothing is left after sanitising %s', (html) => {
    const { container } = render(<Description html={html} />);
    expect(screen.getByText('No description on the sheet.')).toBeInTheDocument();
    expect(container.querySelector('.description')).toBeNull();
  });

  it('renders the sanitised text', () => {
    const { container } = render(<Description html={'<p>Hello <em>there</em></p><script>window.hacked = true</script>'} />);
    expect(screen.getByText('there')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('says so when the sheet has no description', () => {
    render(<Description html="  " />);
    expect(screen.getByText('No description on the sheet.')).toBeInTheDocument();
  });
});

describe('NotesList', () => {
  it('prefixes a note with the skill or save it is about', () => {
    render(<NotesList empty="none" notes={[
      { target: { kind: 'skill', skill: 'sleight-of-hand' }, text: 'Advantage (roll twice, keep the higher).' },
      { target: { kind: 'save', ability: 'con' }, text: 'Advantage: to maintain Concentration.' },
      { target: { kind: 'other' }, text: 'Immunity, charmed: Raging.' },
    ]} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Sleight of Hand: Advantage (roll twice, keep the higher).',
      'Constitution save: Advantage: to maintain Concentration.',
      'Immunity, charmed: Raging.',
    ]);
  });

  it('shows the empty text when there are no notes', () => {
    render(<NotesList notes={[]} empty="No other notes on this sheet." />);
    expect(screen.getByText('No other notes on this sheet.')).toBeInTheDocument();
  });
});

describe('AbilityRow', () => {
  async function row(name: string, state: PlayState = emptyPlayState(), cost?: 'slot' | 'uses') {
    await seed('vlad');
    const sheet = useStore.getState().sheet;
    if (!sheet) throw new Error('no sheet');
    const onUse = vi.fn();
    const onAdjust = vi.fn();
    render(<AbilityRow ability={ability(name, cost)} sheet={sheet} state={state} mode="combat" onUse={onUse} onAdjust={onAdjust} />);
    return { article: screen.getByRole('article', { name }), onUse, onAdjust };
  }

  it('shows the name, cost label, tags and roll line, and calls onUse', async () => {
    const { article, onUse } = await row('Arms of Hadar');
    expect(article).toHaveTextContent('pact slot');
    expect(article).toHaveTextContent('They roll a Strength save against DC 13. Fail: 2d6 necrotic.');
    await userEvent.click(within(article).getByRole('button', { name: 'Use Arms of Hadar' }));
    expect(onUse).toHaveBeenCalledWith(ability('Arms of Hadar'));
  });

  it('tells two abilities with the same name apart by their cost', async () => {
    const { article } = await row('Misty Step', emptyPlayState(), 'uses');
    expect(article).toHaveTextContent('free cast, 3 left');
  });

  it('disables Use and gives the reason when the ability is blocked', async () => {
    const state: PlayState = { ...emptyPlayState(), spent: { pact: 2 } };
    const { article, onUse } = await row('Arms of Hadar', state);
    const use = within(article).getByRole('button', { name: 'Use Arms of Hadar' });
    expect(use).toBeDisabled();
    expect(article).toHaveTextContent('No spell slots left.');
    await userEvent.click(use);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('warns when using it would end the current concentration', async () => {
    await seed('vlad');
    const state: PlayState = { ...emptyPlayState(), concentrationKey: ability('Hex').key };
    const { article } = await row('Darkness', state);
    expect(article).toHaveTextContent('Ends your Hex.');
  });

  it('shows a weapon\'s charges as pips that never go through Use', async () => {
    const { article, onUse, onAdjust } = await row('Wurms Claw - Sword');
    expect(article).toHaveTextContent('Roll d20 + 5. Hit: 1d8 + 3 piercing. Extra: 1d6 poison (see the item).');
    expect(within(article).getByRole('group', { name: 'Wurms Claw - Sword: 3 of 3 left' })).toBeInTheDocument();
    await userEvent.click(within(article).getAllByRole('button', { name: 'Spend one Wurms Claw - Sword' })[0]);
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(onAdjust.mock.calls[0][1]).toBe(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('opens the description on a tap of the name', async () => {
    const { article } = await row('Dash');
    expect(article).not.toHaveTextContent('Gain extra movement');
    await userEvent.click(within(article).getByRole('button', { name: /^Dash/ }));
    expect(article).toHaveTextContent('Gain extra movement equal to your Speed');
  });

  it('has no Use button for an ability with nothing to spend', async () => {
    await seed('sid');
    const sheet = useStore.getState().sheet;
    if (!sheet) throw new Error('no sheet');
    render(<AbilityRow ability={ability('Sneak Attack')} sheet={sheet} state={emptyPlayState()} mode="combat" onUse={() => {}} onAdjust={() => {}} />);
    const article = screen.getByRole('article', { name: 'Sneak Attack' });
    expect(article).toHaveTextContent('Roll 2d6.');
    expect(within(article).queryByRole('button', { name: 'Use Sneak Attack' })).toBeNull();
  });
});
