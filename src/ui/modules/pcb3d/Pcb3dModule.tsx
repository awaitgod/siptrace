import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AppModuleId, PcbProject } from '../../../core/types';
import { polygonBounds } from '../../../core/geometry';
import { buildPcbScene } from './buildPcbScene';
import { loadActivePcb, openAppModule, subscribeEdaEvents } from '../../../core/store';
import { exportPcbObj3D, exportPcbStep, exportPcbStlAscii, exportPcbWrl } from '../../../engines/camExport';
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

const VIEW_CONTROLS = 'ЛКМ — вращение, ПКМ / стрелки — панорама, колесо / + и − — масштаб, Home — изометрия.';
const EXPORT_FORMATS = {
  obj: { extension: 'obj', serialize: exportPcbObj3D },
  stl: { extension: 'stl', serialize: exportPcbStlAscii },
  wrl: { extension: 'wrl', serialize: exportPcbWrl },
  step: { extension: 'stp', serialize: exportPcbStep }
} as const;

export const Pcb3dModule: React.FC<{ onSwitchModule?: (m: AppModuleId) => void }> = ({ onSwitchModule }) => {
  const [pcb, setPcb] = useState<PcbProject>(() => loadActivePcb());
  const [maskColor, setMaskColor] = useState<string>(pcb.soldermaskColor || '#1b6b33');
  const [finishGold, setFinishGold] = useState<boolean>(pcb.surfaceFinish === 'ENIG');
  const [showComponents, setShowComponents] = useState<boolean>(true);
  const [showSilk, setShowSilk] = useState<boolean>(true);
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [statusText, setStatusText] = useState(VIEW_CONTROLS);
  const [webglError, setWebglError] = useState<string | null>(null);

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
    (preset: 'iso' | 'top' | 'bottom' | 'side') => {
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
      const d = Math.max(20, upperSide * 0.62 / Math.sin(Math.min(halfFov, halfHorizontalFov)));
      cam.far = Math.max(2000, d * 10);
      cam.updateProjectionMatrix();
      cam.up.set(0, 1, 0);
      if (preset === 'top') {
        cam.position.set(0, d, 0.01);
      } else if (preset === 'bottom') {
        cam.position.set(0, -d, 0.01);
      } else if (preset === 'side') {
        cam.position.set(0, Math.max(2.5, (pcb.boardThickness || 1.6) * 2), d);
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
      if (e.key === '1' || e.key === 'Home' || e.key.toLowerCase() === 'r' || e.code === 'KeyR') setCameraPreset('iso');
      else if (e.key === '2') setCameraPreset('top');
      else if (e.key === '3') setCameraPreset('bottom');
      else if (e.key === '4') setCameraPreset('side');
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
    const draw = () => {
      rafId = 0;
      controls.update();
      renderer.render(scene, camera);
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
    const onContextLost = () => setWebglError('Потеряно подключение к WebGL. Восстанавливаем 3D-просмотр…');
    const onContextRestored = () => {
      setWebglError(null);
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
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
    buildPcbScene(pcbGroup, pcb, boardCenter, { maskColor, finishGold, showComponents, showSilk, explodeFactor });
    invalidateRef.current?.();
  }, [pcb, maskColor, finishGold, showComponents, showSilk, explodeFactor, boardCenter, disposeObject3D]);

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
        { label: 'Вид сверху', shortcut: '2', onClick: () => setCameraPreset('top') },
        { label: 'Вид снизу', shortcut: '3', onClick: () => setCameraPreset('bottom') },
        { label: 'Изометрия', shortcut: '1 / Home', onClick: () => setCameraPreset('iso') },
        { label: 'Вид сбоку', shortcut: '4', onClick: () => setCameraPreset('side') },
        { separator: true },
        { label: 'Показать 3D-компоненты', checked: showComponents, onClick: () => setShowComponents((v) => !v) },
        { label: 'Показать шелкографию', checked: showSilk, onClick: () => setShowSilk((v) => !v) }
      ]
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#f0f0f0' }}>
      <MenuBar menus={menus} onBrandClick={() => openAppModule('launcher', (m) => onSwitchModule?.(m))} />

      <div className="dt-toolbar-row dt-pcb3d-toolbar" role="group" aria-label="Управление 3D-просмотром">
        <button className="dt-btn" onClick={() => setCameraPreset('iso')}>Изометрия</button>
        <button className="dt-btn" onClick={() => setCameraPreset('top')}>Сверху</button>
        <button className="dt-btn" onClick={() => setCameraPreset('bottom')}>Снизу</button>
        <button className="dt-btn" onClick={() => setCameraPreset('side')}>Сбоку</button>
        <div className="dt-tb-sep" />
        <label htmlFor="pcb3d-mask">Маска:</label>
        <select id="pcb3d-mask" className="dt-tb-select" value={maskColor} onChange={(e) => setMaskColor(e.target.value)}>
          {!MASK_PALETTES.some((mask) => mask.color === maskColor) && <option value={maskColor}>Цвет проекта ({maskColor})</option>}
          {MASK_PALETTES.map((m) => (
            <option key={m.color} value={m.color}>{m.label}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
        <button className="dt-btn" onClick={() => handleExport3dFormat('wrl')}>Экспорт WRL</button>
        <button className="dt-btn primary" onClick={handleExportObj}><DipIcon name="view3d" /> &nbsp;Экспорт OBJ</button>
      </div>

      <div ref={mountRef} style={{ flex: 1, minHeight: 0, position: 'relative', background: '#222730' }}>
        {webglError && (
          <div role="alert" style={{ position: 'relative', padding: 24, color: '#fff' }}>
            {webglError}
          </div>
        )}
      </div>

      <div className="dt-statusbar">
        <div id="pcb3d-controls" hidden>{VIEW_CONTROLS}</div>
        <div className="dt-status-cell" role="status" style={{ flex: 1 }}>
          {webglError && statusText === VIEW_CONTROLS ? '3D-просмотр недоступен.' : statusText}
        </div>
        <div className="dt-status-cell">Плата: {boardCenter.w.toFixed(1)} × {boardCenter.h.toFixed(1)} × {pcb.boardThickness} мм</div>
        <div className="dt-status-cell">Компонентов: {pcb.components.length}</div>
      </div>
    </div>
  );
};
