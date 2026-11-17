import React, { useState } from 'react';
import { PatternDef, PatternLibrary, PcbProject } from '../../../../core/types';
import { CadLibraryManagerDialog } from '../../../components/CadLibraryManagerDialog';
import { PatternPreviewCanvas } from '../../../components/CadPreviewCanvas';
import { PcbToolId } from '../types';

export interface PcbLeftSidebarProps {
  allPatternLibs: PatternLibrary[];
  selectedPatLibId: string;
  setSelectedPatLibId: (id: string) => void;
  selectedLibPatId: string;
  setSelectedLibPatId: (id: string) => void;
  activeLib: PatternLibrary | undefined;
  previewPatternDef: PatternDef | null;
  pcb: PcbProject;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  setTool: React.Dispatch<React.SetStateAction<PcbToolId>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  setShowRulesDialog: (v: boolean) => void;
}

/** Left pattern browser, quick accuracy/trace-width settings, and live 2D footprint preview. */
export const PcbLeftSidebar: React.FC<PcbLeftSidebarProps> = (p) => {
  const [showCadLibManager, setShowCadLibManager] = useState(false);
  React.useEffect(() => {
    const onOpen = () => setShowCadLibManager(true);
    window.addEventListener('siptrace:open-cadlib', onOpen);
    return () => window.removeEventListener('siptrace:open-cadlib', onOpen);
  }, []);

  return (
  <div className="dt-left-sidebar">
    <div className="dt-black-bar" role="heading" aria-level={2}>Установить корпус</div>
    <div className="dt-lib-list" style={{ height: 120 }}>
      {p.allPatternLibs.map((lib) => (
        <div
          key={lib.id}
          className={`dt-lib-item ${lib.id === p.selectedPatLibId ? 'selected' : ''}`}
          onClick={() => {
            p.setSelectedPatLibId(lib.id);
            if (lib.patterns[0]) p.setSelectedLibPatId(lib.patterns[0].id);
          }}
        >
          {lib.name}
        </div>
      ))}
    </div>
    <div style={{ padding: '2px 4px', background: '#e8e8e8', borderBottom: '1px solid #bdbdbd' }}>
      <button
        type="button"
        className="dt-btn"
        style={{ width: '100%', fontSize: 11, height: 22 }}
        data-testid="pcb-cadlib-btn"
        onClick={() => setShowCadLibManager(true)}
      >
        + Импорт / Библиотеки CAD...
      </button>
    </div>
    <div className="dt-black-bar" role="heading" aria-level={2}>Корпуса ({p.activeLib?.patterns.length ?? 0})</div>
    <div className="dt-comp-list">
      {(p.activeLib?.patterns ?? []).map((pat) => (
        <div
          key={pat.id}
          className={`dt-comp-item ${pat.id === p.selectedLibPatId ? 'selected' : ''}`}
          onClick={() => {
            p.setSelectedLibPatId(pat.id);
            p.setTool('placePattern');
            p.setStatusMessage(`Кликните на плату для установки корпуса ${pat.name}.`);
          }}
        >
          {pat.name}
        </div>
      ))}
    </div>

    <div style={{ padding: '4px 6px', background: '#f0f0f0', borderTop: '1px solid #c0c0c0', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600 }}>Класс точности: ГОСТ Кл.{p.pcb.designRules.gostAccuracyClass}</div>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Дорожка, мм:</span>
        <input
          type="number"
          step="0.05"
          min="0.1"
          className="dt-input"
          style={{ width: 65 }}
          value={p.pcb.designRules.defaultTraceWidth}
          onChange={(e) =>
            p.commitPcb(
              (prev) => ({
                ...prev,
                designRules: { ...prev.designRules, defaultTraceWidth: Math.max(0.1, parseFloat(e.target.value) || 0.25) }
              }),
              false
            )
          }
        />
      </label>
      <button className="dt-btn" onClick={() => p.setShowRulesDialog(true)}>Нормы ГОСТ 23751...</button>
    </div>

    <div className="dt-preview-area">
      <div className="dt-preview-label">{p.previewPatternDef?.name ?? 'Корпус'}</div>
      <PatternPreviewCanvas pattern={p.previewPatternDef} />
    </div>

    {showCadLibManager && (
      <CadLibraryManagerDialog
        initialTab="patterns"
        onClose={() => setShowCadLibManager(false)}
        onSelectPattern={(pat) => {
          const lib = p.allPatternLibs.find((l) => l.patterns.some((x) => x.id === pat.id));
          if (lib) p.setSelectedPatLibId(lib.id);
          p.setSelectedLibPatId(pat.id);
          p.setTool('placePattern');
          p.setStatusMessage(`Выбран корпус «${pat.name}» — кликните на плату для установки.`);
        }}
      />
    )}
  </div>
  );
};
