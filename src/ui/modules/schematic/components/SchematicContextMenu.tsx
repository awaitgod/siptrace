import React from 'react';
import { SchContextMenu } from '../types';

export interface SchematicContextMenuProps {
  menu: SchContextMenu;
  onRotate: () => void;
  onFlipX: () => void;
  onFlipY: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Floating right-click context menu over canvas components and wires. */
export const SchematicContextMenu: React.FC<SchematicContextMenuProps> = ({
  menu,
  onRotate,
  onFlipX,
  onFlipY,
  onDelete,
  onClose
}) => (
  <div
    className="dt-dropdown"
    style={{ left: menu.x, top: menu.y, position: 'fixed', zIndex: 3000 }}
    onClick={(e) => e.stopPropagation()}
  >
    {menu.compId && (
      <>
        <div className="dt-dropdown-row" onClick={() => { onRotate(); onClose(); }}>
          <span>Повернуть на 90°</span><span className="dt-dropdown-shortcut">R</span>
        </div>
        <div className="dt-dropdown-row" onClick={() => { onFlipX(); onClose(); }}>
          <span>Отразить по X</span><span className="dt-dropdown-shortcut">X</span>
        </div>
        <div className="dt-dropdown-row" onClick={() => { onFlipY(); onClose(); }}>
          <span>Отразить по Y</span><span className="dt-dropdown-shortcut">Y</span>
        </div>
        <div className="dt-dropdown-sep" />
      </>
    )}
    <div className="dt-dropdown-row" onClick={() => { onDelete(); onClose(); }}>
      <span>{menu.wireId && !menu.compId ? 'Удалить провод' : 'Удалить'}</span>
      <span className="dt-dropdown-shortcut">Del</span>
    </div>
  </div>
);
