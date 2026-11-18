import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AppModuleId, PcbPlacedComponent, PcbProject } from '../../../core/types';
import { polygonBounds } from '../../../core/geometry';
import { buildPcbScene } from './buildPcbScene';
import { loadActivePcb, openAppModule, subscribeEdaEvents } from '../../../core/store';
import { exportPcbDxf, exportPcbObj3D, exportPcbStep, exportPcbStlAscii, exportPcbWrl } from '../../../engines/camExport';
import { saveTextFile } from '../../../core/utils/fileIo';
import { MenuBar, TopMenuSpec } from '../../components/MenuBar';
import { DipIcon } from '../../theme/DipTraceIcons';

const MASK_PALETTES = [
  { label: 'Зелёная', color: '#1b6b33' },
  { label: 'Синяя', color: '#124185' },
  { label: 'Красная', color: '#8b1a1a' },
  { label: 'Чёрная матовая', color: '#1c1c1e' },
  { label: 'Белая', color: '#dcdcdc' }
];

const VIEW_CONTROLS = 'ЛКМ — вращение, ПКМ / СКМ / стрелки — панорама, колесо / + и − — масштаб, Home / I — изометрия, R / Пробел — сброс.';
const EXPORT_FORMATS = {
  obj: { extension: 'obj', serialize: exportPcbObj3D },
  stl: { extension: 'stl', serialize: exportPcbStlAscii },
  wrl: { extension: 'wrl', serialize: exportPcbWrl },
  step: { extension: 'stp', serialize: exportPcbStep },
  dxf: { extension: 'dxf', serialize: exportPcbDxf }
} as const;

export const Pcb3dModule: React.FC<{ onSwitchModule?: (m: AppModuleId) => void }> = ({ onSwitchModule }) => {
  const [pcb, setPcb] = useState<PcbProject>(() => loadActivePcb());
  const [maskColor, setMaskColor] = useState<string>(pcb.soldermaskColor || '#1b6b33');
  const [finishGold, setFinishGold] = useState<boolean>(pcb.surfaceFinish === 'ENIG');
  const [showComponents, setShowComponents] = useState<boolean>(true);
  const [showSilk, setShowSilk] = useState<boolean>(true);
  const [showMask, setShowMask] = useState<boolean>(true);
  const [showCopper, setShowCopper] = useState<boolean>(true);
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [inspectedComponent, setInspectedComponent] = useState<PcbPlacedComponent | null>(null);
  const [statusText, setStatusText] = useState(VIEW_CONTROLS);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(60);
  const [polyCount, setPolyCount] = useState<number>(0);

  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pcbGroupRef = useRef<THREE.Group | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);

  const boardCenter = useMemo(() => {
    const b = pcb.boardOutline.length >= 3 ? polygonBounds(pcb.boardOutline) : { minX: 0, minY: 0, maxX: 80, maxY: 50 };
    return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY };
  }, [pcb.boardOutline]);

  useEffect(() => {
    document.title = `3D-просмотр платы - [${pcb.projectName}] — SIPTrace`;
  }, [pcb.projectName]);

  useEffect(() => {
    setMaskColor(pcb.soldermaskColor || '#1b6b33');
    setFinishGold(pcb.surfaceFinish === 'ENIG');
  }, [pcb.projectName, pcb.soldermaskColor, pcb.surfaceFinish]);

  useEffect(() => {
    return subscribeEdaEvents((ch, payload: unknown) => {
      if (ch === 'pcb:updated' && payload) {
        setPcb(payload as PcbProject);
      }
    });
  }, []);

  const setCameraPreset = useCallback(
    (preset: 'iso' | 'top' | 'bottom' | 'side' | 'left' | 'right') => {
      const cam = cameraRef.current;
      const ctr = controlsRef.current;
      if (!cam || !ctr) return;
      const prevDamp = ctr.enableDamping;
      ctr.enableDamping = false;
      ctr.update();
      ctr.target.set(0, 0, 0);
      const halfFov = THREE.MathUtils.degToRad(cam.fov / 2);
      const halfHorizontalFov = Math.atan(Math.tan(halfFov) * cam.aspect);
      const upperSide = Math.max(boardCenter.w, boardCenter.h);
      const d = Math.max(20, (upperSide * 0.62) / Math.sin(Math.min(halfFov, halfHorizontalFov)));
      cam.far = Math.max(2000, d * 10);
      cam.updateProjectionMatrix();
      cam.up.set(0, 1, 0);
      if (preset === 'top') {
        cam.position.set(0, d, 0.01);
      } else if (preset === 'bottom') {
        cam.position.set(0, -d, 0.01);
      } else if (preset === 'side') {
        cam.position.set(0, Math.max(2.5, (pcb.boardThickness || 1.6) * 2), d);
      } else if (preset === 'left') {
        cam.position.set(-d, Math.max(2.5, (pcb.boardThickness || 1.6) * 2), 0.01);
      } else if (preset === 'right') {
        cam.position.set(d, Math.max(2.5, (pcb.boardThickness || 1.6) * 2), 0.01);
      } else {
        cam.position.set(0.55, 0.68, 0.72).setLength(d);
      }
      ctr.update();
      ctr.enableDamping = prevDamp;
      invalidateRef.current?.();
    },
    [boardCenter.w, boardCenter.h, pcb.boardThickness]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || (e.shiftKey && e.key !== '+')) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable], .dt-menubar')) return;
      const key = e.key.toLowerCase();
      if (e.key === '1' || e.key === 'Home' || key === 'i') setCameraPreset('iso');
      else if (e.key === '2' || key === 't') setCameraPreset('top');
      else if (e.key === '3' || key === 'b') setCameraPreset('bottom');
      else if (e.key === '4' || key === 's') setCameraPreset('side');
      else if (key === 'l') setCameraPreset('left');
      else if (key === 'g') setCameraPreset('right');
      else if (key === 'r' || e.code === 'KeyR' || e.key === ' ') setCameraPreset('iso');
      else if (['+', '=', '-'].includes(e.key) && e.target === rendererRef.current?.domElement) {
        const cam = cameraRef.current;
        const ctr = controlsRef.current;
        if (!cam || !ctr) return;
        const factor = e.key === '-' ? 1.15 : 1 / 1.15;
        const distance = THREE.MathUtils.clamp(cam.position.distanceTo(ctr.target) * factor, 1, cam.far * 0.5);
        cam.position.sub(ctr.target).setLength(distance).add(ctr.target);
        ctr.update();
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCameraPreset]);

  // Helper to cleanly dispose Three.js geometries, materials, and textures
  const disposeObject3D = useCallback((root: THREE.Object3D) => {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial & { map?: THREE.Texture | null };
        if (std.map) std.map.dispose();
        m.dispose();
      }
    });
  }, []);

  // Initialize persistent WebGLRenderer, Camera, Controls, and Scene ONCE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setWebglError('Для 3D-просмотра требуется WebGL 2.');
      return;
    }

    const w = container.clientWidth || 900;
    const h = container.clientHeight || 600;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    const canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '3D-модель печатной платы');
    canvas.setAttribute('aria-describedby', 'pcb3d-controls');
    container.appendChild(canvas);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#222730');

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 2000);
    camera.position.set(1, 1, 1);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.listenToKeyEvents(canvas);
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN
    };
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(60, 120, 70);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.45);
    fillLight.position.set(-70, -50, -60);
    scene.add(fillLight);

    const pcbGroup = new THREE.Group();
    scene.add(pcbGroup);
    pcbGroupRef.current = pcbGroup;

    let rafId = 0;
    let frameTimes: number[] = [];
    const draw = (now: number) => {
      rafId = 0;
      controls.update();
      renderer.render(scene, camera);

      if (now > 0) {
        frameTimes.push(now);
        if (frameTimes.length > 15) {
          frameTimes = frameTimes.filter((t) => now - t < 1000);
          if (frameTimes.length >= 2) {
            setFps(Math.round((frameTimes.length * 1000) / (now - frameTimes[0])));
          }
        }
      }
    };
    const invalidate = () => {
      if (!rafId) rafId = requestAnimationFrame(draw);
    };
    invalidateRef.current = invalidate;
    controls.addEventListener('change', invalidate);
    invalidate();

    const onResize = () => {
      const nw = container.clientWidth || 900;
      const nh = container.clientHeight || 600;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      invalidate();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('Потеряно подключение к WebGL. Восстанавливаем 3D-просмотр…');
    };
    const onContextRestored = () => {
      setWebglError(null);
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    let pointerDownPos = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) < 6) {
        const cam = cameraRef.current;
        const group = pcbGroupRef.current;
        if (!cam || !group) return;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cam);
        const hits = raycaster.intersectObjects(group.children, true);
        let foundComp: PcbPlacedComponent | null = null;
        for (const hit of hits) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur && cur !== group) {
            if (cur.userData?.component) {
              foundComp = cur.userData.component as PcbPlacedComponent;
              break;
            }
            cur = cur.parent;
          }
          if (foundComp) break;
        }
        setInspectedComponent(foundComp);
        if (foundComp) {
          setStatusText(
            `Инспекция: ${foundComp.refDes} (${foundComp.value || 'Без номинала'}, ${foundComp.patternId || 'SMD'}, ${foundComp.side}, X=${foundComp.x.toFixed(1)}, Y=${foundComp.y.toFixed(1)} мм)`
          );
        } else {
          setStatusText(VIEW_CONTROLS);
        }
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      disposeObject3D(scene);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      pcbGroupRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      invalidateRef.current = null;
    };
  }, [disposeObject3D]);

  useEffect(() => {
    setCameraPreset('iso');
  }, [pcb.projectName, setCameraPreset]);

  useEffect(() => {
    const pcbGroup = pcbGroupRef.current;
    if (!pcbGroup) return;

    disposeObject3D(pcbGroup);
    pcbGroup.clear();
    buildPcbScene(pcbGroup, pcb, boardCenter, {
      maskColor,
      finishGold,
      showComponents,
      showSilk,
      showCopper,
      showMask,
      explodeFactor,
      inspectedRefDes: inspectedComponent?.refDes ?? null
    });
    invalidateRef.current?.();

    let tris = 0;
    pcbGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        if (mesh.geometry.index) {
          tris += mesh.geometry.index.count / 3;
        } else if (mesh.geometry.attributes?.position) {
          tris += mesh.geometry.attributes.position.count / 3;
        }
      }
    });
    setPolyCount(Math.round(tris));
  }, [pcb, maskColor, finishGold, showComponents, showSilk, showCopper, showMask, explodeFactor, inspectedComponent, boardCenter, disposeObject3D]);

  const handleSavePng = () => {
    const ren = rendererRef.current;
    if (!ren) return;
    const url = ren.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pcb.projectName || 'pcb'}_3D.png`;
    a.click();
    setStatusText('Снимок 3D-платы сохранён в PNG.');
  };

  const handleExport3dFormat = async (format: keyof typeof EXPORT_FORMATS) => {
    const { extension, serialize } = EXPORT_FORMATS[format];
    const label = format.toUpperCase();
    try {
      const content = serialize(pcb);
      const saved = await saveTextFile(`${pcb.projectName || 'pcb'}.${extension}`, content);
      if (saved) setStatusText(`Экспорт ${label}: ${saved} (${new TextEncoder().encode(content).length} байт). Корпуса упрощены.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`Экспорт ${label} не выполнен. ${message}`);
    }
  };

  const handleExportObj = () => handleExport3dFormat('obj');

  const menus: TopMenuSpec[] = [
    {
      id: 'file',
      label: 'Файл',
      items: [
        { label: 'Экспорт 3D модели в OBJ...', onClick: () => handleExport3dFormat('obj') },
        { label: 'Экспорт 3D модели в STL...', onClick: () => handleExport3dFormat('stl') },
        { label: 'Экспорт 3D модели в VRML (.wrl)...', onClick: () => handleExport3dFormat('wrl') },
        { label: 'Экспорт 3D модели в STEP (.stp)...', onClick: () => handleExport3dFormat('step') },
        { label: 'Экспорт 3D/2D в DXF (.dxf)...', onClick: () => handleExport3dFormat('dxf') },
        { label: 'Сохранить снимок PNG...', disabled: !!webglError, onClick: handleSavePng },
        { separator: true },
        { label: 'Вернуться в редактор Плата', onClick: () => openAppModule('pcb', (m) => onSwitchModule?.(m)) },
        { label: 'Стартовое окно (Запуск)', onClick: () => openAppModule('launcher', (m) => onSwitchModule?.(m)) }
      ]
    },
    {
      id: 'view',
      label: 'Вид',
      items: [
        { label: 'Вид сверху', shortcut: '2 / T', onClick: () => setCameraPreset('top') },
        { label: 'Вид снизу', shortcut: '3 / B', onClick: () => setCameraPreset('bottom') },
        { label: 'Изометрия', shortcut: '1 / Home / I', onClick: () => setCameraPreset('iso') },
        { label: 'Вид сбоку', shortcut: '4 / S', onClick: () => setCameraPreset('side') },
        { label: 'Вид слева', shortcut: 'L', onClick: () => setCameraPreset('left') },
        { label: 'Вид справа', shortcut: 'G', onClick: () => setCameraPreset('right') },
        { separator: true },
        { label: 'Показать 3D-компоненты', checked: showComponents, onClick: () => setShowComponents((v) => !v) },
        { label: 'Показать шелкографию', checked: showSilk, onClick: () => setShowSilk((v) => !v) },
        { label: 'Показать медь (проводники)', checked: showCopper, onClick: () => setShowCopper((v) => !v) },
        { label: 'Показать паяльную маску', checked: showMask, onClick: () => setShowMask((v) => !v) }
      ]
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#f0f0f0' }}>
      <MenuBar menus={menus} onBrandClick={() => openAppModule('launcher', (m) => onSwitchModule?.(m))} />

      <div className="dt-toolbar-row dt-pcb3d-toolbar" role="group" aria-label="Управление 3D-просмотром">
        <button className="dt-btn" title="Изометрический ракурс (Home / 1 / I)" onClick={() => setCameraPreset('iso')}>Изометрия</button>
        <button className="dt-btn" title="Вид сверху (2 / T)" onClick={() => setCameraPreset('top')}>Сверху</button>
        <button className="dt-btn" title="Вид снизу (3 / B)" onClick={() => setCameraPreset('bottom')}>Снизу</button>
        <button className="dt-btn" title="Вид сбоку (4 / S)" onClick={() => setCameraPreset('side')}>Сбоку</button>
        <button className="dt-btn" title="Вид слева (L)" onClick={() => setCameraPreset('left')}>Слева</button>
        <button className="dt-btn" title="Вид справа (G)" onClick={() => setCameraPreset('right')}>Справа</button>
        <div className="dt-tb-sep" />
        <label htmlFor="pcb3d-mask">Маска:</label>
        <select id="pcb3d-mask" className="dt-tb-select" value={maskColor} onChange={(e) => setMaskColor(e.target.value)}>
          {!MASK_PALETTES.some((mask) => mask.color === maskColor) && <option value={maskColor}>Цвет проекта ({maskColor})</option>}
          {MASK_PALETTES.map((m) => (
            <option key={m.color} value={m.color}>{m.label}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Отображение паяльной маски">
          <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} />
          Масочный слой
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Отображение медных дорожек и полигонов">
          <input type="checkbox" checked={showCopper} onChange={(e) => setShowCopper(e.target.checked)} />
          Медь
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Покрытие площадок: ENIG (золото) или HASL (олово)">
          <input type="checkbox" checked={finishGold} onChange={(e) => setFinishGold(e.target.checked)} />
          Золото (ENIG)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showComponents} onChange={(e) => setShowComponents(e.target.checked)} />
          3D корпуса
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showSilk} onChange={(e) => setShowSilk(e.target.checked)} />
          Шелкография
        </label>
        <div className="dt-tb-sep" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          Разнос слоёв:
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={explodeFactor}
            onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
            style={{ width: 90 }}
          />
        </label>
        <div style={{ flex: 1 }} />
        <button className="dt-btn" disabled={!!webglError} onClick={handleSavePng}>Снимок PNG</button>
        <button className="dt-btn" onClick={() => handleExport3dFormat('stl')}>Экспорт STL</button>
        <button className="dt-btn" onClick={() => handleExport3dFormat('step')}>Экспорт STEP</button>
        <button className="dt-btn" onClick={() => handleExport3dFormat('dxf')}>Экспорт DXF</button>
        <button className="dt-btn" onClick={() => handleExport3dFormat('wrl')}>Экспорт WRL</button>
        <button className="dt-btn primary" onClick={handleExportObj}><DipIcon name="view3d" /> &nbsp;Экспорт OBJ</button>
      </div>

      <div ref={mountRef} style={{ flex: 1, minHeight: 0, position: 'relative', background: '#222730' }}>
        {webglError && (
          <div role="alert" style={{ position: 'relative', padding: 24, color: '#fff' }}>
            {webglError}
          </div>
        )}
        {inspectedComponent && (
          <div
            data-testid="pcb3d-component-inspector"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              background: 'rgba(23, 27, 34, 0.95)',
              backdropFilter: 'blur(8px)',
              color: '#ffffff',
              border: '1px solid #38bdf8',
              borderRadius: 6,
              padding: '12px 14px',
              fontSize: 12,
              minWidth: 260,
              maxWidth: 320,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 10
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #334155', paddingBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ background: '#0284c7', color: '#fff', padding: '2px 7px', borderRadius: 4, fontWeight: 'bold', fontSize: 13 }}>
                  {inspectedComponent.refDes}
                </span>
                <span style={{ fontWeight: 600 }}>{inspectedComponent.value || 'Без номинала'}</span>
              </div>
              <button
                className="dt-btn"
                aria-label="Закрыть инспекцию"
                style={{ minWidth: 20, height: 20, padding: 0, fontSize: 13, background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  setInspectedComponent(null);
                  setStatusText(VIEW_CONTROLS);
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '5px 8px', fontSize: 11.5, color: '#cbd5e1' }}>
              <span>Корпус:</span><span style={{ color: '#fff', fontWeight: 500 }}>{inspectedComponent.patternId || 'SMD'}</span>
              <span>Слой монтажа:</span><span>{inspectedComponent.side === 'Top' ? 'Верхний (Top)' : 'Нижний (Bottom)'}</span>
              <span>Координаты:</span><span>X: {inspectedComponent.x.toFixed(2)} мм, Y: {inspectedComponent.y.toFixed(2)} мм</span>
              <span>Угол поворота:</span><span>{inspectedComponent.angle}°</span>
              <span>Контактных площадок:</span><span>{inspectedComponent.pads.length}</span>
              <span>3D форма:</span><span>{inspectedComponent.model3d?.shape || 'Box'}</span>
              <span>Габариты 3D:</span><span>{inspectedComponent.model3d ? `${inspectedComponent.model3d.bodyWidth} × ${inspectedComponent.model3d.bodyLength} × ${inspectedComponent.model3d.bodyHeight} мм` : '—'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="dt-statusbar">
        <div id="pcb3d-controls" hidden>{VIEW_CONTROLS}</div>
        <div className="dt-status-cell" role="status" style={{ flex: 1 }}>
          {webglError && statusText === VIEW_CONTROLS ? '3D-просмотр недоступен.' : statusText}
        </div>
        <div className="dt-status-cell" title="Производительность рендеринга и полигональная сложность">
          {fps} FPS • {polyCount.toLocaleString('ru')} треуг.
        </div>
        <div className="dt-status-cell">Плата: {boardCenter.w.toFixed(1)} × {boardCenter.h.toFixed(1)} × {pcb.boardThickness} мм</div>
        <div className="dt-status-cell">Компонентов: {pcb.components.length}</div>
      </div>
    </div>
  );
};
