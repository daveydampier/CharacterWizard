import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

afterEach(() => {
  vi.restoreAllMocks();
});

function open() {
  const onClose = vi.fn();
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  render(
    <Dialog title="Pick a slot" onClose={onClose}>
      <button type="button">Inside</button>
    </Dialog>,
  );
  return { dialog: screen.getByRole('dialog', { name: 'Pick a slot' }), onClose, showModal };
}

/** A button that opens the dialog; the dialog goes when it is dismissed or something in it is picked. */
function Opener({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Dialog title="Pick a slot" onClose={close}>
          <button type="button" onClick={() => setOpen(false)}>Pick</button>
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('opens as a modal dialog, labelled by its title', () => {
    const { dialog, showModal } = open();
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Pick a slot' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Inside' })).toBeInTheDocument();
  });

  it('calls onClose on Escape, which the browser reports as a cancel event', () => {
    const { dialog, onClose } = open();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the browser closes it', () => {
    const { dialog, onClose } = open();
    fireEvent(dialog, new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on a click on the backdrop', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into itself when it opens, and gives it back to what opened it when it goes', async () => {
    render(<Opener />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Pick a slot' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pick' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('calls onClose once for Escape, and not again when it then goes, and stops the browser closing it first', async () => {
    const onClose = vi.fn();
    render(<Opener onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('dialog', { name: 'Pick a slot' }), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('ends up open, and gives focus back to what opened it, when React runs its effect twice', async () => {
    const onClose = vi.fn();
    render(<StrictMode><Opener onClose={onClose} /></StrictMode>);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Pick a slot' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pick' }));
    expect(trigger).toHaveFocus();
  });

  it('stays open on a click inside it', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Inside' }));
    await userEvent.click(within(dialog).getByRole('heading', { name: 'Pick a slot' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
