import React, { useEffect, useRef } from 'react';
import { SchContextMenu } from '../types';
interface Props {
    menu: SchContextMenu;
    onRotate: () => void;
    onFlipX: () => void;
    onFlipY: () => void;
    onDelete: () => void;
    onClose: () => void;
    onProperties: () => void;
    onCopy: () => void;
    onPaste: () => void;
    hotkeys: Record<string, string>;
    onWireAction?: (action: 'split' | 'merge' | 'trim') => void;
}
export const SchematicContextMenu: React.FC<Props> = (p) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); const close = (e: KeyboardEvent) => { if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        p.onClose();
    } if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const buttons = [...ref.current!.querySelectorAll('button')];
        buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    } }; const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node))
        p.onClose(); }; window.addEventListener('keydown', close, true); window.addEventListener('pointerdown', outside); return () => { window.removeEventListener('keydown', close, true); window.removeEventListener('pointerdown', outside); previous?.focus(); }; }, [p.onClose]);
    const button = (label: string, run: () => void, key?: string) => <button role="menuitem" aria-label={label} className="dt-dropdown-row" onClick={() => { run(); p.onClose(); }}><span>{label}</span><span className="dt-dropdown-shortcut">{key}</span></button>;
    return <div ref={ref} className="dt-dropdown" role="menu" aria-label="Действия с выделением" style={{ left: Math.min(p.menu.x, window.innerWidth - 250), top: Math.min(p.menu.y, window.innerHeight - 310), position: 'fixed', zIndex: 3000 }}>
 {button('Свойства...', p.onProperties, p.hotkeys.properties)}
 {button('Копировать', p.onCopy, p.hotkeys.copy)}{button('Вставить', p.onPaste, p.hotkeys.paste)}
 {button('Повернуть на 90°', p.onRotate, p.hotkeys.rotate)}{button('Отразить по X', p.onFlipX, p.hotkeys.flipX)}{button('Отразить по Y', p.onFlipY, p.hotkeys.flipY)}
 {p.menu.wireId && <>{button('Разбить провод в точке', () => p.onWireAction?.('split'))}{button('Объединить проводники', () => p.onWireAction?.('merge'))}{button('Удалить сегмент', () => p.onWireAction?.('trim'))}</>}
 {button(p.menu.wireId ? 'Удалить провод' : 'Удалить выделение', p.onDelete, 'Del')}
 </div>;
};
