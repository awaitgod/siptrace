import React, { useLayoutEffect, useRef } from 'react';
import type { ColorSchemeId } from '../../../../core/types';
import type { RecentProjectSnapshot } from '../../../../core/store';
import { drawLauncherPreview } from '../drawLauncherPreview';

export function LauncherDocumentPreview({ documents, board, theme }: {
  documents: RecentProjectSnapshot;
  board: boolean;
  theme: ColorSchemeId;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const schematic = board ? undefined : documents.schematic;
  const sheet = schematic?.sheets.find(sheet => sheet.id === schematic.activeSheetId) ?? schematic?.sheets[0];
  const pcb = board ? documents.pcb : undefined;

  useLayoutEffect(() => {
    const frame = container.current;
    const surface = canvas.current;
    if (!frame || !surface) return;

    const draw = () => {
      drawLauncherPreview(surface, frame, documents, board, theme);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [documents, board, theme]);

  if (!sheet && !pcb) return <p className="launch-missing-preview">Предпросмотр недоступен. Откройте исходный файл с диска.</p>;
  return <div className="launch-document-preview" ref={container}>
    <canvas ref={canvas} role="img" aria-label={board ? 'Предпросмотр печатной платы' : 'Предпросмотр листа схемы'} />
  </div>;
}

