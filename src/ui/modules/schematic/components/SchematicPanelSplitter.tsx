import { useRef } from 'react';

interface Props {
    side: 'left' | 'right';
    width: number;
    onResize: (width: number) => void;
}

const minWidth = 150;
const maxWidth = 500;

export function SchematicPanelSplitter({ side, width, onResize }: Props) {
    const drag = useRef<{ id: number; x: number; width: number } | null>(null);
    const left = side === 'left';
    const direction = left ? 1 : -1;
    const resize = (value: number) => onResize(Math.max(minWidth, Math.min(maxWidth, value)));

    return (
        <div className="dt-splitter" role="separator" tabIndex={0} aria-orientation="vertical"
            aria-label={left ? 'Ширина библиотеки' : 'Ширина свойств'}
            aria-controls={left ? 'schematic-library' : 'schematic-properties'}
            aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={width}
            onPointerDown={e => {
                if (e.button !== 0 || drag.current) return;
                drag.current = { id: e.pointerId, x: e.clientX, width };
                e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={e => {
                const start = drag.current;
                if (start?.id === e.pointerId) resize(start.width + (e.clientX - start.x) * direction);
            }}
            onLostPointerCapture={e => {
                if (drag.current?.id === e.pointerId) drag.current = null;
            }}
            onKeyDown={e => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                if (e.key === 'Home') resize(minWidth);
                else if (e.key === 'End') resize(maxWidth);
                else resize(width + (e.key === 'ArrowRight' ? 10 : -10) * direction);
            }}
        />
    );
}
