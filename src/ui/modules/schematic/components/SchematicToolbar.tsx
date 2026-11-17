import React from 'react';
import { PlacedComponent, Point2D, SchematicProject, SchematicSheet } from '../../../../core/types';
import { STANDARD_GRID_STEPS_MM, formatGridValue } from '../../../../core/units';
import { renumberSchematicComponents } from '../../../../engines/erc';
import { DipIcon } from '../../../theme/DipTraceIcons';
import { SCHEMATIC_ZOOM_OPTIONS } from '../constants';
import { cloneClipboardComponents } from '../services/schematicActionsService';
import { SchToolId } from '../types';
export interface SchematicToolbarProps {
    selectionCount: number;
    onCopy: () => void;
    onPaste: () => void;
    canPaste: boolean;
    hotkeys: Record<string, string>;
    project: SchematicProject;
    activeSheet: SchematicSheet;
    historyLength: number;
    redoLength: number;
    selectedCompIds: string[];
    clipboardComps: PlacedComponent[];
    setClipboardComps: React.Dispatch<React.SetStateAction<PlacedComponent[]>>;
    zoomPercent: number;
    setZoomByPercent: (pct: number) => void;
    tool: SchToolId;
    setTool: React.Dispatch<React.SetStateAction<SchToolId>>;
    setWireDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
    setShapeStartPt: React.Dispatch<React.SetStateAction<Point2D | null>>;
    commitProject: (updater: (prev: SchematicProject) => SchematicProject, pushUndo?: boolean) => void;
    updateActiveSheet: (sheetUpdater: (s: SchematicSheet) => SchematicSheet, pushUndo?: boolean) => void;
    handleNewProject: () => void;
    handleOpenFile: () => void;
    handleSaveFile: () => void;
    setShowTitleDialog: (v: boolean) => void;
    setShowBomDialog: (v: boolean) => void;
    handleUndo: () => void;
    handleRedo: () => void;
    zoomToFit: () => void;
    setShowFindDialog: (v: boolean) => void;
    handleRunErc: () => void;
    handleRunSpice: () => void;
    handleConvertToPcb: () => void;
}
/** Main DipTrace-style horizontal schematic toolbar. */
export const SchematicToolbar: React.FC<SchematicToolbarProps> = (p) => (<div className="dt-toolbar-row">
    <button className="dt-tb-btn" title="Новая схема" onClick={p.handleNewProject}><DipIcon name="new"/></button>
    <button className="dt-tb-btn" title="Открыть схему (Ctrl+O)" onClick={p.handleOpenFile}><DipIcon name="open"/></button>
    <button className="dt-tb-btn" title={`Сохранить схему (${p.hotkeys.save})`} onClick={p.handleSaveFile}><DipIcon name="save"/></button>
    <button className="dt-tb-btn" title="Настройка листа / Штамп ГОСТ 2.104" onClick={() => p.setShowTitleDialog(true)}><DipIcon name="preview"/></button>
    <button className="dt-tb-btn" title="Перечень элементов ПЭ3 (ГОСТ 2.701)" onClick={() => p.setShowBomDialog(true)}><DipIcon name="bom"/></button>
    <div className="dt-tb-sep"/>
    <button className="dt-tb-btn" title={`Копировать (${p.hotkeys.copy})`} disabled={p.selectionCount === 0} onClick={p.onCopy}>
      <DipIcon name="copy"/>
    </button>
    <button className="dt-tb-btn" title={`Вставить (${p.hotkeys.paste})`} disabled={!p.canPaste} onClick={p.onPaste}>
      <DipIcon name="paste"/>
    </button>
    <div className="dt-tb-sep"/>
    <button className="dt-tb-btn" title={`Отменить (${p.hotkeys.undo})`} disabled={p.historyLength === 0} onClick={p.handleUndo}><DipIcon name="undo"/></button>
    <button className="dt-tb-btn" title={`Повторить (${p.hotkeys.redo})`} disabled={p.redoLength === 0} onClick={p.handleRedo}><DipIcon name="redo"/></button>
    <div className="dt-tb-sep"/>
    <button className="dt-tb-btn" title={`Показать весь лист (${p.hotkeys.zoomFit})`} onClick={p.zoomToFit}><DipIcon name="zoomAll"/></button>
    <button className="dt-tb-btn" title={`Приблизить (${p.hotkeys.zoomIn})`} onClick={() => p.setZoomByPercent(Math.round(p.zoomPercent * 1.25))}><DipIcon name="zoomIn"/></button>
    <button className="dt-tb-btn" title={`Отдалить (${p.hotkeys.zoomOut})`} onClick={() => p.setZoomByPercent(Math.max(15, Math.round(p.zoomPercent / 1.25)))}><DipIcon name="zoomOut"/></button>
    <button className={`dt-tb-btn ${p.tool === 'zoomBox' ? 'active' : ''}`} title="Рамка приближения" onClick={() => { p.setShapeStartPt(null); p.setTool('zoomBox'); }}><DipIcon name="zoomBox"/></button>
    <select className="dt-tb-select" style={{ width: 62 }} value={SCHEMATIC_ZOOM_OPTIONS.includes(p.zoomPercent) ? p.zoomPercent : 'custom'} onChange={(e) => {
        if (e.target.value !== 'custom')
            p.setZoomByPercent(Number(e.target.value));
    }}>
      {!SCHEMATIC_ZOOM_OPTIONS.includes(p.zoomPercent) && <option value="custom">{p.zoomPercent}%</option>}
      {SCHEMATIC_ZOOM_OPTIONS.map((z) => (<option key={z} value={z}>{z}%</option>))}
    </select>
    <select className="dt-tb-select" style={{ width: 68 }} value={p.project.gridSize} onChange={(e) => p.commitProject((prev) => ({ ...prev, gridSize: parseFloat(e.target.value) }), false)}>
      {STANDARD_GRID_STEPS_MM.map((g) => (<option key={g} value={g}>{formatGridValue(g, p.project.units)}</option>))}
    </select>
    <div className="dt-tb-sep"/>
    <button className={`dt-tb-btn ${p.tool === 'select' ? 'active' : ''}`} title={`Режим выделения (${p.hotkeys.selectTool})`} onClick={() => p.setTool('select')}><DipIcon name="select"/></button>
    <button className={`dt-tb-btn ${p.tool === 'origin' ? 'active' : ''}`} title="Установить начало координат" onClick={() => p.setTool('origin')}><DipIcon name="origin"/></button>
    <button className="dt-tb-btn" title={`Найти элемент / цепь (${p.hotkeys.find})`} onClick={() => p.setShowFindDialog(true)}><DipIcon name="find"/></button>
    <div className="dt-tb-sep"/>
    <button className={`dt-tb-btn ${p.tool === 'wire' ? 'active' : ''}`} title={`Проложить провод (${p.hotkeys.placeWire})`} onClick={() => { p.setWireDraftPts([]); p.setTool('wire'); }}><DipIcon name="wire"/></button>
    <button className={`dt-tb-btn ${p.tool === 'junction' ? 'active' : ''}`} title={`Узел соединения (${p.hotkeys.placeJunction})`} onClick={() => p.setTool('junction')}><DipIcon name="junction"/></button>
    <button className={`dt-tb-btn ${p.tool === 'bus' ? 'active' : ''}`} title={`Проложить шину (${p.hotkeys.placeBus})`} onClick={() => { p.setWireDraftPts([]); p.setTool('bus'); }}><DipIcon name="bus"/></button>
    <button className={`dt-tb-btn ${p.tool === 'busTap' ? 'active' : ''}`} title={`Отвод шины (${p.hotkeys.placeBusTap})`} onClick={() => p.setTool('busTap')}><DipIcon name="busTap"/></button>
    <button className={`dt-tb-btn ${p.tool === 'netPort' ? 'active' : ''}`} title={`Порт цепи / Земля / Питание (${p.hotkeys.placePort})`} onClick={() => p.setTool('netPort')}><DipIcon name="netPort"/></button>
    <button className={`dt-tb-btn ${p.tool === 'noConnect' ? 'active' : ''}`} title={`Не подключать (${p.hotkeys.noConnect})`} onClick={() => p.setTool('noConnect')}><DipIcon name="noConnect"/></button>
    <button className={`dt-tb-btn ${p.tool === 'placeComp' ? 'active' : ''}`} title="Разместить выбранный компонент" onClick={() => p.setTool('placeComp')}><DipIcon name="placeComp"/></button>
    <div className="dt-tb-sep"/>
    <button className={`dt-tb-btn ${p.tool === 'shapeLine' ? 'active' : ''}`} title="Нарисовать линию" onClick={() => { p.setShapeStartPt(null); p.setTool('shapeLine'); }}><DipIcon name="shapeLine"/></button>
    <button className={`dt-tb-btn ${p.tool === 'shapeRect' ? 'active' : ''}`} title="Нарисовать прямоугольник" onClick={() => { p.setShapeStartPt(null); p.setTool('shapeRect'); }}><DipIcon name="shapeRect"/></button>
    <button className={`dt-tb-btn ${p.tool === 'shapeCircle' ? 'active' : ''}`} title={`Нарисовать окружность (${p.hotkeys.placeCircle})`} onClick={() => { p.setShapeStartPt(null); p.setTool('shapeCircle'); }}><DipIcon name="shapeCircle"/></button>
    <button className={`dt-tb-btn ${p.tool === 'shapeText' ? 'active' : ''}`} title="Вставить текстовую надпись" onClick={() => p.setTool('shapeText')}><DipIcon name="shapeText"/></button>
    <button className={`dt-tb-btn ${p.tool === 'table' ? 'active' : ''}`} title="Вставить таблицу" onClick={() => p.setTool('table')}><DipIcon name="table"/></button>
    <button className={`dt-tb-btn ${p.tool === 'hierarchy' ? 'active' : ''}`} title="Иерархический блок" onClick={() => p.setTool('hierarchy')}><DipIcon name="hierarchy"/></button>
    <button className={`dt-tb-btn ${p.tool === 'diffPair' ? 'active' : ''}`} title="Метка дифф. пары" onClick={() => p.setTool('diffPair')}><DipIcon name="diffPair"/></button>
    <div className="dt-tb-sep"/>
    <button className="dt-tb-btn" title="Автонумерация элементов (ГОСТ)" onClick={() => p.commitProject((prev) => renumberSchematicComponents(prev))}><DipIcon name="renumber"/></button>
    <button className="dt-tb-btn" title={`Проверка ERC (${p.hotkeys.runCheck})`} onClick={p.handleRunErc}><DipIcon name="erc"/></button>
    <button className="dt-tb-btn" title="SPICE симуляция цепи" onClick={p.handleRunSpice}><DipIcon name="spice"/></button>
    <button className="dt-tb-btn" title={`Преобразовать в печатную плату (${p.hotkeys.convertToPcb})`} onClick={p.handleConvertToPcb}><DipIcon name="toPcb"/></button>
  </div>);
