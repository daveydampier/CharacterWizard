import { ABILITIES, type AbilityName, type DamagePart, type Roll } from '@cw/model';
import { abilityLabel } from '@cw/rules';
import { useId, type ReactNode } from 'react';
import { INPUT, LABEL } from './fieldStyles';

type Kind = Roll['kind'];

const KIND_LABEL: Record<Kind, string> = {
  none: 'No roll',
  attack: 'Attack roll',
  save: 'Saving throw',
  damage: 'Damage only',
  dice: 'Dice only',
  check: 'Ability check',
};

/** The kinds a player can choose. An ability check is offered only for a roll that already is one. */
const CHOICES: Kind[] = ['none', 'attack', 'save', 'damage', 'dice'];

/** The roll a kind starts from when the player switches to it. */
function blank(kind: Kind): Roll {
  switch (kind) {
    case 'attack':
      return { kind, bonus: 0, damage: [], optionalDamage: [] };
    case 'save':
      return { kind, ability: 'str', dc: 10, damage: [] };
    case 'damage':
      return { kind, damage: [] };
    case 'dice':
      return { kind, dice: '' };
    case 'check':
      return { kind, bonus: 0 };
    default:
      return { kind: 'none' };
  }
}

/** `damage` with its first part changed. Any further parts are kept as they are. */
function withFirst(damage: DamagePart[], change: Partial<DamagePart>): DamagePart[] {
  const first: DamagePart = { dice: damage[0]?.dice ?? '', type: damage[0]?.type ?? null, ...change };
  return [first, ...damage.slice(1)];
}

/** An empty number field is not a number yet; the form that holds the roll decides what to say about it. */
const numberFrom = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));
const numberText = (value: number): number | string => (Number.isFinite(value) ? value : '');

interface Props {
  value: Roll;
  /** Called with every change, including rolls that are not finished yet (empty dice, an empty number). */
  onChange: (roll: Roll) => void;
}

/**
 * The fields for one roll: its kind, then what that kind needs. It edits the first damage part
 * only; further parts, and an attack's optional damage, stay as they are until the kind changes.
 */
export function RollEditor({ value, onChange }: Props) {
  const id = useId();
  const kinds = value.kind === 'check' ? [...CHOICES, value.kind] : CHOICES;

  const field = (name: string, label: string, control: (fieldId: string) => ReactNode): ReactNode => (
    <div>
      <label htmlFor={`${id}-${name}`} className={LABEL}>{label}</label>
      {control(`${id}-${name}`)}
    </div>
  );

  const number = (name: string, label: string, current: number, change: (n: number) => void): ReactNode =>
    field(name, label, (fieldId) => (
      <input
        id={fieldId}
        type="number"
        inputMode="numeric"
        value={numberText(current)}
        onChange={(event) => change(numberFrom(event.target.value))}
        className={INPUT}
      />
    ));

  const text = (name: string, label: string, current: string, change: (text: string) => void, hint?: string): ReactNode =>
    field(name, label, (fieldId) => (
      <input
        id={fieldId}
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        placeholder={hint}
        value={current}
        onChange={(event) => change(event.target.value)}
        className={INPUT}
      />
    ));

  /** The first damage part's two fields, for the kinds that have damage. */
  const damage = (roll: Extract<Roll, { damage: DamagePart[] }>): ReactNode => (
    <>
      {text('damage', 'Damage', roll.damage[0]?.dice ?? '', (dice) => onChange({ ...roll, damage: withFirst(roll.damage, { dice }) }), '1d8+3')}
      {text('type', 'Damage type', roll.damage[0]?.type ?? '', (type) =>
        onChange({ ...roll, damage: withFirst(roll.damage, { type: type === '' ? null : type }) }))}
    </>
  );

  return (
    <div className="space-y-3">
      {field('kind', 'Roll', (fieldId) => (
        <select
          id={fieldId}
          value={value.kind}
          onChange={(event) => onChange(blank(event.target.value as Kind))}
          className={INPUT}
        >
          {kinds.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
        </select>
      ))}

      {value.kind === 'attack' ? (
        <>
          {number('bonus', 'Attack bonus', value.bonus, (bonus) => onChange({ ...value, bonus }))}
          {damage(value)}
        </>
      ) : null}

      {value.kind === 'save' ? (
        <>
          {field('ability', 'Save', (fieldId) => (
            <select
              id={fieldId}
              value={value.ability}
              onChange={(event) => onChange({ ...value, ability: event.target.value as AbilityName })}
              className={INPUT}
            >
              {ABILITIES.map((ability) => <option key={ability} value={ability}>{abilityLabel(ability)}</option>)}
            </select>
          ))}
          {number('dc', 'DC', value.dc, (dc) => onChange({ ...value, dc }))}
          {damage(value)}
        </>
      ) : null}

      {value.kind === 'damage' ? damage(value) : null}

      {value.kind === 'dice' ? text('dice', 'Dice', value.dice, (dice) => onChange({ ...value, dice }), '2d6') : null}

      {value.kind === 'check' ? number('bonus', 'Bonus', value.bonus, (bonus) => onChange({ ...value, bonus })) : null}
    </div>
  );
}
