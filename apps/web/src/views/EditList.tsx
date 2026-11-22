import { arrayMove } from '@dnd-kit/sortable';
import type { Ability, ViewName } from '@cw/model';
import { combatGroups, exploreAbilities, hiddenByDefault, withHidden, type CombatGroupName, type Sheet } from '@cw/rules';
import { useMemo } from 'react';
import { ArrangeSection } from '../components/ArrangeSection';
import { HiddenDrawer } from '../components/HiddenDrawer';
import { rowLabel } from '../components/rowLabel';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { useStore } from '../store';

/** The Combat view's groups, in the order the view shows them. */
const COMBAT_SECTIONS: { group: CombatGroupName; title: string }[] = [
  { group: 'action', title: 'Action' },
  { group: 'bonus', title: 'Bonus Action' },
  { group: 'reaction', title: 'Reaction' },
  { group: 'other', title: 'Other' },
  { group: 'free', title: 'No action needed' },
  { group: 'passive', title: 'Always on' },
  { group: 'universal', title: 'Anyone can do this' },
];

/**
 * A section's keys after the row `activeKey` is dropped on the row `overKey`: the dragged row
 * takes that place and the rows between shift by one. Unchanged when either key is not in the list.
 */
export function moved(keys: string[], activeKey: string, overKey: string): string[] {
  const from = keys.indexOf(activeKey);
  const to = keys.indexOf(overKey);
  return from < 0 || to < 0 || from === to ? keys : arrayMove(keys, from, to);
}

interface Props {
  view: ViewName;
  sheet: Sheet;
  onDone: () => void;
}

/**
 * A view while it is being arranged: the same rows under the same headings, each with a handle
 * instead of a Use button. Rows are put in order, edited, hidden and restored here, and abilities
 * of the player's own are added.
 */
export function EditList({ view, sheet, onDone }: Props) {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const setOrder = useStore((s) => s.setOrder);
  const { edit, add, editor } = useAbilityEdit();

  const sections = useMemo(() => {
    const groups = combatGroups(sheet);
    const all = view === 'combat'
      ? COMBAT_SECTIONS.map(({ group, title }) => ({ title, abilities: groups[group] }))
      : [{ title: 'Abilities', abilities: exploreAbilities(sheet) }];
    return all.filter((section) => section.abilities.length > 0);
  }, [view, sheet]);

  /** A feature that D&D Beyond hides starts hidden, so hiding and restoring record only a choice that differs. */
  const setHidden = (ability: Ability, hidden: boolean): void =>
    setEdit(ability.key, withHidden(edits.abilities[ability.key], hidden, hiddenByDefault(sheet, ability.key)));

  /** Dragging and the two buttons both end here: the whole section's keys go to the store in their new order. */
  function reorder(keys: string[], activeKey: string, overKey: string): void {
    const next = moved(keys, activeKey, overKey);
    if (next !== keys) setOrder(view, next);
  }

  return (
    <div>
      {sections.map(({ title, abilities }) => (
        <ArrangeSection
          key={title}
          title={title}
          items={abilities.map((ability) => ({ ability, label: rowLabel(ability, sheet) }))}
          onMove={(activeKey, overKey) => reorder(abilities.map((a) => a.key), activeKey, overKey)}
          onEdit={edit}
          onHide={(ability) => setHidden(ability, true)}
        />
      ))}

      <HiddenDrawer hidden={sheet.hidden} onRestore={(ability) => setHidden(ability, false)} />

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={add} className="min-h-11 flex-1 rounded-lg border border-slate-400 px-3 py-2 font-medium">
          Add an ability
        </button>
        <button type="button" onClick={onDone} className="min-h-11 flex-1 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
          Done
        </button>
      </div>

      {editor}
    </div>
  );
}
