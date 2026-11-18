/**
 * ECAD / Hardware Engineering Unit Converter
 * Length, PCB Copper Foil Weight/Thickness, Temperature, and RF Frequency
 */

export interface LengthUnits {
  mm: number;
  mils: number;
  inches: number;
  um: number;
}

export function convertLength(val: number, fromUnit: 'mm' | 'mils' | 'in' | 'um'): LengthUnits {
  let mm = 0;
  switch (fromUnit) {
    case 'mm': mm = val; break;
    case 'mils': mm = val * 0.0254; break;
    case 'in': mm = val * 25.4; break;
    case 'um': mm = val * 0.001; break;
  }

  return {
    mm: Number(mm.toFixed(5)),
    mils: Number((mm / 0.0254).toFixed(3)),
    inches: Number((mm / 25.4).toFixed(5)),
    um: Number((mm * 1000).toFixed(2))
  };
}

export interface CopperUnits {
  ozFt2: number;
  um: number;
  mm: number;
  mils: number;
}

export function convertCopper(val: number, fromUnit: 'oz' | 'um' | 'mils'): CopperUnits {
  let um = 0;
  switch (fromUnit) {
    case 'oz': um = val * 34.79; break; // 1 oz/ft² ≈ 34.79 - 35 um standard
    case 'um': um = val; break;
    case 'mils': um = val * 25.4; break;
  }

  const oz = um / 34.79;
  const mm = um * 0.001;
  const mils = um / 25.4;

  return {
    ozFt2: Number(oz.toFixed(2)),
    um: Number(um.toFixed(2)),
    mm: Number(mm.toFixed(4)),
    mils: Number(mils.toFixed(2))
  };
}

export interface TemperatureUnits {
  celsius: number;
  fahrenheit: number;
  kelvin: number;
}

export function convertTemperature(val: number, fromUnit: 'C' | 'F' | 'K'): TemperatureUnits {
  let c = 0;
  switch (fromUnit) {
    case 'C': c = val; break;
    case 'F': c = (val - 32) * (5 / 9); break;
    case 'K': c = val - 273.15; break;
  }

  return {
    celsius: Number(c.toFixed(2)),
    fahrenheit: Number((c * (9 / 5) + 32).toFixed(2)),
    kelvin: Number((c + 273.15).toFixed(2))
  };
}
