import React from 'react';
import { SchematicProject, SchematicSheet } from '../../../../core/types';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { buildNextSchematicSheet } from '../services/schematicActionsService';

export interface SchematicSheetBarProps {
  project: SchematicProject;
  activeSheet: SchematicSheet;
  commitProject: (updater: (prev: SchematicProject) => SchematicProject, pushUndo?: boolean) => void;
}

/** Bottom multi-sheet selector tabs and current GOST sheet format indicator. */
export const SchematicSheetBar: React.FC<SchematicSheetBarProps> = ({
  project,
  activeSheet,
  commitProject
}) => (
  <div className="dt-sheet-bar">
    <div className="dt-sheet-tabs">
      {project.sheets.map((s) => (
        <div
          key={s.id}
          className={`dt-sheet-tab ${s.id === project.activeSheetId ? 'active' : ''}`}
          title="Клик — переключить; двойной клик — переименовать"
          onClick={() => commitProject((p) => ({ ...p, activeSheetId: s.id }), false)}
          onDoubleClick={() => {
            const nextName = window.prompt('Имя листа:', s.name);
            if (nextName && nextName.trim()) {
              commitProject((p) => ({
                ...p,
                sheets: p.sheets.map((sh) => (sh.id === s.id ? { ...sh, name: nextName.trim() } : sh))
              }));
            }
          }}
        >
          {s.name}
        </div>
      ))}
      <button
        className="dt-btn"
        style={{ minWidth: 20, height: 17, padding: '0 6px', fontSize: 11, lineHeight: '15px' }}
        title="Добавить новый лист"
        onClick={() => {
          const nextSheet = buildNextSchematicSheet(project, activeSheet);
          commitProject((p) => {
            const total = p.sheets.length + 1;
            const sheets = [...p.sheets, nextSheet].map((sh, idx) => ({
              ...sh,
              titleBlock: {
                ...sh.titleBlock,
                sheetNumber: idx + 1,
                totalSheets: total
              }
            }));
            return {
              ...p,
              activeSheetId: nextSheet.id,
              sheets
            };
          });
        }}
      >
        +
      </button>
    </div>
    <div style={{ fontSize: 10.5, color: '#444', paddingRight: 6 }}>
      {SHEET_FORMATS[activeSheet.format].label}
    </div>
  </div>
);
