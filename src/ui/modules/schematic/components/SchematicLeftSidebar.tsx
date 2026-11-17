import React, { useState } from 'react';
import { ComponentDef, ComponentLibrary, PatternDef, SchNetPort } from '../../../../core/types';
import { CadLibraryManagerDialog } from '../../../components/CadLibraryManagerDialog';
import { PatternPreviewCanvas, SymbolPreviewCanvas } from '../../../components/CadPreviewCanvas';
import { SchToolId } from '../types';

export interface SchematicLeftSidebarProps {
  allLibraries: ComponentLibrary[];
  selectedLibId: string;
  setSelectedLibId: (id: string) => void;
  selectedLibCompId: string;
  setSelectedLibCompId: (id: string) => void;
  selectedPartIndex: number;
  setSelectedPartIndex: (idx: number) => void;
  placeExpanded: boolean;
  setPlaceExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  toolsExpanded: boolean;
  setToolsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  sortLibsAlpha: boolean;
  setSortLibsAlpha: React.Dispatch<React.SetStateAction<boolean>>;
  searchCompQuery: string;
  setSearchCompQuery: (q: string) => void;
  displayedLibComps: ComponentDef[];
  previewComponentDef: ComponentDef | null;
  previewPatternDef: PatternDef | null;
  netPortStyle: SchNetPort['style'];
  setNetPortStyle: (s: SchNetPort['style']) => void;
  netPortLabel: string;
  setNetPortLabel: (l: string) => void;
  autoPowerCheck: boolean;
  setAutoPowerCheck: (v: boolean) => void;
  setTool: React.Dispatch<React.SetStateAction<SchToolId>>;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
}

/** Left DipTrace black-accordion GOST component library browser & dual symbol/footprint preview. */
export const SchematicLeftSidebar: React.FC<SchematicLeftSidebarProps> = (p) => {
  const [showCadLibManager, setShowCadLibManager] = useState(false);
  React.useEffect(() => {
    const onOpen = () => setShowCadLibManager(true);
    window.addEventListener('siptrace:open-cadlib', onOpen);
    return () => window.removeEventListener('siptrace:open-cadlib', onOpen);
  }, []);

  return (
  <div className="dt-left-sidebar" id="schematic-library">
    <button type="button" className="dt-black-bar" aria-expanded={p.placeExpanded} onClick={() => p.setPlaceExpanded((v) => !v)}>
      <span>Установить компонент</span>
      <span aria-hidden="true">{p.placeExpanded ? '▼' : '▶'}</span>
    </button>
    {p.placeExpanded && (
      <>
        <div className="dt-black-bar" role="heading" aria-level={2}>
          <span>Компоненты (ГОСТ)</span>
        </div>
        <div className="dt-lib-list">
          {p.allLibraries.map((lib) => (
            <div
              key={lib.id}
              className={`dt-lib-item ${lib.id === p.selectedLibId ? 'selected' : ''}`}
              onClick={() => {
                p.setSelectedLibId(lib.id);
                if (lib.components[0]) {
                  p.setSelectedLibCompId(lib.components[0].id);
                  p.setSelectedPartIndex(1);
                }
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
            data-testid="schematic-cadlib-btn"
            onClick={() => setShowCadLibManager(true)}
          >
            + Импорт / Библиотеки CAD...
          </button>
        </div>
      </>
    )}

    <button type="button" className="dt-black-bar" aria-expanded={p.toolsExpanded} onClick={() => p.setToolsExpanded((v) => !v)}>
      <span>Инструменты</span>
      <span aria-hidden="true">{p.toolsExpanded ? '▼' : '▶'}</span>
    </button>
    {p.toolsExpanded && (
      <div style={{ background: '#202020', color: '#fff', padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label style={{ fontSize: 10.5 }}>
          Тип порта цепи:
          <select
            className="dt-select"
            style={{ width: '100%', marginTop: 2 }}
            value={p.netPortStyle}
            onChange={(e) => {
              const st = e.target.value as SchNetPort['style'];
              p.setNetPortStyle(st);
              p.setNetPortLabel(st === 'Ground' ? 'GND' : st === 'Power' ? '+5V' : 'SIG');
              p.setTool('netPort');
            }}
          >
            <option value="Ground">Земля (GND)</option>
            <option value="Power">Питание (+5V / +3V3)</option>
            <option value="PortLeft">Входной порт цепей</option>
            <option value="PortRight">Выходной порт цепей</option>
            <option value="OffPageIn">Межлистовой вход</option>
            <option value="OffPageOut">Межлистовой выход</option>
          </select>
        </label>
        <input
          className="dt-input"
          value={p.netPortLabel}
          onChange={(e) => p.setNetPortLabel(e.target.value)}
          placeholder="Имя цепи порта"
        />
      </div>
    )}

    <button type="button" className="dt-black-bar" aria-pressed={p.sortLibsAlpha} onClick={() => p.setSortLibsAlpha((v) => !v)}>
      <span>Сортировать по алфавиту</span>
      <span aria-hidden="true">{p.sortLibsAlpha ? '✓' : ''}</span>
    </button>

    <div style={{ padding: '2px 3px', background: '#141414', borderBottom: '1px solid #333' }}>
      <input
        style={{
          width: '100%',
          height: 18,
          fontSize: 10.5,
          background: '#000',
          color: '#eee',
          border: '1px solid #444',
          padding: '0 4px',
          outline: 'none'
        }}
        value={p.searchCompQuery}
        onChange={(e) => p.setSearchCompQuery(e.target.value)}
        placeholder="Фильтр компонентов..."
      />
    </div>

    <div className="dt-comp-list">
      {p.displayedLibComps.map((comp) => (
        <div
          key={comp.id}
          className={`dt-comp-item ${comp.id === (p.previewComponentDef?.id ?? '') ? 'selected' : ''}`}
          onClick={() => {
            p.setSelectedLibCompId(comp.id);
            p.setSelectedPartIndex(1);
            p.setTool('placeComp');
            p.setStatusMessage(`Готов к размещению: ${comp.name} (${comp.gostStandard}). R — поворот, Esc — отмена.`);
          }}
        >
          {comp.name}
        </div>
      ))}
    </div>

    <div style={{ padding: '2px 5px', background: '#f0f0f0', borderTop: '1px solid #c0c0c0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 10.5 }}>
        {p.previewComponentDef && p.previewComponentDef.parts.length > 1 ? (
          <select
            className="dt-select"
            style={{ height: 18, fontSize: 10.5 }}
            value={p.selectedPartIndex}
            onChange={(e) => p.setSelectedPartIndex(Number(e.target.value))}
          >
            {p.previewComponentDef.parts.map((pt) => (
              <option key={pt.partIndex} value={pt.partIndex}>{pt.name}</option>
            ))}
          </select>
        ) : (
          'Секция 1'
        )}
      </span>
      <label style={{ fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 3 }}>
        <input
          type="checkbox"
          checked={p.autoPowerCheck}
          onChange={(e) => p.setAutoPowerCheck(e.target.checked)}
        />
        Авт. VCC и GND
      </label>
    </div>

    <div className="dt-preview-area">
      <SymbolPreviewCanvas component={p.previewComponentDef} partIndex={p.selectedPartIndex} />
      <div className="dt-preview-label" title={p.previewPatternDef?.name}>
        {p.previewPatternDef?.name ?? 'Без корпуса'}
      </div>
      <PatternPreviewCanvas pattern={p.previewPatternDef} />
    </div>

    {showCadLibManager && (
      <CadLibraryManagerDialog
        initialTab="components"
        onClose={() => setShowCadLibManager(false)}
        onSelectComponent={(c) => {
          const lib = p.allLibraries.find((l) => l.components.some((x) => x.id === c.id));
          if (lib) p.setSelectedLibId(lib.id);
          p.setSelectedLibCompId(c.id);
          p.setSelectedPartIndex(1);
          p.setTool('placeComp');
          p.setStatusMessage(`Выбран компонент «${c.name}» — кликните на схему для установки.`);
        }}
      />
    )}
  </div>
  );
};
