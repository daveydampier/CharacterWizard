import type { Feature } from '@cw/model';
import { featureLine, type Sheet } from '@cw/rules';
import { useMemo, useState } from 'react';
import { Description } from '../components/Description';
import { featureLabeller } from '../components/featureLabel';
import { useAbilityEdit } from '../components/useAbilityEdit';
import { FeatureEditList } from './FeatureEditList';

interface RowProps {
  feature: Feature;
  /** The name the row and its Edit button are known by; what the row says is the plain name. */
  label: string;
  onEdit: (feature: Feature) => void;
}

/** One feature: its name, where it comes from, and on tap the description and Edit. Nothing here is used or spent. */
function FeatureRow({ feature, label, onEdit }: RowProps) {
  const [open, setOpen] = useState(false);
  const line = featureLine(feature);
  return (
    <article aria-label={label} className="border-t border-slate-200 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 w-full text-left">
        <span className="font-medium">{feature.name}</span>
        {feature.playKeys.length > 0 ? (
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-900">In play</span>
        ) : null}
        {line ? <span className="block text-sm text-slate-600">{line}</span> : null}
      </button>
      {open ? (
        <div className="mt-2 rounded-lg bg-slate-100 p-2">
          <Description html={feature.description} />
          <button
            type="button"
            aria-label={`Edit ${label}`}
            onClick={() => onEdit(feature)}
            className="mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium"
          >
            Edit
          </button>
        </div>
      ) : null}
    </article>
  );
}

/** What the character has: every feature on the sheet, under a heading for where it comes from. */
export function FeaturesView({ sheet }: { sheet: Sheet }) {
  const { edit, editor } = useAbilityEdit();
  /** True while the player is arranging the list instead of reading it. */
  const [arranging, setArranging] = useState(false);
  /** Two features with the same name are told apart by what their rows and buttons are called. */
  const labelOf = useMemo(() => featureLabeller(sheet), [sheet]);

  if (sheet.featureSource.list.length === 0) return <p className="py-2 text-sm text-slate-600">This sheet lists no features.</p>;
  if (arranging) return <FeatureEditList sheet={sheet} onDone={() => setArranging(false)} />;

  return (
    <div>
      {sheet.features.length === 0 ? (
        <p className="py-2 text-sm text-slate-600">Every feature is hidden. "Edit list" brings them back.</p>
      ) : null}
      {sheet.features.map((group) => (
        <section key={group.key} aria-label={group.heading} className="mt-4 first:mt-0">
          <h2 className="text-sm font-medium text-slate-700">{group.heading}</h2>
          {group.items.map((item) => (
            <div key={item.feature.key}>
              <FeatureRow feature={item.feature} label={labelOf(item.feature)} onEdit={edit} />
              {item.options.length > 0 ? (
                <div role="group" aria-label={`${labelOf(item.feature)} options`} className="ml-4">
                  {item.options.map((option) => <FeatureRow key={option.key} feature={option} label={labelOf(option)} onEdit={edit} />)}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ))}

      <button
        type="button"
        onClick={() => setArranging(true)}
        className="mt-4 min-h-11 w-full rounded-lg border border-slate-400 px-3 py-2 font-medium"
      >
        Edit list
      </button>

      {editor}
    </div>
  );
}
