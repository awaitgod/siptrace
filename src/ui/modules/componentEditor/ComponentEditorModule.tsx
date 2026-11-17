import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ComponentDef,
  PinElectricalType,
  PinGraphicStyle,
  PinOrientation,
  Point2D,
  SymbolPin,
  SymbolPrimitive
} from '../../../core/types';
import { dist, uid } from '../../../core/geometry';
import { snapPoint } from '../../../core/units';
import {
  broadcastEdaEvent,
  loadUserComponents,
  loadUserPatterns,
  openAppModule,
  registerImportedLibraryBundle,
  saveUserComponents,
  subscribeEdaEvents
} from '../../../core/store';
import { GOST_COMPONENT_LIBRARIES } from '../../../gost/libraries/gostComponents';
import { makeGostRectangularIcPart } from '../../../gost/libraries/components/helpers';
import { GOST_PATTERN_LIBRARIES, findPatternById } from '../../../gost/libraries/gostPatterns';
import { GostConversionReport, importExternalCadLibrary } from '../../../engines/importers';
import { pickCadFiles, saveTextFile } from '../../../core/utils/fileIo';
import { CadLibraryManagerDialog } from '../../components/CadLibraryManagerDialog';
import { GostConversionDialog } from '../../components/GostConversionDialog';
import { MenuBar, TopMenuSpec } from '../../components/MenuBar';
import { StatusBar } from '../../components/StatusBar';
import { DipIcon } from '../../theme/DipTraceIcons';
import { PatternPreviewCanvas, drawSymbolPrimitives } from '../../components/CadPreviewCanvas';
import { nextAvailableNumber } from '../libraryEditors/numbering';
import { useLibraryDraft } from '../libraryEditors/useLibraryDraft';
import { validateComponent } from './componentValidation';
import './componentEditor.css';
import '../libraryEditors/libraryEditor.css';

type CompToolId = 'select' | 'pin' | 'line' | 'rect' | 'circle' | 'text';

const createEmptyGostComponent = (): ComponentDef => ({
  id: uid('ucomp'),
  name: 'Новый_элемент_ГОСТ',
  library: 'lib_user',
  refDesPrefix: 'DA',
  defaultValue: '',
  gostStandard: 'ГОСТ 2.743-91',
  description: 'Пользовательский компонент по ГОСТ',
  patternId: 'PAT_DIP8',
  parts: [
    {
      partIndex: 1,
      name: 'Секция 1',
      primitives: [{ type: 'rect', x: -7.5, y: -10, w: 15, h: 20, width: 0.4 }],
      pins: [
        { id: 'p1', number: '1', name: 'IN+', x: -12.5, y: -5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '1' },
        { id: 'p2', number: '2', name: 'IN-', x: -12.5, y: 5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: true, showNumber: true, padMapping: '2' },
        { id: 'p3', number: '3', name: 'OUT', x: 12.5, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: 'Line', showName: true, showNumber: true, padMapping: '3' }
      ]
    }
  ]
});

export const ComponentEditorModule: React.FC<{ onSwitchModule?: (m: any) => void }> = ({ onSwitchModule }) => {
  const [userComps, setUserComps] = useState<ComponentDef[]>(() => loadUserComponents());
  const [userPatterns, setUserPatterns] = useState(() => loadUserPatterns());

  const [comp, setComp] = useState<ComponentDef>(() => {
    const u = loadUserComponents();
    return u[0] ? structuredClone(u[0]) : structuredClone(GOST_COMPONENT_LIBRARIES[0].components[0]);
  });
  const { acceptReplacement, replaceDraft } = useLibraryDraft(comp, setComp, 'Компонент изменён. Продолжить без сохранения?');
  const [partIdx, setPartIdx] = useState(1);
  const [tool, setTool] = useState<CompToolId>('select');
  const [gridMm, setGridMm] = useState(2.5);
  const [viewport, setViewport] = useState({ ox: 320, oy: 230, pxPerMm: 8 });
  const [cursorMm, setCursorMm] = useState<Point2D>({ x: 0, y: 0 });
  const [draftStart, setDraftStart] = useState<Point2D | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [statusText, setStatusText] = useState('Редактор компонентов (УГО ГОСТ 2.721 / 2.743). Выберите элемент или создавайте УГО.');
  const [showPatternDialog, setShowPatternDialog] = useState(false);
  const [showIcWizard, setShowIcWizard] = useState(false);
  const [icName, setIcName] = useState('К561ИЕ10');
  const [icPrefix, setIcPrefix] = useState('DD');
  const [icLeftPins, setIcLeftPins] = useState('4');
  const [icRightPins, setIcRightPins] = useState('4');
  const [verificationIssues, setVerificationIssues] = useState<string[] | null>(null);
  const [symbolText, setSymbolText] = useState('&');
  const [conversionReport, setConversionReport] = useState<GostConversionReport | null>(null);
  const [showCadLibDialog, setShowCadLibDialog] = useState(false);

  const handleImportCompLibrary = async () => {
    if (!acceptReplacement()) return;
    const pickedList = await pickCadFiles('.eli,.elixml,.lib,.libxml,.kicad_sym,.kicad_mod,.lbr,.gostlib,.json,.zip');
    if (pickedList.length === 0) return;
    try {
      const importedComps: ComponentDef[] = [];
      let lastRes: Awaited<ReturnType<typeof importExternalCadLibrary>> | null = null;
      for (const picked of pickedList) {
        const res = await importExternalCadLibrary(picked.bytes, picked.name, { adaptToGost: true });
        lastRes = res;
        importedComps.push(...res.components);
        if (res.components.length > 0 || res.patterns.length > 0) {
          registerImportedLibraryBundle({
            name: res.libraryName,
            sourceFormat: res.detectedFormat,
            sourceFile: picked.name,
            category: res.categories[0] || 'Импорт CAD',
            gostAdapted: true,
            components: res.components,
            patterns: res.patterns
          });
        }
      }
      setUserComps(loadUserComponents());
      setUserPatterns(loadUserPatterns());
      if (importedComps.length > 0) {
        replaceDraft(structuredClone(importedComps[0]));
        setPartIdx(1);
        setStatusText(`Импортировано компонентов (${lastRes?.detectedFormat ?? 'CAD'}): ${importedComps.length} -> ГОСТ УГО.`);
        if (lastRes) setConversionReport(lastRes.report);
      } else {
        setStatusText(`В выбранных файлах не найдено компонентов схемы.`);
      }
    } catch (err) {
      setStatusText(`Ошибка импорта библиотеки: ${(err as Error).message}`);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `Редактор компонентов - [${comp.name}] — SIPTrace`;
  }, [comp.name]);

  useEffect(() => {
    const unsub = subscribeEdaEvents((ch) => {
      if (ch === 'libraries:updated') {
        setUserComps(loadUserComponents());
        setUserPatterns(loadUserPatterns());
      }
    });
    const onKeyDown = (e: KeyboardEvent) => {
      if (showPatternDialog || showIcWizard || verificationIssues || conversionReport || showCadLibDialog) return;
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.code === 'KeyS')) {
        e.preventDefault();
        handleSaveToUserLibrary();
      } else if (e.key === 'Escape') {
        setDraftStart(null);
        setTool('select');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPinId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        updateActivePart((p) => ({ ...p, pins: p.pins.filter((x) => x.id !== selectedPinId) }));
        setSelectedPinId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const activePart = useMemo(
    () => comp.parts.find((p) => p.partIndex === partIdx) ?? comp.parts[0],
    [comp.parts, partIdx]
  );
  useEffect(() => {
    setSelectedPinId(null);
    setDraftStart(null);
  }, [comp.id, activePart.partIndex]);

  const attachedPattern = useMemo(
    () => userPatterns.find((p) => p.id === comp.patternId) ?? findPatternById(comp.patternId) ?? null,
    [comp.patternId, userPatterns]
  );

  const updateActivePart = useCallback(
    (updater: (pt: ComponentDef['parts'][0]) => ComponentDef['parts'][0]) => {
      setComp((prev) => ({
        ...prev,
        parts: prev.parts.map((pt) => (pt.partIndex === activePart.partIndex ? updater(pt) : pt))
      }));
    },
    [activePart.partIndex]
  );

  // Save current component to user library
  const handleSaveToUserLibrary = async () => {
    const toSave = structuredClone(comp);
    if (!toSave.id.startsWith('ucomp') || toSave.library !== 'lib_user') toSave.id = uid('ucomp');
    toSave.library = 'lib_user';
    const nextList = [...loadUserComponents().filter((c) => c.id !== toSave.id), toSave];
    setUserComps(nextList);
    saveUserComponents(nextList);
    replaceDraft(toSave);
    broadcastEdaEvent('libraries:updated', { kind: 'components' });
    setStatusText(`Компонент «${toSave.name}» сохранён в Пользовательскую библиотеку и синхронизирован со Схемотехникой.`);
  };

  const handleVerifyComponent = () => {
    setVerificationIssues(validateComponent(comp, attachedPattern));
  };

  const changeTool = (nextTool: CompToolId) => {
    setDraftStart(null);
    setTool(nextTool);
  };

  const pinCountIsValid = (value: string) => {
    const count = Number(value);
    return Number.isInteger(count) && count >= 1 && count <= 32;
  };

  const icInputsValid = Boolean(icName.trim() && icPrefix.trim() && pinCountIsValid(icLeftPins) && pinCountIsValid(icRightPins));

  const createIc = () => {
    if (!icInputsValid || !acceptReplacement()) return;
    const leftCount = Number(icLeftPins);
    const rightCount = Number(icRightPins);
    const leftPins = Array.from({ length: leftCount }, (_, i) => ({
      num: String(i + 1),
      name: `IN${i + 1}`,
      type: 'Input' as const
    }));
    const rightPins = Array.from({ length: rightCount }, (_, i) => ({
      num: String(leftCount + i + 1),
      name: `OUT${i + 1}`,
      type: 'Output' as const
    }));
    const name = icName.trim();
    replaceDraft({
      id: uid('ucomp'),
      name,
      library: 'lib_user',
      gostStandard: 'ГОСТ 2.743-91',
      refDesPrefix: icPrefix.trim(),
      defaultValue: name,
      patternId: '',
      description: `ИМС ${name} (создано Мастером УГО ГОСТ)`,
      parts: [makeGostRectangularIcPart({ leftPins, rightPins, headerText: name })]
    });
    setPartIdx(1);
    setShowIcWizard(false);
    setStatusText(`Создано УГО «${name}» с ${leftCount + rightCount} выводами. Назначьте корпус и проверьте распиновку.`);
  };

  const openComponent = (component: ComponentDef) => {
    if (!acceptReplacement()) return false;
    replaceDraft(component);
    setPartIdx(component.parts[0]?.partIndex ?? 1);
    changeTool('select');
    setSelectedPinId(null);
    return true;
  };

  const switchModule = (module: Parameters<typeof openAppModule>[0]) => {
    if (acceptReplacement()) openAppModule(module, (m) => onSwitchModule?.(m));
  };

  const zoomToFit = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth || 700;
    const h = wrap.clientHeight || 500;
    const xs = activePart.pins.map(p => p.x);
    const ys = activePart.pins.map(p => p.y);
    for (const pr of activePart.primitives) {
      if ('x' in pr && 'w' in pr) { xs.push(pr.x, pr.x + pr.w); ys.push(pr.y, pr.y + pr.h); }
      else if ('x1' in pr) { xs.push(pr.x1, pr.x2); ys.push(pr.y1, pr.y2); }
      else if ('cx' in pr) { xs.push(pr.cx - pr.r, pr.cx + pr.r); ys.push(pr.cy - pr.r, pr.cy + pr.r); }
    }
    const minX = xs.length ? Math.min(...xs) - 10 : -20;
    const maxX = xs.length ? Math.max(...xs) + 10 : 20;
    const minY = ys.length ? Math.min(...ys) - 10 : -20;
    const maxY = ys.length ? Math.max(...ys) + 10 : 20;
    const scale = Math.max(2, Math.min(20, Math.min(w / Math.max(10, maxX - minX), h / Math.max(10, maxY - minY)) * 0.82));
    setViewport({
      pxPerMm: scale,
      ox: w / 2 - ((minX + maxX) / 2) * scale,
      oy: h / 2 - ((minY + maxY) / 2) * scale
    });
  };

  // Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth || 700;
    const h = wrap.clientHeight || 500;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(viewport.ox, viewport.oy);
    ctx.scale(viewport.pxPerMm, viewport.pxPerMm);

    // Dotted Grid
    ctx.fillStyle = '#383838';
    const sx = Math.floor(-viewport.ox / viewport.pxPerMm / gridMm) * gridMm;
    const ex = (w - viewport.ox) / viewport.pxPerMm;
    const sy = Math.floor(-viewport.oy / viewport.pxPerMm / gridMm) * gridMm;
    const ey = (h - viewport.oy) / viewport.pxPerMm;
    const ds = 1.0 / viewport.pxPerMm;
    for (let gx = sx; gx <= ex; gx += gridMm) {
      for (let gy = sy; gy <= ey; gy += gridMm) {
        ctx.fillRect(gx - ds * 0.5, gy - ds * 0.5, ds, ds);
      }
    }

    // Center Origin Axis
    ctx.strokeStyle = '#336699';
    ctx.lineWidth = 1 / viewport.pxPerMm;
    ctx.beginPath();
    ctx.moveTo(-250, 0); ctx.lineTo(250, 0);
    ctx.moveTo(0, -250); ctx.lineTo(0, 250);
    ctx.stroke();

    // Symbol primitives + pins
    drawSymbolPrimitives(
      ctx,
      activePart.primitives,
      activePart.pins,
      0,
      0,
      0,
      false,
      false,
      viewport.pxPerMm,
      '#FFFFFF',
      '#ECECA0',
      '#00E5E5',
      1.0
    );

    // Selected pin highlight
    if (selectedPinId) {
      const sp = activePart.pins.find((p) => p.id === selectedPinId);
      if (sp) {
        ctx.strokeStyle = '#FF4444';
        ctx.lineWidth = 1.5 / viewport.pxPerMm;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 1.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draft line/rect/circle preview
    if (draftStart) {
      const cur = snapPoint(cursorMm, gridMm);
      ctx.strokeStyle = '#FFFF44';
      ctx.lineWidth = 0.25;
      ctx.setLineDash([1.5, 1.5]);
      if (tool === 'line') {
        ctx.beginPath(); ctx.moveTo(draftStart.x, draftStart.y); ctx.lineTo(cur.x, cur.y); ctx.stroke();
      } else if (tool === 'rect') {
        ctx.strokeRect(
          Math.min(draftStart.x, cur.x),
          Math.min(draftStart.y, cur.y),
          Math.abs(cur.x - draftStart.x),
          Math.abs(cur.y - draftStart.y)
        );
      } else if (tool === 'circle') {
        ctx.beginPath();
        ctx.arc(draftStart.x, draftStart.y, Math.max(1, dist(draftStart, cur)), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [activePart, viewport, gridMm, selectedPinId, draftStart, cursorMm, tool]);

  const screenToWorld = (cx: number, cy: number): Point2D => {
    const r = canvasRef.current?.getBoundingClientRect();
    return {
      x: (cx - (r?.left ?? 0) - viewport.ox) / viewport.pxPerMm,
      y: (cy - (r?.top ?? 0) - viewport.oy) / viewport.pxPerMm
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      if (e.button === 2 && (tool !== 'select' || draftStart)) {
        setDraftStart(null);
        setTool('select');
        return;
      }
      panRef.current = { startX: e.clientX, startY: e.clientY, ox: viewport.ox, oy: viewport.oy };
      return;
    }
    if (e.button !== 0) return;
    const wp = screenToWorld(e.clientX, e.clientY);
    const pt = snapPoint(wp, gridMm);

    if (tool === 'pin') {
      const n = nextAvailableNumber(activePart.pins);
      const newPin: SymbolPin = {
        id: uid('pin'),
        number: n,
        name: `P${n}`,
        x: pt.x,
        y: pt.y,
        length: 5,
        orientation: pt.x < 0 ? 0 : pt.x > 0 ? 180 : pt.y < 0 ? 90 : 270,
        electricalType: 'Passive',
        style: 'Line',
        showName: true,
        showNumber: true,
        padMapping: n
      };
      updateActivePart((p) => ({ ...p, pins: [...p.pins, newPin] }));
      setSelectedPinId(newPin.id);
      return;
    }

    if (tool === 'text') {
      if (!symbolText.trim()) return;
      const prim: SymbolPrimitive = { type: 'text', x: pt.x, y: pt.y, text: symbolText.trim(), size: 3.5 };
      updateActivePart((p) => ({ ...p, primitives: [...p.primitives, prim] }));
      setTool('select');
      return;
    }

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      if (!draftStart) setDraftStart(pt);
      else {
        let prim: SymbolPrimitive;
        if (tool === 'line') {
          prim = { type: 'line', x1: draftStart.x, y1: draftStart.y, x2: pt.x, y2: pt.y, width: 0.4 };
        } else if (tool === 'rect') {
          prim = {
            type: 'rect',
            x: Math.min(draftStart.x, pt.x),
            y: Math.min(draftStart.y, pt.y),
            w: Math.max(1, Math.abs(pt.x - draftStart.x)),
            h: Math.max(1, Math.abs(pt.y - draftStart.y)),
            width: 0.4
          };
        } else {
          prim = { type: 'circle', cx: draftStart.x, cy: draftStart.y, r: Math.max(1, dist(draftStart, pt)), width: 0.4 };
        }
        updateActivePart((p) => ({ ...p, primitives: [...p.primitives, prim] }));
        setDraftStart(null);
      }
      return;
    }

    const hitPin = activePart.pins.find((p) => dist(wp, p) <= 2.2);
    setSelectedPinId(hitPin?.id ?? null);
  };

  const menus: TopMenuSpec[] = [
    {
      id: 'lib',
      label: 'Библиотека',
      items: [
        { label: 'Новый компонент ГОСТ...', onClick: () => openComponent(createEmptyGostComponent()) },
        { label: 'Мастер создания УГО ИМС (ГОСТ 2.743)...', onClick: () => setShowIcWizard(true) },
        { label: 'Импорт библиотеки САПР (.eli / .kicad_sym / .lbr / .gostlib)...', onClick: handleImportCompLibrary },
        { label: 'Сохранить в Пользовательскую библиотеку', shortcut: 'Ctrl+S', onClick: handleSaveToUserLibrary },
        { separator: true },
        {
          label: 'Экспорт библиотеки (.gostlib)...',
          onClick: async () => {
            await saveTextFile(`${comp.name}.gostlib`, JSON.stringify({ components: [comp] }, null, 2), [
              { name: 'Библиотека компонентов ГОСТ', extensions: ['gostlib'] }
            ]);
          }
        },
        { label: 'Стартовое окно (Запуск)', onClick: () => switchModule('launcher') }
      ]
    },
    {
      id: 'comp',
      label: 'Компонент',
      items: [
        { label: 'Добавить новую секцию (Multi-part)', onClick: () => {
          const nextIdx = Math.max(...comp.parts.map((part) => part.partIndex)) + 1;
          setComp((p) => ({
            ...p,
            parts: [...p.parts, { partIndex: nextIdx, name: `Секция ${nextIdx}`, primitives: [{ type: 'rect', x: -7.5, y: -7.5, w: 15, h: 15, width: 0.4 }], pins: [] }]
          }));
          setPartIdx(nextIdx);
        }},
        { label: 'Привязать корпус (Корпуса ГОСТ)...', onClick: () => setShowPatternDialog(true) },
        { label: 'Проверить компонент...', onClick: handleVerifyComponent }
      ]
    },
    {
      id: 'objects',
      label: 'Объекты',
      items: [
        { label: 'Выбор', checked: tool === 'select', onClick: () => changeTool('select') },
        { label: 'Добавить вывод (Pin)', checked: tool === 'pin', onClick: () => changeTool('pin') },
        { label: 'Линия УГО', checked: tool === 'line', onClick: () => changeTool('line') },
        { label: 'Прямоугольник УГО', checked: tool === 'rect', onClick: () => changeTool('rect') },
        { label: 'Окружность УГО', checked: tool === 'circle', onClick: () => changeTool('circle') },
        { label: 'Функциональный текст', checked: tool === 'text', onClick: () => changeTool('text') }
      ]
    },
    {
      id: 'tools',
      label: 'Инструменты',
      items: [
        { label: 'Открыть Схемотехнику', onClick: () => switchModule('schematic') },
        { label: 'Открыть Редактор корпусов', onClick: () => switchModule('patternEditor') }
      ]
    }
  ];

  const allSourceComps = useMemo(() => {
    const out: ComponentDef[] = [...userComps];
    for (const l of GOST_COMPONENT_LIBRARIES) out.push(...l.components);
    return out;
  }, [userComps]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#f0f0f0' }}>
      <MenuBar menus={menus} onBrandClick={() => switchModule('launcher')} />

      <div className="dt-toolbar-row">
        <button className="dt-tb-btn" title="Новый компонент ГОСТ" onClick={() => openComponent(createEmptyGostComponent())}><DipIcon name="new" /></button>
        <button className="dt-tb-btn" title="Сохранить в Пользовательскую библиотеку" onClick={handleSaveToUserLibrary}><DipIcon name="save" /></button>
        <div className="dt-tb-sep" />
        <button className={`dt-tb-btn ${tool === 'select' ? 'active' : ''}`} aria-pressed={tool === 'select'} title="Выбор" onClick={() => changeTool('select')}><DipIcon name="select" /></button>
        <button className={`dt-tb-btn ${tool === 'pin' ? 'active' : ''}`} aria-pressed={tool === 'pin'} title="Добавить вывод (Pin)" onClick={() => changeTool('pin')}><DipIcon name="pin" /></button>
        <button className={`dt-tb-btn ${tool === 'line' ? 'active' : ''}`} aria-pressed={tool === 'line'} title="Линия УГО" onClick={() => changeTool('line')}><DipIcon name="shapeLine" /></button>
        <button className={`dt-tb-btn ${tool === 'rect' ? 'active' : ''}`} aria-pressed={tool === 'rect'} title="Прямоугольник УГО" onClick={() => changeTool('rect')}><DipIcon name="shapeRect" /></button>
        <button className={`dt-tb-btn ${tool === 'circle' ? 'active' : ''}`} aria-pressed={tool === 'circle'} title="Окружность УГО" onClick={() => changeTool('circle')}><DipIcon name="shapeCircle" /></button>
        <button className={`dt-tb-btn ${tool === 'text' ? 'active' : ''}`} aria-pressed={tool === 'text'} title="Функциональный текст" onClick={() => changeTool('text')}><DipIcon name="shapeText" /></button>
        {tool === 'text' && (
          <input className="dt-input" aria-label="Текст УГО" title="Текст для размещения на УГО" style={{ width: 72 }} value={symbolText} onChange={(e) => setSymbolText(e.target.value)} />
        )}
        <div className="dt-tb-sep" />
        <button className="dt-tb-btn" title="Показать весь компонент" onClick={zoomToFit}><DipIcon name="zoomAll" /></button>
        <select className="dt-tb-select" style={{ width: 72 }} value={gridMm} onChange={(e) => setGridMm(parseFloat(e.target.value))}>
          <option value={1.25}>1,25 мм</option>
          <option value={2.5}>2,5 мм</option>
          <option value={5.0}>5,0 мм</option>
        </select>
        <button className="dt-btn" onClick={() => setShowIcWizard(true)}>Мастер УГО ИМС</button>
        <button className="dt-btn" data-testid="comped-cadlib-btn" onClick={() => setShowCadLibDialog(true)}>Библиотеки CAD...</button>
        <button className="dt-btn" onClick={handleVerifyComponent}>Проверить УГО</button>
        <button className="dt-btn primary" onClick={handleSaveToUserLibrary}>Сохранить в библиотеку</button>
      </div>

      <div className="dt-workspace">
        {/* Left Library & Component Info */}
        <div className="dt-left-sidebar">
          <div className="dt-black-bar" role="heading" aria-level={2}><span>Компоненты библиотек</span></div>
          <div className="dt-comp-list" style={{ height: 220, flex: 'none' }}>
            {allSourceComps.map((c) => (
              <div
                key={c.id}
                className={`dt-comp-item ${c.id === comp.id ? 'selected' : ''}`}
                aria-pressed={c.id === comp.id}
                onClick={() => openComponent(structuredClone(c))}
              >
                {c.name}
              </div>
            ))}
          </div>

          <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto', flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Свойства компонента</div>
            <label>Наименование: <input className="dt-input" style={{ width: '100%' }} value={comp.name} onChange={(e) => setComp((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>Префикс ГОСТ: <input className="dt-input" style={{ width: '100%' }} value={comp.refDesPrefix} onChange={(e) => setComp((p) => ({ ...p, refDesPrefix: e.target.value }))} /></label>
            <label>Номинал по ум.: <input className="dt-input" style={{ width: '100%' }} value={comp.defaultValue} onChange={(e) => setComp((p) => ({ ...p, defaultValue: e.target.value }))} /></label>
            <label>Стандарт ЕСКД: <input className="dt-input" style={{ width: '100%' }} value={comp.gostStandard} onChange={(e) => setComp((p) => ({ ...p, gostStandard: e.target.value }))} /></label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span>Секции ({comp.parts.length}):</span>
              <select className="dt-select" aria-label="Секция компонента" value={activePart.partIndex} onChange={(e) => setPartIdx(Number(e.target.value))}>
                {comp.parts.map((pt) => <option key={pt.partIndex} value={pt.partIndex}>{pt.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Center Canvas */}
        <div className="dt-center-col">
          <div className="dt-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              tabIndex={0}
              aria-label="Редактор УГО компонентов (ГОСТ 2.721 / 2.743)"
              style={{ display: 'block', width: '100%', height: '100%', cursor: tool === 'select' ? 'default' : 'crosshair' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={(e) => {
                if (panRef.current) {
                  setViewport((v) => ({ ...v, ox: panRef.current!.ox + (e.clientX - panRef.current!.startX), oy: panRef.current!.oy + (e.clientY - panRef.current!.startY) }));
                  return;
                }
                setCursorMm(snapPoint(screenToWorld(e.clientX, e.clientY), gridMm));
              }}
              onMouseUp={() => { panRef.current = null; }}
              onMouseLeave={() => { panRef.current = null; }}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={(e) => {
                const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
                setViewport((v) => ({ ...v, pxPerMm: Math.max(2, Math.min(35, v.pxPerMm * factor)) }));
              }}
            />
          </div>
        </div>

        {/* Right Pin Manager & Attached Pattern */}
        <div className="dt-right-sidebar" style={{ width: 305, maxWidth: 360 }}>
          <div className="dt-panel-card" style={{ flex: 1 }}>
            <div className="dt-panel-header">
              <span>Менеджер выводов ({activePart.pins.length})</span>
              {selectedPinId && (
                <button
                  className="dt-btn"
                  style={{ minWidth: 50, height: 16, padding: '0 4px', fontSize: 10 }}
                  onClick={() => {
                    updateActivePart((p) => ({ ...p, pins: p.pins.filter((x) => x.id !== selectedPinId) }));
                    setSelectedPinId(null);
                  }}
                >
                  Удалить
                </button>
              )}
            </div>
            <div className="dt-panel-body">
              <table className="dt-table library-editor-table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Имя</th>
                    <th>Ориент.</th>
                    <th>Стиль</th>
                    <th>Тип</th>
                    <th>Pad</th>
                  </tr>
                </thead>
                <tbody>
                  {activePart.pins.map((pin) => (
                    <tr
                      key={pin.id}
                      style={{ background: pin.id === selectedPinId ? '#cce8ff' : '#fff' }}
                      onClick={() => setSelectedPinId(pin.id)}
                      onFocus={() => setSelectedPinId(pin.id)}
                    >
                      <td>
                        <input
                          className="dt-prop-input"
                          aria-label={`Номер вывода ${pin.number}`}
                          style={{ width: 24 }}
                          value={pin.number}
                          onChange={(e) => updateActivePart((p) => ({ ...p, pins: p.pins.map((x) => x.id === pin.id ? { ...x, number: e.target.value } : x) }))}
                        />
                      </td>
                      <td>
                        <input
                          className="dt-prop-input"
                          aria-label={`Имя вывода ${pin.number}`}
                          style={{ width: 44 }}
                          value={pin.name}
                          onChange={(e) => updateActivePart((p) => ({ ...p, pins: p.pins.map((x) => x.id === pin.id ? { ...x, name: e.target.value } : x) }))}
                        />
                      </td>
                      <td>
                        <select
                          className="dt-prop-input"
                          aria-label={`Ориентация вывода ${pin.number}`}
                          value={pin.orientation}
                          onChange={(e) => updateActivePart((p) => ({ ...p, pins: p.pins.map((x) => x.id === pin.id ? { ...x, orientation: Number(e.target.value) as PinOrientation } : x) }))}
                        >
                          <option value={0}>0°</option>
                          <option value={90}>90°</option>
                          <option value={180}>180°</option>
                          <option value={270}>270°</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="dt-prop-input"
                          aria-label={`Стиль вывода ${pin.number}`}
                          value={pin.style}
                          onChange={(e) => updateActivePart((p) => ({ ...p, pins: p.pins.map((x) => x.id === pin.id ? { ...x, style: e.target.value as PinGraphicStyle } : x) }))}
                        >
                          <option value="Line">Line</option>
                          <option value="Inverted">Inv</option>
                          <option value="Clock">Clk</option>
                          <option value="InvertedClock">InvClk</option>
                          {!['Line', 'Inverted', 'Clock', 'InvertedClock'].includes(pin.style) && (
                            <option value={pin.style} disabled>{pin.style} (импорт)</option>
                          )}
                        </select>
                      </td>
                      <td>
                        <select
                          className="dt-prop-input"
                          aria-label={`Электрический тип вывода ${pin.number}`}
                          value={pin.electricalType}
                          onChange={(e) => updateActivePart((p) => ({ ...p, pins: p.pins.map((x) => x.id === pin.id ? { ...x, electricalType: e.target.value as PinElectricalType } : x) }))}
                        >
                          <option value="Passive">Passive</option>
                          <option value="Input">Input</option>
                          <option value="Output">Output</option>
                          <option value="Bidirectional">BiDir</option>
                          <option value="Power">Power</option>
                          <option value="OpenCollector">OC</option>
                          <option value="TriState">3-State</option>
                          <option value="NotConnected">NC</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="dt-prop-input"
                          aria-label={`Площадка вывода ${pin.number}`}
                          style={{ width: 24 }}
                          value={pin.padMapping ?? pin.number}
                          onChange={(e) => updateActivePart((p) => ({ ...p, pins: p.pins.map((x) => x.id === pin.id ? { ...x, padMapping: e.target.value } : x) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dt-panel-card" style={{ height: 155 }}>
            <div className="dt-panel-header">
              <span>Корпус: {attachedPattern?.name ?? 'Нет'}</span>
              <button className="dt-btn" style={{ minWidth: 66, height: 16, padding: '0 4px', fontSize: 10 }} onClick={() => setShowPatternDialog(true)}>Привязать...</button>
            </div>
            <div className="dt-preview-area">
              <PatternPreviewCanvas pattern={attachedPattern} />
            </div>
          </div>
        </div>
      </div>

      <StatusBar hint={statusText} gridMm={gridMm} units="mm" cursorX={cursorMm.x} cursorY={cursorMm.y} />

      {showPatternDialog && (
        <div className="dt-modal-backdrop">
          <div className="dt-modal" style={{ width: 500 }}>
            <div className="dt-modal-title">
              <span>Привязка посадочного корпуса (ГОСТ)</span>
              <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={() => setShowPatternDialog(false)}>×</button>
            </div>
            <div className="dt-modal-body" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {userPatterns.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, background: '#eee', padding: '2px 6px' }}>Пользовательские корпуса</div>
                  {userPatterns.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={`dt-tree-row component-pattern-option ${p.id === comp.patternId ? 'selected' : ''}`}
                      aria-pressed={p.id === comp.patternId}
                      onClick={() => {
                        setComp((prev) => ({ ...prev, patternId: p.id }));
                        setShowPatternDialog(false);
                      }}
                    >
                      {p.name} ({p.pads.length} выв.) — {p.description}
                    </button>
                  ))}
                </div>
              )}
              {GOST_PATTERN_LIBRARIES.map((lib) => (
                <div key={lib.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, background: '#eee', padding: '2px 6px' }}>{lib.name}</div>
                  {lib.patterns.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={`dt-tree-row component-pattern-option ${p.id === comp.patternId ? 'selected' : ''}`}
                      aria-pressed={p.id === comp.patternId}
                      onClick={() => {
                        setComp((prev) => ({ ...prev, patternId: p.id }));
                        setShowPatternDialog(false);
                      }}
                    >
                      {p.name} ({p.pads.length} выв.) — {p.description}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="dt-modal-footer">
              <button className="dt-btn" onClick={() => setShowPatternDialog(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showIcWizard && (
        <div className="dt-modal-backdrop" onClick={() => setShowIcWizard(false)}>
          <div className="dt-modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              <strong>Мастер создания УГО микросхемы (ГОСТ 2.743-91)</strong>
              <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={() => setShowIcWizard(false)}>×</button>
            </div>
            <div className="dt-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5 }}>
              <label>Наименование ИМС: <input className="dt-input" style={{ width: '100%' }} value={icName} onChange={(e) => setIcName(e.target.value)} /></label>
              <label>Префикс (DD/DA): <input className="dt-input" style={{ width: '100%' }} value={icPrefix} onChange={(e) => setIcPrefix(e.target.value)} /></label>
              <label>Входов слева (1–32): <input type="number" min={1} max={32} aria-invalid={!pinCountIsValid(icLeftPins)} className="dt-input" style={{ width: '100%' }} value={icLeftPins} onChange={(e) => setIcLeftPins(e.target.value)} /></label>
              <label>Выходов справа (1–32): <input type="number" min={1} max={32} aria-invalid={!pinCountIsValid(icRightPins)} className="dt-input" style={{ width: '100%' }} value={icRightPins} onChange={(e) => setIcRightPins(e.target.value)} /></label>
              <div style={{ gridColumn: '1 / -1' }}>Мастер создаёт шаблон. Задайте номера, имена и типы выводов по документации компонента.</div>
            </div>
            <div className="dt-modal-footer">
              <button className="dt-btn primary" disabled={!icInputsValid} onClick={createIc}>
                Создать УГО
              </button>
              <button className="dt-btn" onClick={() => setShowIcWizard(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {verificationIssues && (
        <div className="dt-modal-backdrop">
          <div className="dt-modal" style={{ width: 520, maxWidth: '95vw' }}>
            <div className="dt-modal-title">
              <span>Проверка УГО</span>
              <button className="dt-btn" aria-label="Закрыть проверку" onClick={() => setVerificationIssues(null)}>×</button>
            </div>
            <div className="dt-modal-body" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {verificationIssues.length === 0
                ? <p>Компонент «{comp.name}» прошёл проверку нумерации, привязки площадок и сетки.</p>
                : <ul>{verificationIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
            </div>
            <div className="dt-modal-footer">
              <button className="dt-btn" onClick={() => setVerificationIssues(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {conversionReport && (
        <GostConversionDialog report={conversionReport} onClose={() => setConversionReport(null)} />
      )}

      {showCadLibDialog && (
        <CadLibraryManagerDialog
          initialTab="components"
          onClose={() => setShowCadLibDialog(false)}
          onSelectComponent={(c) => {
            if (!openComponent(structuredClone(c))) return false;
            setStatusText(`Загружен компонент «${c.name}» из библиотеки «${c.library}».`);
            return true;
          }}
        />
      )}
    </div>
  );
};
