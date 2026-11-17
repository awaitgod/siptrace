import React, { useState } from 'react';
import { PlacedComponent } from '../../../../../core/types';
import { NetGraphNode } from '../../../../../engines/erc';

export interface SchFindDialogProps {
  components: PlacedComponent[];
  nets?: NetGraphNode[];
  onSelectComp: (compId: string, x: number, y: number) => void;
  onSelectNet?: (netName: string) => void;
  onClose: () => void;
}

/** Modal to search and select components or nets on the active sheet. */
export const SchFindDialog: React.FC<SchFindDialogProps> = ({
  components,
  nets = [],
  onSelectComp,
  onSelectNet,
  onClose
}) => {
  const [findQuery, setFindQuery] = useState('');
  const q = findQuery.trim().toLowerCase();

  const matchingComps = components.filter(
    (c) =>
      !c.refDes.startsWith('#') &&
      (!q || c.refDes.toLowerCase().includes(q) || c.value.toLowerCase().includes(q) || c.typeName.toLowerCase().includes(q))
  );
  const matchingNets = nets.filter((n) => !q || n.netName.toLowerCase().includes(q));

  const pickFirst = () => {
    if (matchingComps.length > 0) {
      const c = matchingComps[0];
      onSelectComp(c.id, c.x, c.y);
      onClose();
    } else if (matchingNets.length > 0 && onSelectNet) {
      onSelectNet(matchingNets[0].netName);
      onClose();
    }
  };

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div className="dt-modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span>Найти компонент или цепь</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body">
          <input
            className="dt-input"
            style={{ width: '100%', marginBottom: 8 }}
            data-autofocus
            aria-label="Обозначение компонента, значение или имя цепи"
            placeholder="Введите RefDes (например, R1, U1) или имя цепи..."
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pickFirst();
            }}
          />
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ccc', background: '#fff' }}>
            {matchingComps.map((c) => (
              <button
                type="button"
                key={c.id}
                className="dt-tree-row dt-find-result"
                onClick={() => {
                  onSelectComp(c.id, c.x, c.y);
                  onClose();
                }}
              >
                [Элемент] {c.refDes} — {c.value || c.typeName} ({c.x} мм, {c.y} мм)
              </button>
            ))}
            {matchingNets.map((n) => (
              <button
                type="button"
                key={`net_${n.netName}`}
                className="dt-tree-row dt-find-result"
                onClick={() => {
                  onSelectNet?.(n.netName);
                  onClose();
                }}
              >
                [Цепь] {n.netName} ({n.pins.length} выв.)
              </button>
            ))}
            {matchingComps.length === 0 && matchingNets.length === 0 && (
              <div style={{ padding: 8, color: 'var(--ui-muted)' }}>Ничего не найдено.</div>
            )}
          </div>
        </div>
        <div className="dt-modal-footer">
          <button className="dt-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
};
