import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
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
  open: boolean;
  documents: RecentProjectSnapshot;
  items: AgentDocumentItem[];
  current: AgentDocumentItem | undefined;
  theme: ColorSchemeId;
  busy: boolean;
  step: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function AgentLiveDocument({ open, documents, items, current, theme, busy, step, onSelect, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<HTMLCanvasElement>(null);
  const transition = useRef<Animation | null>(null);
  const lastDraw = useRef<{ key: string; content: string; theme: ColorSchemeId; zoom: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const board = current?.kind === 'pcb';
  const document = board ? documents.pcb : documents.schematic;
  const key = current ? current.kind + ':' + current.id : '';
  const content = useMemo(() => {
    if (!open) return '';
    if (board) return JSON.stringify(documents.pcb ?? null);
    const schematic = documents.schematic;
    return JSON.stringify({
      sheet: schematic?.sheets.find(sheet => sheet.id === current?.id),
      origin: schematic?.origin,
      definitions: schematic?.customComponentDefs
    });
  }, [open, board, documents.pcb, documents.schematic, current?.id]);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      lastDraw.current = null;
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      element.showModal();
      element.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const container = frame.current!, surface = canvas.current!, overlay = previous.current!;
    const old = lastDraw.current;
    const redraw = () => {
      transition.current?.cancel();
      if (current) drawLauncherPreview(surface, container, documents, board, theme, current.id, undefined, { zoom, ...offset });
      else surface.getContext('2d')?.clearRect(0, 0, surface.width, surface.height);
    };
    const animate = key && old && (old.key !== key || old.content !== content) &&
      old.theme === theme && old.zoom === zoom &&
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
    }
    lastDraw.current = { key, content, theme, zoom };
    return () => transition.current?.cancel();
  }, [open, key, content, theme, zoom, offset]);

  useLayoutEffect(() => {
    if (!open) return;
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
  }, [open, current, documents, board, theme, zoom, offset]);

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  function fit() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === '+' || event.key === '=' || (event.ctrlKey && event.key === '=')) {
      event.preventDefault();
      setZoom(z => Math.min(8, Number((z * 1.25).toFixed(2))));
    } else if (event.key === '-' || event.key === '_' || (event.ctrlKey && event.key === '-')) {
      event.preventDefault();
      setZoom(z => Math.max(0.5, Number((z / 1.25).toFixed(2))));
    } else if (event.key === '0' || event.key === 'f' || event.key === 'F' || (event.ctrlKey && event.key === '0')) {
      event.preventDefault();
      fit();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setOffset(prev => ({ ...prev, x: prev.x + (event.shiftKey ? 80 : 30) }));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setOffset(prev => ({ ...prev, x: prev.x - (event.shiftKey ? 80 : 30) }));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOffset(prev => ({ ...prev, y: prev.y + (event.shiftKey ? 80 : 30) }));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOffset(prev => ({ ...prev, y: prev.y - (event.shiftKey ? 80 : 30) }));
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - rect.left - rect.width / 2;
    const cursorY = event.clientY - rect.top - rect.height / 2;

    const factor = event.deltaY < 0 ? 1.2 : 0.833;
    setZoom(prevZoom => {
      const nextZoom = Math.max(0.5, Math.min(8, Number((prevZoom * factor).toFixed(2))));
      if (nextZoom === prevZoom) return prevZoom;
      const scaleRatio = nextZoom / prevZoom;
      setOffset(prevOffset => ({
        x: cursorX - scaleRatio * (cursorX - prevOffset.x),
        y: cursorY - scaleRatio * (cursorY - prevOffset.y)
      }));
      return nextZoom;
    });
  }

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="agent-live-dialog"
      aria-label="Просмотр проекта агента"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="agent-live-view">
        <header className="agent-live-header">
          <div className="agent-live-title">
            <strong>{document?.projectName || 'Черновик проекта'}</strong>
            {busy && <span className="agent-live-status" role="status">
              <span className="agent-state-dot" />
              <span key={step}>{step}</span>
            </span>}
          </div>
          <button
            className="dt-tb-btn agent-icon-button"
            aria-label="Закрыть просмотр"
            title="Закрыть просмотр (Esc)"
            onClick={onClose}
          >
            <IconX size={18} />
          </button>
        </header>

        <div className="agent-live-controls">
          <label>
            <select
              className="dt-input"
              aria-label="Документ"
              value={current?.id ?? ''}
              onChange={event => {
                onSelect(event.target.value);
                fit();
              }}
            >
              {!current && <option value="">Документы появятся здесь</option>}
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="agent-live-zoom">
            <button
              className="dt-tb-btn agent-icon-button"
              aria-label="Уменьшить масштаб (-)"
              title="Уменьшить масштаб (-)"
              disabled={zoom <= 0.5}
              onClick={() => setZoom(value => Math.max(0.5, Number((value / 1.25).toFixed(2))))}
            >
              <IconMinus size={16} />
            </button>
            <span aria-live="polite" role="status" title="Текущий масштаб">
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="dt-tb-btn agent-icon-button"
              aria-label="Увеличить масштаб (+)"
              title="Увеличить масштаб (+)"
              disabled={zoom >= 8}
              onClick={() => setZoom(value => Math.min(8, Number((value * 1.25).toFixed(2))))}
            >
              <IconPlus size={16} />
            </button>
            <button
              className="dt-tb-btn agent-icon-button"
              aria-label="Вписать документ (0 или Двойной клик)"
              title="Вписать документ (0 или Двойной клик)"
              onClick={fit}
            >
              <IconArrowsMaximize size={16} />
            </button>
          </div>
        </div>

        <div
          className="agent-live-frame"
          ref={frame}
          tabIndex={0}
          role="region"
          aria-label="Холст чертежа (используйте перетаскивание мышью, колесо для зума, двойной клик для вписывания)"
          onWheel={handleWheel}
          onDoubleClick={fit}
          onPointerDown={event => {
            if ((event.button !== 0 && event.button !== 1) || !current) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { id: event.pointerId, x: event.clientX - offset.x, y: event.clientY - offset.y };
          }}
          onPointerMove={event => {
            const origin = drag.current;
            if (origin?.id === event.pointerId) {
              const nextX = event.clientX - origin.x;
              const nextY = event.clientY - origin.y;
              if (rafId.current) cancelAnimationFrame(rafId.current);
              rafId.current = requestAnimationFrame(() => {
                setOffset({ x: nextX, y: nextY });
              });
            }
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <canvas ref={canvas} role="img" aria-label={board ? 'Печатная плата' : 'Лист схемы'} />
          <canvas ref={previous} className="agent-live-previous" aria-hidden="true" />
          {!current && <p className="agent-live-empty">Документ пока недоступен</p>}
        </div>

      </div>
    </dialog>
  );
}
