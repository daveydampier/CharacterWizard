import { TAGS, type ResetType, type Roll, type Tag, type Timing } from '@cw/model';
import { ROLL_BONUS_RANGE, ROLL_DC_RANGE, defaultViews, normaliseRoll } from '@cw/rules';
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

type Range = { readonly min: number; readonly max: number };
const outside = (value: number, range: Range): boolean =>
  Number.isFinite(value) && (!Number.isInteger(value) || value < range.min || value > range.max);

/**
 * What is wrong with the numbers of a roll the player changed, in words; null when nothing is.
 * A number the app would have to change to store (out of range, or a fraction) is refused, and
 * so is a damage part with a type and no dice, which would be dropped. An empty number is not
 * caught here: that is an unfinished roll.
 */
export function rollError(roll: Roll): string | null {
  if (roll.kind === 'attack' && outside(roll.bonus, ROLL_BONUS_RANGE)) {
    return `Set the attack bonus, from ${ROLL_BONUS_RANGE.min} to ${ROLL_BONUS_RANGE.max}.`;
  }
  if (roll.kind === 'check' && outside(roll.bonus, ROLL_BONUS_RANGE)) {
    return `Set the bonus, from ${ROLL_BONUS_RANGE.min} to ${ROLL_BONUS_RANGE.max}.`;
  }
  if (roll.kind === 'save' && outside(roll.dc, ROLL_DC_RANGE)) return `Set the DC, from ${ROLL_DC_RANGE.min} to ${ROLL_DC_RANGE.max}.`;
  const parts = roll.kind === 'attack' ? [...roll.damage, ...roll.optionalDamage]
    : roll.kind === 'save' || roll.kind === 'damage' ? roll.damage : [];
  if (parts.some((p) => (p.type ?? '').trim() !== '' && p.dice.trim() === '')) return 'Give the damage its dice, or clear its type.';
  return null;
}

/**
 * The roll to save, or the message saying why it cannot be saved. A roll the player did not touch
 * (`roll` is `start`) is kept exactly as it is.
 */
export function checkedRoll(roll: Roll, start: Roll | null): { roll: Roll } | { error: string } {
  if (roll === start) return { roll };
  const problem = rollError(roll);
  if (problem) return { error: problem };
  const normalised = normaliseRoll(roll);
  return normalised ? { roll: normalised } : { error: ROLL_ERROR };
}

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
 * tap. A box the player has set stays where they put it. `row` is the ability being edited: a
 * feature's boxes follow nothing, because the app never lists a feature unasked.
 */
export function withViews<D extends ViewsDraft>(
  draft: D, next: Partial<D>, chosen: ViewsChosen, row: { key?: string; ritual: boolean },
): { draft: D; chosen: ViewsChosen } {
  const merged: D = { ...draft, ...next };
  const now: ViewsChosen = {
    combat: chosen.combat || next.inCombat !== undefined,
    explore: chosen.explore || next.inExplore !== undefined,
  };
  if (next.timing !== undefined || next.tags !== undefined) {
    const auto = defaultViews({ key: row.key, timing: merged.timing, tags: merged.tags, ritual: row.ritual });
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
