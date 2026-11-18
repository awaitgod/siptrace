import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Model3DShapeType, PadDef, PadShape, PadType, PatternDef, Point2D } from '../../../core/types';
import { dist, uid } from '../../../core/geometry';
import { snapPoint } from '../../../core/units';
import { broadcastEdaEvent, loadUserPatterns, openAppModule, registerImportedLibraryBundle, saveUserPatterns, subscribeEdaEvents } from '../../../core/store';
import { GOST_PATTERN_LIBRARIES } from '../../../gost/libraries/gostPatterns';
import { PatternGeneratorFamily, generateParametricPattern } from '../../../engines/patternGenerator';
import {
  IPC_BGA_PRESETS,
  IPC_CHIP_PRESETS,
  IPC_GULLWING_PRESETS,
  IPC_QFN_DFN_PRESETS,
  IPC_QFP_PRESETS,
  IPC_THD_PRESETS
} from '../../../engines/parametricPattern';
import { GostConversionReport, importCadLibrary, importExternalCadLibrary } from '../../../engines/importers';
import { pickCadFiles, saveTextFile } from '../../../core/utils/fileIo';
import { CadLibraryManagerDialog } from '../../components/CadLibraryManagerDialog';
import { GostConversionDialog } from '../../components/GostConversionDialog';
import { MenuBar, TopMenuSpec } from '../../components/MenuBar';
import { StatusBar } from '../../components/StatusBar';
import { DipIcon } from '../../theme/DipTraceIcons';
import { nextAvailableNumber } from '../libraryEditors/numbering';
import { useLibraryDraft } from '../libraryEditors/useLibraryDraft';
import { changePadType, renumberPads, validatePatternGenerator } from './patternEditing';
import { validatePattern } from './patternValidation';
import '../libraryEditors/libraryEditor.css';

type PatToolId = 'select' | 'padSmd' | 'padTht' | 'hole' | 'silkLine' | 'silkRect';

const createEmptyPattern = (): PatternDef => ({
  id: uid('upat'),
  name: 'Новый_корпус_ГОСТ',
  library: 'patlib_user',
  gostName: 'ГОСТ 17467',
  description: 'Пользовательский корпус',
  courtyard: { width: 10, height: 8 },
  model3d: { shape: 'Box', bodyWidth: 6, bodyLength: 8, bodyHeight: 2.5, color: '#2b2b2b' },
  pads: [
    { id: 'pad_1', number: '1', type: 'SMD', shape: 'RoundedRect', x: -2.5, y: 0, width: 1.6, height: 1.4, cornerRadius: 0.1, layer: 'Top' },
    { id: 'pad_2', number: '2', type: 'SMD', shape: 'RoundedRect', x: 2.5, y: 0, width: 1.6, height: 1.4, cornerRadius: 0.1, layer: 'Top' }
  ],
  graphics: [
    { type: 'rect', layer: 'TopSilk', x: -4.2, y: -3, w: 8.4, h: 6, width: 0.18 }
  ]
});

export const PatternEditorModule: React.FC<{ onSwitchModule?: (m: any) => void }> = ({ onSwitchModule }) => {
  const [userPatterns, setUserPatterns] = useState<PatternDef[]>(() => loadUserPatterns());
  const [pattern, setPattern] = useState<PatternDef>(() => {
    const up = loadUserPatterns();
    return up[0] ? structuredClone(up[0]) : structuredClone(GOST_PATTERN_LIBRARIES[2].patterns[0]);
  });
  const { acceptReplacement, replaceDraft } = useLibraryDraft(pattern, setPattern, 'Корпус изменён. Продолжить без сохранения?');

  const [tool, setTool] = useState<PatToolId>('select');
  const [gridMm, setGridMm] = useState(0.5);
  const [viewport, setViewport] = useState({ ox: 320, oy: 230, pxPerMm: 18 });
  const [cursorMm, setCursorMm] = useState<Point2D>({ x: 0, y: 0 });
  const [draftStart, setDraftStart] = useState<Point2D | null>(null);
  const [selectedPadId, setSelectedPadId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Редактор корпусов (IPC-7351 / ГОСТ). Выберите корпус или запустите Генератор.');

  // Parametric Generator Modal state
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [conversionReport, setConversionReport] = useState<GostConversionReport | null>(null);
  const [showCadLibDialog, setShowCadLibDialog] = useState(false);
  const [verificationIssues, setVerificationIssues] = useState<string[] | null>(null);

  const handleImportPatternLibrary = async () => {
    if (!acceptReplacement()) return;
    const pickedList = await pickCadFiles('.lib,.libxml,.eli,.elixml,.kicad_mod,.lbr,.dxf,.gostlib,.json,.zip');
    if (pickedList.length === 0) return;
    try {
      const importedPats: PatternDef[] = [];
      let lastReport: GostConversionReport | null = null;
      let lastFormat = 'CAD';
      for (const picked of pickedList) {
        if (picked.name.toLowerCase().endsWith('.dxf')) {
          const res = await importCadLibrary(picked.bytes, picked.name);
          importedPats.push(...res.patterns);
          lastReport = res.report;
          lastFormat = res.detectedFormat;
          if (res.patterns.length > 0) {
            registerImportedLibraryBundle({
              name: picked.name.replace(/\.[^.]+$/, ''),
              sourceFormat: res.detectedFormat,
              sourceFile: picked.name,
              category: 'Импорт DXF',
              gostAdapted: true,
              components: [],
              patterns: res.patterns
            });
          }
        } else {
          const res = await importExternalCadLibrary(picked.bytes, picked.name, { adaptToGost: true });
          importedPats.push(...res.patterns);
          lastReport = res.report;
          lastFormat = res.detectedFormat;
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
      }
      setUserPatterns(loadUserPatterns());
      if (importedPats.length > 0) {
        replaceDraft(structuredClone(importedPats[0]));
        setStatusText(`Импортировано корпусов (${lastFormat}): ${importedPats.length}.`);
        if (lastReport) setConversionReport(lastReport);
      } else {
        setStatusText('В выбранных файлах не найдено корпусов.');
      }
    } catch (err) {
      setStatusText(`Ошибка импорта корпусов: ${(err as Error).message}`);
    }
  };
  const [genFamily, setGenFamily] = useState<PatternGeneratorFamily>('SOIC');
  const [genName, setGenName] = useState('SOIC-16_ГОСТ');
  const [genPins, setGenPins] = useState(16);
  const [genPitch, setGenPitch] = useState(1.27);
  const [genRowSpan, setGenRowSpan] = useState(5.4);
  const [genPadW, setGenPadW] = useState(1.55);
  const [genPadH, setGenPadH] = useState(0.65);
  const [genHole, setGenHole] = useState(0);
  const [genBodyW, setGenBodyW] = useState(3.9);
  const [genBodyL, setGenBodyL] = useState(9.9);
  const [genThermalPad, setGenThermalPad] = useState(3.2);
  const [genDensity, setGenDensity] = useState<'A' | 'B' | 'C'>('B');
  const [generatorIssue, setGeneratorIssue] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    document.title = `Редактор корпусов - [${pattern.name}] — SIPTrace`;
  }, [pattern.name]);

  useEffect(() => {
    const unsub = subscribeEdaEvents((ch) => {
      if (ch === 'libraries:updated') {
        setUserPatterns(loadUserPatterns());
      }
    });
    const onKeyDown = (e: KeyboardEvent) => {
      if (showGenDialog || conversionReport || showCadLibDialog || verificationIssues) return;
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.code === 'KeyS')) {
        e.preventDefault();
        handleSavePattern();
      } else if (e.key === 'Escape') {
        setDraftStart(null);
        setTool('select');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPadId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        setPattern((p) => ({ ...p, pads: p.pads.filter((x) => x.id !== selectedPadId) }));
        setSelectedPadId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  useEffect(() => {
    setDraftStart(null);
    setSelectedPadId(null);
  }, [pattern.id]);

  const changeTool = (nextTool: PatToolId) => {
    setDraftStart(null);
    setTool(nextTool);
  };

  const handleSavePattern = () => {
    const toSave = structuredClone(pattern);
    if (!toSave.id.startsWith('upat') || toSave.library !== 'patlib_user') toSave.id = uid('upat');
    toSave.library = 'patlib_user';
    const next = [...loadUserPatterns().filter((p) => p.id !== toSave.id), toSave];
    setUserPatterns(next);
    saveUserPatterns(next);
    replaceDraft(toSave);
    broadcastEdaEvent('libraries:updated', { kind: 'patterns' });
    setStatusText(`Корпус «${toSave.name}» сохранён в Пользовательскую библиотеку.`);
  };

  // Render Canvas
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
    if (gridMm * viewport.pxPerMm >= 3.5) {
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
    }

    // Center Origin Crosshair
    ctx.strokeStyle = '#336699';
    ctx.lineWidth = 1 / viewport.pxPerMm;
    ctx.beginPath();
    ctx.moveTo(-100, 0); ctx.lineTo(100, 0);
    ctx.moveTo(0, -100); ctx.lineTo(0, 100);
    ctx.stroke();

    // Courtyard dashed box
    ctx.save();
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 0.08;
    ctx.setLineDash([0.4, 0.3]);
    ctx.strokeRect(-pattern.courtyard.width / 2, -pattern.courtyard.height / 2, pattern.courtyard.width, pattern.courtyard.height);
    ctx.restore();

    // Graphics (Silk / Assembly / Keepout)
    for (const g of pattern.graphics) {
      ctx.strokeStyle = g.layer === 'TopSilk' ? '#FFFFFF' : g.layer === 'TopAssembly' ? '#FFCC00' : '#808080';
      ctx.fillStyle = ctx.strokeStyle;
      if (g.type === 'text') {
        ctx.font = `${Math.max(0.5, g.size)}px "Segoe UI", Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(g.text, g.x, g.y);
        continue;
      }
      ctx.lineWidth = Math.max(0.08, g.width);
      if (g.type === 'line') {
        ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
      } else if (g.type === 'rect') {
        ctx.strokeRect(g.x, g.y, g.w, g.h);
      } else if (g.type === 'circle') {
        ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
        if (g.fill) ctx.fill();
        else ctx.stroke();
      } else if (g.type === 'arc') {
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.r, (g.startAngle * Math.PI) / 180, (g.endAngle * Math.PI) / 180);
        ctx.stroke();
      } else if (g.type === 'polyline' && g.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(g.points[0].x, g.points[0].y);
        for (let i = 1; i < g.points.length; i++) ctx.lineTo(g.points[i].x, g.points[i].y);
        if (g.closed) ctx.closePath();
        ctx.stroke();
      }
    }

    // Pads
    for (const pad of pattern.pads) {
      const isSel = pad.id === selectedPadId;
      const isTht = pad.type === 'THT' || pad.type === 'MountingHole';
      ctx.save();
      ctx.translate(pad.x, pad.y);
      ctx.rotate(((pad.angle ?? 0) * Math.PI) / 180);
      ctx.fillStyle = isSel ? '#66EEFF' : pad.type === 'MountingHole' ? '#AAAAAA' : isTht ? '#22CC55' : '#FF3030';
      if (pad.shape === 'Round') {
        ctx.beginPath(); ctx.arc(0, 0, pad.width / 2, 0, Math.PI * 2); ctx.fill();
      } else if (pad.shape === 'Oval') {
        ctx.beginPath(); ctx.ellipse(0, 0, pad.width / 2, pad.height / 2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (pad.shape === 'RoundedRect') {
        const hw = pad.width / 2;
        const hh = pad.height / 2;
        const r = Math.min(pad.cornerRadius ?? Math.min(hw, hh) * 0.25, hw, hh);
        ctx.beginPath();
        ctx.moveTo(-hw + r, -hh);
        ctx.lineTo(hw - r, -hh);
        ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
        ctx.lineTo(hw, hh - r);
        ctx.quadraticCurveTo(hw, hh, hw - r, hh);
        ctx.lineTo(-hw + r, hh);
        ctx.quadraticCurveTo(-hw, hh, -hw, hh - r);
        ctx.lineTo(-hw, -hh + r);
        ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
        ctx.closePath();
        ctx.fill();
      } else if (pad.shape === 'Polygon') {
        const hw = pad.width / 2;
        const hh = pad.height / 2;
        const c = Math.min(hw, hh) * 0.3;
        const pts = (pad.polygonPoints && pad.polygonPoints.length >= 3)
          ? pad.polygonPoints
          : [
              { x: -hw + c, y: -hh },
              { x: hw - c, y: -hh },
              { x: hw, y: -hh + c },
              { x: hw, y: hh - c },
              { x: hw - c, y: hh },
              { x: -hw + c, y: hh },
              { x: -hw, y: hh - c },
              { x: -hw, y: -hh + c }
            ];
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-pad.width / 2, -pad.height / 2, pad.width, pad.height);
      }
      if (pad.holeDiameter && pad.holeDiameter > 0) {
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(0, 0, pad.holeDiameter / 2, 0, Math.PI * 2); ctx.fill();
      }
      if (pad.number) {
        ctx.fillStyle = '#FFFFFF';
        const fontMm = Math.min(0.85, Math.max(0.18, Math.min(pad.width, pad.height) * 0.45));
        ctx.font = `${fontMm}px "Segoe UI", Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pad.number, 0, 0);
      }
      ctx.restore();
    }

    // Draft line/rect
    if (draftStart) {
      const cur = snapPoint(cursorMm, gridMm);
      ctx.strokeStyle = '#FFFF44';
      ctx.lineWidth = 0.15;
      ctx.setLineDash([0.6, 0.6]);
      if (tool === 'silkLine') {
        ctx.beginPath(); ctx.moveTo(draftStart.x, draftStart.y); ctx.lineTo(cur.x, cur.y); ctx.stroke();
      } else if (tool === 'silkRect') {
        ctx.strokeRect(
          Math.min(draftStart.x, cur.x),
          Math.min(draftStart.y, cur.y),
          Math.abs(cur.x - draftStart.x),
          Math.abs(cur.y - draftStart.y)
        );
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [pattern, viewport, gridMm, selectedPadId, draftStart, cursorMm, tool]);

  const screenToWorld = (cx: number, cy: number): Point2D => {
    const r = canvasRef.current?.getBoundingClientRect();
    return {
      x: (cx - (r?.left ?? 0) - viewport.ox) / viewport.pxPerMm,
      y: (cy - (r?.top ?? 0) - viewport.oy) / viewport.pxPerMm
    };
  };

  const zoomToFit = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth || 700;
    const h = wrap.clientHeight || 500;
    const xs = pattern.pads.flatMap(p => [p.x - p.width / 2, p.x + p.width / 2]);
    const ys = pattern.pads.flatMap(p => [p.y - p.height / 2, p.y + p.height / 2]);
    const minX = xs.length ? Math.min(...xs) - 2 : -10;
    const maxX = xs.length ? Math.max(...xs) + 2 : 10;
    const minY = ys.length ? Math.min(...ys) - 2 : -10;
    const maxY = ys.length ? Math.max(...ys) + 2 : 10;
    const scale = Math.max(4, Math.min(70, Math.min(w / Math.max(4, maxX - minX), h / Math.max(4, maxY - minY)) * 0.72));
    setViewport({ pxPerMm: scale, ox: w / 2 - ((minX + maxX) / 2) * scale, oy: h / 2 - ((minY + maxY) / 2) * scale });
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

    if (tool === 'padSmd' || tool === 'padTht' || tool === 'hole') {
      const nextNum = nextAvailableNumber(pattern.pads);
      const newPad: PadDef = {
        id: uid('pad'),
        number: tool === 'hole' ? '' : nextNum,
        type: tool === 'padSmd' ? 'SMD' : tool === 'padTht' ? 'THT' : 'MountingHole',
        shape: tool === 'padSmd' ? 'RoundedRect' : 'Round',
        x: pt.x,
        y: pt.y,
        width: tool === 'padSmd' ? 1.6 : tool === 'padTht' ? 1.8 : 3.4,
        height: tool === 'padSmd' ? 1.4 : tool === 'padTht' ? 1.8 : 3.4,
        holeDiameter: tool === 'padSmd' ? 0 : tool === 'padTht' ? 0.9 : 3.2,
        layer: tool === 'padSmd' ? 'Top' : 'All'
      };
      setPattern((p) => ({ ...p, pads: [...p.pads, newPad] }));
      setSelectedPadId(newPad.id);
      return;
    }

    if (tool === 'silkLine' || tool === 'silkRect') {
      if (!draftStart) setDraftStart(pt);
      else {
        setPattern((p) => ({
          ...p,
          graphics: [
            ...p.graphics,
            tool === 'silkLine'
              ? { type: 'line', layer: 'TopSilk', x1: draftStart.x, y1: draftStart.y, x2: pt.x, y2: pt.y, width: 0.15 }
              : {
                  type: 'rect',
                  layer: 'TopSilk',
                  x: Math.min(draftStart.x, pt.x),
                  y: Math.min(draftStart.y, pt.y),
                  w: Math.max(0.5, Math.abs(pt.x - draftStart.x)),
                  h: Math.max(0.5, Math.abs(pt.y - draftStart.y)),
                  width: 0.15
                }
          ]
        }));
        setDraftStart(null);
      }
      return;
    }

    const hitPad = pattern.pads.find((p) => dist(wp, p) <= Math.max(p.width, p.height) * 0.6);
    setSelectedPadId(hitPad?.id ?? null);
  };

  const applyFamilyDefaults = (fam: PatternGeneratorFamily) => {
    setGenFamily(fam);
    if (fam === 'DIP') {
      setGenName('DIP-14_ГОСТ'); setGenPins(14); setGenPitch(2.54); setGenRowSpan(7.62); setGenPadW(1.6); setGenPadH(1.6); setGenHole(0.85); setGenBodyW(6.4); setGenBodyL(19.0);
    } else if (fam === 'SOIC') {
      setGenName('SOIC-16_ГОСТ'); setGenPins(16); setGenPitch(1.27); setGenRowSpan(5.4); setGenPadW(1.55); setGenPadH(0.65); setGenHole(0); setGenBodyW(3.9); setGenBodyL(9.9);
    } else if (fam === 'QFP') {
      setGenName('LQFP-48_ГОСТ'); setGenPins(48); setGenPitch(0.5); setGenRowSpan(8.4); setGenPadW(1.3); setGenPadH(0.32); setGenHole(0); setGenBodyW(7.0); setGenBodyL(7.0);
    } else if (fam === 'QFN') {
      setGenName('QFN-32_ГОСТ'); setGenPins(32); setGenPitch(0.5); setGenRowSpan(4.8); setGenPadW(0.85); setGenPadH(0.28); setGenHole(0); setGenBodyW(5.0); setGenBodyL(5.0); setGenThermalPad(3.2);
    } else if (fam === 'DFN') {
      setGenName('DFN-8_3x3_ГОСТ'); setGenPins(8); setGenPitch(0.5); setGenRowSpan(2.8); setGenPadW(0.7); setGenPadH(0.28); setGenHole(0); setGenBodyW(3.0); setGenBodyL(3.0); setGenThermalPad(1.7);
    } else if (fam === 'SOT23') {
      setGenName('SOT-23_ГОСТ'); setGenPins(3); setGenPitch(0.95); setGenRowSpan(2.2); setGenPadW(1.0); setGenPadH(0.6); setGenHole(0); setGenBodyW(1.3); setGenBodyL(2.9);
    } else if (fam === 'ChipSMD') {
      setGenName('ЧИП_1206'); setGenPins(2); setGenPitch(0); setGenRowSpan(2.8); setGenPadW(1.3); setGenPadH(1.6); setGenHole(0); setGenBodyW(1.6); setGenBodyL(3.2);
    } else if (fam === 'AxialTHT') {
      setGenName('АКСИАЛ_МЛТ-0.25'); setGenPins(2); setGenPitch(0); setGenRowSpan(10.0); setGenPadW(1.8); setGenPadH(1.8); setGenHole(0.8); setGenBodyW(2.4); setGenBodyL(6.5);
    } else if (fam === 'RadialTHT') {
      setGenName('РАДИАЛ_5x11'); setGenPins(2); setGenPitch(2.5); setGenRowSpan(2.5); setGenPadW(1.8); setGenPadH(1.8); setGenHole(0.8); setGenBodyW(5.0); setGenBodyL(5.0);
    } else if (fam === 'Header') {
      setGenName('PLS-10_2.54'); setGenPins(10); setGenPitch(2.54); setGenRowSpan(2.54); setGenPadW(1.8); setGenPadH(1.8); setGenHole(1.0); setGenBodyW(5.1); setGenBodyL(12.7);
    } else if (fam === 'SIP') {
      setGenName('SIP-8_2.54_ГОСТ'); setGenPins(8); setGenPitch(2.54); setGenRowSpan(0); setGenPadW(1.7); setGenPadH(1.7); setGenHole(0.85); setGenBodyW(2.8); setGenBodyL(20.4);
    } else if (fam === 'BGA') {
      setGenName('BGA-16_1.0'); setGenPins(16); setGenPitch(1.0); setGenRowSpan(3.0); setGenPadW(0.5); setGenPadH(0.5); setGenHole(0); setGenBodyW(5.0); setGenBodyL(5.0);
    }
  };

  const allPatterns = useMemo(() => {
    const arr: PatternDef[] = [...userPatterns];
    for (const l of GOST_PATTERN_LIBRARIES) arr.push(...l.patterns);
    return arr;
  }, [userPatterns]);

  const duplicatePadNumbers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pattern.pads) {
      const n = p.number.trim();
      if (!n) continue;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [n, count] of counts.entries()) {
      if (count > 1) dupes.add(n);
    }
    return dupes;
  }, [pattern.pads]);

  const openGenerator = () => {
    setGeneratorIssue(null);
    setShowGenDialog(true);
  };

  const generatePattern = () => {
    const parameters = {
      family: genFamily,
      name: genName.trim(),
      pinCount: genPins,
      pitch: genPitch,
      rowSpacing: genRowSpan,
      padWidth: genPadW,
      padHeight: genPadH,
      holeDiameter: genHole,
      bodyWidth: genBodyW,
      bodyLength: genBodyL,
      bodyHeight: genFamily === 'DIP' || genFamily === 'SIP' ? 3.5 : 1.6,
      densityLevel: genDensity,
      thermalPadSize: (genFamily === 'QFN' || genFamily === 'DFN') ? genThermalPad : undefined
    };
    const issue = validatePatternGenerator(parameters);
    if (issue) {
      setGeneratorIssue(issue);
      return;
    }
    if (!acceptReplacement()) return;
    const generated = generateParametricPattern(parameters);
    replaceDraft(generated);
    setShowGenDialog(false);
    setStatusText(`Сгенерирован корпус «${generated.name}» (${generated.pads.length} контактных площадок).`);
  };

  const openPattern = (nextPattern: PatternDef) => {
    if (!acceptReplacement()) return false;
    replaceDraft(nextPattern);
    changeTool('select');
    setSelectedPadId(null);
    return true;
  };

  const switchModule = (module: Parameters<typeof openAppModule>[0]) => {
    if (acceptReplacement()) openAppModule(module, (m) => onSwitchModule?.(m));
  };

  const menus: TopMenuSpec[] = [
    {
      id: 'lib',
      label: 'Библиотека',
      items: [
        { label: 'Новый корпус...', onClick: () => openPattern(createEmptyPattern()) },
        { label: 'Импорт корпуса из САПР (.lib / .kicad_mod / .lbr / .dxf)...', onClick: handleImportPatternLibrary },
        { label: 'Сохранить в Пользовательскую библиотеку', shortcut: 'Ctrl+S', onClick: handleSavePattern },
        {
          label: 'Экспорт библиотеки корпусов (.gostlib)...',
          onClick: async () => {
            await saveTextFile(`${pattern.name}.gostlib`, JSON.stringify({ patterns: [pattern] }, null, 2), [
              { name: 'Библиотека корпусов ГОСТ', extensions: ['gostlib'] }
            ]);
          }
        },
        { separator: true },
        { label: 'Стартовое окно (Запуск)', onClick: () => switchModule('launcher') }
      ]
    },
    {
      id: 'pattern',
      label: 'Корпус',
      items: [
        { label: 'Генератор корпусов (IPC-7351 / ГОСТ)...', onClick: openGenerator },
        { label: 'Автонумерация контактных площадок (1..N)', onClick: () => setPattern((p) => ({ ...p, pads: renumberPads(p.pads) })) },
        { label: 'Проверить корпус (IPC-7351 / ГОСТ)...', onClick: () => setVerificationIssues(validatePattern(pattern)) }
      ]
    },
    {
      id: 'objects',
      label: 'Объекты',
      items: [
        { label: 'Выбор', checked: tool === 'select', onClick: () => setTool('select') },
        { label: 'Контактная площадка SMD', checked: tool === 'padSmd', onClick: () => setTool('padSmd') },
        { label: 'Контактная площадка THT (со сквозным отв.)', checked: tool === 'padTht', onClick: () => setTool('padTht') },
        { label: 'Крепёжное отверстие (Mounting Hole)', checked: tool === 'hole', onClick: () => setTool('hole') },
        { label: 'Линия шелкографии', checked: tool === 'silkLine', onClick: () => { setDraftStart(null); setTool('silkLine'); } },
        { label: 'Прямоугольник шелкографии', checked: tool === 'silkRect', onClick: () => { setDraftStart(null); setTool('silkRect'); } }
      ]
    },
    {
      id: 'tools',
      label: 'Инструменты',
      items: [
        { label: 'Открыть Плата (PCB Layout)', onClick: () => switchModule('pcb') },
        { label: 'Открыть Редактор компонентов', onClick: () => switchModule('componentEditor') }
      ]
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#f0f0f0' }}>
      <MenuBar menus={menus} onBrandClick={() => switchModule('launcher')} />

      <div className="dt-toolbar-row">
        <button className="dt-tb-btn" title="Новый корпус" onClick={() => openPattern(createEmptyPattern())}><DipIcon name="new" /></button>
        <button className="dt-tb-btn" title="Сохранить в Пользовательскую библиотеку" onClick={handleSavePattern}><DipIcon name="save" /></button>
        <div className="dt-tb-sep" />
        <button className={`dt-tb-btn ${tool === 'select' ? 'active' : ''}`} aria-pressed={tool === 'select'} title="Выбор" onClick={() => changeTool('select')}><DipIcon name="select" /></button>
        <button className={`dt-tb-btn ${tool === 'padSmd' ? 'active' : ''}`} aria-pressed={tool === 'padSmd'} title="Площадка SMD" onClick={() => changeTool('padSmd')}><DipIcon name="padSmd" /></button>
        <button className={`dt-tb-btn ${tool === 'padTht' ? 'active' : ''}`} aria-pressed={tool === 'padTht'} title="Вывод THT (с отверстием)" onClick={() => changeTool('padTht')}><DipIcon name="padTht" /></button>
        <button className={`dt-tb-btn ${tool === 'hole' ? 'active' : ''}`} aria-pressed={tool === 'hole'} title="Крепёжное отверстие" onClick={() => changeTool('hole')}><DipIcon name="hole" /></button>
        <button className={`dt-tb-btn ${tool === 'silkLine' ? 'active' : ''}`} aria-pressed={tool === 'silkLine'} title="Линия шелкографии" onClick={() => changeTool('silkLine')}><DipIcon name="shapeLine" /></button>
        <button className={`dt-tb-btn ${tool === 'silkRect' ? 'active' : ''}`} aria-pressed={tool === 'silkRect'} title="Прямоугольник шелкографии" onClick={() => changeTool('silkRect')}><DipIcon name="shapeRect" /></button>
        <div className="dt-tb-sep" />
        <button className="dt-tb-btn" title="Показать весь корпус" onClick={zoomToFit}><DipIcon name="zoomAll" /></button>
        <select className="dt-tb-select" style={{ width: 72 }} value={gridMm} onChange={(e) => setGridMm(parseFloat(e.target.value))}>
          <option value={0.25}>0,25 мм</option>
          <option value={0.5}>0,5 мм</option>
          <option value={1.25}>1,25 мм</option>
          <option value={2.5}>2,5 мм</option>
        </select>
        <button className="dt-btn" onClick={handleImportPatternLibrary}>Импорт САПР/DXF...</button>
        <button className="dt-btn" data-testid="pated-cadlib-btn" onClick={() => setShowCadLibDialog(true)}>Библиотеки CAD...</button>
        <button className="dt-btn" onClick={() => setShowGenDialog(true)}>Генератор корпусов (IPC-7351)...</button>
        <button className="dt-btn" onClick={() => setVerificationIssues(validatePattern(pattern))}>Проверить корпус</button>
        <button className="dt-btn primary" onClick={handleSavePattern}>Сохранить в библиотеку</button>
      </div>

      <div className="dt-workspace">
        {/* Left Pattern List */}
        <div className="dt-left-sidebar">
          <div className="dt-black-bar" role="heading" aria-level={2}><span>Корпуса библиотек</span></div>
          <div className="dt-comp-list" style={{ height: 230, flex: 'none' }}>
            {allPatterns.map((p) => (
              <div
                key={p.id}
                className={`dt-comp-item ${p.id === pattern.id ? 'selected' : ''}`}
                aria-pressed={p.id === pattern.id}
                onClick={() => openPattern(structuredClone(p))}
              >
                {p.name}
              </div>
            ))}
          </div>

          <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto', flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Свойства корпуса</div>
            <label>Наименование: <input className="dt-input" style={{ width: '100%' }} value={pattern.name} onChange={(e) => setPattern((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>ГОСТ корпус: <input className="dt-input" style={{ width: '100%' }} value={pattern.gostName ?? ''} onChange={(e) => setPattern((p) => ({ ...p, gostName: e.target.value }))} /></label>
            <label>Форма 3D тела:
              <select
                className="dt-select"
                style={{ width: '100%' }}
                value={pattern.model3d.shape}
                onChange={(e) => setPattern((p) => ({ ...p, model3d: { ...p.model3d, shape: e.target.value as Model3DShapeType } }))}
              >
                <option value="ChipSMD">Chip SMD</option>
                <option value="AxialResistor">Осевой (МЛТ)</option>
                <option value="RadialCap">Радиальный (Электролит)</option>
                <option value="DIP">DIP корпус</option>
                <option value="SOIC">SOIC / SOP</option>
                <option value="QFP">LQFP / QFP</option>
                <option value="QFN">QFN</option>
                <option value="SOT23">SOT-23 / КТ-46</option>
                <option value="TO92">КТ-26 (TO-92)</option>
                <option value="TO220">КТ-28 (TO-220)</option>
                <option value="Header">Вилка штыревая (PLS)</option>
                <option value="SwitchTact">Кнопка тактовая</option>
                <option value="Relay">Реле (РЭС / DIP)</option>
                <option value="Crystal">Кварцевый резонатор</option>
                <option value="Inductor">Катушка / Дроссель</option>
                <option value="Cylinder">Цилиндр</option>
                <option value="Box">Прямоугольный 3D корпус</option>
              </select>
            </label>
            <label>Высота 3D (мм): <input className="dt-input" type="number" step="0.5" value={pattern.model3d.bodyHeight} onChange={(e) => setPattern((p) => ({ ...p, model3d: { ...p.model3d, bodyHeight: parseFloat(e.target.value) || 2 } }))} /></label>
          </div>
        </div>

        {/* Center Canvas */}
        <div className="dt-center-col">
          <div className="dt-canvas-wrap" ref={wrapRef}>
            <canvas
              ref={canvasRef}
              tabIndex={0}
              aria-label="Редактор посадочных мест и корпусов (ГОСТ / IPC-7351)"
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
                const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
                setViewport((v) => ({ ...v, pxPerMm: Math.max(4, Math.min(70, v.pxPerMm * f)) }));
              }}
            />
          </div>
        </div>

        {/* Right Pad Manager */}
        <div className="dt-right-sidebar" style={{ width: 335, maxWidth: 380 }}>
          <div className="dt-panel-card" style={{ flex: 1 }}>
            <div className="dt-panel-header">
              <span>Контактные площадки ({pattern.pads.length})</span>
              {selectedPadId && (
                <button
                  className="dt-btn"
                  style={{ minWidth: 50, height: 16, padding: '0 4px', fontSize: 10 }}
                  onClick={() => {
                    setPattern((p) => ({ ...p, pads: p.pads.filter((x) => x.id !== selectedPadId) }));
                    setSelectedPadId(null);
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
                    <th>Тип</th>
                    <th>X</th>
                    <th>Y</th>
                    <th>Ш×В</th>
                    <th>Отв.</th>
                  </tr>
                </thead>
                <tbody>
                  {pattern.pads.map((pad) => (
                    <tr
                      key={pad.id}
                      style={{ background: pad.id === selectedPadId ? '#cce8ff' : '#fff' }}
                      onClick={() => setSelectedPadId(pad.id)}
                      onFocus={() => setSelectedPadId(pad.id)}
                    >
                      <td>
                        <input
                          className="dt-prop-input"
                          style={{
                            width: 24,
                            borderColor: duplicatePadNumbers.has(pad.number.trim()) ? '#d9534f' : undefined,
                            backgroundColor: duplicatePadNumbers.has(pad.number.trim()) ? '#fff0f0' : undefined
                          }}
                          value={pad.number}
                          title={duplicatePadNumbers.has(pad.number.trim()) ? `Дубликат номера площадки «${pad.number}»` : undefined}
                          aria-label={`Номер площадки ${pad.number || 'без номера'}`}
                          disabled={pad.type === 'MountingHole' && !pad.number}
                          onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === pad.id ? { ...x, number: e.target.value } : x) }))}
                        />
                      </td>
                      <td>
                        <select
                          className="dt-prop-input"
                          value={pad.type}
                          aria-label={`Тип площадки ${pad.number || 'без номера'}`}
                          onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === pad.id ? changePadType(x, e.target.value as PadType, p.pads) : x) }))}
                        >
                          <option value="SMD">SMD</option>
                          <option value="THT">THT</option>
                          <option value="MountingHole">Hole</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="dt-prop-input"
                          style={{ width: 48 }}
                          type="number"
                          step="0.25"
                          value={pad.x}
                          aria-label={`Координата X площадки ${pad.number || 'без номера'}`}
                          onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === pad.id ? { ...x, x: parseFloat(e.target.value) || 0 } : x) }))}
                        />
                      </td>
                      <td>
                        <input
                          className="dt-prop-input"
                          style={{ width: 48 }}
                          type="number"
                          step="0.25"
                          value={pad.y}
                          aria-label={`Координата Y площадки ${pad.number || 'без номера'}`}
                          onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === pad.id ? { ...x, y: parseFloat(e.target.value) || 0 } : x) }))}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <input className="dt-prop-input" style={{ width: 32 }} type="number" step="0.1" value={pad.width} onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === pad.id ? { ...x, width: Math.max(0.1, parseFloat(e.target.value) || 0.2) } : x) }))} />
                          <input className="dt-prop-input" style={{ width: 32 }} type="number" step="0.1" value={pad.height} onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === pad.id ? { ...x, height: Math.max(0.1, parseFloat(e.target.value) || 0.2) } : x) }))} />
                        </div>
                      </td>
                      <td>
                        <input className="dt-prop-input" aria-label={`Диаметр отверстия площадки ${pad.number || 'без номера'}`} style={{ width: 34 }} type="number" step="0.05" disabled={pad.type === 'SMD'} value={pad.holeDiameter ?? 0} onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === pad.id ? { ...x, holeDiameter: Math.max(0, parseFloat(e.target.value) || 0) } : x) }))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pattern.pads.find((p) => p.id === selectedPadId) && (() => {
              const selPad = pattern.pads.find((p) => p.id === selectedPadId)!;
              return (
                <div style={{ padding: '6px 8px', borderTop: '1px solid #ddd', background: '#f8f9fa', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: 600 }}>
                    Свойства площадки №{selPad.number || '—'} ({selPad.type})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <label>Форма:
                      <select
                        className="dt-select"
                        style={{ width: '100%' }}
                        value={selPad.shape}
                        aria-label={`Форма площадки ${selPad.number || 'без номера'}`}
                        onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === selPad.id ? { ...x, shape: e.target.value as PadShape } : x) }))}
                      >
                        <option value="RoundedRect">RoundedRect (Скруглённый прямоуг.)</option>
                        <option value="Rect">Rect (Прямоугольный)</option>
                        <option value="Round">Round (Круглый)</option>
                        <option value="Oval">Oval (Овальный)</option>
                        <option value="Polygon">Polygon (Полигональный / Срезанный)</option>
                      </select>
                    </label>
                    <label>Угол (°):
                      <input
                        className="dt-input"
                        type="number"
                        step="45"
                        value={selPad.angle ?? 0}
                        aria-label={`Угол площадки ${selPad.number || 'без номера'}`}
                        onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === selPad.id ? { ...x, angle: parseFloat(e.target.value) || 0 } : x) }))}
                      />
                    </label>
                    <label>Маска (мм):
                      <input
                        className="dt-input"
                        type="number"
                        step="0.01"
                        value={selPad.solderMaskExpansion ?? 0.05}
                        aria-label={`Маска площадки ${selPad.number || 'без номера'}`}
                        onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === selPad.id ? { ...x, solderMaskExpansion: parseFloat(e.target.value) || 0 } : x) }))}
                      />
                    </label>
                    <label>Паста (мм):
                      <input
                        className="dt-input"
                        type="number"
                        step="0.01"
                        value={selPad.pasteMaskExpansion ?? 0}
                        aria-label={`Паста площадки ${selPad.number || 'без номера'}`}
                        onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === selPad.id ? { ...x, pasteMaskExpansion: parseFloat(e.target.value) || 0 } : x) }))}
                      />
                    </label>
                    <label style={{ gridColumn: '1 / -1' }}>Термобарьер:
                      <select
                        className="dt-select"
                        style={{ width: '100%' }}
                        value={selPad.thermalMode ?? 'Inherited'}
                        aria-label={`Термобарьер площадки ${selPad.number || 'без номера'}`}
                        onChange={(e) => setPattern((p) => ({ ...p, pads: p.pads.map((x) => x.id === selPad.id ? { ...x, thermalMode: e.target.value as any } : x) }))}
                      >
                        <option value="Inherited">По умолчанию (Inherited)</option>
                        <option value="4Spoke">4 спицы (крест)</option>
                        <option value="2Spoke">2 спицы</option>
                        <option value="Direct">Сплошной контакт (Direct)</option>
                        <option value="None">Без термобарьера</option>
                      </select>
                    </label>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <StatusBar hint={statusText} gridMm={gridMm} units="mm" cursorX={cursorMm.x} cursorY={cursorMm.y} />

      {/* IPC-7351 / GOST Parametric Pattern Generator Modal */}
      {showGenDialog && (
        <div className="dt-modal-backdrop">
          <div className="dt-modal" style={{ width: 520 }} role="dialog" aria-label="Параметрический генератор корпусов (IPC-7351 / ГОСТ)">
            <div className="dt-modal-title">
              <span>Параметрический генератор корпусов (IPC-7351 / ГОСТ)</span>
              <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={() => setShowGenDialog(false)}>×</button>
            </div>
            <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>Семейство корпуса:
                  <select className="dt-select" style={{ width: '100%' }} value={genFamily} onChange={(e) => applyFamilyDefaults(e.target.value as PatternGeneratorFamily)}>
                    <option value="SOIC">SOIC / SOP (Планарный двухрядный)</option>
                    <option value="DIP">DIP (Штыревой двухрядный ГОСТ 2.54 мм)</option>
                    <option value="QFP">QFP / LQFP (Четырёхсторонний планарный)</option>
                    <option value="QFN">QFN (С термопадом)</option>
                    <option value="DFN">DFN (Двухрядный с термопадом)</option>
                    <option value="SOT23">SOT-23 (3-выводной SMD)</option>
                    <option value="ChipSMD">Chip SMD (Резистор / Конденсатор)</option>
                    <option value="AxialTHT">Осевой THT (МЛТ / КД)</option>
                    <option value="RadialTHT">Радиальный THT (Электролит)</option>
                    <option value="Header">Штыревая вилка (PLS)</option>
                    <option value="SIP">SIP (Штыревой однорядный)</option>
                    <option value="BGA">Матрица выводов (BGA)</option>
                  </select>
                </label>
                <label>Уровень плотности (IPC-7351):
                  <select className="dt-select" style={{ width: '100%' }} value={genDensity} onChange={(e) => setGenDensity(e.target.value as any)}>
                    <option value="A">Уровень A (Максимальный припой)</option>
                    <option value="B">Уровень B (Номинальный — Стандарт)</option>
                    <option value="C">Уровень C (Минимальный / Высокая плотность)</option>
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>Быстрый выбор типоразмера IPC / ГОСТ:
                  <select
                    className="dt-select"
                    style={{ width: '100%' }}
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      if (val.startsWith('CHIP_')) {
                        const code = val.replace('CHIP_', '');
                        const p = IPC_CHIP_PRESETS[code];
                        if (p) {
                          setGenFamily('ChipSMD');
                          setGenName(`ЧИП_${p.imperialName} (${p.metricName})`);
                          setGenPins(2);
                          setGenPitch(0);
                          setGenRowSpan(p.rowSpacing);
                          setGenPadW(p.padLength);
                          setGenPadH(p.padWidth);
                          setGenHole(0);
                          setGenBodyW(p.bodyWidth);
                          setGenBodyL(p.bodyLength);
                        }
                      } else if (val.startsWith('GW_')) {
                        const code = val.replace('GW_', '');
                        const p = IPC_GULLWING_PRESETS[code];
                        if (p) {
                          setGenFamily('SOIC');
                          setGenName(p.name);
                          setGenPins(p.pinCount);
                          setGenPitch(p.pitch);
                          setGenRowSpan(p.rowSpacing);
                          setGenPadW(p.padWidth);
                          setGenPadH(p.padHeight);
                          setGenHole(0);
                          setGenBodyW(p.bodyWidth);
                          setGenBodyL(p.bodyLength);
                        }
                      } else if (val.startsWith('QFP_')) {
                        const code = val.replace('QFP_', '');
                        const p = IPC_QFP_PRESETS[code];
                        if (p) {
                          setGenFamily('QFP');
                          setGenName(p.name);
                          setGenPins(p.pinCount);
                          setGenPitch(p.pitch);
                          setGenRowSpan(p.rowSpacing);
                          setGenPadW(p.padWidth);
                          setGenPadH(p.padHeight);
                          setGenHole(0);
                          setGenBodyW(p.bodyWidth);
                          setGenBodyL(p.bodyLength);
                        }
                      } else if (val.startsWith('QFN_') || val.startsWith('DFN_')) {
                        const code = val;
                        const p = IPC_QFN_DFN_PRESETS[code.replace('QFN_', '').replace('DFN_', '')];
                        if (p) {
                          setGenFamily(p.family);
                          setGenName(p.name);
                          setGenPins(p.pinCount);
                          setGenPitch(p.pitch);
                          setGenRowSpan(p.rowSpacing);
                          setGenPadW(p.padWidth);
                          setGenPadH(p.padHeight);
                          setGenHole(0);
                          setGenBodyW(p.bodyWidth);
                          setGenBodyL(p.bodyLength);
                          setGenThermalPad(p.thermalPadSize);
                        }
                      } else if (val.startsWith('BGA_')) {
                        const code = val.replace('BGA_', '');
                        const p = IPC_BGA_PRESETS[code];
                        if (p) {
                          setGenFamily('BGA');
                          setGenName(p.name);
                          setGenPins(p.pinCount);
                          setGenPitch(p.pitch);
                          setGenRowSpan(p.pitch * (p.cols - 1));
                          setGenPadW(p.padDiameter);
                          setGenPadH(p.padDiameter);
                          setGenHole(0);
                          setGenBodyW(p.bodyWidth);
                          setGenBodyL(p.bodyLength);
                        }
                      } else if (val.startsWith('THD_')) {
                        const code = val.replace('THD_', '');
                        const p = IPC_THD_PRESETS[code];
                        if (p) {
                          setGenFamily(p.family);
                          setGenName(p.name);
                          setGenPins(p.pinCount);
                          setGenPitch(p.pitch);
                          setGenRowSpan(p.rowSpacing);
                          setGenPadW(p.padWidth);
                          setGenPadH(p.padHeight);
                          setGenHole(p.holeDiameter);
                          setGenBodyW(p.bodyWidth);
                          setGenBodyL(p.bodyLength);
                        }
                      }
                    }}
                  >
                    <option value="">-- Выберите типовой корпус IPC / ГОСТ --</option>
                    <optgroup label="Чип-компоненты (SMD резисторы / конденсаторы)">
                      <option value="CHIP_0201">0201 (0603M)</option>
                      <option value="CHIP_0402">0402 (1005M)</option>
                      <option value="CHIP_0603">0603 (1608M)</option>
                      <option value="CHIP_0805">0805 (2012M)</option>
                      <option value="CHIP_1206">1206 (3216M)</option>
                      <option value="CHIP_1210">1210 (3225M)</option>
                      <option value="CHIP_2512">2512 (6432M)</option>
                    </optgroup>
                    <optgroup label="SOIC / SOP / TSSOP / MSOP">
                      <option value="GW_SOIC-8">SOIC-8 (шаг 1.27 мм)</option>
                      <option value="GW_SOIC-14">SOIC-14 (шаг 1.27 мм)</option>
                      <option value="GW_SOIC-16">SOIC-16 (шаг 1.27 мм)</option>
                      <option value="GW_SOIC-16W">SOIC-16W (широкий 7.5 мм)</option>
                      <option value="GW_TSSOP-14">TSSOP-14 (шаг 0.65 мм)</option>
                      <option value="GW_TSSOP-16">TSSOP-16 (шаг 0.65 мм)</option>
                      <option value="GW_TSSOP-20">TSSOP-20 (шаг 0.65 мм)</option>
                      <option value="GW_MSOP-8">MSOP-8 (шаг 0.65 мм)</option>
                      <option value="GW_MSOP-10">MSOP-10 (шаг 0.50 мм)</option>
                    </optgroup>
                    <optgroup label="QFP / LQFP / TQFP">
                      <option value="QFP_QFP-32_0.8">QFP-32 (шаг 0.8 мм, 7×7 мм)</option>
                      <option value="QFP_QFP-44_0.8">QFP-44 (шаг 0.8 мм, 10×10 мм)</option>
                      <option value="QFP_LQFP-48_0.5">LQFP-48 (шаг 0.5 мм, 7×7 мм)</option>
                      <option value="QFP_LQFP-64_0.5">LQFP-64 (шаг 0.5 мм, 10×10 мм)</option>
                      <option value="QFP_TQFP-100_0.4">TQFP-100 (шаг 0.4 мм, 14×14 мм)</option>
                      <option value="QFP_TQFP-100_0.5">TQFP-100 (шаг 0.5 мм, 14×14 мм)</option>
                    </optgroup>
                    <optgroup label="QFN / DFN (с термопадом)">
                      <option value="DFN_DFN-6_2x2">DFN-6 (2×2 мм, шаг 0.65 мм, EP 1.2 мм)</option>
                      <option value="DFN_DFN-8_3x3">DFN-8 (3×3 мм, шаг 0.50 мм, EP 1.7 мм)</option>
                      <option value="QFN_QFN-16_3x3">QFN-16 (3×3 мм, шаг 0.50 мм, EP 1.65 мм)</option>
                      <option value="QFN_QFN-24_4x4">QFN-24 (4×4 мм, шаг 0.50 мм, EP 2.45 мм)</option>
                      <option value="QFN_QFN-32_5x5">QFN-32 (5×5 мм, шаг 0.50 мм, EP 3.20 мм)</option>
                      <option value="QFN_QFN-48_7x7">QFN-48 (7×7 мм, шаг 0.50 мм, EP 5.10 мм)</option>
                    </optgroup>
                    <optgroup label="BGA (матрица выводов)">
                      <option value="BGA_BGA-16_1.0">BGA-16 (шаг 1.0 мм, 4×4, пады Ø0.5 мм)</option>
                      <option value="BGA_BGA-64_0.8">BGA-64 (шаг 0.8 мм, 8×8, пады Ø0.4 мм)</option>
                      <option value="BGA_BGA-100_0.8">BGA-100 (шаг 0.8 мм, 10×10, пады Ø0.4 мм)</option>
                      <option value="BGA_BGA-144_0.8">BGA-144 (шаг 0.8 мм, 12×12, пады Ø0.4 мм)</option>
                      <option value="BGA_BGA-256_1.0">BGA-256 (шаг 1.0 мм, 16×16, пады Ø0.5 мм)</option>
                      <option value="BGA_BGA-256_0.5">BGA-256 (шаг 0.5 мм, 16×16, пады Ø0.3 мм)</option>
                    </optgroup>
                    <optgroup label="DIP / SIP (штыревые корпуса)">
                      <option value="THD_DIP-8">DIP-8 (шаг 2.54 мм, ширина 7.62 мм)</option>
                      <option value="THD_DIP-14">DIP-14 (шаг 2.54 мм, ширина 7.62 мм)</option>
                      <option value="THD_DIP-16">DIP-16 (шаг 2.54 мм, ширина 7.62 мм)</option>
                      <option value="THD_DIP-28">DIP-28 (шаг 2.54 мм, ширина 15.24 мм)</option>
                      <option value="THD_SIP-4">SIP-4 (шаг 2.54 мм, однорядный)</option>
                      <option value="THD_SIP-8">SIP-8 (шаг 2.54 мм, однорядный)</option>
                      <option value="THD_SIP-10">SIP-10 (шаг 2.54 мм, однорядный)</option>
                    </optgroup>
                  </select>
                </label>
                <label>Название корпуса: <input className="dt-input" style={{ width: '100%' }} value={genName} onChange={(e) => setGenName(e.target.value)} /></label>
                <label>Количество выводов: <input className="dt-input" style={{ width: '100%' }} type="number" min={2} max={4096} value={genPins} onChange={(e) => setGenPins(Number(e.target.value))} /></label>
                <label>Шаг выводов e (мм): <input className="dt-input" style={{ width: '100%' }} type="number" step="0.05" value={genPitch} onChange={(e) => setGenPitch(parseFloat(e.target.value) || 0.5)} /></label>
                <label>Межрядное расстояние (мм): <input className="dt-input" style={{ width: '100%' }} type="number" step="0.1" value={genRowSpan} onChange={(e) => setGenRowSpan(parseFloat(e.target.value) || 5)} /></label>
                <label>Ширина площадки (мм): <input className="dt-input" style={{ width: '100%' }} type="number" step="0.05" value={genPadW} onChange={(e) => setGenPadW(parseFloat(e.target.value) || 1.2)} /></label>
                <label>Высота площадки (мм): <input className="dt-input" style={{ width: '100%' }} type="number" step="0.05" value={genPadH} onChange={(e) => setGenPadH(parseFloat(e.target.value) || 0.6)} /></label>
                <label>Диаметр отв. THT (0 для SMD): <input className="dt-input" style={{ width: '100%' }} type="number" step="0.05" value={genHole} onChange={(e) => setGenHole(parseFloat(e.target.value) || 0)} /></label>
                <label>Ширина × Длина корпуса (мм):
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="dt-input" style={{ width: '50%' }} type="number" step="0.5" value={genBodyW} onChange={(e) => setGenBodyW(parseFloat(e.target.value) || 4)} />
                    <input className="dt-input" style={{ width: '50%' }} type="number" step="0.5" value={genBodyL} onChange={(e) => setGenBodyL(parseFloat(e.target.value) || 6)} />
                  </div>
                </label>
                {(genFamily === 'QFN' || genFamily === 'DFN') && (
                  <label>Термопад {genFamily} (мм):
                    <input className="dt-input" style={{ width: '100%' }} type="number" step="0.1" value={genThermalPad} onChange={(e) => setGenThermalPad(Math.max(0, parseFloat(e.target.value) || 0))} />
                  </label>
                )}
              </div>
              {generatorIssue && <p role="alert">{generatorIssue}</p>}
            </div>
            <div className="dt-modal-footer">
              <button className="dt-btn primary" onClick={generatePattern}>
                Сгенерировать корпус
              </button>
              <button className="dt-btn" onClick={() => setShowGenDialog(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {conversionReport && (
        <GostConversionDialog report={conversionReport} onClose={() => setConversionReport(null)} />
      )}

      {showCadLibDialog && (
        <CadLibraryManagerDialog
          initialTab="patterns"
          onClose={() => setShowCadLibDialog(false)}
          onSelectPattern={(pat) => {
            if (!openPattern(structuredClone(pat))) return false;
            setStatusText(`Загружен корпус «${pat.name}» из библиотеки «${pat.library}».`);
            return true;
          }}
        />
      )}

      {verificationIssues && (
        <div className="dt-modal-backdrop">
          <div className="dt-modal" role="dialog" aria-modal="true" aria-label="Проверка корпуса" style={{ width: 520, maxWidth: '95vw' }}>
            <div className="dt-modal-title">
              <span>Проверка корпуса (IPC-7351 / ГОСТ)</span>
              <button className="dt-btn" aria-label="Закрыть проверку" onClick={() => setVerificationIssues(null)}>×</button>
            </div>
            <div className="dt-modal-body" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {verificationIssues.length === 0 ? (
                <p>Корпус «{pattern.name}» прошёл проверку: геометрия площадок, зазоры маски и пасты соответствуют нормам.</p>
              ) : (
                <ul>
                  {verificationIssues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="dt-modal-footer">
              <button className="dt-btn" onClick={() => setVerificationIssues(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
