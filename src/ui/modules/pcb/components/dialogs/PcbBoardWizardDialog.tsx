import React, { useState } from 'react';
import { polygonBounds } from '../../../../../core/geometry';
import { PcbProject } from '../../../../../core/types';
import { updateAllCopperPours } from '../../../../../engines/copperPour';
import { buildBoardOutlinePolygon } from '../../services/pcbActionsService';
import { changePcbLayerStack, hasInternalLayerObjects, INTERNAL_LAYER_OBJECTS_MESSAGE } from '../../services/pcbLayerStack';

interface PcbBoardWizardDialogProps {
  pcb: PcbProject;
  commitPcb: (updater: (prev: PcbProject) => PcbProject) => void;
  onClose: () => void;
  onApply: () => void;
}

export function PcbBoardWizardDialog({ pcb, commitPcb, onClose, onApply }: PcbBoardWizardDialogProps) {
  const hasOutline = pcb.boardOutline.length >= 3;
  const bounds = hasOutline ? polygonBounds(pcb.boardOutline) : null;
  const [replaceOutline, setReplaceOutline] = useState(!hasOutline);
  const [width, setWidth] = useState(bounds ? String(Number((bounds.maxX - bounds.minX).toFixed(2))) : '100');
  const [height, setHeight] = useState(bounds ? String(Number((bounds.maxY - bounds.minY).toFixed(2))) : '70');
  const [radius, setRadius] = useState('0');
  const [ellipse, setEllipse] = useState(false);
  const [thickness, setThickness] = useState(String(pcb.boardThickness || 1.6));
  const [layerCount, setLayerCount] = useState(pcb.layerCount);
  const restrictTwoLayers = pcb.layerCount === 4 && hasInternalLayerObjects(pcb);

  function handleApply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitPcb((previous) => {
      const next = changePcbLayerStack(previous, layerCount);
      const boardThickness = Number(thickness);
      if (!replaceOutline && next === previous && boardThickness === previous.boardThickness) return previous;
      const currentBounds = previous.boardOutline.length >= 3 ? polygonBounds(previous.boardOutline) : { minX: 10, minY: 10 };
      const boardOutline = replaceOutline
        ? buildBoardOutlinePolygon(Number(width), Number(height), Number(radius), ellipse, { x: currentBounds.minX, y: currentBounds.minY })
        : previous.boardOutline;
      return updateAllCopperPours({ ...next, boardOutline, boardThickness });
    });
    onApply();
  }

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <form className="dt-modal" style={{ width: 420 }} onSubmit={handleApply} onClick={(event) => event.stopPropagation()}>
        <div className="dt-modal-title">
          <strong>Мастер контура и стека печатной платы</strong>
          <button type="button" className="dt-btn" aria-label="Закрыть мастер контура" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5 }}>
          {hasOutline && <label><input type="checkbox" checked={replaceOutline} onChange={(event) => setReplaceOutline(event.target.checked)} /> Заменить контур платы</label>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label>Ширина, мм<input type="number" min="0.1" step="any" required disabled={!replaceOutline} className="dt-input" style={{ width: '100%' }} value={width} onChange={(event) => setWidth(event.target.value)} /></label>
            <label>Высота, мм<input type="number" min="0.1" step="any" required disabled={!replaceOutline} className="dt-input" style={{ width: '100%' }} value={height} onChange={(event) => setHeight(event.target.value)} /></label>
            <label>Скругление углов, мм<input type="number" step="any" min="0" max={Math.min(Number(width), Number(height)) / 2} required disabled={!replaceOutline || ellipse} className="dt-input" style={{ width: '100%' }} value={radius} onChange={(event) => setRadius(event.target.value)} /></label>
            <label>Толщина платы, мм<input type="number" min="0.1" step="any" required className="dt-input" style={{ width: '100%' }} value={thickness} onChange={(event) => setThickness(event.target.value)} /></label>
            <label>Слоёв меди
              <select className="dt-select" style={{ width: '100%' }} value={layerCount} onChange={(event) => setLayerCount(event.target.value === '4' ? 4 : 2)}>
                <option value={2} disabled={restrictTwoLayers}>2 слоя</option>
                <option value={4}>4 слоя</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14 }}>
              <input type="checkbox" disabled={!replaceOutline} checked={ellipse} onChange={(event) => setEllipse(event.target.checked)} /> Эллиптический контур
            </label>
          </div>
          {restrictTwoLayers && <div>{INTERNAL_LAYER_OBJECTS_MESSAGE}</div>}
        </div>
        <div className="dt-modal-footer">
          <button type="submit" className="dt-btn primary">Применить</button>
          <button type="button" className="dt-btn" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
