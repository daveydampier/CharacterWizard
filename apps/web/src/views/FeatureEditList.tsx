import type { Feature } from '@cw/model';
import { withHidden, type FeatureItem, type Sheet } from '@cw/rules';
import { useMemo } from 'react';
import { ArrangeSection } from '../components/ArrangeSection';
import { HiddenDrawer } from '../components/HiddenDrawer';
import { featureLabeller } from '../components/featureLabel';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { useStore } from '../store';
import { moved } from './EditList';

const TEXT = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-indigo-700';

interface Props {
  sheet: Sheet;
  onDone: () => void;
}

/**
 * The Features page while it is being arranged: the same features under the same headings, each
 * with a handle. Features are put in order within their group, edited, hidden and restored here.
 * An option stays under its feature and moves with it. Nothing is added here: a feature comes
 * from the sheet.
 */
export function FeatureEditList({ sheet, onDone }: Props) {
  const edits = useStore((s) => s.edits);
  const setEdit = useStore((s) => s.setEdit);
  const setOrder = useStore((s) => s.setOrder);
  const { edit, editor } = useAbilityEdit();
  /** Two features with the same name are told apart by what their buttons are called. */
  const labelOf = useMemo(() => featureLabeller(sheet), [sheet]);

  /** A feature that D&D Beyond hides starts hidden, so only a choice that differs from that is recorded. */
  const setHidden = (feature: Feature, hidden: boolean): void =>
    setEdit(feature.key, withHidden(edits.abilities[feature.key], hidden, feature.hiddenOnSheet));
  const hide = (key: string): void => {
    const feature = sheet.featureSource.list.find((f) => f.key === key);
    if (feature) setHidden(feature, true);
  };

  /** Dragging and the two buttons both end here: the whole group's keys go to the store in their new order. */
  function reorder(keys: string[], activeKey: string, overKey: string): void {
    const next = moved(keys, activeKey, overKey);
    if (next !== keys) setOrder('features', next);
  }

  const options = ({ feature, options: chosen }: FeatureItem) =>
    chosen.length === 0 ? undefined : (
      <div role="group" aria-label={`${labelOf(feature)} options`} className="ml-11">
        {chosen.map((option) => (
          <div key={option.key} className="flex items-center gap-x-1 border-t border-slate-200">
            <span className="min-w-0 flex-1">{option.name}</span>
            <button type="button" aria-label={`Edit ${labelOf(option)}`} onClick={() => edit(option)} className={TEXT}>Edit</button>
            <button type="button" aria-label={`Hide ${labelOf(option)}`} onClick={() => setHidden(option, true)} className={TEXT}>Hide</button>
          </div>
        ))}
      </div>
    );

  return (
    <div>
      {sheet.features.map((group) => {
        const keys = group.items.map((item) => item.feature.key);
        return (
          <ArrangeSection
            key={group.key}
            title={group.heading}
            items={group.items.map((item) => ({ key: item.feature.key, label: labelOf(item.feature), text: item.feature.name, below: options(item) }))}
            onMove={(activeKey, overKey) => reorder(keys, activeKey, overKey)}
            onEdit={(key) => edit({ key })}
            onHide={hide}
          />
        );
      })}

      <HiddenDrawer hidden={sheet.hiddenFeatures} label={labelOf} onRestore={(feature) => setHidden(feature, false)} />

      <button type="button" onClick={onDone} className="mt-4 min-h-11 w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white">
        Done
      </button>

      {editor}
    </div>
  );
}
