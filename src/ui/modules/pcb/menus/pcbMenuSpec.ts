import { PcbProject, Point2D } from '../../../../core/types';
import { createProjectFromOptions, loadActiveSchematic, openAppModule } from '../../../../core/store';
import { updateAllCopperPours } from '../../../../engines/copperPour';
import { convertSchematicToPcb } from '../../../../engines/netlist/schematicToPcbConverter';
import { exportDipTraceAsciiPcb } from '../../../../engines/importers';
import { saveTextFile } from '../../../../core/utils/fileIo';
import { TopMenuSpec } from '../../../components/MenuBar';
import { PcbToolId } from '../types';

export interface CreatePcbTopMenusParams {
  pcb: PcbProject;
  historyLength: number;
  redoLength: number;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showRatlines: boolean;
  setShowRatlines: React.Dispatch<React.SetStateAction<boolean>>;
  selectedCompId: string | null;
  tool: PcbToolId;
  setTool: React.Dispatch<React.SetStateAction<PcbToolId>>;
  setRouteDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  setPolyDraftPts: React.Dispatch<React.SetStateAction<Point2D[]>>;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
  replacePcb: (next: PcbProject) => void;
  confirmDiscardIfDirty: () => boolean;
  setStatusMessage: React.Dispatch<React.SetStateAction<string>>;
  handleNewProject: () => void;
  handleSavePcbFile: (saveAs?: boolean) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  zoomToFit: () => void;
  handleAutoplace: () => void;
  handleAutoroute: () => void;
  handleRunDrc: () => void;
  handleUpdatePours: () => void;
  handleApplyViaStitching: () => void;
  setShowCompareDialog: (v: boolean) => void;
  setShowCamDialog: (v: boolean) => void;
  setShowPanelDialog: (v: boolean) => void;
  setShowRulesDialog: (v: boolean) => void;
  setShowPourDialog: (v: boolean) => void;
  setShowRfDialog: (v: boolean) => void;
  setShowHotkeysDialog: (v: boolean) => void;
  setShowBoardWizard: (v: boolean) => void;
  handleOpenPcbFile: () => void;
  onSwitchModule?: (m: any) => void;
}

/** Builds the complete DipTrace-style PCB top menu specification. */
export function createPcbTopMenus(p: CreatePcbTopMenusParams): TopMenuSpec[] {
  return [
    {
      id: 'file',
      label: 'Файл',
      items: [
        {
          label: 'Новый проект / Новая плата...',
          shortcut: 'Ctrl+N',
          onClick: p.handleNewProject
        },
        {
          label: 'Открыть / Импортировать плату САПР (DipTrace / KiCad / Eagle / DXF / Gerber ZIP)...',
          shortcut: 'Ctrl+O',
          onClick: p.handleOpenPcbFile
        },
        {
          label: 'Открыть демонстрационную плату RS-485',
          onClick: () => {
            if (!p.confirmDiscardIfDirty()) return;
            const res = createProjectFromOptions(
              {
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
              },
              'pcb'
            );
            p.replacePcb(res.pcb);
            p.setStatusMessage(res.statusMessage);
          }
        },
        { separator: true },
        {
          label: 'Сохранить плату (.gostpcb)',
          shortcut: 'Ctrl+S',
          onClick: () => p.handleSavePcbFile(false)
        },
        {
          label: 'Сохранить плату как...',
          onClick: () => p.handleSavePcbFile(true)
        },
        {
          label: 'Экспорт платы DipTrace ASCII (.dip)...',
          onClick: async () => {
            const saved = await saveTextFile(`${p.pcb.projectName}.dip`, exportDipTraceAsciiPcb(p.pcb), [
              { name: 'DipTrace ASCII PCB', extensions: ['dip', 'asc'] }
            ]);
            if (saved) p.setStatusMessage(`Экспортирован DipTrace PCB: ${saved}`);
          }
        },
        { separator: true },
        {
          label: 'Обновить плату по принципиальной схеме',
          onClick: () => {
            const sch = loadActiveSchematic();
            p.commitPcb((prev) => convertSchematicToPcb(sch, prev));
            p.setStatusMessage('Плата обновлена из активной схемы.');
          }
        },
        { label: 'Сравнить со схемой / Обратная аннотация...', onClick: () => p.setShowCompareDialog(true) },
        { separator: true },
        { label: 'Экспорт Gerber RS-274X / X2, Excellon, ЛУТ SVG 1:1 и предпросмотр...', onClick: () => p.setShowCamDialog(true) },
        { label: 'Мастер контура и стека платы (ГОСТ / Прямоуг. / Круг)...', onClick: () => p.setShowBoardWizard(true) },
        { label: '3D-просмотр печатной платы (WebGL)...', onClick: () => openAppModule('pcb3d', (m) => p.onSwitchModule?.(m)) },
        { separator: true },
        { label: 'Стартовое окно (Запуск)...', onClick: () => openAppModule('launcher', (m) => p.onSwitchModule?.(m)) }
      ]
    },
    {
      id: 'edit',
      label: 'Правка',
      items: [
        { label: 'Отменить', shortcut: 'Ctrl+Z', disabled: p.historyLength === 0, onClick: p.handleUndo },
        { label: 'Повторить', shortcut: 'Ctrl+Y', disabled: p.redoLength === 0, onClick: p.handleRedo },
        { separator: true },
        { label: 'Очистить всю трассировку (Unroute All)', onClick: () => p.commitPcb((prev) => updateAllCopperPours({ ...prev, traces: [], vias: [] })) },
        { label: 'Панелизация платы (Мультизаготовка)...', onClick: () => p.setShowPanelDialog(true) }
      ]
    },
    {
      id: 'view',
      label: 'Вид',
      items: [
        { label: 'Показать сетку', shortcut: 'F11', checked: p.showGrid, onClick: () => p.setShowGrid((v) => !v) },
        { label: 'Показать связи (Ratlines)', checked: p.showRatlines, onClick: () => p.setShowRatlines((v) => !v) },
        { label: 'Показать всю плату', shortcut: 'Home', onClick: p.zoomToFit },
        { separator: true },
        { label: '3D-модель платы...', onClick: () => openAppModule('pcb3d', (m) => p.onSwitchModule?.(m)) }
      ]
    },
    {
      id: 'place',
      label: 'Размещение',
      items: [
        { label: 'Автоматическое размещение компонентов', onClick: p.handleAutoplace },
        {
          label: 'Повернуть выделенный компонент на 90°',
          shortcut: 'R',
          disabled: !p.selectedCompId,
          onClick: () =>
            p.commitPcb((prev) => ({
              ...prev,
              components: prev.components.map((c) => (c.id === p.selectedCompId && !c.locked ? { ...c, angle: (c.angle + 90) % 360 } : c))
            }))
        },
        {
          label: 'Перенести компонент на противоположную сторону (Top/Bot)',
          shortcut: 'F',
          disabled: !p.selectedCompId,
          onClick: () =>
            p.commitPcb((prev) => ({
              ...prev,
              components: prev.components.map((c) =>
                c.id === p.selectedCompId && !c.locked ? { ...c, side: c.side === 'Top' ? 'Bottom' : 'Top' } : c
              )
            }))
        }
      ]
    },
    {
      id: 'route',
      label: 'Трассировка',
      items: [
        { label: 'Ручная трассировка (под 45°)', checked: p.tool === 'routeManual', onClick: () => { p.setRouteDraftPts([]); p.setTool('routeManual'); } },
        { label: 'Автотрассировщик (Multi-layer A* + сглаживание 45°)', onClick: p.handleAutoroute },
        { label: 'Инструмент «Змейка» (выравнивание длины)', checked: p.tool === 'meander', onClick: () => p.setTool('meander') },
        { separator: true },
        { label: 'Свойства правил трассировки (ГОСТ 23751-86)...', onClick: () => p.setShowRulesDialog(true) },
        { label: 'Добавить каплевидные скругления (Teardrops)', checked: Boolean(p.pcb.teardropsEnabled), onClick: () => p.commitPcb((prev) => ({ ...prev, teardropsEnabled: !prev.teardropsEnabled })) }
      ]
    },
    {
      id: 'objects',
      label: 'Объекты',
      items: [
        { label: 'Заливка медным полигоном...', onClick: () => p.setShowPourDialog(true) },
        { label: 'Обновить все полигоны меди', onClick: p.handleUpdatePours },
        { label: 'Переходное отверстие (Via)', onClick: () => p.setTool('via') },
        { label: 'Прошить землю переходными отверстиями (Via Stitching GND)', onClick: p.handleApplyViaStitching },
        { separator: true },
        { label: 'Нарисовать контур платы', onClick: () => { p.setPolyDraftPts([]); p.setTool('boardOutline'); } },
        { label: 'Вырез в плате (Cutout)', onClick: () => { p.setPolyDraftPts([]); p.setTool('cutout'); } },
        { label: 'Область запрета трассировки (Keepout)', onClick: () => { p.setPolyDraftPts([]); p.setTool('keepout'); } },
        { label: 'Линия шелкографии', checked: p.tool === 'shapeLine', onClick: () => p.setTool('shapeLine') },
        { label: 'Текст шелкографии', checked: p.tool === 'shapeText', onClick: () => p.setTool('shapeText') },
        { label: 'Измеритель расстояний (Линейка)', onClick: () => p.setTool('measure') }
      ]
    },
    {
      id: 'check',
      label: 'Проверка',
      items: [
        { label: 'Проверка норм проектирования (DRC по ГОСТ 23751-86)', shortcut: 'F9', onClick: p.handleRunDrc },
        { label: 'Настройка классов точности ПП (1..5 классы ГОСТ)...', onClick: () => p.setShowRulesDialog(true) },
        { label: 'Сравнить плату со схемой...', onClick: () => p.setShowCompareDialog(true) }
      ]
    },
    {
      id: 'tools',
      label: 'Инструменты',
      items: [
        { label: 'Импорт и управление библиотеками CAD (.lib / .kicad_mod / .lbr)...', onClick: () => window.dispatchEvent(new CustomEvent('siptrace:open-cadlib')) },
        { separator: true },
        { label: 'Калькулятор ширины дорожек по току и импеданса (ВЧ / Диффпары)...', onClick: () => p.setShowRfDialog(true) },
        { label: 'Редактор корпусов...', onClick: () => openAppModule('patternEditor', (m) => p.onSwitchModule?.(m)) },
        { label: 'Горячие клавиши...', onClick: () => p.setShowHotkeysDialog(true) }
      ]
    }
  ];
}
