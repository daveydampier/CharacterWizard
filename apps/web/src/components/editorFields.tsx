import { TAGS, type ResetType, type Tag, type Timing } from '@cw/model';
import { defaultViews } from '@cw/rules';
import { useId } from 'react';
import { CHECK, INPUT, LABEL } from './fieldStyles';

/** The fields the ability editor and the custom ability editor have in common. */

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

export const ROLL_ERROR = 'Finish the roll, or choose No roll.';
export const MAX_USES_ERROR = 'Set the maximum uses, from 1 to 99.';

/** True for a maximum the app can store. The field is not a number while it is empty. */
export const validMaxUses = (max: number): boolean => Number.isInteger(max) && max >= 1 && max <= 99;

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

interface TimingProps {
  value: Timing;
  onChange: (timing: Timing) => void;
  /** Offer "Unknown": true only for an ability whose timing is unknown already. */
  allowUnknown: boolean;
}

export function TimingSelect({ value, onChange, allowUnknown }: TimingProps) {
  const id = useId();
  const options = allowUnknown ? [...TIMING_OPTIONS, UNKNOWN] : TIMING_OPTIONS;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>Timing</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as Timing)} className={INPUT}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

interface UsesProps {
  /** Not a number while the field is empty. */
  max: number;
  reset: ResetType;
  onChange: (change: { max?: number; reset?: ResetType }) => void;
  /** Offer "Unknown": true only for a pool whose reset is unknown already. */
  allowUnknown: boolean;
}

/** How many uses a pool has and when they come back. */
export function UsesFields({ max, reset, onChange, allowUnknown }: UsesProps) {
  const id = useId();
  const options = allowUnknown ? [...RESET_OPTIONS, UNKNOWN] : RESET_OPTIONS;
  return (
    <>
      <div>
        <label htmlFor={`${id}-max`} className={LABEL}>Maximum uses</label>
        <input
          id={`${id}-max`}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={Number.isFinite(max) ? max : ''}
          onChange={(event) => onChange({ max: event.target.value.trim() === '' ? Number.NaN : Number(event.target.value) })}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor={`${id}-reset`} className={LABEL}>Comes back on</label>
        <select id={`${id}-reset`} value={reset} onChange={(event) => onChange({ reset: event.target.value as ResetType })} className={INPUT}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </>
  );
}

/** The nine tags as toggles. The tags stay in the order they are listed, whatever order they are tapped in. */
export function TagToggles({ value, onChange }: { value: Tag[]; onChange: (tags: Tag[]) => void }) {
  return (
    <fieldset>
      <legend className={LABEL}>Tags</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {TAGS.map((tag) => {
          const on = value.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(TAGS.filter((t) => (t === tag ? !on : value.includes(t))))}
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
  );
}

/** Which of the two "Shown in" boxes the player has set themselves, now or in an earlier edit. */
export interface ViewsChosen {
  combat: boolean;
  explore: boolean;
}

interface ViewsDraft {
  timing: Timing;
  tags: Tag[];
  inCombat: boolean;
  inExplore: boolean;
}

/**
 * A form's draft with `next` applied. A "Shown in" box the player has not set follows the app's
 * rule, so that giving an ability a tag that belongs in Explore lists it there without a second
 * tap. A box the player has set stays where they put it.
 */
export function withViews<D extends ViewsDraft>(
  draft: D, next: Partial<D>, chosen: ViewsChosen, ritual: boolean,
): { draft: D; chosen: ViewsChosen } {
  const merged: D = { ...draft, ...next };
  const now: ViewsChosen = {
    combat: chosen.combat || next.inCombat !== undefined,
    explore: chosen.explore || next.inExplore !== undefined,
  };
  if (next.timing !== undefined || next.tags !== undefined) {
    const auto = defaultViews({ timing: merged.timing, tags: merged.tags, ritual });
    if (!now.combat) merged.inCombat = auto.combat;
    if (!now.explore) merged.inExplore = auto.explore;
  }
  return { draft: merged, chosen: now };
}

interface ShownInProps {
  inCombat: boolean;
  inExplore: boolean;
  onChange: (change: { inCombat?: boolean; inExplore?: boolean }) => void;
}

/** Which of the two views list the ability. */
export function ShownIn({ inCombat, inExplore, onChange }: ShownInProps) {
  return (
    <fieldset>
      <legend className={LABEL}>Shown in</legend>
      <div className="flex gap-6">
        <label className={CHECK}>
          <input type="checkbox" checked={inCombat} onChange={(event) => onChange({ inCombat: event.target.checked })} className="size-5" />
          <span>Combat</span>
        </label>
        <label className={CHECK}>
          <input type="checkbox" checked={inExplore} onChange={(event) => onChange({ inExplore: event.target.checked })} className="size-5" />
          <span>Explore</span>
        </label>
      </div>
    </fieldset>
  );
}
