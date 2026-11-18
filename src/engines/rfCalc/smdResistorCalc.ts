/**
 * SMD Resistor Marking Code Decoder & Encoder
 * Supports:
 * - 3-digit EIA standard (e.g., "103" = 10k, "4R7" = 4.7 Ohm, "R22" = 0.22 Ohm)
 * - 4-digit EIA standard (e.g., "1002" = 10k, "R010" = 0.01 Ohm, "47R0" = 47.0 Ohm)
 * - EIA-96 high-precision 1% code (e.g., "01Y" = 1.00 Ohm, "01A" = 100 Ohm, "68X" = 49.9 Ohm)
 */

// EIA-96 standard lookup table: 2-digit code -> base 3-digit mantissa
const EIA96_CODES: Record<string, number> = {
  '01': 100, '02': 102, '03': 105, '04': 107, '05': 110, '06': 113, '07': 115, '08': 118,
  '09': 121, '10': 124, '11': 127, '12': 130, '13': 133, '14': 137, '15': 140, '16': 143,
  '17': 147, '18': 150, '19': 154, '20': 158, '21': 162, '22': 165, '23': 169, '24': 174,
  '25': 178, '26': 182, '27': 187, '28': 191, '29': 196, '30': 200, '31': 205, '32': 210,
  '33': 215, '34': 221, '35': 226, '36': 232, '37': 237, '38': 243, '39': 249, '40': 255,
  '41': 261, '42': 267, '43': 274, '44': 280, '45': 287, '46': 294, '47': 301, '48': 309,
  '49': 316, '50': 324, '51': 332, '52': 340, '53': 348, '54': 357, '55': 365, '56': 374,
  '57': 383, '58': 392, '59': 402, '60': 412, '61': 422, '62': 432, '63': 442, '64': 453,
  '65': 464, '66': 475, '67': 487, '68': 499, '69': 511, '70': 523, '71': 536, '72': 549,
  '73': 562, '74': 576, '75': 590, '76': 604, '77': 619, '78': 634, '79': 649, '80': 665,
  '81': 681, '82': 698, '83': 715, '84': 732, '85': 750, '86': 768, '87': 787, '88': 806,
  '89': 825, '90': 845, '91': 866, '92': 887, '93': 909, '94': 931, '95': 953, '96': 976
};

// EIA-96 letter multiplier lookup
const EIA96_MULTIPLIERS: Record<string, number> = {
  'Z': 0.001,
  'Y': 0.01,
  'R': 0.01,
  'X': 0.1,
  'S': 0.1,
  'A': 1,
  'B': 10,
  'H': 10,
  'C': 100,
  'D': 1000,
  'E': 10000,
  'F': 100000
};

export interface SmdResistorDecoded {
  valid: boolean;
  resistanceOhm: number;
  formatted: string;
  standard: '3-digit' | '4-digit' | 'EIA-96' | 'invalid';
  tolerancePercent: number;
  error?: string;
}

export function formatResistance(ohms: number): string {
  if (ohms < 0 || !Number.isFinite(ohms)) return '—';
  if (ohms === 0) return '0 Ом (перемычка / 0R)';
  if (ohms < 1) return `${(ohms).toFixed(3).replace(/\.?0+$/, '')} Ом`;
  if (ohms < 1000) return `${Number(ohms.toFixed(3))} Ом`;
  if (ohms < 1e6) return `${Number((ohms / 1e3).toFixed(3))} кОм`;
  if (ohms < 1e9) return `${Number((ohms / 1e6).toFixed(3))} МОм`;
  return `${Number((ohms / 1e9).toFixed(3))} ГОм`;
}

export function decodeSmdResistor(inputCode: string): SmdResistorDecoded {
  const code = inputCode.trim().toUpperCase();
  if (!code) {
    return { valid: false, resistanceOhm: 0, formatted: '—', standard: 'invalid', tolerancePercent: 0, error: 'Введите код маркировки' };
  }

  // Jumper: "0", "00", "000", "0000"
  if (/^0+$/.test(code)) {
    return {
      valid: true,
      resistanceOhm: 0,
      formatted: '0 Ом (Jumper / Нулевое сопротивление)',
      standard: code.length <= 3 ? '3-digit' : '4-digit',
      tolerancePercent: 5
    };
  }

  // 1. EIA-96 (2 digits + 1 letter, e.g., 01Y, 68A, 01X)
  const eia96Match = code.match(/^(\d{2})([ZYRXSABCDEHF])$/);
  if (eia96Match) {
    const numPart = eia96Match[1];
    const letter = eia96Match[2];
    const base = EIA96_CODES[numPart];
    const mult = EIA96_MULTIPLIERS[letter];
    if (base !== undefined && mult !== undefined) {
      const ohms = Math.round(base * mult * 1e6) / 1e6;
      return {
        valid: true,
        resistanceOhm: ohms,
        formatted: `${formatResistance(ohms)} (±1%)`,
        standard: 'EIA-96',
        tolerancePercent: 1
      };
    }
  }

  // 2. 3-digit with 'R' as decimal separator (e.g. 4R7, R22, 0R1)
  if (code.length <= 4 && code.includes('R') && !code.includes('M') && !code.includes('K')) {
    const val = parseFloat(code.replace('R', '.'));
    if (!isNaN(val)) {
      return {
        valid: true,
        resistanceOhm: val,
        formatted: `${formatResistance(val)} (±5%)`,
        standard: code.length <= 3 ? '3-digit' : '4-digit',
        tolerancePercent: 5
      };
    }
  }

  // 3. 3-digit with 'M' (Megohm) or 'K' (kiloohm) as decimal separator (e.g. 1M2, 4K7)
  const metricMatch = code.match(/^(\d+)?([RKM])(\d+)?$/);
  if (metricMatch) {
    const prefix = metricMatch[1] || '0';
    const unit = metricMatch[2];
    const suffix = metricMatch[3] || '0';
    const num = parseFloat(`${prefix}.${suffix}`);
    let mult = 1;
    if (unit === 'K') mult = 1e3;
    if (unit === 'M') mult = 1e6;
    const ohms = num * mult;
    return {
      valid: true,
      resistanceOhm: ohms,
      formatted: `${formatResistance(ohms)} (±5%)`,
      standard: code.length <= 3 ? '3-digit' : '4-digit',
      tolerancePercent: 5
    };
  }

  // 4. Standard 3-digit code (e.g. 103 = 10 * 10^3 = 10,000)
  if (/^\d{3}$/.test(code)) {
    const digits = parseInt(code.slice(0, 2), 10);
    const exponent = parseInt(code.charAt(2), 10);
    const ohms = digits * Math.pow(10, exponent);
    return {
      valid: true,
      resistanceOhm: ohms,
      formatted: `${formatResistance(ohms)} (±5%)`,
      standard: '3-digit',
      tolerancePercent: 5
    };
  }

  // 5. Standard 4-digit code (e.g. 1002 = 100 * 10^2 = 10,000)
  if (/^\d{4}$/.test(code)) {
    const digits = parseInt(code.slice(0, 3), 10);
    const exponent = parseInt(code.charAt(3), 10);
    const ohms = digits * Math.pow(10, exponent);
    return {
      valid: true,
      resistanceOhm: ohms,
      formatted: `${formatResistance(ohms)} (±1%)`,
      standard: '4-digit',
      tolerancePercent: 1
    };
  }

  return {
    valid: false,
    resistanceOhm: 0,
    formatted: '—',
    standard: 'invalid',
    tolerancePercent: 0,
    error: `Неверный формат маркировки «${code}». Используйте 3 цифры (напр. 472), 4 цифры (напр. 4701) или EIA-96 (напр. 68A).`
  };
}

export function encodeSmdResistor(valOhm: number): { code3Digit?: string; code4Digit?: string; eia96?: string } {
  if (valOhm <= 0 || !Number.isFinite(valOhm)) {
    return { code3Digit: '000', code4Digit: '0000' };
  }

  const result: { code3Digit?: string; code4Digit?: string; eia96?: string } = {};

  // Sub-ohm or decimal: e.g. 4.7 -> 4R7, 0.22 -> R22
  if (valOhm < 10) {
    const s = valOhm.toFixed(2).replace(/\.?0+$/, '');
    result.code3Digit = s.replace('.', 'R');
    result.code4Digit = valOhm.toFixed(2).replace('.', 'R');
  } else {
    // 3-digit
    const exp3 = Math.floor(Math.log10(valOhm)) - 1;
    const mantissa3 = Math.round(valOhm / Math.pow(10, exp3));
    if (mantissa3 >= 10 && mantissa3 < 100 && exp3 >= 0 && exp3 <= 9) {
      result.code3Digit = `${mantissa3}${exp3}`;
    }

    // 4-digit
    const exp4 = Math.floor(Math.log10(valOhm)) - 2;
    const mantissa4 = Math.round(valOhm / Math.pow(10, exp4));
    if (mantissa4 >= 100 && mantissa4 < 1000 && exp4 >= 0 && exp4 <= 9) {
      result.code4Digit = `${mantissa4}${exp4}`;
    }
  }

  // EIA-96 lookup
  const exp96 = Math.floor(Math.log10(valOhm)) - 2;
  const mantissa96 = Math.round(valOhm / Math.pow(10, exp96));
  for (const [code, val] of Object.entries(EIA96_CODES)) {
    if (val === mantissa96) {
      // Find letter
      const mult = Math.pow(10, exp96);
      for (const [letter, letterMult] of Object.entries(EIA96_MULTIPLIERS)) {
        if (Math.abs(letterMult - mult) < 1e-6) {
          result.eia96 = `${code}${letter}`;
          break;
        }
      }
      break;
    }
  }

  return result;
}
