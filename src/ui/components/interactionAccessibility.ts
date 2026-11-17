import { useEffect } from 'react';

/** Extracts clean modal title text excluding the close button ("×") */
function getCleanModalTitle(modal: HTMLElement): string {
  const titleEl = modal.querySelector<HTMLElement>('.dt-modal-title');
  if (!titleEl) return 'Диалог';
  const labelEl = titleEl.querySelector<HTMLElement>('strong, span, [id$="-title"]');
  if (labelEl) {
    const text = labelEl.textContent?.trim();
    if (text) return text;
  }
  // Fallback: extract text nodes directly without button text
  const clone = titleEl.cloneNode(true) as HTMLElement;
  for (const btn of clone.querySelectorAll('button')) {
    btn.remove();
  }
  return clone.textContent?.trim() || 'Диалог';
}

/** Finds the best initial element to focus when modal opens */
function getInitialFocusElement(modal: HTMLElement): HTMLElement | null {
  // 1. Explicit autofocus / data-autofocus inside modal
  const explicit = modal.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
  if (explicit && explicit.getClientRects().length > 0) return explicit;

  // 2. First form input, select, textarea, or button in modal body
  const bodyControls = Array.from(
    modal.querySelectorAll<HTMLElement>(
      '.dt-modal-body input:not([disabled]):not([type="hidden"]), .dt-modal-body select:not([disabled]), .dt-modal-body textarea:not([disabled]), .dt-modal-body button:not([disabled]), .dt-modal-body [tabindex="0"]'
    )
  ).filter((el) => el.getClientRects().length > 0);
  if (bodyControls.length > 0) return bodyControls[0];

  // 3. Primary action button in modal footer
  const footerPrimary = modal.querySelector<HTMLElement>('.dt-modal-footer button.primary:not([disabled]), .dt-modal-footer button[type="submit"]:not([disabled])');
  if (footerPrimary && footerPrimary.getClientRects().length > 0) return footerPrimary;

  // 4. Any focusable control excluding the title close button
  const allControls = Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    )
  ).filter((el) => el.getClientRects().length > 0 && !el.closest('.dt-modal-title'));
  if (allControls.length > 0) return allControls[0];

  return modal;
}

/** Dialog focus handling, accessibility trap, and keyboard activation for enterprise CAD. */
export function useInteractionAccessibility() {
  useEffect(() => {
    interface ModalRecord {
      modal: HTMLElement;
      opener: HTMLElement | null;
    }
    const modalStack: ModalRecord[] = [];
    let currentModal: HTMLElement | null = null;

    const restoreEditorFocus = (opener: HTMLElement | null) => {
      if (opener && opener.isConnected) {
        opener.focus();
        return;
      }
      // If opener was in a closed menu or destroyed element, fall back to canvas
      const canvas = document.querySelector<HTMLElement>(
        '.dt-canvas-wrap canvas, .dt-center-col canvas, canvas[tabindex="0"]'
      );
      if (canvas) {
        canvas.focus();
      }
    };

    const enhance = () => {
      for (const el of document.querySelectorAll<HTMLElement>('.dt-lib-item, .dt-comp-item, .dt-tree-row')) {
        if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      }

      const activeModals = Array.from(document.querySelectorAll<HTMLElement>('.dt-modal'));
      const topModal = activeModals.length > 0 ? activeModals[activeModals.length - 1] : null;

      if (topModal !== currentModal) {
        if (topModal) {
          // A modal has opened
          const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          modalStack.push({ modal: topModal, opener });
          currentModal = topModal;

          topModal.setAttribute('role', 'dialog');
          topModal.setAttribute('aria-modal', 'true');
          if (!topModal.hasAttribute('aria-label') && !topModal.hasAttribute('aria-labelledby')) {
            topModal.setAttribute('aria-label', getCleanModalTitle(topModal));
          }

          setTimeout(() => {
            if (!topModal.contains(document.activeElement)) {
              const target = getInitialFocusElement(topModal);
              target?.focus();
            }
          }, 0);
        } else {
          // All modals closed
          currentModal = null;
          const last = modalStack.pop();
          // A dialog may already have restored focus during its unmount.
          if (document.activeElement === document.body || !document.activeElement?.isConnected) {
            restoreEditorFocus(last?.opener ?? null);
          }
        }
      }
    };

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();

    const onKeyDown = (e: KeyboardEvent) => {
      if (currentModal && currentModal.isConnected) {
        const focusables = Array.from(
          currentModal.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.getClientRects().length > 0);

        // Tab trapping
        if (e.key === 'Tab') {
          if (focusables.length === 0) {
            e.preventDefault();
            currentModal.focus();
            return;
          }
          const activeEl = document.activeElement as HTMLElement | null;
          const i = activeEl ? focusables.indexOf(activeEl) : -1;

          if (e.shiftKey) {
            if (i <= 0) {
              e.preventDefault();
              focusables[focusables.length - 1].focus();
            }
          } else {
            if (i === focusables.length - 1 || i < 0) {
              e.preventDefault();
              focusables[0].focus();
            }
          }
          return;
        }

        // Enter key in single-line inputs without an enclosing form
        if (e.key === 'Enter') {
          const target = e.target as HTMLElement;
          if (target && target.matches('input:not([type="button"]):not([type="submit"]):not([type="reset"])') && !target.closest('form')) {
            const primaryBtn = currentModal.querySelector<HTMLButtonElement>(
              '.dt-modal-footer button.primary, .dt-modal-footer button[type="submit"]'
            );
            if (primaryBtn && !primaryBtn.disabled) {
              e.preventDefault();
              primaryBtn.click();
              return;
            }
          }
        }

        // Escape key to dismiss dialog
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          const closeBtn =
            currentModal.querySelector<HTMLButtonElement>('.dt-modal-title button') ??
            Array.from(currentModal.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
              /^(Отмена|Закрыть|×)$/.test(b.textContent?.trim() ?? '')
            );
          closeBtn?.click();
          return;
        }
        return;
      }

      // Non-modal list navigation
      const target = e.target as HTMLElement;
      if (!target) return;
      if ((e.key === 'Enter' || e.key === ' ') && target.matches('div.dt-lib-item, div.dt-comp-item, div.dt-tree-row')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        target.click();
      }
      if (['ArrowDown', 'ArrowUp'].includes(e.key) && target.matches('.dt-lib-item, .dt-comp-item, .dt-tree-row')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const parent = target.parentElement;
        if (!parent) return;
        const items = Array.from(parent.children).filter((el) => (el as HTMLElement).tabIndex === 0) as HTMLElement[];
        const idx = items.indexOf(target);
        if (idx >= 0 && items.length > 0) {
          const nextIdx = (idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
          items[nextIdx]?.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
