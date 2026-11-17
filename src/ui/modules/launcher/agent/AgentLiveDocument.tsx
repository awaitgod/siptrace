import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconArrowsMaximize, IconMinus, IconPlus, IconX } from '@tabler/icons-react';
import type { ColorSchemeId } from '../../../../core/models';
import type { RecentProjectSnapshot } from '../../../../core/store';
import { drawLauncherPreview } from '../drawLauncherPreview';

export interface AgentDocumentItem {
  id: string;
  label: string;
  kind: 'schematic' | 'pcb';
}

interface Props {
  documents: RecentProjectSnapshot;
  items: AgentDocumentItem[];
  current: AgentDocumentItem | undefined;
  theme: ColorSchemeId;
  busy: boolean;
  step: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function AgentLiveDocument({ documents, items, current, theme, busy, step, onSelect, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<HTMLCanvasElement>(null);
  const transition = useRef<Animation | null>(null);
  const lastDraw = useRef<{ key: string; content: string; theme: ColorSchemeId; zoom: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const board = current?.kind === 'pcb';
  const document = board ? documents.pcb : documents.schematic;
  const key = current ? current.kind + ':' + current.id : '';
  const content = useMemo(() => {
    if (board) return JSON.stringify(documents.pcb ?? null);
    const schematic = documents.schematic;
    return JSON.stringify({
      sheet: schematic?.sheets.find(sheet => sheet.id === current?.id),
      origin: schematic?.origin,
      definitions: schematic?.customComponentDefs
    });
  }, [board, documents.pcb, documents.schematic, current?.id]);

  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  useLayoutEffect(() => {
    const container = frame.current!, surface = canvas.current!, overlay = previous.current!;
    const old = lastDraw.current;
    const redraw = () => {
      transition.current?.cancel();
      if (current) drawLauncherPreview(surface, container, documents, board, theme, current.id, undefined, { zoom, ...offset });
      else surface.getContext('2d')?.clearRect(0, 0, surface.width, surface.height);
    };
    const animate = key && old?.key === key && old.content !== content && old.theme === theme && old.zoom === zoom &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate) {
      overlay.width = surface.width;
      overlay.height = surface.height;
      overlay.getContext('2d')?.drawImage(surface, 0, 0);
    }
    redraw();
    if (animate) {
      transition.current = overlay.animate([{ opacity: .9 }, { opacity: 0 }],
        { duration: 240, easing: 'cubic-bezier(.2,.65,.3,1)' });
      container.animate([{ outlineColor: 'var(--ui-accent)' }, { outlineColor: 'transparent' }], { duration: 420 });
    }
    lastDraw.current = { key, content, theme, zoom };
    return () => transition.current?.cancel();
  }, [key, content, theme, zoom, offset]);

  useLayoutEffect(() => {
    const container = frame.current!, surface = canvas.current!;
    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      if (!current || (surface.width === Math.round(container.clientWidth * dpr) &&
        surface.height === Math.round(container.clientHeight * dpr))) return;
      transition.current?.cancel();
      drawLauncherPreview(surface, container, documents, board, theme, current.id, undefined, { zoom, ...offset });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [current, documents, board, theme, zoom, offset]);

  function fit() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  return <dialog ref={dialog} className="agent-live-dialog" aria-label="Просмотр проекта агента"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="agent-live-view">
      <header className="agent-live-header">
        <div className="agent-live-title">
          <strong>{document?.projectName || 'Черновик проекта'}</strong>
          <span className="agent-live-status"><span className="agent-state-dot" data-busy={busy} />
            {busy ? 'Агент работает' : 'Текущая версия'}</span>
        </div>
        <button className="dt-tb-btn" aria-label="Закрыть просмотр" title="Закрыть просмотр" onClick={onClose}><IconX size={18} /></button>
      </header>
      <div className="agent-live-controls">
        <label>Документ <select className="dt-input" value={current?.id ?? ''} onChange={event => { onSelect(event.target.value); fit(); }}>
          {!current && <option value="">Документы появятся здесь</option>}
          {items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <div className="agent-live-zoom">
          <button className="dt-tb-btn" aria-label="Уменьшить масштаб" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 1.25))}><IconMinus size={16} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="dt-tb-btn" aria-label="Увеличить масштаб" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value * 1.25))}><IconPlus size={16} /></button>
          <button className="dt-tb-btn" aria-label="Вписать документ" title="Вписать документ" onClick={fit}><IconArrowsMaximize size={16} /></button>
        </div>
      </div>
      <div className="agent-live-frame" ref={frame}
        onPointerDown={event => {
          if (event.button !== 0 || !current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX - offset.x, y: event.clientY - offset.y };
        }}
        onPointerMove={event => {
          const origin = drag.current;
          if (origin?.id === event.pointerId) setOffset({ x: event.clientX - origin.x, y: event.clientY - origin.y });
        }}
        onLostPointerCapture={() => { drag.current = null; }}>
          <canvas ref={canvas} role="img" aria-label={board ? 'Печатная плата' : 'Лист схемы'} />
          <canvas ref={previous} className="agent-live-previous" aria-hidden="true" />
          {!current && <p className="agent-live-empty">Документ пока недоступен</p>}
      </div>
      <footer className="agent-live-footer">{busy ? step : 'Просмотр черновика'}</footer>
    </div>
  </dialog>;
}
