import { printSchematicProject } from '../services/printSchematic';
import { ComponentDef, PlacedComponent, SchematicProject, SchematicSheet, Units } from '../../../../core/types';
import { AppSettings, createProjectFromOptions, openAppModule, saveSettings } from '../../../../core/store';
import { renumberSchematicComponents } from '../../../../engines/erc';
import { exportDipTraceAsciiSchematic } from '../../../../engines/importers';
import { exportDipTraceAsciiNetlist } from '../../../../engines/netlist';
import { exportSpiceNetlist } from '../../../../engines/spice';
import { TopMenuSpec } from '../../../components/MenuBar';
import { cloneClipboardComponents, generateSchematicSvg } from '../services/schematicActionsService';
import { SchToolId } from '../types';
export interface CreateSchematicTopMenusParams {
    onCut: () => void;
    onDuplicate: () => void;
    onProperties: () => void;
    selectedIds: string[];
    onCopy: () => void;
    onPaste: () => void;
    canPaste: boolean;
    hotkeys: Record<string, string>;
    project: SchematicProject;
    activeSheet: SchematicSheet;
    customCompMap: Record<string, ComponentDef>;
    historyLength: number;
    redoLength: number;
    selectedCompIds: string[];
    clipboardComps: PlacedComponent[];
    setClipboardComps: React.Dispatch<React.SetStateAction<PlacedComponent[]>>;
    showGrid: boolean;
    setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
    zoomPercent: number;
    setZoomByPercent: (pct: number) => void;
    tool: SchToolId;
    setTool: React.Dispatch<React.SetStateAction<SchToolId>>;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    commitProject: (updater: (prev: SchematicProject) => SchematicProject, pushUndo?: boolean) => void;
    replaceProject: (next: SchematicProject) => void;
    confirmDiscardIfDirty: () => boolean;
    updateActiveSheet: (sheetUpdater: (s: SchematicSheet) => SchematicSheet, pushUndo?: boolean) => void;
    setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
    handleNewProject: () => void;
    handleOpenFile: () => void;
    handleSaveFile: (saveAs?: boolean) => void;
    handleUndo: () => void;
    handleRedo: () => void;
    deleteSelection: () => void;
    rotateSelection: () => void;
    flipSelection: (axis: 'X' | 'Y') => void;
    zoomToFit: () => void;
    handleConvertToPcb: () => void;
    handleUpdatePcbFromSchematic: () => void;
    handleRunErc: () => void;
    handleRunSpice: () => void;
    handleExportTextFile: (filename: string, content: string, ext: string, desc?: string) => void;
    setShowTitleDialog: (v: boolean) => void;
    setShowBomDialog: (v: boolean) => void;
    setShowFindDialog: (v: boolean) => void;
    setShowNetClassesDialog: (v: boolean) => void;
    setShowColorDialog: (v: boolean) => void;
    setShowErcSettingsDialog: (v: boolean) => void;
    setShowHotkeysDialog: (v: boolean) => void;
    handleAlignSelection: (axis: 'x' | 'y') => void;
    onSwitchModule?: (m: any) => void;
}
/** Builds the exact DipTrace Russian top menu specification for Schematic Capture. */
export function createSchematicTopMenus(p: CreateSchematicTopMenusParams): TopMenuSpec[] {
    return [
        {
            id: 'file',
            label: 'Файл',
            items: [
                { label: 'Новый проект...', shortcut: 'Ctrl+N', onClick: p.handleNewProject },
                { label: 'Открыть...', shortcut: 'Ctrl+O', onClick: p.handleOpenFile },
                { label: 'Импорт сторонних САПР (DipTrace / Proteus / KiCad / Eagle / EasyEDA / Altium)...', onClick: p.handleOpenFile },
                {
                    label: 'Открыть проект «Гальваническая развязка RS-485»',
                    onClick: () => {
                        if (!p.confirmDiscardIfDirty())
                            return;
                        const res = createProjectFromOptions({
                            mode: 'demo_rs485',
                            projectName: 'RS-485',
                            titleName: 'Гальваническая развязка RS-485',
                            designation: 'ГТРС.468364.001',
                            sheetFormat: 'A3_L',
                            boardWidthMm: 90,
                            boardHeightMm: 55,
                            boardCornerRadiusMm: 0,
                            boardIsCircle: false,
                            boardLayers: 2,
                            accuracyClass: 4,
                            units: 'mm',
                            developer: '',
                            checker: '',
                            normControl: '',
                            organization: ''
                        }, 'schematic');
                        if (res.schematic)
                            p.replaceProject(res.schematic);
                        p.setStatusMessage(res.statusMessage);
                    }
                },
                {
                    label: 'Открыть проект «Контроллер К1986ВЕ92QI»',
                    onClick: () => {
                        if (!p.confirmDiscardIfDirty())
                            return;
                        const res = createProjectFromOptions({
                            mode: 'demo_mcu',
                            projectName: 'К1986ВЕ92QI',
                            titleName: 'Контроллер К1986ВЕ92QI',
                            designation: 'ГТРС.468364.005',
                            sheetFormat: 'A3_L',
                            boardWidthMm: 100,
                            boardHeightMm: 70,
                            boardCornerRadiusMm: 0,
                            boardIsCircle: false,
                            boardLayers: 2,
                            accuracyClass: 4,
                            units: 'mm',
                            developer: '',
                            checker: '',
                            normControl: '',
                            organization: ''
                        }, 'schematic');
                        if (res.schematic)
                            p.replaceProject(res.schematic);
                        p.setStatusMessage(res.statusMessage);
                    }
                },
                { separator: true },
                { label: 'Сохранить', shortcut: p.hotkeys.save, onClick: () => p.handleSaveFile(false) },
                { label: 'Сохранить как...', shortcut: p.hotkeys.saveAs, onClick: () => p.handleSaveFile(true) },
                { separator: true },
                { label: 'Заголовки и настройка листа (ГОСТ 2.104)...', onClick: () => p.setShowTitleDialog(true) },
                { label: 'Перечень элементов по ГОСТ 2.701 / 2.106 (ПЭ3)...', onClick: () => p.setShowBomDialog(true) },
                { label: 'Печать чертежа ГОСТ...', shortcut: 'Ctrl+P', onClick: () => printSchematicProject(p.project, p.customCompMap) },
                { separator: true },
                { label: 'Преобразовать в плату (PCB Layout)', shortcut: p.hotkeys.convertToPcb, onClick: p.handleConvertToPcb },
                { label: 'Обновить плату по схеме', onClick: p.handleUpdatePcbFromSchematic },
                { separator: true },
                {
                    label: 'Экспорт схемы DipTrace ASCII (.dch)...',
                    onClick: () => p.handleExportTextFile(`${p.project.projectName}.dch`, exportDipTraceAsciiSchematic(p.project), 'dch', 'DipTrace ASCII Schematic')
                },
                {
                    label: 'Экспорт списка цепей DipTrace ASCII (.net)...',
                    onClick: () => p.handleExportTextFile(`${p.project.projectName}.net`, exportDipTraceAsciiNetlist(p.project), 'net', 'Список цепей DipTrace')
                },
                {
                    label: 'Экспорт SPICE-схемы (.cir)...',
                    onClick: () => p.handleExportTextFile(`${p.project.projectName}.cir`, exportSpiceNetlist(p.project), 'cir', 'SPICE список цепей')
                },
                {
                    label: 'Экспорт векторного чертежа ГОСТ (.svg)...',
                    onClick: () => p.handleExportTextFile(`${p.project.projectName}.svg`, generateSchematicSvg(p.activeSheet, p.customCompMap), 'svg', 'SVG чертёж')
                },
                { separator: true },
                { label: 'Стартовое окно (Запуск)...', onClick: () => openAppModule('launcher', (m) => p.onSwitchModule?.(m)) }
            ]
        },
        {
            id: 'edit',
            label: 'Правка',
            items: [
                { label: 'Отменить', shortcut: p.hotkeys.undo, disabled: p.historyLength === 0, onClick: p.handleUndo },
                { label: 'Повторить', shortcut: p.hotkeys.redo, disabled: p.redoLength === 0, onClick: p.handleRedo },
                { separator: true },
                {
                    label: 'Копировать',
                    shortcut: p.hotkeys.copy,
                    disabled: p.selectedIds.length === 0,
                    onClick: p.onCopy
                },
                {
                    label: 'Вставить',
                    shortcut: p.hotkeys.paste,
                    disabled: !p.canPaste,
                    onClick: p.onPaste
                },
                { label: 'Вырезать', shortcut: p.hotkeys.cut, onClick: p.onCut },
                { label: 'Дублировать', shortcut: p.hotkeys.duplicate, onClick: p.onDuplicate },
                { label: 'Свойства выделения...', shortcut: p.hotkeys.properties, onClick: p.onProperties },
                { label: 'Удалить выделенное', shortcut: 'Del', onClick: p.deleteSelection },
                { separator: true },
                { label: 'Повернуть на 90°', shortcut: p.hotkeys.rotate, onClick: p.rotateSelection },
                { label: 'Отразить по горизонтали', shortcut: p.hotkeys.flipX, onClick: () => p.flipSelection('X') },
                { label: 'Отразить по вертикали', shortcut: p.hotkeys.flipY, onClick: () => p.flipSelection('Y') },
                { label: 'Выровнять выделенные по вертикальной оси (X)', onClick: () => p.handleAlignSelection('x') },
                { label: 'Выровнять выделенные по горизонтальной оси (Y)', onClick: () => p.handleAlignSelection('y') },
                { separator: true },
                { label: 'Найти компонент / цепь...', shortcut: p.hotkeys.find, onClick: () => p.setShowFindDialog(true) },
                { label: 'Свойства классов цепей...', onClick: () => p.setShowNetClassesDialog(true) }
            ]
        },
        {
            id: 'view',
            label: 'Вид',
            items: [
                { label: 'Отображать сетку', shortcut: p.hotkeys.toggleGrid, checked: p.showGrid, onClick: () => p.setShowGrid((g) => !g) },
                { label: 'Показать весь лист', shortcut: p.hotkeys.zoomFit, onClick: p.zoomToFit },
                { label: 'Увеличить масштаб', shortcut: p.hotkeys.zoomIn, onClick: () => p.setZoomByPercent(Math.round(p.zoomPercent * 1.25)) },
                { label: 'Уменьшить масштаб', shortcut: p.hotkeys.zoomOut, onClick: () => p.setZoomByPercent(Math.max(15, Math.round(p.zoomPercent / 1.25))) },
                { separator: true },
                { label: 'Настройка цветов и темы (Тёмная / ГОСТ Белая)...', onClick: () => p.setShowColorDialog(true) },
                {
                    label: 'Единицы измерения: мм',
                    checked: p.project.units === 'mm',
                    onClick: () => {
                        p.commitProject((prev) => ({ ...prev, units: 'mm' }), false);
                        p.setSettings((s) => {
                            const next = { ...s, units: 'mm' as Units };
                            saveSettings(next);
                            return next;
                        });
                    }
                },
                {
                    label: 'Единицы измерения: mil',
                    checked: p.project.units === 'mil',
                    onClick: () => {
                        p.commitProject((prev) => ({ ...prev, units: 'mil' }), false);
                        p.setSettings((s) => {
                            const next = { ...s, units: 'mil' as Units };
                            saveSettings(next);
                            return next;
                        });
                    }
                }
            ]
        },
        {
            id: 'objects',
            label: 'Объекты',
            items: [
                { label: 'Выбор / Перемещение', shortcut: p.hotkeys.selectTool, checked: p.tool === 'select', onClick: () => p.setTool('select') },
                { separator: true },
                { label: 'Провод (Wire)', shortcut: p.hotkeys.placeWire, checked: p.tool === 'wire', onClick: () => p.setTool('wire') },
                { label: 'Узел соединения', shortcut: p.hotkeys.placeJunction, onClick: () => p.setTool('junction') },
                { label: 'Отвод шины', shortcut: p.hotkeys.placeBusTap, onClick: () => p.setTool('busTap') },
                { label: 'Метка цепи', onClick: () => p.setTool('pinLabel') },
                { label: 'Не подключать', shortcut: p.hotkeys.noConnect, onClick: () => p.setTool('noConnect') },
                { label: 'Окружность', shortcut: p.hotkeys.placeCircle, onClick: () => p.setTool('shapeCircle') },
                { label: 'Шина (Bus)', shortcut: p.hotkeys.placeBus, checked: p.tool === 'bus', onClick: () => p.setTool('bus') },
                { label: 'Порт цепи / Земля / Питание', shortcut: p.hotkeys.placePort, checked: p.tool === 'netPort', onClick: () => p.setTool('netPort') },
                { separator: true },
                { label: 'Иерархический блок', checked: p.tool === 'hierarchy', onClick: () => p.setTool('hierarchy') },
                { label: 'Метка дифференциальной пары', checked: p.tool === 'diffPair', onClick: () => p.setTool('diffPair') },
                { separator: true },
                { label: 'Линия', checked: p.tool === 'shapeLine', onClick: () => p.setTool('shapeLine') },
                { label: 'Прямоугольник', checked: p.tool === 'shapeRect', onClick: () => p.setTool('shapeRect') },
                { label: 'Надпись (Текст)', checked: p.tool === 'shapeText', onClick: () => p.setTool('shapeText') },
                { label: 'Таблица перечня / параметров', checked: p.tool === 'table', onClick: () => p.setTool('table') }
            ]
        },
        {
            id: 'check',
            label: 'Проверка',
            items: [
                { label: 'Проверка электрических правил (ERC)', shortcut: p.hotkeys.runCheck, onClick: p.handleRunErc },
                { label: 'Параметры проверки ERC...', onClick: () => p.setShowErcSettingsDialog(true) },
                { separator: true },
                { label: 'Встроенная SPICE-симуляция (DC + Переходный анализ)...', onClick: p.handleRunSpice },
                { separator: true },
                { label: 'Синхронизация и обратная аннотация из платы', onClick: p.handleUpdatePcbFromSchematic }
            ]
        },
        {
            id: 'library',
            label: 'Библиотека',
            items: [
                { label: 'Открыть Редактор компонентов (УГО ГОСТ)...', onClick: () => openAppModule('componentEditor', (m) => p.onSwitchModule?.(m)) },
                { label: 'Открыть Редактор корпусов...', onClick: () => openAppModule('patternEditor', (m) => p.onSwitchModule?.(m)) }
            ]
        },
        {
            id: 'tools',
            label: 'Инструменты',
            items: [
                {
                    label: 'Автонумерация позиционных обозначений по листам (ГОСТ)',
                    onClick: () => {
                        p.commitProject((prev) => renumberSchematicComponents(prev));
                        p.setStatusMessage('Автонумерация позиционных обозначений выполнена.');
                    }
                },
                { label: 'Сформировать Перечень элементов (ПЭ3)...', onClick: () => p.setShowBomDialog(true) },
                { separator: true },
                { label: 'Настройка горячих клавиш...', onClick: () => p.setShowHotkeysDialog(true) }
            ]
        },
        {
            id: 'help',
            label: 'Справка',
            items: [
                { label: 'Справочник стандартов ЕСКД / ГОСТ (2.702, 2.728, 2.730, 2.743)', onClick: () => p.setStatusMessage('Поддерживаются ГОСТ 2.702-2011, 2.721-74, 2.728-74, 2.730-73, 2.743-91, 2.104-2006.') },
                { label: 'О программе SIPTrace v1.1', onClick: () => p.setStatusMessage('SIPTrace v1.1 — Российская САПР электроники стандарта ЕСКД.') }
            ]
        }
    ];
}
