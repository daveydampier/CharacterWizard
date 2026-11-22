import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Slug } from '../../../../test-utils/fixtures';
import { CharacterScreen } from '../screens/Character';
import { useStore } from '../store';
import { rawWithId, seed } from '../test/helpers';
import { renderAt } from '../test/render';

async function openFeatures(slug: Slug) {
  const record = await seed(slug);
  render(<CharacterScreen id={record.id} view="features" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

/** Imports a changed copy of a fixture into the signed-in store and opens its Features page. */
async function openChanged(slug: Slug, change: (data: any) => void) {
  await seed(slug);
  const raw = rawWithId(slug, 424242);
  change(raw.data);
  const record = await useStore.getState().saveImported(raw);
  if (!record) throw new Error('the changed sheet did not import');
  render(<CharacterScreen id={record.id} view="features" />);
  await screen.findByRole('heading', { name: record.name });
  return record;
}

const group = (heading: string) => screen.getByRole('region', { name: heading });
const rowNames = (heading: string) =>
  within(group(heading)).getAllByRole('article').map((row) => row.getAttribute('aria-label'));
const row = (heading: string, name: string) => within(group(heading)).getByRole('article', { name });

describe('Features view', () => {
  it('lists the features under a heading for the class, the feats and the species', async () => {
    await openFeatures('vlad');
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(['Warlock 3', 'Feats', 'Human']);
    expect(rowNames('Warlock 3')).toEqual([
      'Core Warlock Traits', 'Eldritch Invocations', 'Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor',
      'Pact Magic', 'Magical Cunning', 'Warlock Subclass', 'Tatzelwurm Spells', 'Shadowy Form', 'The Cost',
    ]);
    expect(rowNames('Feats')).toEqual([
      'Alert', 'Criminal Ability Score Improvements', 'Increase three scores (+1 / +1 / +1)', 'Lucky', 'Dark Bargain',
    ]);
    expect(rowNames('Human')).toEqual(['Resourceful', 'Skillful', 'Versatile', 'Creature Type', 'Size', 'Speed', 'Ability Score Increases']);
  });

  it('says where a class or subclass feature comes from, and nothing for a feat', async () => {
    await openFeatures('vlad');
    expect(row('Warlock 3', 'Magical Cunning')).toHaveTextContent('Warlock, level 2');
    expect(row('Warlock 3', 'Shadowy Form')).toHaveTextContent('Thressia, Spirit of the Tatzelwurm, level 3');
    expect(row('Warlock 3', 'Pact of the Blade')).not.toHaveTextContent('level');
    expect(row('Feats', 'Alert')).toHaveTextContent(/^Alert$/);
  });

  it('groups a feature\'s options, so a screen reader tells them from the feature', async () => {
    await openFeatures('vlad');
    const options = within(group('Warlock 3')).getByRole('group', { name: 'Eldritch Invocations options' });
    expect(within(options).getAllByRole('article').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Pact of the Blade', 'Armor of Shadows', 'Fiendish Vigor',
    ]);
    expect(within(row('Warlock 3', 'Eldritch Invocations')).queryByRole('group')).toBeNull();
    expect(row('Warlock 3', 'Eldritch Invocations').closest('[role="group"]')).toBeNull();
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Eldritch Invocations options', 'Criminal Ability Score Improvements options',
    ]);
    expect(within(group('Feats')).queryByRole('group', { name: 'Lucky options' })).toBeNull();
  });

  it('labels a feature that has rows in play, and only those', async () => {
    await openFeatures('vlad');
    for (const [heading, name] of [['Feats', 'Lucky'], ['Warlock 3', 'Magical Cunning'], ['Warlock 3', 'Pact of the Blade']]) {
      expect(within(row(heading, name)).getByText('In play')).toBeInTheDocument();
    }
    for (const [heading, name] of [['Feats', 'Alert'], ['Warlock 3', 'Pact Magic'], ['Human', 'Size']]) {
      expect(within(row(heading, name)).queryByText('In play')).toBeNull();
    }
  });

  it('shows a feature the sheet lists twice once', async () => {
    await openFeatures('franny');
    expect(within(group('Barbarian 3')).getAllByRole('article', { name: 'Rage' })).toHaveLength(1);
    expect(within(row('Barbarian 3', 'Rage')).getByText('In play')).toBeInTheDocument();
  });

  it('has nothing to use or spend, and no turn button', async () => {
    await openFeatures('vlad');
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start my turn' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Action|Bonus Action|Reaction): / })).toBeNull();
    expect(screen.queryByRole('group', { name: /left$/ })).toBeNull();
  });

  it('opens and closes a description, sanitised', async () => {
    await openChanged('vlad', (data) => {
      const lucky = data.feats.find((f: any) => f.definition.name === 'Lucky');
      lucky.definition.description = '<p>Made-up <strong>test text</strong>.</p><script>window.hacked = true</script><a href="https://example.com">link</a>';
    });
    const lucky = row('Feats', 'Lucky');
    const toggle = within(lucky).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(lucky).queryByText('test text')).toBeNull();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(lucky).getByText('test text').tagName).toBe('STRONG');
    expect(lucky.querySelector('script')).toBeNull();
    expect(lucky.querySelector('a')).toBeNull();
    expect(lucky).toHaveTextContent('link');

    await userEvent.click(toggle);
    expect(within(lucky).queryByText('test text')).toBeNull();
  });

  it('says so when a feature has no description', async () => {
    await openChanged('vlad', (data) => {
      const alert = data.feats.find((f: any) => f.definition.name === 'Alert');
      alert.definition.description = '';
      alert.definition.snippet = '';
    });
    await userEvent.click(within(row('Feats', 'Alert')).getByRole('button'));
    expect(within(row('Feats', 'Alert')).getByText('No description on the sheet.')).toBeInTheDocument();
  });

  it('says so when the sheet lists no features', async () => {
    await openChanged('vlad', (data) => {
      for (const cls of data.classes) cls.classFeatures = [];
      data.feats = [];
      data.race.racialTraits = [];
      data.options = {};
    });
    expect(screen.getByText('This sheet lists no features.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('the view switch', () => {
  it('offers Combat, Explore and Features, and marks the one that is open', async () => {
    const record = await seed('vlad');
    renderAt({ name: 'character', id: record.id, view: 'features' });
    await screen.findByRole('heading', { name: record.name });
    const links = within(screen.getByRole('navigation', { name: 'View' })).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('aria-current')])).toEqual([
      ['Combat', null], ['Explore', null], ['Features', 'page'],
    ]);
    expect(links[2]).toHaveAttribute('href', `#/c/${encodeURIComponent(record.id)}/features`);
    expect(screen.getByRole('region', { name: 'Feats' })).toBeInTheDocument();
  });

  it('still opens Combat and Explore', async () => {
    const record = await seed('vlad');
    const view = render(<CharacterScreen id={record.id} view="combat" />);
    expect(await screen.findByRole('button', { name: 'Start my turn' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Feats' })).toBeNull();
    view.rerender(<CharacterScreen id={record.id} view="explore" />);
    expect(screen.getByRole('button', { name: 'Long Rest' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Feats' })).toBeNull();
  });
});
