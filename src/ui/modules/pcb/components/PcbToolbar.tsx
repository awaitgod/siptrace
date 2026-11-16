import React from 'react';
import { PcbProject, Point2D } from '../../../../core/types';
import { formatGridValue } from '../../../../core/units';
import { openAppModule } from '../../../../core/store';
import { DipIcon } from '../../../theme/DipTraceIcons';
import { PCB_GRID_STEPS, PCB_ZOOM_OPTIONS } from '../constants';
import { CopperLayerId, PcbToolId } from '../types';

export interface PcbToolbarProps {
  pcb: PcbProject;
  historyLength: number;
  redoLength: number;
  zoomPercent: number;
  activeLayer: CopperLayerId;
  tool: PcbToolId;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  handleNewProject: () => void;
  handleOpenPcbFile: () => void;
  handleSavePcbFile: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  zoomToFit: () => void;
  setZoomPercent: (pct: number) => void;
  switchCopperLayer: (layer: CopperLayerId) => void;
  setTool: React.Dispatch<React.SetStateAction<PcbToolId>>;
  setRouteDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setPolyDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setShowCompareDialog: (v: boolean) => void;
  setShowPourDialog: (v: boolean) => void;
  handleUpdatePours: () => void;
  handleAutoplace: () => void;
  handleAutoroute: () => void;
  handleRunDrc: () => void;
  setShowCamDialog: (v: boolean) => void;
  onSwitchModule?: (m: any) => void;
}

/** Main PCB Editor toolbar row preserving DipTrace button order and tooltips. */
export const PcbToolbar: React.FC<PcbToolbarProps> = (p) => (
  <div className="dt-toolbar-row">
    <button className="dt-tb-btn" title="Новый проект / Новая плата (Ctrl+N)" onClick={p.handleNewProject}><DipIcon name="new" /></button>
    <button className="dt-tb-btn" title="Открыть / Импортировать плату (Ctrl+O)" onClick={p.handleOpenPcbFile}><DipIcon name="open" /></button>
    <button className="dt-tb-btn" title="Сохранить плату (.gostpcb, Ctrl+S)" onClick={p.handleSavePcbFile}><DipIcon name="save" /></button>
    <button className="dt-tb-btn" title="Сравнить/Обновить из схемы" onClick={() => p.setShowCompareDialog(true)}><DipIcon name="toSch" /></button>
    <div className="dt-tb-sep" />
    <button className="dt-tb-btn" title="Отменить (Ctrl+Z)" disabled={p.historyLength === 0} onClick={p.handleUndo}><DipIcon name="undo" /></button>
    <button className="dt-tb-btn" title="Повторить (Ctrl+Y)" disabled={p.redoLength === 0} onClick={p.handleRedo}><DipIcon name="redo" /></button>
    <div className="dt-tb-sep" />
    <button className="dt-tb-btn" title="Показать всю плату (Home)" onClick={p.zoomToFit}><DipIcon name="zoomAll" /></button>
    <button className="dt-tb-btn" title="Приблизить" onClick={() => p.setZoomPercent(Math.round(p.zoomPercent * 1.25))}><DipIcon name="zoomIn" /></button>
    <button className="dt-tb-btn" title="Отдалить" onClick={() => p.setZoomPercent(Math.max(20, Math.round(p.zoomPercent / 1.25)))}><DipIcon name="zoomOut" /></button>
    <select className="dt-tb-select" style={{ width: 60 }} value={PCB_ZOOM_OPTIONS.includes(p.zoomPercent) ? p.zoomPercent : 'c'} onChange={(e) => e.target.value !== 'c' && p.setZoomPercent(Number(e.target.value))}>
      {!PCB_ZOOM_OPTIONS.includes(p.zoomPercent) && <option value="c">{p.zoomPercent}%</option>}
      {PCB_ZOOM_OPTIONS.map((z) => <option key={z} value={z}>{z}%</option>)}
    </select>
    <select className="dt-tb-select" style={{ width: 68 }} value={p.pcb.gridSize} onChange={(e) => p.commitPcb((prev) => ({ ...prev, gridSize: parseFloat(e.target.value) }), false)}>
      {PCB_GRID_STEPS.map((g) => <option key={g} value={g}>{formatGridValue(g, p.pcb.units)}</option>)}
    </select>
    <select
      className="dt-tb-select"
      style={{ width: 112 }}
      value={p.activeLayer}
      onChange={(e) => p.switchCopperLayer(e.target.value as CopperLayerId)}
    >
      <option value="TopCopper">Слой: Верхний (Top)</option>
      {p.pcb.layerCount === 4 && <option value="Inner1">Слой: Внутр. 1 (GND)</option>}
      {p.pcb.layerCount === 4 && <option value="Inner2">Слой: Внутр. 2 (PWR)</option>}
      <option value="BottomCopper">Слой: Нижний (Bot)</option>
    </select>
    <div className="dt-tb-sep" />
    <button className={`dt-tb-btn ${p.tool === 'select' ? 'active' : ''}`} title="Выбор / Перемещение" onClick={() => p.setTool('select')}><DipIcon name="select" /></button>
    <button className={`dt-tb-btn ${p.tool === 'routeManual' ? 'active' : ''}`} title="Ручная трассировка 45° (клавиша V — переходной слой)" onClick={() => { p.setRouteDraftPts([]); p.setTool('routeManual'); }}><DipIcon name="routeManual" /></button>
    <button className={`dt-tb-btn ${p.tool === 'via' ? 'active' : ''}`} title="Установить переходное отверстие (Via)" onClick={() => p.setTool('via')}><DipIcon name="via" /></button>
    <button className={`dt-tb-btn ${p.tool === 'meander' ? 'active' : ''}`} title="Змейка (выравнивание длины трассы)" onClick={() => p.setTool('meander')}><DipIcon name="meander" /></button>
    <button className={`dt-tb-btn ${p.tool === 'copperPour' ? 'active' : ''}`} title="Заливка медным полигоном" onClick={() => p.setShowPourDialog(true)}><DipIcon name="pour" /></button>
    <button className="dt-tb-btn" title="Обновить полигоны меди" onClick={p.handleUpdatePours}><DipIcon name="pourUpdate" /></button>
    <button className={`dt-tb-btn ${p.tool === 'boardOutline' ? 'active' : ''}`} title="Контур платы" onClick={() => { p.setPolyDraftPts([]); p.setTool('boardOutline'); }}><DipIcon name="boardOutline" /></button>
    <button className={`dt-tb-btn ${p.tool === 'cutout' ? 'active' : ''}`} title="Вырез в плате" onClick={() => { p.setPolyDraftPts([]); p.setTool('cutout'); }}><DipIcon name="cutout" /></button>
    <button className={`dt-tb-btn ${p.tool === 'keepout' ? 'active' : ''}`} title="Зона запрета трассировки" onClick={() => { p.setPolyDraftPts([]); p.setTool('keepout'); }}><DipIcon name="keepout" /></button>
    <button className={`dt-tb-btn ${p.tool === 'measure' ? 'active' : ''}`} title="Линейка (измерение)" onClick={() => p.setTool('measure')}><DipIcon name="measure" /></button>
    <div className="dt-tb-sep" />
    <button className="dt-tb-btn" title="Авторазмещение компонентов" onClick={p.handleAutoplace}><DipIcon name="autoplace" /></button>
    <button className="dt-tb-btn" title="Автотрассировщик" onClick={p.handleAutoroute}><DipIcon name="autoroute" /></button>
    <button className="dt-tb-btn" title="Проверка DRC (F9)" onClick={p.handleRunDrc}><DipIcon name="drc" /></button>
    <button className="dt-tb-btn" title="3D-просмотр печатной платы" onClick={() => openAppModule('pcb3d', (m) => p.onSwitchModule?.(m))}><DipIcon name="view3d" /></button>
    <button className="dt-tb-btn" title="Экспорт Gerber RS-274X / Сверловка / ЛУТ SVG" onClick={() => p.setShowCamDialog(true)}><DipIcon name="gerber" /></button>
  </div>
);
