import { expect, it } from 'vitest';
import { findComponentById } from '../../src/gost/libraries/gostComponents';
import { findPatternById } from '../../src/gost/libraries/gostPatterns';
import { resolveOrBuildGostComponent } from '../../src/engines/importers/gostConverter';

it('maps every CH340G signal to the SOP-16 pad from WCH CH340DS1 §3–4', () => {
  const definition = findComponentById('COMP_DD_CH340G')!;
  const pins = definition.parts[0].pins;
  const padNumbers = findPatternById(definition.patternId)!.pads.map((pad) => pad.number);
  const expectedSignals = [
    'GND', 'TXD', 'RXD', 'V3', 'UD+', 'UD-', 'XI', 'XO',
    'CTS#', 'DSR#', 'RI#', 'DCD#', 'DTR#', 'RTS#', 'R232', 'VCC'
  ];
  expect(pins).toHaveLength(expectedSignals.length);
  for (const [index, name] of expectedSignals.entries()) {
    const number = String(index + 1);
    expect(pins.find((pin) => pin.number === number)).toMatchObject({ name, padMapping: number });
    expect(padNumbers).toContain(number);
  }
  expect(pins.find((pin) => pin.number === '4')?.electricalType).toBe('Power');
  expect(pins.find((pin) => pin.number === '16')).toMatchObject({ x: -20, y: -12.5 });
  expect(pins.find((pin) => pin.number === '10')).toMatchObject({ x: 20, y: 12.5 });
});

it.each([
  ['CH340C', 'COMP_DD_CH340G'],
  ['CH340N', 'COMP_DD_CH340G'],
  ['FT232RQ', 'COMP_DD_FT232RL']
])('keeps %s distinct from the other package and pinout', (mpn, otherComponent) => {
  const mapping = resolveOrBuildGostComponent({ rawRef: 'U1', rawName: mpn, rawValue: mpn, rawPattern: '', customDefs: {} });
  expect(mapping.defId).not.toBe(otherComponent);
  expect(mapping.gostValue).toBe(mpn);
});

it('describes the Nexperia 74HC595D without substituting the part number', () => {
  const mapping = resolveOrBuildGostComponent({
    rawRef: 'U1', rawName: '74HC595D', rawValue: '74HC595D', rawPattern: 'SOIC-16', customDefs: {}
  });
  const definition = findComponentById(mapping.defId)!;
  expect(mapping.gostTypeName).toContain('74HC595');
  expect(definition.name).toContain('74HC595D');
  expect(definition.parts[0].pins.find((pin) => pin.number === '14')?.name).toBe('DS');
  expect(definition.parts[0].pins.find((pin) => pin.number === '16')?.name).toBe('VCC');
});
