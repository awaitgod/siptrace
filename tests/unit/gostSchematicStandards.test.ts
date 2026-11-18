import { describe, expect, it } from 'vitest';
import { ALL_GOST_COMPONENTS, findComponentById } from '../../src/gost/libraries/gostComponents';
import { libResistors } from '../../src/gost/libraries/components/resistors';
import { libCapacitors } from '../../src/gost/libraries/components/capacitors';
import { libInductors } from '../../src/gost/libraries/components/inductors';
import { libDiodes } from '../../src/gost/libraries/components/diodes';
import { libTransistors } from '../../src/gost/libraries/components/transistors';
import { libDigitalIC } from '../../src/gost/libraries/components/digitalIc';
import { libAnalogIC } from '../../src/gost/libraries/components/analogIc';
import { libConnectorsAndSwitch } from '../../src/gost/libraries/components/connectorsAndSwitch';
import { libGeneral } from '../../src/gost/libraries/components/general';
import { GOST_REFDES_GROUPS, GOST_GROUP_ORDER } from '../../src/gost/rules';
import {
  SHEET_FORMATS,
  getGostFrameRect,
  buildGostFrameAndStampGeometry,
  createDefaultGostTitleBlock
} from '../../src/gost/gostTitleBlock';
import {
  generateGostBom,
  exportGostBomToCsv,
  exportGostBomToHtml,
  splitRefDes,
  formatRefDesRange
} from '../../src/gost/gostBom';
import { runSchematicErc, extractSchematicNets } from '../../src/engines/erc';
import { validateSchematic } from '../../src/core/schematic/validation';
import { SchematicProject, SheetFormatId } from '../../src/core/types';

describe('1. Библиотеки УГО и стандарты ГОСТ ЕСКД', () => {
  it('ГОСТ 2.728-74: резисторы имеют габариты тела 10×4 мм и выводы строго на сетке 2.5 мм', () => {
    const mlt = libResistors.components.find((c) => c.id === 'COMP_R_MLT025')!;
    expect(mlt.refDesPrefix).toBe('R');
    const bodyRect = mlt.parts[0].primitives.find((p) => p.type === 'rect')!;
    expect(bodyRect).toBeDefined();
    expect(bodyRect.w).toBe(10);
    expect(bodyRect.h).toBe(4);
    expect(bodyRect.x).toBe(-5);
    expect(bodyRect.y).toBe(-2);

    // Выводы должны быть на сетке 2.5 мм (x = -10 и 10, y = 0)
    for (const pin of mlt.parts[0].pins) {
      expect(Math.abs(pin.x % 2.5)).toBe(0);
      expect(Math.abs(pin.y % 2.5)).toBe(0);
    }
  });

  it('ГОСТ 2.728-74: переменный резистор (потенциометр) имеет стрелку-указатель, а подстроечный — Т-образную планку', () => {
    // Подстроечный СП3-38б (Т-образная черта)
    const trim = libResistors.components.find((c) => c.id === 'COMP_R_TRIM_SP3')!;
    expect(trim.parts[0].pins).toHaveLength(3);
    const trimLines = trim.parts[0].primitives.filter((p) => p.type === 'line');
    // Линия отвода и поперечная планка подстроечника
    const hasTBar = trimLines.some((l) => l.y1 === l.y2 && l.x2 > l.x1);
    expect(hasTBar).toBe(true);

    // Переменный СП3-4а (стрелка регулирования)
    const pot = libResistors.components.find((c) => c.id === 'COMP_R_VAR_SP3_4')!;
    expect(pot).toBeDefined();
    expect(pot.parts[0].pins).toHaveLength(3);
    const potLines = pot.parts[0].primitives.filter((p) => p.type === 'line');
    // Должны быть наклонные линии стрелки движка
    const hasArrowWings = potLines.some((l) => l.x1 !== l.x2 && l.y1 !== l.y2);
    expect(hasArrowWings).toBe(true);
  });

  it('ГОСТ 2.728-74: конденсаторы полярные и неполярные имеют обкладки высотой 8 мм и корректную полярность', () => {
    const k10 = libCapacitors.components.find((c) => c.id === 'COMP_C_K10_17V_0805')!;
    expect(k10.refDesPrefix).toBe('C');
    const nonpolarLines = k10.parts[0].primitives.filter((p) => p.type === 'line');
    expect(nonpolarLines).toHaveLength(2);
    expect(Math.abs(nonpolarLines[0].y2 - nonpolarLines[0].y1)).toBe(8);

    const k50 = libCapacitors.components.find((c) => c.id === 'COMP_C_K50_35')!;
    expect(k50.refDesPrefix).toBe('C');
    // Положительная обкладка — прямоугольник, отрицательная — линия, знак '+'
    const posPlate = k50.parts[0].primitives.find((p) => p.type === 'rect')!;
    const negPlate = k50.parts[0].primitives.find((p) => p.type === 'line')!;
    const plusSign = k50.parts[0].primitives.find((p) => p.type === 'text')!;
    expect(posPlate.h).toBe(8);
    expect(Math.abs(negPlate.y2 - negPlate.y1)).toBe(8);
    expect(plusSign.text).toBe('+');
  });

  it('ГОСТ 2.723-68: индуктивности содержат 4 дуги радиусом 1.25 мм', () => {
    const ind = libInductors.components.find((c) => c.id === 'COMP_L_DM01')!;
    expect(ind.refDesPrefix).toBe('L');
    const arcs = ind.parts[0].primitives.filter((p) => p.type === 'arc');
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      expect(arc.r).toBe(1.25);
    }
    // Выводы на концах катушки
    for (const pin of ind.parts[0].pins) {
      expect(Math.abs(pin.x % 2.5)).toBe(0);
      expect(Math.abs(pin.y % 2.5)).toBe(0);
    }
  });

  it('ГОСТ 2.730-73: полупроводниковые диоды, стабилитроны и светодиоды (HL) соответствуют ЕСКД', () => {
    const diode = libDiodes.components.find((c) => c.id === 'COMP_VD_KD522')!;
    expect(diode.refDesPrefix).toBe('VD');
    const triangle = diode.parts[0].primitives.find((p) => p.type === 'polyline')!;
    expect(triangle.closed).toBe(true);

    // Стабилитрон содержит излом на катодной черте
    const zener = libDiodes.components.find((c) => c.id === 'COMP_VD_KS147')!;
    expect(zener.refDesPrefix).toBe('VD');
    const zenerLines = zener.parts[0].primitives.filter((p) => p.type === 'line');
    const hasCathodeHook = zenerLines.some((l) => l.x1 === 2.5 && l.x2 < 2.5);
    expect(hasCathodeHook).toBe(true);

    // Светодиод имеет префикс HL и оптические стрелки наружу
    const led = libDiodes.components.find((c) => c.id === 'COMP_VD_AL307')!;
    expect(led.refDesPrefix).toBe('HL');
    const optLines = led.parts[0].primitives.filter((p) => p.type === 'line');
    expect(optLines.length).toBeGreaterThanOrEqual(3);
  });

  it('ГОСТ 2.730-73: транзисторы BJT (NPN/PNP) и полевые (N-MOS/P-MOS) имеют правильное направление стрелок', () => {
    // NPN КТ315: стрелка эмиттера направлена наружу (от базы)
    const npn = libTransistors.components.find((c) => c.id === 'COMP_VT_KT315B')!;
    expect(npn.refDesPrefix).toBe('VT');
    const npnArrow = npn.parts[0].primitives.find((p) => p.type === 'polyline')!;
    // В NPN точка острия имеет больший x, чем основание у базы
    const npnTip = npnArrow.points![1];
    expect(npnTip.x).toBeGreaterThan(0);

    // PNP КТ361: стрелка эмиттера направлена внутрь (к базе)
    const pnp = libTransistors.components.find((c) => c.id === 'COMP_VT_KT361B')!;
    expect(pnp.refDesPrefix).toBe('VT');
    const pnpArrow = pnp.parts[0].primitives.find((p) => p.type === 'polyline')!;
    const pnpTip = pnpArrow.points![0];
    expect(pnpTip.x).toBeLessThan(0);

    // N-MOS КП501А: стрелка подложки направлена влево (к каналу)
    const nmos = libTransistors.components.find((c) => c.id === 'COMP_VT_KP501A')!;
    expect(nmos.refDesPrefix).toBe('VT');
    const nmosArrow = nmos.parts[0].primitives.find((p) => p.type === 'polyline' && p.points?.[0].y === 0)!;
    expect(nmosArrow.points![0].x).toBeLessThan(nmosArrow.points![1].x);

    // P-MOS КП505А: стрелка подложки направлена вправо (от канала)
    const pmos = libTransistors.components.find((c) => c.id === 'COMP_VT_KP505A')!;
    expect(pmos).toBeDefined();
    expect(pmos.refDesPrefix).toBe('VT');
    const pmosArrow = pmos.parts[0].primitives.find((p) => p.type === 'polyline' && p.points?.[0].y === 0)!;
    expect(pmosArrow.points![0].x).toBeGreaterThan(pmosArrow.points![1].x);
  });

  it('ГОСТ 2.743-91: логические микросхемы имеют прямоугольное тело и правильные условные обозначения (&, 1, T)', () => {
    const k155 = libDigitalIC.components.find((c) => c.id === 'COMP_DD_K155LA3')!;
    expect(k155.refDesPrefix).toBe('DD');
    expect(k155.parts).toHaveLength(5); // 4 логических элемента + секция питания
    const gate1 = k155.parts[0];
    const textFunc = gate1.primitives.find((p) => p.type === 'text')!;
    expect(textFunc.text).toBe('&');
    const outPin = gate1.pins.find((p) => p.electricalType === 'Output')!;
    expect(outPin.style).toBe('Inverted'); // 2И-НЕ

    const k555le1 = libDigitalIC.components.find((c) => c.id === 'COMP_DD_K555LE1')!;
    expect(k555le1.parts[0].primitives.find((p) => p.type === 'text')?.text).toBe('1'); // 2ИЛИ-НЕ
  });

  it('ГОСТ 2.710-81: все компоненты библиотек имеют валидный префикс позиционного обозначения', () => {
    const knownPrefixes = new Set(GOST_REFDES_GROUPS.map((g) => g.prefix));
    for (const comp of ALL_GOST_COMPONENTS) {
      if (comp.refDesPrefix.startsWith('#')) continue;
      expect(knownPrefixes.has(comp.refDesPrefix)).toBe(true);
    }
  });

  it('ГОСТ сетка: ВСЕ выводы (100%) всех компонентов библиотек строго выровнены по сетке 1.25 мм / 2.5 мм', () => {
    for (const comp of ALL_GOST_COMPONENTS) {
      for (const part of comp.parts) {
        for (const pin of part.pins) {
          const xRem = Math.abs(pin.x % 1.25);
          const yRem = Math.abs(pin.y % 1.25);
          const snappedX = xRem < 0.001 || Math.abs(xRem - 1.25) < 0.001;
          const snappedY = yRem < 0.001 || Math.abs(yRem - 1.25) < 0.001;
          expect(snappedX).toBe(true);
          expect(snappedY).toBe(true);
        }
      }
    }
  });
});

describe('2. Оформление листов, рамок и штампов (ГОСТ 2.104-2006, ГОСТ 2.301-68)', () => {
  it('ГОСТ 2.301-68: размеры полей строго 20 мм слева для подшивки, 5 мм сверху, справа, снизу для всех форматов', () => {
    const formats: SheetFormatId[] = ['A4_P', 'A4_L', 'A3_L', 'A3_P', 'A2_L', 'A1_L', 'A0_L'];
    for (const fmt of formats) {
      const dim = SHEET_FORMATS[fmt];
      const frame = getGostFrameRect(fmt);
      expect(frame.left).toBe(20);
      expect(frame.top).toBe(5);
      expect(frame.right).toBe(dim.widthMm - 5);
      expect(frame.bottom).toBe(dim.heightMm - 5);
      expect(frame.width).toBe(dim.widthMm - 25);
      expect(frame.height).toBe(dim.heightMm - 10);
    }
  });

  it('ГОСТ 2.301-68: поддерживает А4 вертикальный (210×297) и А3 как горизонтальный (420×297), так и вертикальный (297×420)', () => {
    expect(SHEET_FORMATS.A4_P.widthMm).toBe(210);
    expect(SHEET_FORMATS.A4_P.heightMm).toBe(297);

    expect(SHEET_FORMATS.A3_L.widthMm).toBe(420);
    expect(SHEET_FORMATS.A3_L.heightMm).toBe(297);

    expect(SHEET_FORMATS.A3_P.widthMm).toBe(297);
    expect(SHEET_FORMATS.A3_P.heightMm).toBe(420);
  });

  it('ГОСТ 2.104-2006: Основная надпись Форма 1 имеет габариты 185×55 мм и содержит все регламентированные графы', () => {
    const tbData = createDefaultGostTitleBlock('Form1');
    tbData.developer = 'Иванов';
    tbData.checker = 'Петров';
    tbData.designation = 'ГТРС.468364.001 Э3';
    tbData.name = 'Устройство сопряжения';
    tbData.organization = 'НИИ Приборостроения';

    const geom = buildGostFrameAndStampGeometry('A3_L', tbData);
    const frame = getGostFrameRect('A3_L');

    // Проверяем внешние границы штампа
    const topStampLine = geom.lines.find(
      (l) => l.y1 === frame.bottom - 55 && l.y2 === frame.bottom - 55 && l.x1 === frame.right - 185
    );
    expect(topStampLine).toBeDefined();

    // Графа 2 (Обозначение документа в основной надписи): кегль шрифта 5.0 - 5.5 мм
    const desText = geom.texts.find((t) => t.text === 'ГТРС.468364.001 Э3' && !t.rotateDeg);
    expect(desText).toBeDefined();
    expect(desText!.sizeMm).toBeGreaterThanOrEqual(5.0);

    // Графа 10 (Разраб., Пров., Т.контр., Н.контр., Утв.)
    expect(geom.texts.some((t) => t.text === 'Разраб.')).toBe(true);
    expect(geom.texts.some((t) => t.text === 'Пров.')).toBe(true);
    expect(geom.texts.some((t) => t.text === 'Т. контр.')).toBe(true);
    expect(geom.texts.some((t) => t.text === 'Н. контр.')).toBe(true);
    expect(geom.texts.some((t) => t.text === 'Утв.')).toBe(true);
    expect(geom.texts.some((t) => t.text === 'Иванов')).toBe(true);
  });

  it('ГОСТ 2.104-2006: Форма 2 (текстовые документы) имеет высоту 40 мм, Форма 2а (последующие листы) — 15 мм', () => {
    const frame = getGostFrameRect('A4_P');
    const tbForm2 = createDefaultGostTitleBlock('Form2');
    const geom2 = buildGostFrameAndStampGeometry('A4_P', tbForm2);
    const top2 = geom2.lines.find(
      (l) => l.y1 === frame.bottom - 40 && l.y2 === frame.bottom - 40 && l.x1 === frame.right - 185
    );
    expect(top2).toBeDefined();

    const tbForm2a = createDefaultGostTitleBlock('Form2a');
    const geom2a = buildGostFrameAndStampGeometry('A4_P', tbForm2a);
    const top2a = geom2a.lines.find(
      (l) => l.y1 === frame.bottom - 15 && l.y2 === frame.bottom - 15 && l.x1 === frame.right - 185
    );
    expect(top2a).toBeDefined();
  });

  it('ГОСТ 2.104-2006 п. 6.3: Графа 26 в левом верхнем углу (70×14 мм) повернута на 180°', () => {
    const tb = createDefaultGostTitleBlock('Form1');
    tb.showCornerStamp26 = true;
    tb.designation = 'АБВГ.468112.001 Э3';
    const geom = buildGostFrameAndStampGeometry('A3_L', tb);
    const cornerText = geom.texts.find((t) => t.text === tb.designation && t.rotateDeg === 180);
    expect(cornerText).toBeDefined();
    expect(cornerText!.y).toBe(getGostFrameRect('A3_L').top + 7);
  });
});

describe('3. Генерация Перечня элементов (BOM / ПЭ3) по ГОСТ 2.702-2011 / ГОСТ 2.106-96', () => {
  function makeMockProject(): SchematicProject {
    return {
      projectName: 'Тестовый проект ЕСКД',
      activeSheetId: 'sheet_1',
      gridSize: 2.5,
      sheets: [
        {
          id: 'sheet_1',
          name: 'Лист 1',
          format: 'A3_L',
          titleBlock: createDefaultGostTitleBlock('Form1'),
          components: [
            // Резисторы
            { id: 'c_r1', refDes: 'R1', componentDefId: 'COMP_R_MLT025', typeName: 'МЛТ-0,25', value: '1к', x: 50, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_MLT_025', gostStandard: 'ОСТ 11 073.013' },
            { id: 'c_r2', refDes: 'R2', componentDefId: 'COMP_R_MLT025', typeName: 'МЛТ-0,25', value: '1к', x: 60, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_MLT_025', gostStandard: 'ОСТ 11 073.013' },
            { id: 'c_r3', refDes: 'R3', componentDefId: 'COMP_R_MLT025', typeName: 'МЛТ-0,25', value: '1к', x: 70, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_MLT_025', gostStandard: 'ОСТ 11 073.013' },
            { id: 'c_r4', refDes: 'R4', componentDefId: 'COMP_R_MLT025', typeName: 'МЛТ-0,25', value: '1к', x: 80, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_MLT_025', gostStandard: 'ОСТ 11 073.013' },
            { id: 'c_r5', refDes: 'R5', componentDefId: 'COMP_R_MLT025', typeName: 'МЛТ-0,25', value: '10к', x: 90, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_MLT_025', gostStandard: 'ОСТ 11 073.013' },
            // Конденсаторы
            { id: 'c_c1', refDes: 'C1', componentDefId: 'COMP_C_K10_17V_0805', typeName: 'К10-17в', value: '0,1 мкФ', x: 50, y: 80, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_CHIP_2012M', gostStandard: 'ОЖ0.460.172 ТУ' },
            { id: 'c_c2', refDes: 'C2', componentDefId: 'COMP_C_K10_17V_0805', typeName: 'К10-17в', value: '0,1 мкФ', x: 60, y: 80, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_CHIP_2012M', gostStandard: 'ОЖ0.460.172 ТУ' },
            // Многосекционная цифровая ИМС (DD1.1, DD1.2 в одном физическом корпусе)
            { id: 'c_dd1_1', refDes: 'DD1', componentDefId: 'COMP_DD_K155LA3', typeName: 'К155ЛА3', value: 'К155ЛА3', x: 120, y: 80, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_DIP14', gostStandard: 'ГОСТ 2.743-91' },
            { id: 'c_dd1_2', refDes: 'DD1', componentDefId: 'COMP_DD_K155LA3', typeName: 'К155ЛА3', value: 'К155LA3', x: 140, y: 80, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: -5 }, valueOffset: { x: 0, y: 5 }, showRefDes: true, showValue: true, partIndex: 2, patternId: 'PAT_DIP14', gostStandard: 'ГОСТ 2.743-91' },
            // Служебные символы цепей питания и земли
            { id: 'p_gnd', refDes: '#GND1', componentDefId: 'COMP_GND', typeName: 'Земля', value: 'GND', x: 50, y: 120, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: false, showValue: false, partIndex: 1, patternId: '', isNetPort: true },
            { id: 'p_vcc', refDes: '#PWR1', componentDefId: 'COMP_VCC_5V', typeName: 'Питание', value: '+5V', x: 60, y: 120, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: false, showValue: false, partIndex: 1, patternId: '', isNetPort: true }
          ],
          wires: [],
          buses: [],
          busTaps: [],
          junctions: [],
          netPorts: [],
          diffPairs: [],
          hierarchyBlocks: [],
          shapes: []
        }
      ]
    };
  }

  it('ГОСТ 2.702-2011 п. 5.3.8: объединяет одинаковые номиналы в диапазон "R1...R4" (или "R1 - R4") и перечень "C1, C2"', () => {
    const project = makeMockProject();
    const bomDots = generateGostBom(project, '...');
    const rGroup = bomDots.find((b) => b.refDesList.includes('R1'));
    expect(rGroup).toBeDefined();
    expect(rGroup!.refDesList).toBe('R1...R4');
    expect(rGroup!.quantity).toBe(4);

    const cGroup = bomDots.find((b) => b.refDesList.includes('C1'));
    expect(cGroup).toBeDefined();
    expect(cGroup!.refDesList).toBe('C1, C2');
    expect(cGroup!.quantity).toBe(2);

    // Поддержка дефиса по ГОСТ 2.702
    const bomDash = generateGostBom(project, ' - ');
    const rDash = bomDash.find((b) => b.refDesList.includes('R1'));
    expect(rDash!.refDesList).toBe('R1 - R4');
  });

  it('ГОСТ 2.702-2011: многосекционные ИМС (DD1.1..DD1.4) учитываются в ПЭ3 строго как 1 физический корпус', () => {
    const project = makeMockProject();
    const bom = generateGostBom(project);
    const ddEntries = bom.filter((b) => b.groupTitle === 'Микросхемы цифровые');
    expect(ddEntries).toHaveLength(1);
    expect(ddEntries[0].quantity).toBe(1);
    expect(ddEntries[0].refDesList).toBe('DD1');
  });

  it('ГОСТ 2.702-2011: служебные символы цепей питания (#PWR) и земли (#GND) исключены из перечня элементов', () => {
    const project = makeMockProject();
    const bom = generateGostBom(project);
    expect(bom.some((b) => b.refDesList.includes('GND') || b.refDesList.includes('#'))).toBe(false);
  });

  it('ГОСТ 2.701-2008 / ГОСТ 2.702-2011: группы в ПЭ3 строго следуют стандартному порядку ЕСКД (C, DD, R...)', () => {
    const project = makeMockProject();
    const bom = generateGostBom(project);
    const titles = bom.map((b) => b.groupTitle);
    const uniqueTitles = Array.from(new Set(titles));

    // 'Конденсаторы' (C) должны идти перед 'Микросхемы цифровые' (DD), а те перед 'Резисторы' (R)
    expect(uniqueTitles).toEqual([
      'Конденсаторы',
      'Микросхемы цифровые',
      'Резисторы'
    ]);
  });

  it('Экспорт в CSV и HTML содержит все обязательные графы по ГОСТ: Поз. обозначение, Наименование, Кол., Примечание', () => {
    const project = makeMockProject();
    const bom = generateGostBom(project);
    const csv = exportGostBomToCsv(bom);
    expect(csv).toContain('Поз. обозначение;Наименование;Кол.;Примечание');
    expect(csv).toContain('R1...R4');

    const html = exportGostBomToHtml(project, bom);
    expect(html).toContain('Поз. обозначение');
    expect(html).toContain('Наименование');
    expect(html).toContain('Кол.');
    expect(html).toContain('Примечание');
    expect(html).toContain('Конденсаторы');
    expect(html).toContain('Резисторы');
  });
});

describe('4. Электрические правила (ERC)', () => {
  it('обнаруживает плавающие входы (floating inputs) логических элементов и неподключенные выводы', () => {
    const project: SchematicProject = {
      projectName: 'ERC Test',
      activeSheetId: 's1',
      gridSize: 2.5,
      sheets: [
        {
          id: 's1',
          name: 'Лист 1',
          format: 'A4_P',
          titleBlock: createDefaultGostTitleBlock('Form1'),
          components: [
            // Логический элемент 2И-НЕ с неподключенными входами
            { id: 'dd1', refDes: 'DD1', componentDefId: 'COMP_DD_K155LA3', typeName: 'К155ЛА3', value: 'К155ЛА3', x: 50, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_DIP14' }
          ],
          wires: [],
          buses: [],
          busTaps: [],
          junctions: [],
          netPorts: [],
          diffPairs: [],
          hierarchyBlocks: [],
          shapes: []
        }
      ]
    };

    const errors = runSchematicErc(project);
    expect(errors.some((e) => e.code === 'ERC-FLOAT')).toBe(true);
  });

  it('обнаруживает конфликт выходов (Output соединен с Output напрямую)', () => {
    const project: SchematicProject = {
      projectName: 'ERC Output Conflict',
      activeSheetId: 's1',
      gridSize: 2.5,
      sheets: [
        {
          id: 's1',
          name: 'Лист 1',
          format: 'A3_L',
          titleBlock: createDefaultGostTitleBlock('Form1'),
          components: [
            // Два логических элемента, выходы которых расположены в одной координате (соединены)
            { id: 'dd1', refDes: 'DD1', componentDefId: 'COMP_DD_K155LA3', typeName: 'К155ЛА3', value: 'К155ЛА3', x: 50, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_DIP14' },
            // Размещаем выход второго DD2 прямо на выходе DD1 (выход p_1_3 в секции 1 смещен на x=+10, y=0 относительно comp.x)
            { id: 'dd2', refDes: 'DD2', componentDefId: 'COMP_DD_K155LA3', typeName: 'К155ЛА3', value: 'К155ЛА3', x: 50, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_DIP14' }
          ],
          wires: [],
          buses: [],
          busTaps: [],
          junctions: [],
          netPorts: [],
          diffPairs: [],
          hierarchyBlocks: [],
          shapes: []
        }
      ]
    };

    const errors = runSchematicErc(project);
    expect(errors.some((e) => e.code === 'ERC-OUT')).toBe(true);
  });

  it('обнаруживает короткое замыкание цепей питания и земли (в т.ч. русские обозначения +5В и ОБЩ)', () => {
    const project: SchematicProject = {
      projectName: 'ERC Short Rail',
      activeSheetId: 's1',
      gridSize: 2.5,
      sheets: [
        {
          id: 's1',
          name: 'Лист 1',
          format: 'A3_L',
          titleBlock: createDefaultGostTitleBlock('Form1'),
          components: [],
          wires: [
            { id: 'w1', netName: '+5В', points: [{ x: 50, y: 50 }, { x: 70, y: 50 }], width: 0.35 }
          ],
          buses: [],
          busTaps: [],
          junctions: [],
          netPorts: [
            { id: 'p1', netName: '+5В', style: 'Power', x: 50, y: 50, orientation: 0 },
            { id: 'p2', netName: 'ОБЩ', style: 'Ground', x: 70, y: 50, orientation: 0 }
          ],
          diffPairs: [],
          hierarchyBlocks: [],
          shapes: []
        }
      ]
    };

    const errors = runSchematicErc(project);
    expect(errors.some((e) => e.code === 'ERC-PWR-SHORT')).toBe(true);
  });

  it('предупреждает об отсутствии питания и земли на схеме с активными микросхемами (ERC-NO-PWR)', () => {
    const project: SchematicProject = {
      projectName: 'ERC No Power',
      activeSheetId: 's1',
      gridSize: 2.5,
      sheets: [
        {
          id: 's1',
          name: 'Лист 1',
          format: 'A3_L',
          titleBlock: createDefaultGostTitleBlock('Form1'),
          components: [
            { id: 'dd1', refDes: 'DD1', componentDefId: 'COMP_DD_K155LA3', typeName: 'К155ЛА3', value: 'К155ЛА3', x: 50, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_DIP14' },
            { id: 'da1', refDes: 'DA1', componentDefId: 'COMP_DA_KR140UD708', typeName: 'КР140УД708', value: 'КР140УД708', x: 100, y: 50, angle: 0, flipX: false, flipY: false, refDesOffset: { x: 0, y: 0 }, valueOffset: { x: 0, y: 0 }, showRefDes: true, showValue: true, partIndex: 1, patternId: 'PAT_DIP8' }
          ],
          wires: [],
          buses: [],
          busTaps: [],
          junctions: [],
          netPorts: [],
          diffPairs: [],
          hierarchyBlocks: [],
          shapes: []
        }
      ]
    };

    const errors = runSchematicErc(project);
    expect(errors.some((e) => e.code === 'ERC-NO-PWR')).toBe(true);
  });
});
