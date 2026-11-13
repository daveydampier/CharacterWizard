import {
  ABILITIES, ABILITY_FULL, SKILLS,
  type AbilityName, type Character, type Modifier, type SkillName,
} from '@cw/model';
import { capitalise, spacedDice } from './text';

export type NoteTarget =
  | { kind: 'skill'; skill: SkillName }
  | { kind: 'save'; ability: AbilityName }
  | { kind: 'other' };

/** A conditional modifier the app shows but never applies to a number. */
export interface Note {
  target: NoteTarget;
  text: string;
}

const words = (kebab: string): string => kebab.replace(/-/g, ' ').trim();

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

const ROLL_TWICE: Record<string, string> = {
  advantage: 'roll twice, keep the higher',
  disadvantage: 'roll twice, keep the lower',
};

function noteTarget(subType: string): NoteTarget {
  const skill = SKILLS.find((s) => s === subType);
  if (skill) return { kind: 'skill', skill };
  const ability = ABILITIES.find((a) => `${ABILITY_FULL[a]}-saving-throws` === subType);
  if (ability) return { kind: 'save', ability };
  return { kind: 'other' };
}

/** "Advantage", "Bonus + 2", "Damage 1d12": the modifier's type and its amount, if it has one. */
function amountLabel(m: Modifier): string {
  let label = capitalise(words(m.type)) || 'Note';
  if (m.dice) label += ` ${spacedDice(m.dice)}`;
  else if (m.value !== null && m.value !== 0) label += ` ${m.value > 0 ? '+' : '-'} ${Math.abs(m.value)}`;
  return label;
}

function noteText(m: Modifier, target: NoteTarget): string {
  const restriction = m.restriction.trim();
  const rollTwice = Object.hasOwn(ROLL_TWICE, m.type) ? ROLL_TWICE[m.type] : null;
  let label = amountLabel(m);
  if (target.kind === 'other' && m.subType !== '') {
    // The row does not say what the note is about, so the note has to.
    label += rollTwice ? ` on ${words(m.subType)}` : `, ${words(m.subType)}`;
  }
  if (restriction !== '') return sentence(`${label}: ${restriction}`);
  if (rollTwice && target.kind !== 'other') return `${label} (${rollTwice}).`;
  return sentence(label);
}

/**
 * Every advantage or disadvantage modifier and every modifier with a restriction, as a note.
 * Notes on a skill or a saving throw name that row; everything else is 'other'.
 */
export function conditionalNotes(c: Character): Note[] {
  const out: Note[] = [];
  const seen = new Set<string>();
  for (const m of c.modifiers) {
    const conditional = m.restriction.trim() !== '';
    if (!conditional && !Object.hasOwn(ROLL_TWICE, m.type)) continue;
    const target = noteTarget(m.subType);
    const text = noteText(m, target);
    const id = `${JSON.stringify(target)}|${text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ target, text });
  }
  return out;
}
