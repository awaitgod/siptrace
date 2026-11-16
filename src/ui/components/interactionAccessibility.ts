import { useEffect } from 'react';
/** Dialog focus handling and keyboard activation shared by the classic CAD panels. */
export function useInteractionAccessibility() {
    useEffect(() => {
        let active: HTMLElement | null = null, previous: HTMLElement | null = null;
        const enhance = () => {
            for (const el of document.querySelectorAll<HTMLElement>('.dt-lib-item,.dt-comp-item,.dt-tree-row,.dt-black-bar')) {
                el.tabIndex = 0;
                el.setAttribute('role', 'button');
            }
            const modal = [...document.querySelectorAll<HTMLElement>('.dt-modal')].at(-1) ?? null;
            if (modal !== active) {
                if (modal) {
                    previous = document.activeElement as HTMLElement;
                    active = modal;
                    modal.setAttribute('role', 'dialog');
                    modal.setAttribute('aria-modal', 'true');
                    if(!modal.hasAttribute('aria-label'))modal.setAttribute('aria-label', modal.querySelector('.dt-modal-title')?.textContent ?? 'Диалог');
                    setTimeout(() => { if (!modal.contains(document.activeElement))
                        modal.querySelector<HTMLElement>('input,button,select,textarea')?.focus(); }, 0);
                }
                else {
                    active = null;
                    previous?.focus();
                }
            }
        };
        const observer = new MutationObserver(enhance);
        observer.observe(document.body, { childList: true, subtree: true });
        enhance();
        const key = (e: KeyboardEvent) => {
            if (active) {
                const focusables = [...active.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')].filter(el => el.getClientRects().length);
                if (e.key === 'Tab' && focusables.length) {
                    const i = focusables.indexOf(document.activeElement as HTMLElement);
                    if (e.shiftKey && i <= 0) {
                        e.preventDefault();
                        focusables.at(-1)?.focus();
                    }
                    else if (!e.shiftKey && (i === focusables.length - 1 || i < 0)) {
                        e.preventDefault();
                        focusables[0].focus();
                    }
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const close = [...active.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === '×') ?? [...active.querySelectorAll<HTMLButtonElement>('button')].find(b => /^(Отмена|Закрыть)$/.test(b.textContent?.trim() ?? ''));
                    close?.click();
                }
                return;
            }
            const target = e.target as HTMLElement;
            if ((e.key === 'Enter' || e.key === ' ') && target.matches('.dt-lib-item,.dt-comp-item,.dt-tree-row,.dt-black-bar')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                target.click();
            }
            if (['ArrowDown', 'ArrowUp'].includes(e.key) && target.matches('.dt-lib-item,.dt-comp-item,.dt-tree-row')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const items = [...target.parentElement!.children].filter(el => (el as HTMLElement).tabIndex === 0) as HTMLElement[];
                items[(items.indexOf(target) + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
            }
        };
        window.addEventListener('keydown', key, true);
        return () => { observer.disconnect(); window.removeEventListener('keydown', key, true); };
    }, []);
}
