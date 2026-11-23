import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no `showModal` or `close` on <dialog>. These stand in for what the app relies on:
// `showModal` refuses a dialog that is already open, marks it open and moves focus into it (to its
// first focusable element, or the dialog itself); `close` marks it closed and sends a `close` event.
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
    if (this.hasAttribute('open')) throw new DOMException('The dialog is already open.', 'InvalidStateError');
    this.setAttribute('open', '');
    const first = this.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus();
    else {
      // A dialog takes focus itself when nothing in it can; jsdom focuses only what has a tab index.
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '-1');
      this.focus();
    }
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
  // Local development's stand-in account remembers its sign-in here.
  window.localStorage.clear();
});
