import { expect, it } from 'vitest';
import { findComponentById } from '../../src/gost/libraries/gostComponents';

it('exposes the FT232RL functional pins without moving existing wire anchors', () => {
  const pins = findComponentById('COMP_DD_FT232RL')!.parts[0].pins;
  expect(new Set(pins.map((pin) => pin.number)).size).toBe(26);
  expect(pins.find((pin) => pin.number === '26')).toMatchObject({ name: 'TEST', electricalType: 'Input', padMapping: '26' });
  expect(pins.filter((pin) => ['12', '13', '14', '27', '28'].includes(pin.number)).map((pin) => pin.name).sort())
    .toEqual(['CBUS2', 'CBUS3', 'CBUS4', 'OSCI', 'OSCO']);
  expect(pins.find((pin) => pin.number === '15')).toMatchObject({ x: -20, y: -20 });
  expect(pins.find((pin) => pin.number === '22')).toMatchObject({ x: 20, y: 25 });
});
