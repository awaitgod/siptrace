import { describe, expect, it } from 'vitest';
import { libResistors } from '../../src/gost/libraries/components/resistors';
import { makeCapPins, makeCapPrimitives, makeResPrimitives } from '../../src/gost/libraries/components/helpers';

describe('ГОСТ 2.728-74, пассивные компоненты', () => {
    it.each([['0.125', 2], ['0.25', 1]] as const)('рисует %s Вт нисходящими штрихами', (power, count) => {
        const marks = makeResPrimitives(power).filter(primitive => primitive.type === 'line');
        expect(marks).toHaveLength(count);
        for (const mark of marks) {
            expect(mark.x2).toBeGreaterThan(mark.x1);
            expect(mark.y2).toBeGreaterThan(mark.y1);
        }
    });

    it('отличает подстроечный резистор с третьим выводом от реостатного обозначения', () => {
        const part = libResistors.components.find(component => component.id === 'COMP_R_TRIM_SP3')!.parts[0];
        expect(part.pins.map(pin => pin.number)).toEqual(['1', '2', '3']);
        const strokes = part.primitives.filter(primitive => primitive.type === 'line');
        expect(strokes).toHaveLength(2);
        expect(strokes[0].x2).toBe(strokes[0].x1);
        expect(strokes[1].y2).toBe(strokes[1].y1);
        expect(strokes[1].x2).toBeGreaterThan(strokes[1].x1);
    });

    it('соединяет положительный вывод с единственной прямоугольной обкладкой', () => {
        const [positive, negative] = makeCapPins(true);
        const primitives = makeCapPrimitives(true);
        const outline = primitives.find(primitive => primitive.type === 'rect')!;
        const line = primitives.find(primitive => primitive.type === 'line')!;
        expect(primitives.map(primitive => primitive.type)).toEqual(['rect', 'line', 'text']);
        expect(outline.w).toBe(1.5);
        expect(line.x1 - (outline.x + outline.w)).toBe(1.5);
        expect(positive.x + positive.length).toBe(outline.x);
        expect(negative.x - negative.length).toBe(line.x1);
        expect(primitives).toContainEqual(expect.objectContaining({ type: 'text', text: '+' }));
        expect(makeCapPrimitives(false).map(primitive => primitive.type)).toEqual(['line', 'line']);
    });
});
