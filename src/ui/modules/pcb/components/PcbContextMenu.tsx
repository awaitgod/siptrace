import React, { useLayoutEffect, useRef } from 'react';
import { PcbContextMenuState } from '../types';

export interface PcbContextMenuProps {
  menu: PcbContextMenuState;
  onRotate?: () => void;
  onFlipSide?: () => void;
  onToggleLock?: () => void;
  onDelete?: () => void;
  onHighlightNet?: (net: string | null) => void;
  onAddMeander?: () => void;
  onSmoothArcs?: () => void;
  onToggleViaStyle?: () => void;
  onUpdatePours?: () => void;
  onOpenProperties?: () => void;
  onSelectTool?: () => void;
  onStartRoute?: () => void;
  onPlaceVia?: () => void;
  onRunDrc?: () => void;
  onCycleGrid?: () => void;
  onZoomFit?: () => void;
  onClose: () => void;
  onRestoreFocus: () => void;
  targetNetName?: string;
  isLocked?: boolean;
}

export const PcbContextMenu: React.FC<PcbContextMenuProps> = (p) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const place = () => {
      menu.style.left = `${Math.max(0, Math.min(p.menu.x, window.innerWidth - menu.offsetWidth - 4))}px`;
      menu.style.top = `${Math.max(0, Math.min(p.menu.y, window.innerHeight - menu.offsetHeight - 4))}px`;
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
    const index = buttons.findIndex((b) => b === document.activeElement);
    if (e.key === 'Home') buttons[0].focus();
    else if (e.key === 'End') buttons[buttons.length - 1].focus();
    else buttons[(index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
  };

  const button = (label: string, run?: () => void, shortcut?: string, disabled = false) => (
    <button
      role="menuitem"
      tabIndex={-1}
      disabled={disabled || !run}
      className={`dt-dropdown-row ${disabled || !run ? 'disabled' : ''}`}
      onClick={() => {
        dismiss();
        run?.();
      }}
    >
      <span>{label}</span>
      {shortcut && <span className="dt-dropdown-shortcut" aria-hidden="true">{shortcut}</span>}
    </button>
  );

  const sep = () => <div className="dt-menu-sep" style={{ margin: '3px 0' }} />;

  const { target } = p.menu;

  return (
    <div
      ref={ref}
      className="dt-dropdown"
      role="menu"
      aria-label="Контекстное меню топологии"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', zIndex: 3000, minWidth: 200, maxHeight: '95vh', overflowY: 'auto' }}
    >
      {target.kind === 'component' && (
        <>
          {button('Свойства компонента...', p.onOpenProperties)}
          {sep()}
          {button('Повернуть на 90°', p.onRotate, 'R')}
          {button('Перенести на другую сторону', p.onFlipSide, 'F')}
          {button(p.isLocked ? 'Разблокировать' : 'Заблокировать', p.onToggleLock)}
          {p.targetNetName && button(`Подсветить цепь «${p.targetNetName}»`, () => p.onHighlightNet?.(p.targetNetName!))}
          {sep()}
          {button('Удалить компонент', p.onDelete, 'Del')}
        </>
      )}

      {target.kind === 'trace' && (
        <>
          {button('Свойства проводника...', p.onOpenProperties)}
          {p.targetNetName && button(`Подсветить цепь «${p.targetNetName}»`, () => p.onHighlightNet?.(p.targetNetName!))}
          {button('Добавить змейку (выравнивание длины)', p.onAddMeander)}
          {button('Сгладить дорожку дугами', p.onSmoothArcs)}
          {sep()}
          {button('Удалить проводник', p.onDelete, 'Del')}
        </>
      )}

      {target.kind === 'via' && (
        <>
          {button('Свойства перехода...', p.onOpenProperties)}
          {p.targetNetName && button(`Подсветить цепь «${p.targetNetName}»`, () => p.onHighlightNet?.(p.targetNetName!))}
          {button('Переключить стиль (Through/Blind)', p.onToggleViaStyle)}
          {sep()}
          {button('Удалить переход (Via)', p.onDelete, 'Del')}
        </>
      )}

      {target.kind === 'pour' && (
        <>
          {button('Параметры заливки...', p.onOpenProperties)}
          {button('Пересчитать полигоны', p.onUpdatePours)}
          {sep()}
          {button('Удалить полигон', p.onDelete, 'Del')}
        </>
      )}

      {target.kind === 'canvas' && (
        <>
          {button('Ручная трассировка (45°/90°/Свободный)', p.onStartRoute)}
          {button('Установить переходное отверстие', p.onPlaceVia)}
          {sep()}
          {button('Проверка DRC по ГОСТ 23751', p.onRunDrc, 'F9')}
          {button('Сменить шаг сетки', p.onCycleGrid, 'G')}
          {button('Показать всю плату', p.onZoomFit, 'Home')}
        </>
      )}
    </div>
  );
};
