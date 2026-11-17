import { ComponentDef, ComponentLibrary, PinElectricalType, PinGraphicStyle, SymbolPin, SymbolPrimitive } from '../../../core/types';

export function makeResPrimitives(powerMark?: '0.125' | '0.25' | '0.5' | '1' | '2'): SymbolPrimitive[] {
  // ГОСТ 2.728-74: прямоугольник 10 x 4 мм (x: -5..5, y: -2..2)
  const prims: SymbolPrimitive[] = [
    { type: 'rect', x: -5, y: -2, w: 10, h: 4, width: 0.35 }
  ];
  if (powerMark === '0.125') {
    // ГОСТ 2.728-74, табл. 1: две нисходящие черты.
    prims.push({ type: 'line', x1: -1.6, y1: -1.4, x2: 0.4, y2: 1.4, width: 0.25 });
    prims.push({ type: 'line', x1: -0.4, y1: -1.4, x2: 1.6, y2: 1.4, width: 0.25 });
  } else if (powerMark === '0.25') {
    // ГОСТ 2.728-74, табл. 1: одна нисходящая черта.
    prims.push({ type: 'line', x1: -1.2, y1: -1.5, x2: 1.2, y2: 1.5, width: 0.28 });
  } else if (powerMark === '0.5') {
    // ГОСТ 2.728-74: 0.5 Вт — одна продольная (горизонтальная) черта —
    prims.push({ type: 'line', x1: -2.2, y1: 0, x2: 2.2, y2: 0, width: 0.3 });
  } else if (powerMark === '1') {
    // ГОСТ 2.728-74: 1 Вт — одна поперечная черта I
    prims.push({ type: 'line', x1: 0, y1: -1.6, x2: 0, y2: 1.6, width: 0.3 });
  } else if (powerMark === '2') {
    // ГОСТ 2.728-74: 2 Вт — две поперечные черты II
    prims.push({ type: 'line', x1: -1.0, y1: -1.6, x2: -1.0, y2: 1.6, width: 0.3 });
    prims.push({ type: 'line', x1: 1.0, y1: -1.6, x2: 1.0, y2: 1.6, width: 0.3 });
  }
  return prims;
}

export function makeTwoPinHorizontal(): SymbolPin[] {
  return [
    { id: 'pin_1', number: '1', name: '1', x: -10, y: 0, length: 5, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
    { id: 'pin_2', number: '2', name: '2', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
  ];
}

export function makeCapPrimitives(electrolytic = false): SymbolPrimitive[] {
  if (electrolytic) {
    // ГОСТ 2.728-74, табл. 4 и 6: прямоугольная положительная обкладка и зазор 1,5 мм.
    return [
      { type: 'rect', x: -2.25, y: -4, w: 1.5, h: 8, fill: false, width: 0.35 },
      { type: 'line', x1: 0.75, y1: -4, x2: 0.75, y2: 4, width: 0.4 },
      { type: 'text', x: -4.2, y: -3.8, text: '+', size: 2.5 }
    ];
  }
  return [
    { type: 'line', x1: -1, y1: -4, x2: -1, y2: 4, width: 0.4 },
    { type: 'line', x1: 1, y1: -4, x2: 1, y2: 4, width: 0.4 }
  ];
}

export function makeCapPins(electrolytic = false): SymbolPin[] {
  return [
    { id: 'pin_1', number: '1', name: electrolytic ? '+' : '1', x: -5, y: 0, length: electrolytic ? 2.75 : 4, orientation: 0, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '1' },
    { id: 'pin_2', number: '2', name: electrolytic ? '-' : '2', x: 5, y: 0, length: electrolytic ? 4.25 : 4, orientation: 180, electricalType: 'Passive', style: 'Line', showName: false, showNumber: false, padMapping: '2' }
  ];
}

export function makeGostLogicGatePart(partIdx: number, funcText: string, pinA: string, pinB: string, pinOut: string, inverted: boolean): ComponentLibrary['components'][0]['parts'][0] {
  return {
    partIndex: partIdx,
    name: `Элемент ${partIdx}`,
    primitives: [
      // ГОСТ 2.743-91: прямоугольник шириной 10 мм (основное поле), высотой 12.5 мм
      { type: 'rect', x: -5, y: -5, w: 10, h: 10, width: 0.4 },
      { type: 'text', x: 0, y: -2.2, text: funcText, size: 3.2, align: 'center' }
    ],
    pins: [
      { id: `p_${partIdx}_1`, number: pinA, name: '', x: -10, y: -2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: pinA },
      { id: `p_${partIdx}_2`, number: pinB, name: '', x: -10, y: 2.5, length: 5, orientation: 0, electricalType: 'Input', style: 'Line', showName: false, showNumber: true, padMapping: pinB },
      { id: `p_${partIdx}_3`, number: pinOut, name: '', x: 10, y: 0, length: 5, orientation: 180, electricalType: 'Output', style: inverted ? 'Inverted' : 'Line', showName: false, showNumber: true, padMapping: pinOut }
    ]
  };
}

export interface GostIcPinSpec {
  num: string;
  name: string;
  type?: PinElectricalType;
  style?: PinGraphicStyle;
}

/** Builds a GOST 2.743-91 rectangular IC/module part with all pin tips snapped cleanly to 2.5mm grid. */
export function makeGostRectangularIcPart(opts: {
  partIndex?: number;
  name?: string;
  leftPins: GostIcPinSpec[];
  rightPins: GostIcPinSpec[];
  halfWidthMm?: number;
  anchorRows?: number;
  headerText?: string;
  subHeaderText?: string;
  extraPrimitives?: SymbolPrimitive[];
}): ComponentDef['parts'][0] {
  const halfW = opts.halfWidthMm ?? 15; // multiple of 2.5
  const maxRows = Math.max(opts.leftPins.length, opts.rightPins.length, 2);
  const topSpace = opts.subHeaderText ? 10 : opts.headerText ? 7.5 : 5;
  const bottomSpace = 5;
  // Keep the top and the original pin rows fixed when expanding a shipped symbol.
  const anchorRows = opts.anchorRows ?? maxRows;
  const anchorHeight = Math.ceil((topSpace + (anchorRows - 1) * 5 + bottomSpace) / 5) * 5;
  const totalHeight = anchorHeight + Math.max(0, maxRows - anchorRows) * 5;
  const halfH = anchorHeight / 2;
  const startY = -halfH + topSpace;

  const snap25 = (v: number) => Math.round(v / 2.5) * 2.5;
  const primitives: SymbolPrimitive[] = [
    { type: 'rect', x: -halfW, y: -halfH, w: halfW * 2, h: totalHeight, width: 0.42 }
  ];
  if (opts.headerText) {
    primitives.push({
      type: 'text',
      x: 0,
      y: -halfH + 3.2,
      text: opts.headerText,
      size: 2.8,
      align: 'center',
      bold: true
    });
  }
  if (opts.subHeaderText) {
    primitives.push({
      type: 'text',
      x: 0,
      y: -halfH + 6.4,
      text: opts.subHeaderText,
      size: 2.1,
      align: 'center'
    });
  }
  if (opts.extraPrimitives) {
    primitives.push(...opts.extraPrimitives);
  }

  const pins: SymbolPin[] = [];
  opts.leftPins.forEach((p, idx) => {
    const py = snap25(startY + idx * 5);
    pins.push({
      id: `pl_${p.num}_${idx}`,
      number: p.num,
      name: p.name,
      x: -(halfW + 5),
      y: py,
      length: 5,
      orientation: 0,
      electricalType: p.type ?? 'Bidirectional',
      style: p.style ?? 'Line',
      showName: true,
      showNumber: true,
      padMapping: p.num
    });
  });

  opts.rightPins.forEach((p, idx) => {
    const py = snap25(startY + idx * 5);
    pins.push({
      id: `pr_${p.num}_${idx}`,
      number: p.num,
      name: p.name,
      x: halfW + 5,
      y: py,
      length: 5,
      orientation: 180,
      electricalType: p.type ?? 'Bidirectional',
      style: p.style ?? 'Line',
      showName: true,
      showNumber: true,
      padMapping: p.num
    });
  });

  return {
    partIndex: opts.partIndex ?? 1,
    name: opts.name ?? 'Part 1',
    primitives,
    pins
  };
}
