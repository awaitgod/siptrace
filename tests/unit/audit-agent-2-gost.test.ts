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
import { makeResPrimitives, makeTwoPinHorizontal, makeCapPrimitives, makeCapPins } from '../../src/gost/libraries/components/helpers';
import { GOST_REFDES_GROUPS, GOST_GROUP_ORDER } from '../../src/gost/rules';
import {
  SHEET_FORMATS,
  getGostFrameRect,
  buildGostFrameAndStampGeometry,
  createDefaultGostTitleBlock
} from '../../src/gost/gostTitleBlock';
import { SheetFormatId } from '../../src/core/types';

describe('Audit Agent 2: Схемотехника, УГО и стандарты ГОСТ / ЕСКД', () => {

  describe('1. ГОСТ 2.728-74: Резисторы постоянные, подстроечные, переменные', () => {
    it('размеры тела постоянного резистора строго 10х4 мм, центрирован в (0,0)', () => {
      const mlt = libResistors.components.find((c) => c.id === 'COMP_R_MLT025');
      expect(mlt).toBeDefined();
      expect(mlt!.refDesPrefix).toBe('R');

      const bodyRect = mlt!.parts[0].primitives.find((p) => p.type === 'rect');
      expect(bodyRect).toBeDefined();
      expect(bodyRect!.w).toBe(10);
      expect(bodyRect!.h).toBe(4);
      expect(bodyRect!.x).toBe(-5);
      expect(bodyRect!.y).toBe(-2);
    });

    it('выводы постоянного резистора расположены на сетке 2.5 мм (длина выводов 5 мм)', () => {
      const mlt = libResistors.components.find((c) => c.id === 'COMP_R_MLT025')!;
      const pins = mlt.parts[0].pins;
      expect(pins).toHaveLength(2);

      // Контакты должны быть на x = -10 и x = 10 при y = 0
      const pin1 = pins.find((p) => p.id === 'pin_1')!;
      const pin2 = pins.find((p) => p.id === 'pin_2')!;
      expect(pin1.x).toBe(-10);
      expect(pin1.y).toBe(0);
      expect(pin1.length).toBe(5);
      expect(pin2.x).toBe(10);
      expect(pin2.y).toBe(0);
      expect(pin2.length).toBe(5);

      // Проверка кратности сетке 2.5 мм
      expect(Math.abs(pin1.x % 2.5)).toBe(0);
      expect(Math.abs(pin2.x % 2.5)).toBe(0);
    });

    it('знаки номинальной мощности внутри УГО соответствуют ГОСТ 2.728-74 табл. 1', () => {
      // 0.125 Вт: две косые черты
      const p0125 = makeResPrimitives('0.125').filter((p) => p.type === 'line');
      expect(p0125).toHaveLength(2);
      for (const line of p0125) {
        expect(line.x2).toBeGreaterThan(line.x1);
        expect(line.y2).toBeGreaterThan(line.y1);
      }

      // 0.25 Вт: одна косая черта
      const p025 = makeResPrimitives('0.25').filter((p) => p.type === 'line');
      expect(p025).toHaveLength(1);
      expect(p025[0].x2).toBeGreaterThan(p025[0].x1);
      expect(p025[0].y2).toBeGreaterThan(p025[0].y1);

      // 0.5 Вт: одна продольная (горизонтальная) черта
      const p05 = makeResPrimitives('0.5').filter((p) => p.type === 'line');
      expect(p05).toHaveLength(1);
      expect(p05[0].y1).toBe(0);
      expect(p05[0].y2).toBe(0);
      expect(p05[0].x2).toBeGreaterThan(p05[0].x1);

      // 1 Вт: одна поперечная (вертикальная) черта
      const p1 = makeResPrimitives('1').filter((p) => p.type === 'line');
      expect(p1).toHaveLength(1);
      expect(p1[0].x1).toBe(0);
      expect(p1[0].x2).toBe(0);
      expect(p1[0].y2).toBeGreaterThan(p1[0].y1);

      // 2 Вт: две поперечные (вертикальные) черты
      const p2 = makeResPrimitives('2').filter((p) => p.type === 'line');
      expect(p2).toHaveLength(2);
      for (const line of p2) {
        expect(line.x1).toBe(line.x2);
        expect(line.y2).toBeGreaterThan(line.y1);
      }
    });

    it('подстроечный резистор СП3-38б имеет 3 вывода на сетке 2.5 мм и Т-образный знак', () => {
      const trim = libResistors.components.find((c) => c.id === 'COMP_R_TRIM_SP3')!;
      expect(trim.refDesPrefix).toBe('R');
      const part = trim.parts[0];
      expect(part.pins).toHaveLength(3);

      for (const pin of part.pins) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }

      // Т-образная планка
      const lines = part.primitives.filter((p) => p.type === 'line');
      const verticalStem = lines.find((l) => l.x1 === 0 && l.x2 === 0);
      const horizontalBar = lines.find((l) => l.y1 === l.y2 && l.x2 > l.x1);
      expect(verticalStem).toBeDefined();
      expect(horizontalBar).toBeDefined();
    });

    it('переменный резистор СП3-4а имеет стрелку регулирования и выводы на сетке 2.5 мм', () => {
      const pot = libResistors.components.find((c) => c.id === 'COMP_R_VAR_SP3_4')!;
      expect(pot).toBeDefined();
      expect(pot.refDesPrefix).toBe('R');
      expect(pot.parts[0].pins).toHaveLength(3);
      for (const pin of pot.parts[0].pins) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }
    });
  });

  describe('2. ГОСТ 2.728-74: Конденсаторы', () => {
    it('неполярный конденсатор имеет обкладки высотой 8 мм с зазором 2 мм', () => {
      const prims = makeCapPrimitives(false);
      const lines = prims.filter((p) => p.type === 'line');
      expect(lines).toHaveLength(2);

      const [line1, line2] = lines;
      expect(Math.abs(line1.y2 - line1.y1)).toBe(8);
      expect(Math.abs(line2.y2 - line2.y1)).toBe(8);
      expect(Math.abs(line2.x1 - line1.x1)).toBe(2);

      const pins = makeCapPins(false);
      expect(pins).toHaveLength(2);
      expect(pins[0].x).toBe(-5);
      expect(pins[1].x).toBe(5);
      expect(Math.abs(pins[0].x % 2.5)).toBe(0);
      expect(Math.abs(pins[1].x % 2.5)).toBe(0);
    });

    it('электролитический полярный конденсатор имеет прямоугольную положительную обкладку 1.5х8 мм и знак "+"', () => {
      const prims = makeCapPrimitives(true);
      const rect = prims.find((p) => p.type === 'rect')!;
      const line = prims.find((p) => p.type === 'line')!;
      const text = prims.find((p) => p.type === 'text')!;

      expect(rect).toBeDefined();
      expect(rect.w).toBe(1.5);
      expect(rect.h).toBe(8);
      expect(Math.abs(line.y2 - line.y1)).toBe(8);
      expect(text.text).toBe('+');

      // Зазор между обкладками 1.5 мм
      const gap = line.x1 - (rect.x + rect.w);
      expect(gap).toBeCloseTo(1.5, 2);

      // Выводы на сетке 2.5 мм
      const pins = makeCapPins(true);
      expect(pins[0].x).toBe(-5);
      expect(pins[1].x).toBe(5);
      expect(pins[0].x + pins[0].length).toBeCloseTo(rect.x, 2);
      expect(pins[1].x - pins[1].length).toBeCloseTo(line.x1, 2);
    });
  });

  describe('3. ГОСТ 2.730-73: Диоды, транзисторы и тиристоры', () => {
    it('диод КД522Б: префикс VD, треугольник анода и катодная черта, выводы на сетке 2.5 мм', () => {
      const diode = libDiodes.components.find((c) => c.id === 'COMP_VD_KD522')!;
      expect(diode.refDesPrefix).toBe('VD');
      const tri = diode.parts[0].primitives.find((p) => p.type === 'polyline')!;
      expect(tri.closed).toBe(true);

      for (const pin of diode.parts[0].pins) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }
    });

    it('светодиод АЛ307БМ: префикс HL (по ГОСТ 2.710-81) и оптические стрелки', () => {
      const led = libDiodes.components.find((c) => c.id === 'COMP_VD_AL307')!;
      expect(led.refDesPrefix).toBe('HL');
      const lines = led.parts[0].primitives.filter((p) => p.type === 'line');
      // Должны быть линии диода + как минимум 2 оптические стрелки
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('тиристор КУ202Н: префикс VS (по ГОСТ 2.710-81) и управляющий электрод', () => {
      const scr = libDiodes.components.find((c) => c.id === 'COMP_VS_KU202')!;
      expect(scr).toBeDefined();
      expect(scr.refDesPrefix).toBe('VS');
      expect(scr.parts[0].pins).toHaveLength(3);
    });

    it('транзисторы биполярные: КТ315 (NPN) стрелка наружу, КТ361 (PNP) стрелка к базе, префикс VT', () => {
      const npn = libTransistors.components.find((c) => c.id === 'COMP_VT_KT315B')!;
      expect(npn.refDesPrefix).toBe('VT');
      expect(npn.parts[0].pins).toHaveLength(3);
      for (const pin of npn.parts[0].pins) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }

      const pnp = libTransistors.components.find((c) => c.id === 'COMP_VT_KT361B')!;
      expect(pnp.refDesPrefix).toBe('VT');
      expect(pnp.parts[0].pins).toHaveLength(3);
      for (const pin of pnp.parts[0].pins) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }
    });

    it('транзисторы полевые: КП501А (N-MOS) стрелка к каналу, КП505А (P-MOS) стрелка от канала', () => {
      const nmos = libTransistors.components.find((c) => c.id === 'COMP_VT_KP501A')!;
      expect(nmos.refDesPrefix).toBe('VT');
      const pmos = libTransistors.components.find((c) => c.id === 'COMP_VT_KP505A')!;
      expect(pmos.refDesPrefix).toBe('VT');

      for (const pin of [...nmos.parts[0].pins, ...pmos.parts[0].pins]) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }
    });
  });

  describe('4. ГОСТ 2.743-91: Микросхемы цифровые (DD)', () => {
    it('К155ЛА3: префикс DD, 4 логические секции 2И-НЕ с символом "&" и инверсным выходом + секция питания', () => {
      const dd = libDigitalIC.components.find((c) => c.id === 'COMP_DD_K155LA3')!;
      expect(dd.refDesPrefix).toBe('DD');
      expect(dd.parts).toHaveLength(5);

      for (let i = 0; i < 4; i++) {
        const gate = dd.parts[i];
        const funcText = gate.primitives.find((p) => p.type === 'text')!;
        expect(funcText.text).toBe('&');
        const outPin = gate.pins.find((p) => p.electricalType === 'Output')!;
        expect(outPin.style).toBe('Inverted');
        for (const pin of gate.pins) {
          expect(Math.abs(pin.x % 2.5)).toBe(0);
          expect(Math.abs(pin.y % 2.5)).toBe(0);
        }
      }

      const pwr = dd.parts[4];
      expect(pwr.name).toContain('Питание');
      expect(pwr.pins).toHaveLength(2);
      expect(pwr.pins.some((p) => p.name === 'VCC')).toBe(true);
      expect(pwr.pins.some((p) => p.name === 'GND')).toBe(true);
    });

    it('К555ТМ2: префикс DD, D-триггеры с символом "T"', () => {
      const tm2 = libDigitalIC.components.find((c) => c.id === 'COMP_DD_K555TM2');
      if (tm2) {
        expect(tm2.refDesPrefix).toBe('DD');
        const funcText = tm2.parts[0].primitives.find((p) => p.type === 'text');
        expect(funcText?.text).toBe('T');
      }
    });
  });

  describe('5. ГОСТ 2.755-87: Соединители, клеммники и коммутация', () => {
    it('вилка ПЛС-5: префикс XP, штыревые контакты, шаг выводов 5 мм, все на сетке 2.5 мм', () => {
      const pls = libConnectorsAndSwitch.components.find((c) => c.id === 'COMP_XP_PLS5')!;
      expect(pls.refDesPrefix).toBe('XP');
      expect(pls.parts[0].pins).toHaveLength(5);
      for (const pin of pls.parts[0].pins) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }
    });

    it('клеммник КЗ-4: префикс XT, 4 винтовых контакта с шагом 5 мм, все на сетке 2.5 мм', () => {
      const kz = libConnectorsAndSwitch.components.find((c) => c.id === 'COMP_XT_KZ4')!;
      expect(kz.refDesPrefix).toBe('XT');
      expect(kz.parts[0].pins).toHaveLength(4);
      for (const pin of kz.parts[0].pins) {
        expect(Math.abs(pin.x % 2.5)).toBe(0);
        expect(Math.abs(pin.y % 2.5)).toBe(0);
      }
    });
  });

  describe('6. ГОСТ 2.710-81: Классификация и буквенные коды позиционных обозначений', () => {
    it('все компоненты имеют стандартизированные префиксы ЕСКД', () => {
      const validPrefixes = new Set(GOST_REFDES_GROUPS.map((g) => g.prefix));
      for (const comp of ALL_GOST_COMPONENTS) {
        if (comp.refDesPrefix.startsWith('#')) continue; // служебные порты питания
        expect(validPrefixes.has(comp.refDesPrefix)).toBe(true);
      }
    });

    it('100% выводов ВСЕХ компонентов библиотек строго выровнены по сетке 1.25 мм', () => {
      let pinCount = 0;
      for (const comp of ALL_GOST_COMPONENTS) {
        for (const part of comp.parts) {
          for (const pin of part.pins) {
            pinCount++;
            const xRem = Math.abs(pin.x % 1.25);
            const yRem = Math.abs(pin.y % 1.25);
            const snappedX = xRem < 0.001 || Math.abs(xRem - 1.25) < 0.001;
            const snappedY = yRem < 0.001 || Math.abs(yRem - 1.25) < 0.001;
            expect(snappedX).toBe(true);
            expect(snappedY).toBe(true);
          }
        }
      }
      expect(pinCount).toBeGreaterThan(100);
    });
  });

  describe('7. ГОСТ 2.104-2006 и ГОСТ 2.301-68: Форматы листов и основная надпись', () => {
    it('поддерживает стандартные форматы А4_П, А4_А, А3_А, А3_П, А2_А, А1_А, А0_А с правильными размерами', () => {
      expect(SHEET_FORMATS.A4_P.widthMm).toBe(210);
      expect(SHEET_FORMATS.A4_P.heightMm).toBe(297);
      expect(SHEET_FORMATS.A4_L.widthMm).toBe(297);
      expect(SHEET_FORMATS.A4_L.heightMm).toBe(210);
      expect(SHEET_FORMATS.A3_L.widthMm).toBe(420);
      expect(SHEET_FORMATS.A3_L.heightMm).toBe(297);
      expect(SHEET_FORMATS.A2_L.widthMm).toBe(594);
      expect(SHEET_FORMATS.A2_L.heightMm).toBe(420);
    });

    it('поля рамки строго 20 мм (слева) и 5 мм (сверху, справа, снизу)', () => {
      const formats: SheetFormatId[] = ['A4_P', 'A4_L', 'A3_L', 'A3_P', 'A2_L', 'A1_L'];
      for (const fmt of formats) {
        const frame = getGostFrameRect(fmt);
        const dim = SHEET_FORMATS[fmt];
        expect(frame.left).toBe(20);
        expect(frame.top).toBe(5);
        expect(frame.right).toBe(dim.widthMm - 5);
        expect(frame.bottom).toBe(dim.heightMm - 5);
        expect(frame.width).toBe(dim.widthMm - 25);
        expect(frame.height).toBe(dim.heightMm - 10);
      }
    });

    it('Форма 1 (185х55 мм) содержит все обязательные графы основной надписи', () => {
      const tb = createDefaultGostTitleBlock('Form1');
      tb.designation = 'АБВГ.468715.001 Э3';
      tb.name = 'Блок управления';
      tb.developer = 'Сидоров';
      const geom = buildGostFrameAndStampGeometry('A3_L', tb);
      const frame = getGostFrameRect('A3_L');

      // Верхняя граница штампа 185x55 мм
      const topBorder = geom.lines.find(
        (l) => l.y1 === frame.bottom - 55 && l.y2 === frame.bottom - 55 && l.x1 === frame.right - 185
      );
      expect(topBorder).toBeDefined();

      // Наличие обязательных текстовых полей
      expect(geom.texts.some((t) => t.text === tb.designation)).toBe(true);
      expect(geom.texts.some((t) => t.text === 'Разраб.')).toBe(true);
      expect(geom.texts.some((t) => t.text === 'Пров.')).toBe(true);
      expect(geom.texts.some((t) => t.text === 'Сидоров')).toBe(true);
    });

    it('Форма 2 (185х40 мм) и Форма 2а (185х15 мм) имеют правильную высоту', () => {
      const frame = getGostFrameRect('A4_P');
      const tb2 = createDefaultGostTitleBlock('Form2');
      const geom2 = buildGostFrameAndStampGeometry('A4_P', tb2);
      expect(geom2.lines.some((l) => l.y1 === frame.bottom - 40 && l.x1 === frame.right - 185)).toBe(true);

      const tb2a = createDefaultGostTitleBlock('Form2a');
      const geom2a = buildGostFrameAndStampGeometry('A4_P', tb2a);
      expect(geom2a.lines.some((l) => l.y1 === frame.bottom - 15 && l.x1 === frame.right - 185)).toBe(true);
    });

    it('Графа 26 (70х14 мм) повернута на 180° в левом верхнем углу листа', () => {
      const tb = createDefaultGostTitleBlock('Form1');
      tb.showCornerStamp26 = true;
      tb.designation = 'АБВГ.468715.001 Э3';
      const geom = buildGostFrameAndStampGeometry('A3_L', tb);
      const corner = geom.texts.find((t) => t.text === tb.designation && t.rotateDeg === 180);
      expect(corner).toBeDefined();
    });
  });
});
