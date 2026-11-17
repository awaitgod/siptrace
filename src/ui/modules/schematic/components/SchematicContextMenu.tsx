import React, { useLayoutEffect, useRef } from 'react';
import { SchContextMenu } from '../types';
interface Props {
    menu: SchContextMenu;
    onRotate: () => void;
    onFlipX: () => void;
    onFlipY: () => void;
    onDelete: () => void;
    onClose: () => void;
    onRestoreFocus: () => void;
    onProperties: () => void;
    onCopy: () => void;
    onPaste: () => void;
    canPaste: boolean;
    hotkeys: Record<string, string>;
    onWireAction?: (action: 'split' | 'merge' | 'trim') => void;
}
export const SchematicContextMenu: React.FC<Props> = (p) => {
    const ref = useRef<HTMLDivElement>(null);
    const hasSelection = p.menu.ids.length > 0;
    useLayoutEffect(() => {
        const menu = ref.current;
        if (!menu) return;
        const place = () => {
            menu.style.left = `${Math.max(0, Math.min(p.menu.x, window.innerWidth - menu.offsetWidth))}px`;
            menu.style.top = `${Math.max(0, Math.min(p.menu.y, window.innerHeight - menu.offsetHeight))}px`;
        };
        place();
        (menu.querySelector<HTMLButtonElement>('button:not([disabled])') ?? menu).focus({ preventScroll: true });
        const onOutside = (e: PointerEvent) => {
            if (!menu.contains(e.target as Node)) p.onClose();
        };
        window.addEventListener('resize', place);
        window.addEventListener('pointerdown', onOutside);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('pointerdown', onOutside);
        };
    }, [p.menu, p.onClose]);

    const dismiss = () => {
        p.onClose();
        p.onRestoreFocus();
    };
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Tab') {
            dismiss();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            dismiss();
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
        if (!buttons.length) return;
        const index = buttons.findIndex(button => button === document.activeElement);
        if (e.key === 'Home') buttons[0].focus();
        else if (e.key === 'End') buttons[buttons.length - 1].focus();
        else buttons[(index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
    };
    const button = (label: string, run: () => void, key?: string, disabled = false) => (
        <button role="menuitem" tabIndex={-1} disabled={disabled} className={`dt-dropdown-row ${disabled ? 'disabled' : ''}`}
            onClick={() => { dismiss(); run(); }}>
            <span>{label}</span><span className="dt-dropdown-shortcut" aria-hidden="true">{key}</span>
        </button>
    );

    return (
        <div ref={ref} className="dt-dropdown" role="menu" aria-label="Действия с выделением" tabIndex={-1} onKeyDown={onKeyDown}
            style={{ position: 'fixed', zIndex: 3000, maxHeight: '100vh', overflowY: 'auto' }}>
            {button('Свойства...', p.onProperties, p.hotkeys.properties, !hasSelection)}
            {button('Копировать', p.onCopy, p.hotkeys.copy, !hasSelection)}
            {button('Вставить', p.onPaste, p.hotkeys.paste, !p.canPaste)}
            {button('Повернуть на 90°', p.onRotate, p.hotkeys.rotate, !hasSelection)}
            {button('Отразить по X', p.onFlipX, p.hotkeys.flipX, !hasSelection)}
            {button('Отразить по Y', p.onFlipY, p.hotkeys.flipY, !hasSelection)}
            {p.menu.wireTarget && <>
                {button('Разбить провод в точке', () => p.onWireAction?.('split'))}
                {button('Объединить проводники', () => p.onWireAction?.('merge'))}
                {button('Удалить сегмент', () => p.onWireAction?.('trim'))}
            </>}
            {button(p.menu.wireTarget && p.menu.ids.length === 1 ? 'Удалить провод' : 'Удалить выделение', p.onDelete, 'Del', !hasSelection)}
        </div>
    );
};
