import type { Feature } from '@cw/model';
import { featureLine, type Sheet } from '@cw/rules';
import { useState } from 'react';
import { Description } from '../components/Description';

/** One feature: its name, where it comes from, and the description on tap. Nothing here is used or spent. */
function FeatureRow({ feature }: { feature: Feature }) {
  const [open, setOpen] = useState(false);
  const line = featureLine(feature);
  return (
    <article aria-label={feature.name} className="border-t border-slate-200 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 w-full text-left">
        <span className="font-medium">{feature.name}</span>
        {feature.playKeys.length > 0 ? (
          <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-900">In play</span>
        ) : null}
        {line ? <span className="block text-sm text-slate-600">{line}</span> : null}
      </button>
      {open ? <div className="mt-2 rounded-lg bg-slate-100 p-2"><Description html={feature.description} /></div> : null}
    </article>
  );
}

/** What the character has: every feature on the sheet, under a heading for where it comes from. */
export function FeaturesView({ sheet }: { sheet: Sheet }) {
  if (sheet.features.length === 0) return <p className="py-2 text-sm text-slate-600">This sheet lists no features.</p>;
  return (
    <div>
      {sheet.features.map((group) => (
        <section key={group.key} aria-label={group.heading} className="mt-4 first:mt-0">
          <h2 className="text-sm font-medium text-slate-700">{group.heading}</h2>
          {group.items.map((item) => (
            <div key={item.feature.key}>
              <FeatureRow feature={item.feature} />
              {item.options.length > 0 ? (
                <div role="group" aria-label={`${item.feature.name} options`} className="ml-4">
                  {item.options.map((option) => <FeatureRow key={option.key} feature={option} />)}
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
