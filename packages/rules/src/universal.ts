import type { Ability } from '@cw/model';

/**
 * The actions every character can take, summarised in our own words from SRD 5.2
 * (CC-BY-4.0; the attribution is in the README and on the About screen).
 */
const UNIVERSAL: { slug: string; name: string; description: string }[] = [
  { slug: 'attack', name: 'Attack', description: 'Attack with a weapon or an Unarmed Strike. Your weapons are listed above.' },
  { slug: 'dash', name: 'Dash', description: 'Gain extra movement equal to your Speed for the rest of this turn.' },
  { slug: 'disengage', name: 'Disengage', description: 'Your movement does not provoke Opportunity Attacks for the rest of this turn.' },
  { slug: 'dodge', name: 'Dodge', description: 'Until your next turn, attacks against you have Disadvantage if you can see the attacker, and you make Dexterity saves with Advantage.' },
  { slug: 'help', name: 'Help', description: 'Give an ally Advantage on an ability check or on their next attack against a creature within 5 feet of you.' },
  { slug: 'hide', name: 'Hide', description: 'Make a Dexterity (Stealth) check to become hidden. You need cover or heavy obscurement, out of sight of enemies.' },
  { slug: 'influence', name: 'Influence', description: 'Make a Charisma check, or a Wisdom (Animal Handling) check, to change how a creature treats you.' },
  { slug: 'magic', name: 'Magic', description: 'Cast a spell, use a magic item, or use a magical feature. Your spells are listed above.' },
  { slug: 'ready', name: 'Ready', description: 'Choose a trigger and an action. When the trigger happens before your next turn, use your Reaction to take the action.' },
  { slug: 'search', name: 'Search', description: 'Make a Wisdom check (Insight, Medicine, Perception or Survival) to notice something that is not obvious.' },
  { slug: 'study', name: 'Study', description: 'Make an Intelligence check (Arcana, History, Investigation, Nature or Religion) to recall or work something out.' },
  { slug: 'utilize', name: 'Utilize', description: 'Use an object that is not magical.' },
];

export function universalActions(): Ability[] {
  return UNIVERSAL.map((u): Ability => ({
    key: `universal:${u.slug}:base`,
    name: u.name,
    source: 'universal',
    timing: 'action',
    roll: { kind: 'none' },
    cost: { kind: 'none' },
    poolKey: null,
    tags: [],
    concentration: false,
    ritual: false,
    range: null,
    area: false,
    description: u.description,
    notes: [],
    tagSource: 'none',
  }));
}
