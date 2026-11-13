import { concentrationName, type Sheet } from '@cw/rules';

interface Props {
  sheet: Sheet;
  concentrationKey: string | null;
  onEnd: () => void;
}

/** What the character is concentrating on, with a way to end it. Shown in both views. */
export function ConcentrationBanner({ sheet, concentrationKey, onEnd }: Props) {
  if (concentrationKey === null) return null;
  const name = concentrationName(sheet, concentrationKey);
  return (
    <p role="status" className="mt-3 flex items-center justify-between rounded-lg bg-amber-100 px-3 py-0.5 text-sm text-amber-900">
      {/* A key that matches no ability still gets a banner, so the player can always end it. */}
      <span className="py-1.5">{name ? `Concentrating on ${name}` : 'Concentrating'}</span>
      <button type="button" onClick={onEnd} className="inline-flex min-h-11 min-w-11 items-center justify-center underline">
        End
      </button>
    </p>
  );
}
