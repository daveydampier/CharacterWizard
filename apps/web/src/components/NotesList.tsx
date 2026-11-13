import { abilityLabel, skillLabel, type Note } from '@cw/rules';

/** What a note is about, for a list where the note does not sit on its own row. */
export function noteSubject(note: Note): string | null {
  if (note.target.kind === 'skill') return skillLabel(note.target.skill);
  if (note.target.kind === 'save') return `${abilityLabel(note.target.ability)} save`;
  return null;
}

interface Props {
  notes: Note[];
  /** Shown when there are no notes. */
  empty: string;
}

/** The "Keep in mind" list: conditional modifiers from the sheet, never applied to a number. */
export function NotesList({ notes, empty }: Props) {
  if (notes.length === 0) return <p className="py-2 text-sm text-slate-600">{empty}</p>;
  return (
    <ul className="list-disc py-2 pl-5 text-sm">
      {notes.map((note) => {
        const subject = noteSubject(note);
        const text = subject ? `${subject}: ${note.text}` : note.text;
        return <li key={text}>{text}</li>;
      })}
    </ul>
  );
}
