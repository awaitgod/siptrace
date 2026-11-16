import React from 'react';
import { Units } from '../../core/types';
import { formatCoord, formatGridValue } from '../../core/units';

export const StatusBar: React.FC<{
  hint: string;
  extraCenter?: string;
  gridMm: number;
  units: Units;
  cursorX: number;
  cursorY: number;
  onToggleUnits?: () => void;
  hideCoords?: boolean;
}> = ({ hint, extraCenter, gridMm, units, cursorX, cursorY, onToggleUnits, hideCoords }) => {
  return (
    <div className="dt-statusbar">
      <div className="dt-status-cell" style={{ flex: 1, minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }} title={hint}>
        {hint}
      </div>
      {extraCenter && (
        <div
          className="dt-status-cell"
          style={{ minWidth: 0, maxWidth: '34vw', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}
          title={extraCenter}
        >
          {extraCenter}
        </div>
      )}
      {!hideCoords && (
        <>
          <div className="dt-status-cell" style={{ minWidth: 78, flexShrink: 0 }}>
            Сетка: {formatGridValue(gridMm, units)}
          </div>
          <div
            className="dt-status-cell"
            style={{ minWidth: 54, flexShrink: 0, cursor: onToggleUnits ? 'pointer' : 'default' }}
            onClick={onToggleUnits}
            title="Нажмите для переключения единиц (мм / mil / in)"
          >
            Ед: {units === 'mm' ? 'мм' : units}
          </div>
          <div className="dt-status-cell" style={{ minWidth: 150, flexShrink: 0, justifyContent: 'flex-end', borderRight: 'none' }}>
            X={formatCoord(cursorX, units)} &nbsp; Y={formatCoord(cursorY, units)}
          </div>
        </>
      )}
    </div>
  );
};
