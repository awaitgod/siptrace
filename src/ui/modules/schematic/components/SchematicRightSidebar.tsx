import React from 'react';
import { ErcError, ComponentDef, PatternDef, PlacedComponent, SchematicProject, SchematicSheet } from '../../../../core/types';
import { formatCoord } from '../../../../core/units';
import { NetGraphNode } from '../../../../engines/erc';
import { findPatternById } from '../../../../gost/libraries/gostPatterns';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { DipIcon } from '../../../theme/DipTraceIcons';
export interface SchematicRightSidebarProps {
    selectedIds?: string[];
    onProperties?: () => void;
    ercStale?: boolean;
    project: SchematicProject;
    activeSheet: SchematicSheet;
    userPatterns?: PatternDef[];
    selectedPlacedComp: PlacedComponent | null;
    inspectorCompDef: ComponentDef | null;
    selectedPartIndex: number;
    selectedWireId: string | null;
    selectedPortId?: string | null;
    selectedCompIds: string[];
    setSelectedCompIds: React.Dispatch<React.SetStateAction<string[]>>;
    managerTab: 'components' | 'nets' | 'erc';
    setManagerTab: (t: 'components' | 'nets' | 'erc') => void;
    schematicNets: NetGraphNode[];
    highlightedNet: string | null;
    setHighlightedNet: React.Dispatch<React.SetStateAction<string | null>>;
    ercErrors: ErcError[];
    setShowTitleDialog: (v: boolean) => void;
    onCenterWorldPt?: (x: number, y: number) => void;
    commitProject: (updater: (prev: SchematicProject) => SchematicProject, pushUndo?: boolean) => void;
    updateActiveSheet: (sheetUpdater: (s: SchematicSheet) => SchematicSheet, pushUndo?: boolean) => void;
}
/** Right docked sidebar displaying Properties, Project Manager (Components/Nets/ERC), and Pinout. */
export const SchematicRightSidebar: React.FC<SchematicRightSidebarProps> = (p) => (<div className="dt-right-sidebar">
    <button className="dt-btn" onClick={p.onProperties} disabled={!p.selectedIds?.length}>Свойства выделения ({p.selectedIds?.length ?? 0}) — E</button>
    {/* Свойства */}
    <div className="dt-panel-card" style={{ height: '31%' }}>
      <div className="dt-panel-header">
        <span>Свойства</span>
        <span style={{ fontSize: 10, color: '#666' }}>{p.selectedPlacedComp ? p.selectedPlacedComp.refDes : p.selectedWireId ? 'Проводник' : p.selectedPortId ? 'Порт цепи' : (p.selectedIds?.length ?? 0) > 0 ? `Объекты (${p.selectedIds!.length})` : 'Лист'}</span>
      </div>
      <div className="dt-panel-body">
        {p.selectedPlacedComp ? (<>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Поз. обозн.</div>
              <div className="dt-prop-val">
                <input className="dt-prop-input" value={p.selectedPlacedComp.refDes} onChange={(e) => p.updateActiveSheet((s) => ({
            ...s,
            components: s.components.map((c) => (c.id === p.selectedPlacedComp!.id ? { ...c, refDes: e.target.value } : c))
        }))}/>
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Номинал</div>
              <div className="dt-prop-val">
                <input className="dt-prop-input" value={p.selectedPlacedComp.value} onChange={(e) => p.updateActiveSheet((s) => ({
            ...s,
            components: s.components.map((c) => (c.id === p.selectedPlacedComp!.id ? { ...c, value: e.target.value } : c))
        }))}/>
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Тип / Модель</div>
              <div className="dt-prop-val">
                <input className="dt-prop-input" value={p.selectedPlacedComp.typeName} onChange={(e) => p.updateActiveSheet((s) => ({
            ...s,
            components: s.components.map((c) => (c.id === p.selectedPlacedComp!.id ? { ...c, typeName: e.target.value } : c))
        }))}/>
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Корпус</div>
              <div className="dt-prop-val">
                {p.userPatterns?.find((up) => up.id === p.selectedPlacedComp!.patternId)?.name ??
            p.project.customPatternDefs?.[p.selectedPlacedComp.patternId]?.name ??
            findPatternById(p.selectedPlacedComp.patternId)?.name ??
            p.selectedPlacedComp.patternId}
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Координаты</div>
              <div className="dt-prop-val">
                X={formatCoord(p.selectedPlacedComp.x, p.project.units)}, Y={formatCoord(p.selectedPlacedComp.y, p.project.units)}
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Угол</div>
              <div className="dt-prop-val">{p.selectedPlacedComp.angle}°</div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Не устанавлив.</div>
              <div className="dt-prop-val">
                <input type="checkbox" checked={Boolean(p.selectedPlacedComp.doNotMount)} onChange={(e) => p.updateActiveSheet((s) => ({
            ...s,
            components: s.components.map((c) => (c.id === p.selectedPlacedComp!.id ? { ...c, doNotMount: e.target.checked } : c))
        }))}/>
              </div>
            </div>
          </>) : p.selectedWireId ? ((() => {
        const wire = p.activeSheet.wires.find((w) => w.id === p.selectedWireId);
        if (!wire)
            return null;
        return (<>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Имя цепи</div>
                  <div className="dt-prop-val">
                    <input className="dt-prop-input" value={wire.netName} onChange={(e) => p.updateActiveSheet((s) => ({
                ...s,
                wires: s.wires.map((w) => (w.id === wire.id ? { ...w, netName: e.target.value } : w))
            }))}/>
                  </div>
                </div>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Класс цепи</div>
                  <div className="dt-prop-val">
                    <select className="dt-prop-input" value={wire.netClassId ?? p.project.netClasses[0]?.id} onChange={(e) => p.updateActiveSheet((s) => ({
                ...s,
                wires: s.wires.map((w) => (w.id === wire.id ? { ...w, netClassId: e.target.value } : w))
            }))}>
                      {p.project.netClasses.map((nc) => (<option key={nc.id} value={nc.id}>{nc.name}</option>))}
                    </select>
                  </div>
                </div>
              </>);
    })()) : p.selectedPortId ? ((() => {
        const port = p.activeSheet.netPorts.find((np) => np.id === p.selectedPortId);
        if (!port)
            return null;
        return (<>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Цепь порта</div>
                  <div className="dt-prop-val">
                    <input className="dt-prop-input" value={port.netName} onChange={(e) => p.updateActiveSheet((s) => ({
                ...s,
                netPorts: s.netPorts.map((np) => (np.id === port.id ? { ...np, netName: e.target.value } : np))
            }))}/>
                  </div>
                </div>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Стиль</div>
                  <div className="dt-prop-val">
                    <select className="dt-prop-input" value={port.style} onChange={(e) => p.updateActiveSheet((s) => ({
                ...s,
                netPorts: s.netPorts.map((np) => np.id === port.id ? { ...np, style: e.target.value as typeof port.style } : np)
            }))}>
                      <option value="Power">Питание (+5V/+3V3)</option>
                      <option value="Ground">Земля (GND)</option>
                      <option value="PortLeft">Вход (Input)</option>
                      <option value="PortRight">Выход (Output)</option>
                      <option value="OffPageIn">Межлистовой вход (Off-Page In)</option>
                      <option value="OffPageOut">Межлистовой выход (Off-Page Out)</option>
                    </select>
                  </div>
                </div>
              </>);
    })()) : (<>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Проект</div>
              <div className="dt-prop-val">
                <input className="dt-prop-input" title={p.project.projectName} value={p.project.projectName} onChange={(e) => p.commitProject((prev) => ({ ...prev, projectName: e.target.value }), false)}/>
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Обозначение</div>
              <div className="dt-prop-val">{p.activeSheet.titleBlock.designation}</div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Формат</div>
              <div className="dt-prop-val" title={SHEET_FORMATS[p.activeSheet.format]?.label ?? p.activeSheet.format}>{SHEET_FORMATS[p.activeSheet.format]?.label ?? p.activeSheet.format}</div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Штамп ГОСТ</div>
              <div className="dt-prop-val">
                <button className="dt-btn" style={{ height: 17, fontSize: 10 }} onClick={() => p.setShowTitleDialog(true)}>Настроить...</button>
              </div>
            </div>
          </>)}
      </div>
    </div>

    {/* Менеджер проекта */}
    <div className="dt-panel-card" style={{ flex: 1 }}>
      <div className="dt-panel-header">
        <span>Менеджер проекта</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className={`dt-tb-btn ${p.managerTab === 'components' ? 'active' : ''}`} style={{ width: 18, height: 16 }} title="Компоненты" onClick={() => p.setManagerTab('components')}>
            <DipIcon name="managerComp" size={13}/>
          </button>
          <button className={`dt-tb-btn ${p.managerTab === 'nets' ? 'active' : ''}`} style={{ width: 18, height: 16 }} title="Цепи схемы" onClick={() => p.setManagerTab('nets')}>
            <DipIcon name="managerNet" size={13}/>
          </button>
          <button className={`dt-tb-btn ${p.managerTab === 'erc' ? 'active' : ''}`} style={{ width: 18, height: 16 }} title="Результаты ERC" onClick={() => p.setManagerTab('erc')}>
            <DipIcon name="managerErr" size={13}/>
          </button>
        </div>
      </div>
      <div className="dt-panel-body">
        {p.managerTab === 'components' &&
        p.activeSheet.components
            .filter((c) => !c.refDes.startsWith('#'))
            .map((c) => {
            const pat = p.userPatterns?.find((up) => up.id === c.patternId) ??
                p.project.customPatternDefs?.[c.patternId] ??
                findPatternById(c.patternId);
            return (<div key={c.id} className={`dt-tree-row ${p.selectedCompIds.includes(c.id) ? 'selected' : ''}`} onClick={() => {
                    p.setSelectedCompIds([c.id]);
                    p.setHighlightedNet(null);
                    p.onCenterWorldPt?.(c.x, c.y);
                }}>
                  {c.refDes} - {c.value || c.typeName} - {pat?.name ?? c.patternId}
                </div>);
        })}

        {p.managerTab === 'nets' &&
        p.schematicNets.map((net) => (<div key={net.netName} className={`dt-tree-row ${p.highlightedNet === net.netName ? 'selected' : ''}`} onClick={() => p.setHighlightedNet((cur) => (cur === net.netName ? null : net.netName))}>
              {net.netName} ({net.pins.length} выв.)
            </div>))}

        {p.managerTab === 'erc' &&
        (p.ercErrors.length === 0 ? (<div style={{ padding: 8, color: p.ercStale ? '#775500' : '#2b7a2b' }}>{p.ercStale ? 'Схема изменена или ещё не проверена. Нажмите F9.' : 'Нарушений ERC не найдено.'}</div>) : (p.ercErrors.map((err) => (<div key={err.id} className="dt-tree-row" style={{ color: err.severity === 'Error' ? '#c00' : '#996000', whiteSpace: 'normal', lineHeight: '14px', padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }} onClick={() => {
                if (err.sheetId !== p.project.activeSheetId) {
                    p.commitProject((prev) => ({ ...prev, activeSheetId: err.sheetId }), false);
                }
                if (err.objectId)
                    p.setSelectedCompIds([err.objectId]);
                if (typeof err.x === 'number' && typeof err.y === 'number') {
                    p.onCenterWorldPt?.(err.x, err.y);
                }
            }}>
                <b>[{err.code}]</b> {err.message}
              </div>))))}
      </div>
    </div>

    {/* Выводы секции */}
    <div className="dt-panel-card" style={{ height: '27%' }}>
      <div className="dt-panel-header">
        <span style={{ flexShrink: 0 }}>Выводы секции</span>
        <span style={{ fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }} title={p.inspectorCompDef?.name ?? ''}>
          {p.inspectorCompDef?.name ?? ''}
        </span>
      </div>
      <div className="dt-panel-body">
        {p.inspectorCompDef ? ((() => {
        const pt = p.inspectorCompDef.parts.find((part) => part.partIndex === (p.selectedPlacedComp?.partIndex ?? p.selectedPartIndex)) ?? p.inspectorCompDef.parts[0];
        return pt?.pins.map((pin) => (<div key={pin.id} className="dt-prop-row" style={{ gridTemplateColumns: '32px 1fr 48px' }}>
                <div className="dt-prop-key" style={{ textAlign: 'center' }}>{pin.number}</div>
                <div className="dt-prop-val">{pin.name || '—'}</div>
                <div className="dt-prop-val" style={{ color: '#666', fontSize: 10 }}>
                  {pin.electricalType}
                </div>
              </div>));
    })()) : (<div style={{ padding: 8, color: '#777' }}>Выберите компонент</div>)}
      </div>
    </div>
  </div>);
