import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('stays open on a click inside it', async () => {
    const { dialog, onClose } = open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Inside' }));
    await userEvent.click(within(dialog).getByRole('heading', { name: 'Pick a slot' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
