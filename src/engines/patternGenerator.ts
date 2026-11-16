import { PadDef, PatternDef, PatternGraphic } from '../core/types';

export type PatternGeneratorFamily =
  | 'ChipSMD'
  | 'AxialTHT'
  | 'RadialTHT'
  | 'DIP'
  | 'SOIC'
  | 'QFP'
  | 'QFN'
  | 'SOT23'
  | 'Header'
  | 'BGA';

export interface PatternGeneratorParams {
  family: PatternGeneratorFamily;
  name: string;
  pinCount: number;
  pitch: number; // mm (e.g. 2.54, 1.27, 0.8, 0.5)
  rowSpacing: number; // mm (between pad rows or body span)
  padWidth: number; // mm
  padHeight: number; // mm
  holeDiameter: number; // mm (0 for SMD)
  bodyWidth: number; // mm
  bodyLength: number; // mm
  bodyHeight: number; // mm
  densityLevel: 'A' | 'B' | 'C'; // IPC-7351A/B/C: A=Maximum, B=Nominal, C=Minimum
  bgaCols?: number;
  bgaRows?: number;
  thermalPadSize?: number; // mm for QFN
  polarized?: boolean;
  bodyShape?: 'circle' | 'rect';
}

export function generateParametricPattern(p: PatternGeneratorParams): PatternDef {
  const densityFactor = p.densityLevel === 'A' ? 1.15 : p.densityLevel === 'C' ? 0.88 : 1.0;
  const pads: PadDef[] = [];
  const graphics: PatternGraphic[] = [];
  const padW = Number((p.padWidth * densityFactor).toFixed(3));
  const padH = Number((p.padHeight * densityFactor).toFixed(3));

  const addSilkRect = (w: number, h: number, layer: 'TopSilk' | 'TopAssembly' | 'Courtyard' = 'TopSilk', lineW = 0.15) => {
    graphics.push({ type: 'rect', layer, x: -w / 2, y: -h / 2, w, h, width: lineW });
  };

  if (p.family === 'ChipSMD') {
    const span = p.rowSpacing / 2;
    pads.push(
      {
        id: 'pad_1',
        number: '1',
        type: 'SMD',
        shape: 'RoundedRect',
        x: -span,
        y: 0,
        width: padW,
        height: padH,
        cornerRadius: 0.08,
        layer: 'Top'
      },
      {
        id: 'pad_2',
        number: '2',
        type: 'SMD',
        shape: 'RoundedRect',
        x: span,
        y: 0,
        width: padW,
        height: padH,
        cornerRadius: 0.08,
        layer: 'Top'
      }
    );
    const sw = p.bodyLength;
    const sh = p.bodyWidth;
    graphics.push(
      { type: 'line', layer: 'TopSilk', x1: -sw / 2 + 0.1, y1: -sh / 2 - 0.15, x2: sw / 2 - 0.1, y2: -sh / 2 - 0.15, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: -sw / 2 + 0.1, y1: sh / 2 + 0.15, x2: sw / 2 - 0.1, y2: sh / 2 + 0.15, width: 0.15 }
    );
    addSilkRect(p.bodyLength, p.bodyWidth, 'TopAssembly', 0.1);
  } else if (p.family === 'AxialTHT') {
    const span = p.rowSpacing / 2;
    pads.push(
      {
        id: 'pad_1',
        number: '1',
        type: 'THT',
        shape: 'Rect',
        x: -span,
        y: 0,
        width: padW,
        height: padH,
        holeDiameter: p.holeDiameter || 0.8,
        layer: 'All'
      },
      {
        id: 'pad_2',
        number: '2',
        type: 'THT',
        shape: 'Round',
        x: span,
        y: 0,
        width: padW,
        height: padH,
        holeDiameter: p.holeDiameter || 0.8,
        layer: 'All'
      }
    );
    addSilkRect(p.bodyLength, p.bodyWidth, 'TopSilk', 0.18);
    graphics.push(
      { type: 'line', layer: 'TopSilk', x1: -span, y1: 0, x2: -p.bodyLength / 2, y2: 0, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: p.bodyLength / 2, y1: 0, x2: span, y2: 0, width: 0.18 }
    );
  } else if (p.family === 'RadialTHT') {
    const span = p.pitch / 2;
    pads.push(
      {
        id: 'pad_1',
        number: '1',
        type: 'THT',
        shape: p.polarized ? 'Rect' : 'Round',
        x: -span,
        y: 0,
        width: padW,
        height: padH,
        holeDiameter: p.holeDiameter || 0.8,
        layer: 'All'
      },
      {
        id: 'pad_2',
        number: '2',
        type: 'THT',
        shape: 'Round',
        x: span,
        y: 0,
        width: padW,
        height: padH,
        holeDiameter: p.holeDiameter || 0.8,
        layer: 'All'
      }
    );
    const isRectBody = p.bodyShape === 'rect' || p.bodyLength > p.bodyWidth * 1.35;
    if (isRectBody) {
      const halfL = p.bodyLength / 2;
      const halfW = p.bodyWidth / 2;
      addSilkRect(p.bodyLength, p.bodyWidth, 'TopAssembly', 0.12);
      graphics.push(
        { type: 'line', layer: 'TopSilk', x1: -halfL + 0.6, y1: -halfW, x2: halfL - 0.6, y2: -halfW, width: 0.18 },
        { type: 'line', layer: 'TopSilk', x1: -halfL + 0.6, y1: halfW, x2: halfL - 0.6, y2: halfW, width: 0.18 }
      );
    } else {
      const r = p.bodyWidth / 2;
      const hitsPad = Math.abs(r - span) <= padW / 2 + 0.25;
      if (hitsPad) {
        graphics.push({ type: 'circle', layer: 'TopAssembly', cx: 0, cy: 0, r, width: 0.12 });
        graphics.push(
          { type: 'arc', layer: 'TopSilk', cx: 0, cy: 0, r, startAngle: 35, endAngle: 145, width: 0.18 },
          { type: 'arc', layer: 'TopSilk', cx: 0, cy: 0, r, startAngle: 215, endAngle: 325, width: 0.18 }
        );
      } else {
        graphics.push({ type: 'circle', layer: 'TopSilk', cx: 0, cy: 0, r, width: 0.18 });
      }
      if (p.polarized) {
        const px = -Math.max(r + 0.55, span + padW / 2 + 0.55);
        graphics.push({ type: 'text', layer: 'TopSilk', x: px, y: -Math.max(0.8, r * 0.45), text: '+', size: 1.0 });
      }
    }
  } else if (p.family === 'DIP' || p.family === 'SOIC') {
    const perSide = Math.max(2, Math.floor(p.pinCount / 2));
    const yStart = -((perSide - 1) * p.pitch) / 2;
    const xSpan = p.rowSpacing / 2;
    const isTht = p.family === 'DIP';
    for (let i = 0; i < perSide; i++) {
      pads.push({
        id: `pad_${i + 1}`,
        number: String(i + 1),
        type: isTht ? 'THT' : 'SMD',
        shape: isTht ? (i === 0 ? 'Rect' : 'Oval') : 'RoundedRect',
        x: -xSpan,
        y: Number((yStart + i * p.pitch).toFixed(3)),
        width: padW,
        height: padH,
        holeDiameter: isTht ? (p.holeDiameter || 0.8) : 0,
        cornerRadius: isTht ? undefined : 0.1,
        layer: isTht ? 'All' : 'Top'
      });
    }
    for (let i = 0; i < perSide; i++) {
      const pinNum = perSide + 1 + i;
      pads.push({
        id: `pad_${pinNum}`,
        number: String(pinNum),
        type: isTht ? 'THT' : 'SMD',
        shape: isTht ? 'Oval' : 'RoundedRect',
        x: xSpan,
        y: Number((yStart + (perSide - 1 - i) * p.pitch).toFixed(3)),
        width: padW,
        height: padH,
        holeDiameter: isTht ? (p.holeDiameter || 0.8) : 0,
        cornerRadius: isTht ? undefined : 0.1,
        layer: isTht ? 'All' : 'Top'
      });
    }
    const xInner = Math.max(0.4, Math.min(p.bodyWidth / 2, xSpan - padW / 2 - 0.25));
    addSilkRect(p.bodyWidth, p.bodyLength, 'TopAssembly', 0.1);
    graphics.push(
      { type: 'line', layer: 'TopSilk', x1: -xInner, y1: -p.bodyLength / 2, x2: xInner, y2: -p.bodyLength / 2, width: 0.18 },
      { type: 'line', layer: 'TopSilk', x1: -xInner, y1: p.bodyLength / 2, x2: xInner, y2: p.bodyLength / 2, width: 0.18 },
      { type: 'circle', layer: 'TopSilk', cx: -xSpan - padW / 2 - 0.4, cy: yStart, r: 0.25, width: 0.18, fill: true }
    );
  } else if (p.family === 'QFP' || p.family === 'QFN') {
    const perSide = Math.max(2, Math.floor(p.pinCount / 4));
    const offsetStart = -((perSide - 1) * p.pitch) / 2;
    const span = p.rowSpacing / 2;
    // Left side (top to bottom): 1..N
    for (let i = 0; i < perSide; i++) {
      pads.push({
        id: `pad_${i + 1}`,
        number: String(i + 1),
        type: 'SMD',
        shape: 'RoundedRect',
        x: -span,
        y: Number((offsetStart + i * p.pitch).toFixed(3)),
        width: padW,
        height: padH,
        cornerRadius: 0.06,
        layer: 'Top'
      });
    }
    // Bottom side (left to right)
    for (let i = 0; i < perSide; i++) {
      const n = perSide + 1 + i;
      pads.push({
        id: `pad_${n}`,
        number: String(n),
        type: 'SMD',
        shape: 'RoundedRect',
        x: Number((offsetStart + i * p.pitch).toFixed(3)),
        y: span,
        width: padH,
        height: padW,
        cornerRadius: 0.06,
        layer: 'Top'
      });
    }
    // Right side (bottom to top)
    for (let i = 0; i < perSide; i++) {
      const n = perSide * 2 + 1 + i;
      pads.push({
        id: `pad_${n}`,
        number: String(n),
        type: 'SMD',
        shape: 'RoundedRect',
        x: span,
        y: Number((-offsetStart - i * p.pitch).toFixed(3)),
        width: padW,
        height: padH,
        cornerRadius: 0.06,
        layer: 'Top'
      });
    }
    // Top side (right to left)
    for (let i = 0; i < perSide; i++) {
      const n = perSide * 3 + 1 + i;
      pads.push({
        id: `pad_${n}`,
        number: String(n),
        type: 'SMD',
        shape: 'RoundedRect',
        x: Number((-offsetStart - i * p.pitch).toFixed(3)),
        y: -span,
        width: padH,
        height: padW,
        cornerRadius: 0.06,
        layer: 'Top'
      });
    }
    if (p.family === 'QFN' && (p.thermalPadSize ?? 0) > 0) {
      const ep = p.thermalPadSize!;
      pads.push({
        id: `pad_EP`,
        number: String(perSide * 4 + 1),
        type: 'SMD',
        shape: 'Rect',
        x: 0,
        y: 0,
        width: ep,
        height: ep,
        layer: 'Top'
      });
    }
    addSilkRect(p.bodyWidth, p.bodyLength, 'TopAssembly', 0.1);
    const outerHalf = Math.max(p.bodyWidth / 2, p.bodyLength / 2, span + padW / 2 + 0.25);
    const tick = Math.max(0.4, Math.min(1.2, outerHalf - ((perSide - 1) * p.pitch + padH) / 2 - 0.15));
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sy] of corners) {
      graphics.push(
        { type: 'line', layer: 'TopSilk', x1: sx * outerHalf, y1: sy * outerHalf, x2: sx * (outerHalf - tick), y2: sy * outerHalf, width: 0.15 },
        { type: 'line', layer: 'TopSilk', x1: sx * outerHalf, y1: sy * outerHalf, x2: sx * outerHalf, y2: sy * (outerHalf - tick), width: 0.15 }
      );
    }
    graphics.push({
      type: 'circle',
      layer: 'TopSilk',
      cx: -span - padW / 2 - 0.35,
      cy: offsetStart,
      r: 0.25,
      width: 0.15,
      fill: true
    });
  } else if (p.family === 'SOT23') {
    pads.push(
      { id: 'pad_1', number: '1', type: 'SMD', shape: 'RoundedRect', x: -1.1, y: -0.95, width: padW, height: padH, cornerRadius: 0.08, layer: 'Top' },
      { id: 'pad_2', number: '2', type: 'SMD', shape: 'RoundedRect', x: -1.1, y: 0.95, width: padW, height: padH, cornerRadius: 0.08, layer: 'Top' },
      { id: 'pad_3', number: '3', type: 'SMD', shape: 'RoundedRect', x: 1.1, y: 0, width: padW, height: padH, cornerRadius: 0.08, layer: 'Top' }
    );
    addSilkRect(p.bodyWidth, p.bodyLength, 'TopAssembly', 0.1);
    graphics.push(
      { type: 'line', layer: 'TopSilk', x1: -0.35, y1: -p.bodyLength / 2 - 0.15, x2: 0.35, y2: -p.bodyLength / 2 - 0.15, width: 0.15 },
      { type: 'line', layer: 'TopSilk', x1: -0.35, y1: p.bodyLength / 2 + 0.15, x2: 0.35, y2: p.bodyLength / 2 + 0.15, width: 0.15 },
      { type: 'circle', layer: 'TopSilk', cx: -1.1 - padW / 2 - 0.35, cy: -0.95, r: 0.2, width: 0.15, fill: true }
    );
  } else if (p.family === 'Header') {
    const cols = p.rowSpacing > 0.5 ? 2 : 1;
    const rows = Math.max(1, Math.floor(p.pinCount / cols));
    const yStart = -((rows - 1) * p.pitch) / 2;
    const xStart = cols === 2 ? -p.rowSpacing / 2 : 0;
    let n = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        pads.push({
          id: `pad_${n}`,
          number: String(n),
          type: 'THT',
          shape: n === 1 ? 'Rect' : 'Round',
          x: Number((xStart + c * p.rowSpacing).toFixed(3)),
          y: Number((yStart + r * p.pitch).toFixed(3)),
          width: padW,
          height: padH,
          holeDiameter: p.holeDiameter || 1.0,
          layer: 'All'
        });
        n++;
      }
    }
    addSilkRect(p.bodyWidth, p.bodyLength, 'TopSilk', 0.2);
  } else if (p.family === 'BGA') {
    const cols = p.bgaCols || Math.round(Math.sqrt(p.pinCount));
    const rows = p.bgaRows || Math.round(p.pinCount / cols);
    const rowLetters = 'ABCDEFGHJKLMNPRTUVWY';
    const xStart = -((cols - 1) * p.pitch) / 2;
    const yStart = -((rows - 1) * p.pitch) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const name = `${rowLetters[r % rowLetters.length]}${c + 1}`;
        pads.push({
          id: `pad_${name}`,
          number: name,
          type: 'SMD',
          shape: 'Round',
          x: Number((xStart + c * p.pitch).toFixed(3)),
          y: Number((yStart + r * p.pitch).toFixed(3)),
          width: padW,
          height: padW,
          layer: 'Top'
        });
      }
    }
    addSilkRect(p.bodyWidth, p.bodyLength, 'TopSilk', 0.15);
  }

  const bodySpanX = p.family === 'ChipSMD' || p.family === 'AxialTHT' ? p.bodyLength : p.bodyWidth;
  const bodySpanY = p.family === 'ChipSMD' || p.family === 'AxialTHT' ? p.bodyWidth : p.bodyLength;
  const cw = Math.max(bodySpanX + 1.5, ...pads.map((pd) => Math.abs(pd.x) * 2 + pd.width + 0.6));
  const ch = Math.max(bodySpanY + 1.5, ...pads.map((pd) => Math.abs(pd.y) * 2 + pd.height + 0.6));
  graphics.push({
    type: 'rect',
    layer: 'Courtyard',
    x: -cw / 2,
    y: -ch / 2,
    w: cw,
    h: ch,
    width: 0.1
  });

  const shape3d =
    p.family === 'ChipSMD'
      ? 'ChipSMD'
      : p.family === 'AxialTHT'
        ? 'AxialResistor'
        : p.family === 'RadialTHT'
          ? 'RadialCap'
          : p.family === 'DIP'
            ? 'DIP'
            : p.family === 'SOIC'
              ? 'SOIC'
              : p.family === 'QFP'
                ? 'QFP'
                : p.family === 'QFN'
                  ? 'QFN'
                  : p.family === 'SOT23'
                    ? 'SOT23'
                    : p.family === 'Header'
                      ? 'Header'
                      : 'Box';

  return {
    id: `pat_gen_${Date.now().toString(36)}`,
    name: p.name,
    library: 'Пользовательские корпуса',
    gostName: `IPC-7351${p.densityLevel} / ГОСТ`,
    ipcName: p.name,
    description: `Сгенерированный корпус ${p.family} (${pads.length} выв., шаг ${p.pitch} мм)`,
    pads,
    graphics,
    courtyard: { width: cw, height: ch },
    model3d: {
      shape: shape3d,
      bodyWidth: p.bodyWidth,
      bodyLength: p.bodyLength,
      bodyHeight: p.bodyHeight,
      color: p.family === 'ChipSMD' ? '#b88655' : '#24272c',
      pinCount: pads.length,
      pitch: p.pitch
    }
  };
}
