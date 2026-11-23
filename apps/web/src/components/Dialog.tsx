import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Called when the player dismisses the dialog: Escape, a tap outside it, or the browser closing it. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal bottom sheet. It is a native `<dialog>` opened with `showModal`, so the browser moves
 * focus into it, keeps it there, and closes it on Escape. The dialog is open for as long as it is
 * rendered: whoever renders it stops rendering it when `onClose` is called. When it goes, focus
 * goes back to what had it before the dialog opened, as the browser's own `close()` would do.
 */
export function Dialog({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  /** How many `close` events the cleanup below has caused that have not yet arrived. */
  const closing = useRef(0);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    // Remembered before `showModal` moves focus into the dialog. When React runs this effect twice
    // in development, the cleanup in between has already given focus back, so this is still right.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) {
        closing.current += 1;
        dialog.close();
      }
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        // The `close` that the cleanup above caused is not a dismissal. A browser sends it a moment
        // after `close()`, by which time React may have run the effect again and reopened the dialog.
        if (closing.current > 0) {
          closing.current -= 1;
          return;
        }
        onClose();
      }}
      onCancel={(event) => {
        // The dialog closes by no longer being rendered, not by the browser closing it first.
        event.preventDefault();
        onClose();
      }}
      // The padding is on the inner element, so a click whose target is the dialog is on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="mx-auto mb-0 mt-auto w-full max-w-md rounded-t-2xl bg-white p-0 text-slate-900 backdrop:bg-slate-900/40"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-4">
        <h2 id={titleId} className="font-medium">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
