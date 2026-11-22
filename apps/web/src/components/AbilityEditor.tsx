import { TAGS, type Ability, type ResetType, type Roll, type Tag, type Timing } from '@cw/model';
import { canEditUses, diffEdit, editForm, normaliseRoll, type EditForm } from '@cw/rules';
import { useId, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { RollEditor } from './RollEditor';
import { ALERT, BUTTON, CHECK, INPUT, LABEL, PRIMARY } from './fieldStyles';

const TIMING_OPTIONS: { value: Timing; label: string }[] = [
  { value: 'action', label: 'Action' },
  { value: 'bonus', label: 'Bonus Action' },
  { value: 'reaction', label: 'Reaction' },
  { value: 'free', label: 'No action needed' },
  { value: 'passive', label: 'Passive' },
  { value: 'long', label: 'Takes a minute or more' },
];

const RESET_OPTIONS: { value: ResetType; label: string }[] = [
  { value: 'short', label: 'Short Rest' },
  { value: 'long', label: 'Long Rest' },
  { value: 'never', label: 'Never' },
];

/** "Unknown" is something the import says, not something a player chooses, so it is offered only to keep. */
const UNKNOWN = { value: 'unknown', label: 'Unknown' } as const;

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** What the form holds while it is open. The uses are kept apart so that unticking them forgets nothing. */
interface Draft extends Omit<EditForm, 'uses'> {
  limited: boolean;
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
}

/** Changes one ability: when it is used, what it costs, how it is tagged, where it is listed and what it rolls. */
export function AbilityEditor({ ability, onClose }: { ability: Ability; onClose: () => void }) {
  const sheet = useStore((s) => s.sheet);
  const baseSheet = useStore((s) => s.baseSheet);
  const setEdit = useStore((s) => s.setEdit);
  const id = useId();
  const [start] = useState<EditForm | null>(() => (sheet ? editForm(sheet, ability) : null));
  const [draft, setDraft] = useState<Draft | null>(() =>
    start ? { ...start, limited: start.uses !== null, max: start.uses?.max ?? 1, reset: start.uses?.reset ?? 'long' } : null);
  const [error, setError] = useState<string | null>(null);

  if (!sheet || !baseSheet || !start || !draft) return null;

  const change = (next: Partial<Draft>): void => {
    setDraft({ ...draft, ...next });
    setError(null);
  };
  const usesEditable = canEditUses(ability);
  const timings = start.timing === 'unknown' ? [...TIMING_OPTIONS, UNKNOWN] : TIMING_OPTIONS;
  const resets = start.uses?.reset === 'unknown' ? [...RESET_OPTIONS, UNKNOWN] : RESET_OPTIONS;
  const canRestore = sheet.edited.includes(ability.key) && ability.source !== 'custom';

  function save(event: FormEvent): void {
    event.preventDefault();
    if (!sheet || !baseSheet || !start || !draft) return;
    if (usesEditable && draft.limited && !(Number.isInteger(draft.max) && draft.max >= 1 && draft.max <= 99)) {
      setError('Set the maximum uses, from 1 to 99.');
      return;
    }
    // A roll the player did not touch is kept exactly as it is; one they changed must be a finished roll.
    const roll: Roll | null = draft.roll === start.roll ? draft.roll : normaliseRoll(draft.roll);
    if (!roll) {
      setError('Finish the roll, or choose No roll.');
      return;
    }
    const base = [...baseSheet.abilities, ...baseSheet.universal].find((a) => a.key === ability.key);
    if (!base) return;
    const form: EditForm = {
      timing: draft.timing,
      uses: usesEditable && draft.limited ? { max: draft.max, reset: draft.reset } : null,
      tags: draft.tags,
      roll,
      inCombat: draft.inCombat,
      inExplore: draft.inExplore,
      hidden: draft.hidden,
    };
    setEdit(ability.key, diffEdit(baseSheet, base, form));
    onClose();
  }

  const toggleTag = (tag: Tag): void =>
    // Kept in the order the tags are listed, whatever order they were tapped in.
    change({ tags: TAGS.filter((t) => (t === tag ? !draft.tags.includes(t) : draft.tags.includes(t))) });

  return (
    <Dialog title={`Edit ${ability.name}`} onClose={onClose}>
      <form onSubmit={save} noValidate className="mt-3 space-y-4">
        <div>
          <label htmlFor={`${id}-timing`} className={LABEL}>Timing</label>
          <select
            id={`${id}-timing`}
            value={draft.timing}
            onChange={(event) => change({ timing: event.target.value as Timing })}
            className={INPUT}
          >
            {timings.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        {usesEditable ? (
          <div className="space-y-3">
            <label className={CHECK}>
              <input type="checkbox" checked={draft.limited} onChange={(event) => change({ limited: event.target.checked })} className="size-5" />
              <span>Limited uses</span>
            </label>
            {draft.limited ? (
              <>
                <div>
                  <label htmlFor={`${id}-max`} className={LABEL}>Maximum uses</label>
                  <input
                    id={`${id}-max`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={Number.isFinite(draft.max) ? draft.max : ''}
                    onChange={(event) => change({ max: event.target.value.trim() === '' ? Number.NaN : Number(event.target.value) })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-reset`} className={LABEL}>Comes back on</label>
                  <select
                    id={`${id}-reset`}
                    value={draft.reset}
                    onChange={(event) => change({ reset: event.target.value as ResetType })}
                    className={INPUT}
                  >
                    {resets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">This ability costs a spell slot.</p>
        )}

        <fieldset>
          <legend className={LABEL}>Tags</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {TAGS.map((tag) => {
              const on = draft.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                  className={`min-h-11 rounded-full border px-3 py-1.5 text-sm ${
                    on ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {capitalised(tag)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className={LABEL}>Shown in</legend>
          <div className="flex gap-6">
            <label className={CHECK}>
              <input type="checkbox" checked={draft.inCombat} onChange={(event) => change({ inCombat: event.target.checked })} className="size-5" />
              <span>Combat</span>
            </label>
            <label className={CHECK}>
              <input type="checkbox" checked={draft.inExplore} onChange={(event) => change({ inExplore: event.target.checked })} className="size-5" />
              <span>Explore</span>
            </label>
          </div>
        </fieldset>

        <RollEditor value={draft.roll} onChange={(roll) => change({ roll })} />

        <label className={CHECK}>
          <input type="checkbox" checked={draft.hidden} onChange={(event) => change({ hidden: event.target.checked })} className="size-5" />
          <span>Hide this ability</span>
        </label>

        {error ? <p role="alert" className={ALERT}>{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={PRIMARY}>Save</button>
          <button type="button" onClick={onClose} className={BUTTON}>Cancel</button>
          {canRestore ? (
            <button
              type="button"
              onClick={() => {
                setEdit(ability.key, {});
                onClose();
              }}
              className={`${BUTTON} ml-auto`}
            >
              Back to imported
            </button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
