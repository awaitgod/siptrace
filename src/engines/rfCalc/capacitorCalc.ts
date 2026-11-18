/**
 * Capacitor Marking Decoder & Reactance Calculator
 * Standards: EIA-198-D / IEC 60062
 */

export interface CapacitorDecoded {
  valid: boolean;
  capacitancePf: number;
  capacitanceNf: number;
  capacitanceUf: number;
  formatted: string;
  toleranceText: string;
  tolerancePercent: number;
  voltageText: string;
  dielectricDescription: string;
  reactanceAt1kHz: number;
  reactanceAt100kHz: number;
  reactanceAt1MHz: number;
  error?: string;
}

const CAP_TOLERANCES: Record<string, { desc: string; percent: number }> = {
  'B': { desc: '±0.1 пФ', percent: 0.1 },
  'C': { desc: '±0.25 пФ', percent: 0.25 },
  'D': { desc: '±0.5 пФ', percent: 0.5 },
  'F': { desc: '±1%', percent: 1 },
  'G': { desc: '±2%', percent: 2 },
  'J': { desc: '±5%', percent: 5 },
  'K': { desc: '±10%', percent: 10 },
  'M': { desc: '±20%', percent: 20 },
  'Z': { desc: '+80% / -20%', percent: 80 }
};

const CAP_VOLTAGES: Record<string, string> = {
  '0G': '4 В',
  '0J': '6.3 В',
  '1A': '10 В',
  '1C': '16 В',
  '1E': '25 В',
  '1V': '35 В',
  '1H': '50 В',
  '2A': '100 В',
  '2D': '200 В',
  '2E': '250 В',
  '2V': '350 В',
  '2W': '450 В',
  '3A': '1000 В (1 кВ)'
};

const DIELECTRIC_INFO: Record<string, string> = {
  'C0G': 'Класс 1 (NP0): Сверхстабильный диэлектрик, ТКЕ ±30 ppm/°C, нулевой пьезоэффект, без падения ёмкости от DC bias. Идеален для ВЧ контуров, генераторов и фильтров.',
  'NP0': 'Класс 1 (C0G): Сверхстабильный диэлектрик, ТКЕ ±30 ppm/°C, нулевой пьезоэффект. Идеален для ВЧ контуров, генераторов и точных фильтров.',
  'X7R': 'Класс 2: Высокая ёмкость, рабочий диапазон -55…+125°C, изменение ёмкости не более ±15%. Стандарт для блокировочных цепей и фильтрации.',
  'X5R': 'Класс 2: Компактный диэлектрик с высокой диэлектрической проницаемостью, -55…+85°C (±15%). Для DC/DC преобразователей и питания ИМС.',
  'Y5V': 'Класс 3: Максимальная удельная ёмкость, но высокая температурная нестабильность (+22% / -82% в диапазоне -30…+85°C) и сильное падение ёмкости от постоянного напряжения.'
};

export function formatCapacitance(pf: number): string {
  if (pf <= 0 || !Number.isFinite(pf)) return '—';
  if (pf < 1000) return `${Number(pf.toFixed(2))} пФ`;
  const nf = pf / 1000;
  if (nf < 1000) return `${Number(nf.toFixed(3))} нФ (${Number(pf.toFixed(1))} пФ)`;
  const uf = nf / 1000;
  if (uf < 1000) return `${Number(uf.toFixed(3))} мкФ (${Number(nf.toFixed(1))} нФ)`;
  const mf = uf / 1000;
  return `${Number(mf.toFixed(3))} мФ`;
}

export function calcCapacitiveReactance(cFarads: number, fHz: number): number {
  if (cFarads <= 0 || fHz <= 0) return 0;
  return 1 / (2 * Math.PI * fHz * cFarads);
}

export function decodeCapacitor(
  code: string,
  toleranceLetter?: string,
  voltageCode?: string,
  dielectricKey: string = 'X7R'
): CapacitorDecoded {
  const clean = code.trim().toUpperCase();
  if (!clean) {
    return {
      valid: false,
      capacitancePf: 0,
      capacitanceNf: 0,
      capacitanceUf: 0,
      formatted: '—',
      toleranceText: '—',
      tolerancePercent: 0,
      voltageText: '—',
      dielectricDescription: DIELECTRIC_INFO[dielectricKey] || '',
      reactanceAt1kHz: 0,
      reactanceAt100kHz: 0,
      reactanceAt1MHz: 0,
      error: 'Введите код маркировки'
    };
  }

  let pf = 0;

  // Decimal with R, e.g. 4R7 = 4.7 pF, R5 = 0.5 pF
  if (clean.includes('R') || clean.includes('.')) {
    pf = parseFloat(clean.replace('R', '.'));
  } else if (/^\d{3}$/.test(clean)) {
    // 3-digit EIA: 104 -> 10 * 10^4 pF
    const digits = parseInt(clean.slice(0, 2), 10);
    const exp = parseInt(clean.charAt(2), 10);
    pf = digits * Math.pow(10, exp);
  } else if (/^\d{1,2}$/.test(clean)) {
    // Direct pF
    pf = parseInt(clean, 10);
  } else {
    // Try alphanumeric e.g. 104K or 2A104K
    const match = clean.match(/^([0-9][A-Z])?(\d{2,3})([BCDFGJKMZ])?$/);
    if (match) {
      if (match[1] && !voltageCode) voltageCode = match[1];
      const digitsCode = match[2];
      if (digitsCode.length === 3) {
        const d = parseInt(digitsCode.slice(0, 2), 10);
        const e = parseInt(digitsCode.charAt(2), 10);
        pf = d * Math.pow(10, e);
      } else {
        pf = parseInt(digitsCode, 10);
      }
      if (match[3] && !toleranceLetter) toleranceLetter = match[3];
    } else {
      return {
        valid: false,
        capacitancePf: 0,
        capacitanceNf: 0,
        capacitanceUf: 0,
        formatted: '—',
        toleranceText: '—',
        tolerancePercent: 0,
        voltageText: '—',
        dielectricDescription: DIELECTRIC_INFO[dielectricKey] || '',
        reactanceAt1kHz: 0,
        reactanceAt100kHz: 0,
        reactanceAt1MHz: 0,
        error: `Неверный формат маркировки «${clean}». Используйте 3 цифры (напр. 104 = 100 нФ) или десятичный код (4R7 = 4.7 пФ).`
      };
    }
  }

  const nf = pf / 1000;
  const uf = nf / 1000;
  const farads = pf * 1e-12;

  const tol = toleranceLetter ? CAP_TOLERANCES[toleranceLetter.toUpperCase()] : undefined;
  const voltText = voltageCode ? CAP_VOLTAGES[voltageCode.toUpperCase()] || `${voltageCode}` : 'Не указано';

  return {
    valid: true,
    capacitancePf: pf,
    capacitanceNf: nf,
    capacitanceUf: uf,
    formatted: formatCapacitance(pf),
    toleranceText: tol ? `${tol.desc}` : '±10% (стандарт K)',
    tolerancePercent: tol ? tol.percent : 10,
    voltageText: voltText,
    dielectricDescription: DIELECTRIC_INFO[dielectricKey] || DIELECTRIC_INFO['X7R'],
    reactanceAt1kHz: calcCapacitiveReactance(farads, 1e3),
    reactanceAt100kHz: calcCapacitiveReactance(farads, 1e5),
    reactanceAt1MHz: calcCapacitiveReactance(farads, 1e6)
  };
}
