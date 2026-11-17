import React, { useEffect, useRef, useState } from 'react';

export interface MenuItemSpec {
  id?: string;
  label?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  submenu?: MenuItemSpec[];
  submenuBelow?: boolean;
  onClick?: () => void;
}

export interface TopMenuSpec {
  id: string;
  label: string;
  items: MenuItemSpec[];
}

const menuRowSelector = '[role="menuitem"], [role="menuitemcheckbox"]';

function focusMenuEdge(menu: Element | null | undefined, last = false) {
  const rows = Array.from(menu?.children ?? []).filter(
    (row): row is HTMLElement => row instanceof HTMLElement && row.matches(menuRowSelector)
  );
  if (rows?.length) rows[last ? rows.length - 1 : 0].focus();
}

export const MenuDropdownList: React.FC<{
  items: MenuItemSpec[];
  onCloseAll: () => void;
  onCloseSubmenu?: () => void;
  inline?: boolean;
  style?: React.CSSProperties;
}> = ({ items, onCloseAll, onCloseSubmenu, inline, style }) => {
  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null);

  return (
    <div className={inline ? 'dt-dropdown dt-dropdown-inline' : 'dt-dropdown'} style={style} role="menu">
      {items.map((item, idx) => {
        if (item.separator) {
          return <div key={`sep_${idx}`} className="dt-dropdown-sep" role="separator" />;
        }
        const hasSub = Boolean(item.submenu && item.submenu.length > 0);
        const isSubOpen = hasSub && openSubIdx === idx;
        const submenuBelow = hasSub && item.submenuBelow;
        const openSubmenu = (row: HTMLElement) => {
          setOpenSubIdx(idx);
          requestAnimationFrame(() => focusMenuEdge(row.querySelector(':scope > [role="menu"]')));
        };
        return (
          <div
            key={item.id ?? `item_${idx}`}
            className={`dt-dropdown-row ${item.disabled ? 'disabled' : ''} ${isSubOpen ? 'sub-open' : ''} ${submenuBelow ? 'dt-dropdown-row-inline' : ''}`}
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-label={submenuBelow ? item.label : undefined}
            aria-checked={item.checked === undefined ? undefined : item.checked}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={hasSub ? 'menu' : undefined}
            aria-expanded={hasSub ? isSubOpen : undefined}
            tabIndex={-1}
            onMouseEnter={() => {
              if (openSubIdx !== null && items[openSubIdx]?.submenuBelow) return;
              setOpenSubIdx(hasSub && !submenuBelow && !item.disabled ? idx : null);
            }}
            onKeyDown={(e) => {
              if (hasSub && (e.key === 'ArrowRight' || (submenuBelow && isSubOpen && e.key === 'ArrowDown'))) {
                e.preventDefault();
                e.stopPropagation();
                if (!item.disabled) openSubmenu(e.currentTarget);
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (item.disabled) return;
                if (hasSub && !item.onClick) {
                  openSubmenu(e.currentTarget);
                } else {
                  onCloseAll();
                  item.onClick?.();
                }
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                e.stopPropagation();
                const rows = Array.from(e.currentTarget.parentElement?.children ?? []).filter(
                  (row): row is HTMLElement => row instanceof HTMLElement && row.matches(menuRowSelector)
                );
                setOpenSubIdx(null);
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
                  : (rows.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
                rows[next]?.focus();
              } else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && onCloseSubmenu) {
                const parentRow = e.currentTarget.parentElement?.parentElement;
                e.preventDefault();
                e.stopPropagation();
                parentRow?.focus();
                onCloseSubmenu();
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;
              if (hasSub && !item.onClick) {
                setOpenSubIdx(idx);
                return;
              }
              onCloseAll();
              item.onClick?.();
            }}
          >
            {item.checked && <span className="dt-dropdown-check">✓</span>}
            <span>{item.label}</span>
            {submenuBelow ? (
              <button
                type="button"
                className="dt-dropdown-arrow dt-dropdown-toggle"
                tabIndex={-1}
                aria-label={`Подменю «${item.label}»`}
                aria-expanded={isSubOpen}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.parentElement?.focus();
                  setOpenSubIdx(isSubOpen ? null : idx);
                }}
              >
                {isSubOpen ? '▼' : '►'}
              </button>
            ) : hasSub ? (
              <span className="dt-dropdown-arrow">►</span>
            ) : item.shortcut ? (
              <span className="dt-dropdown-shortcut">{item.shortcut}</span>
            ) : null}
            {isSubOpen && item.submenu && (
              <MenuDropdownList
                items={item.submenu}
                onCloseAll={onCloseAll}
                onCloseSubmenu={() => setOpenSubIdx(null)}
                inline={submenuBelow}
                style={submenuBelow ? undefined : { left: '100%', top: -2, zIndex: 1100 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const MenuBar: React.FC<{ menus: TopMenuSpec[]; onBrandClick?: () => void; brand?: React.ReactNode }> = ({
  menus,
  onBrandClick,
  brand: customBrand
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const closeAndRestoreFocus = () => {
    barRef.current?.querySelector<HTMLElement>('.dt-menu-item.open')?.focus();
    setOpenMenuId(null);
  };

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    window.addEventListener('mousedown', onDocDown);
    return () => window.removeEventListener('mousedown', onDocDown);
  }, []);

  const activeMenu = menus.find((m) => m.id === openMenuId);
  const logoSrc = `${import.meta.env?.BASE_URL ?? './'}logo.svg`;
  const brand = customBrand === undefined ? <><img src={logoSrc} alt="" width={14} height={14} /><span>SIPTrace</span></> : customBrand;

  return (
    <div className="dt-menubar" ref={barRef} onKeyDown={(e) => {
      if (e.key === 'Escape' && openMenuId !== null) {
        e.preventDefault();
        e.stopPropagation();
        closeAndRestoreFocus();
      } else if (e.key === 'Tab' && openMenuId !== null) {
        closeAndRestoreFocus();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && openMenuId !== null) {
        e.preventDefault();
        e.stopPropagation();
        const idx = menus.findIndex((menu) => menu.id === openMenuId);
        const next = (idx + menus.length + (e.key === 'ArrowRight' ? 1 : -1)) % menus.length;
        const trigger = barRef.current?.querySelectorAll<HTMLElement>('.dt-menu-item')[next];
        setOpenMenuId(menus[next].id);
        requestAnimationFrame(() => focusMenuEdge(trigger?.parentElement?.querySelector('[role="menu"]')));
      }
    }} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpenMenuId(null);
    }}>
      {menus.map((m) => {
        const isOpen = openMenuId === m.id;
        return (
          <div key={m.id} style={{ position: 'relative' }}>
            <div
              className={`dt-menu-item ${isOpen ? 'open' : ''}`}
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenMenuId(m.id);
                  const menu = e.currentTarget.parentElement;
                  const last = e.key === 'ArrowUp';
                  requestAnimationFrame(() => focusMenuEdge(menu?.querySelector('[role="menu"]'), last));
                } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && openMenuId === null) {
                  e.preventDefault();
                  const triggers = Array.from(barRef.current?.querySelectorAll<HTMLElement>('.dt-menu-item') ?? []);
                  const curIdx = triggers.indexOf(e.currentTarget);
                  if (curIdx >= 0) triggers[(curIdx + (e.key === 'ArrowRight' ? 1 : -1) + triggers.length) % triggers.length]?.focus();
                }
              }}
              onClick={(e) => {
                setOpenMenuId(isOpen ? null : m.id);
                if (!isOpen) {
                  const trigger = e.currentTarget;
                  requestAnimationFrame(() => {
                    if (document.activeElement === trigger) focusMenuEdge(trigger.parentElement?.querySelector('[role="menu"]'));
                  });
                }
              }}
              onMouseEnter={() => {
                if (openMenuId !== null) setOpenMenuId(m.id);
              }}
            >
              {m.label}
            </div>
            {isOpen && activeMenu && (
              <MenuDropdownList
                items={activeMenu.items}
                onCloseAll={closeAndRestoreFocus}
                style={{ left: 0 }}
              />
            )}
          </div>
        );
      })}
      {brand && (onBrandClick ? (
        <button type="button" className="dt-menubar-brand clickable" title="Стартовое окно SIPTrace" onClick={onBrandClick}>
          {brand}
        </button>
      ) : <span className="dt-menubar-brand">{brand}</span>)}
    </div>
  );
};
