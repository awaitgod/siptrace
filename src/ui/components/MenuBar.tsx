import React, { useEffect, useRef, useState } from 'react';

export interface MenuItemSpec {
  id?: string;
  label?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  submenu?: MenuItemSpec[];
  onClick?: () => void;
}

export interface TopMenuSpec {
  id: string;
  label: string;
  items: MenuItemSpec[];
}

export const MenuDropdownList: React.FC<{
  items: MenuItemSpec[];
  onCloseAll: () => void;
  style?: React.CSSProperties;
}> = ({ items, onCloseAll, style }) => {
  const [hoveredSubIdx, setHoveredSubIdx] = useState<number | null>(null);

  return (
    <div className="dt-dropdown" style={style} role="menu">
      {items.map((item, idx) => {
        if (item.separator) {
          return <div key={`sep_${idx}`} className="dt-dropdown-sep" role="separator" />;
        }
        const hasSub = Boolean(item.submenu && item.submenu.length > 0);
        const isSubOpen = hasSub && hoveredSubIdx === idx;
        return (
          <div
            key={item.id ?? `item_${idx}`}
            className={`dt-dropdown-row ${item.disabled ? 'disabled' : ''} ${isSubOpen ? 'sub-open' : ''}`}
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked === undefined ? undefined : item.checked}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={hasSub ? 'menu' : undefined}
            aria-expanded={hasSub ? isSubOpen : undefined}
            tabIndex={item.disabled ? -1 : 0}
            onMouseEnter={() => setHoveredSubIdx(hasSub ? idx : null)}
            onKeyDown={(e) => {
              if (item.disabled) return;
              if (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowRight' && hasSub)) {
                e.preventDefault();
                e.stopPropagation();
                if (hasSub) {
                  setHoveredSubIdx(idx);
                  const row = e.currentTarget;
                  requestAnimationFrame(() => row.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])')?.focus());
                } else {
                  onCloseAll();
                  item.onClick?.();
                }
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                const rows = Array.from(e.currentTarget.parentElement?.children ?? []).filter(
                  (row): row is HTMLElement => row instanceof HTMLElement && row.getAttribute('role')?.startsWith('menuitem') === true && row.getAttribute('aria-disabled') !== 'true'
                );
                const next = (rows.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
                rows[next]?.focus();
              } else if (e.key === 'ArrowLeft') {
                const parentRow = e.currentTarget.parentElement?.parentElement;
                if (parentRow?.getAttribute('role')?.startsWith('menuitem')) {
                  e.preventDefault();
                  e.stopPropagation();
                  parentRow.focus();
                }
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;
              if (hasSub) {
                setHoveredSubIdx(idx);
                return;
              }
              onCloseAll();
              item.onClick?.();
            }}
          >
            {item.checked && <span className="dt-dropdown-check">✓</span>}
            <span>{item.label}</span>
            {hasSub ? (
              <span className="dt-dropdown-arrow">►</span>
            ) : item.shortcut ? (
              <span className="dt-dropdown-shortcut">{item.shortcut}</span>
            ) : null}
            {isSubOpen && item.submenu && (
              <MenuDropdownList
                items={item.submenu}
                onCloseAll={onCloseAll}
                style={{ left: '100%', top: -2, zIndex: 1100 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const MenuBar: React.FC<{ menus: TopMenuSpec[]; onBrandClick?: () => void }> = ({
  menus,
  onBrandClick
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openMenuId !== null) {
        setOpenMenuId(null);
        barRef.current?.querySelector<HTMLElement>('.dt-menu-item.open')?.focus();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  const activeMenu = menus.find((m) => m.id === openMenuId);
  const logoSrc = `${import.meta.env?.BASE_URL ?? './'}logo.svg`;

  return (
    <div className="dt-menubar" ref={barRef} onKeyDown={(e) => {
      if (e.key === 'Escape' && openMenuId !== null) {
        e.preventDefault();
        e.stopPropagation();
        barRef.current?.querySelector<HTMLElement>('.dt-menu-item.open')?.focus();
        setOpenMenuId(null);
      }
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
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenMenuId(m.id);
                  const menu = e.currentTarget.parentElement;
                  requestAnimationFrame(() => menu?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])')?.focus());
                }
              }}
              onClick={() => setOpenMenuId(isOpen ? null : m.id)}
              onMouseEnter={() => {
                if (openMenuId !== null) setOpenMenuId(m.id);
              }}
            >
              {m.label}
            </div>
            {isOpen && activeMenu && (
              <MenuDropdownList
                items={activeMenu.items}
                onCloseAll={() => setOpenMenuId(null)}
                style={{ left: 0 }}
              />
            )}
          </div>
        );
      })}
      <button
        type="button"
        className={`dt-menubar-brand ${onBrandClick ? 'clickable' : ''}`}
        title={onBrandClick ? 'Стартовое окно SIPTrace' : 'SIPTrace'}
        onClick={onBrandClick}
      >
        <img src={logoSrc} alt="SIPTrace" width={14} height={14} />
        <span>SIPTrace</span>
      </button>
    </div>
  );
};
