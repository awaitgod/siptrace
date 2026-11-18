import { PadDef, PatternDef, PatternGraphic, Model3DShapeType } from '../core/types';
import { PatternGeneratorFamily, PatternGeneratorParams, generateParametricPattern } from './patternGenerator';

export type { PatternGeneratorFamily, PatternGeneratorParams };
export { generateParametricPattern };

/**
 * IPC-7351A/B Land Pattern Density Levels:
 * - Level A (Most / Maximum Material Condition - M): Large solder fillet, high reliability, military/automotive.
 * - Level B (Nominal / Median Material Condition - N): Standard commercial production, balanced density and yield.
 * - Level C (Least / Minimum Material Condition - L): High density, portable/handheld devices, fine pitch.
 */
export type IpcDensityLevel = 'A' | 'B' | 'C';

/**
 * Lead types defined in IPC-7351B
 */
export type IpcLeadType =
  | 'Gullwing'       // SOIC, SOP, TSSOP, MSOP, QFP, LQFP, TQFP
  | 'Chip'           // Resistors, Capacitors, Inductors (0201 to 2512)
  | 'NoLead'         // QFN, DFN, SON
  | 'BGA'            // Ball Grid Array
  | 'JLead'          // PLCC, SOJ
  | 'ThroughHole';   // DIP, SIP, Header, Axial, Radial

/**
 * IPC-7351 Fillet Goals (in mm)
 */
export interface IpcFilletGoals {
  toe: number;      // J_T: Outward extension past lead toe
  heel: number;     // J_H: Inward extension past lead heel
  side: number;     // J_S: Lateral extension past lead edge
  courtyard: number;// Excess clearance beyond maximum body/pad boundary
}

/**
 * Standard IPC-7351B Fillet Goal tables by lead type and density level
 */
export const IPC_7351_FILLET_TABLE: Record<IpcLeadType, Record<IpcDensityLevel, IpcFilletGoals>> = {
  Gullwing: {
    A: { toe: 0.55, heel: 0.45, side: 0.05, courtyard: 0.50 },
    B: { toe: 0.35, heel: 0.35, side: 0.03, courtyard: 0.25 },
    C: { toe: 0.15, heel: 0.25, side: 0.01, courtyard: 0.12 }
  },
  Chip: {
    A: { toe: 0.55, heel: 0.00, side: 0.05, courtyard: 0.50 },
    B: { toe: 0.35, heel: 0.00, side: 0.00, courtyard: 0.25 },
    C: { toe: 0.15, heel: 0.00, side: -0.05, courtyard: 0.12 }
  },
  NoLead: {
    A: { toe: 0.40, heel: 0.10, side: 0.05, courtyard: 0.50 },
    B: { toe: 0.30, heel: 0.05, side: 0.00, courtyard: 0.25 },
    C: { toe: 0.20, heel: 0.00, side: -0.04, courtyard: 0.12 }
  },
  BGA: {
    A: { toe: 0.00, heel: 0.00, side: 0.00, courtyard: 0.50 },
    B: { toe: 0.00, heel: 0.00, side: 0.00, courtyard: 0.25 },
    C: { toe: 0.00, heel: 0.00, side: 0.00, courtyard: 0.12 }
  },
  JLead: {
    A: { toe: 0.55, heel: 0.50, side: 0.10, courtyard: 0.50 },
    B: { toe: 0.35, heel: 0.40, side: 0.05, courtyard: 0.25 },
    C: { toe: 0.15, heel: 0.30, side: 0.01, courtyard: 0.12 }
  },
  ThroughHole: {
    A: { toe: 0.30, heel: 0.30, side: 0.30, courtyard: 0.50 },
    B: { toe: 0.20, heel: 0.20, side: 0.20, courtyard: 0.25 },
    C: { toe: 0.15, heel: 0.15, side: 0.15, courtyard: 0.15 }
  }
};

/**
 * Component physical geometry inputs for IPC-7351 calculation
 */
export interface IpcComponentDimensions {
  leadType: IpcLeadType;
  /** Overall component length (tip-to-tip across leads, mm) */
  overallSpanNom: number;
  overallSpanTol: number;
  /** Component body length / width (mm) */
  bodyLengthNom: number;
  bodyLengthTol: number;
  bodyWidthNom: number;
  bodyWidthTol: number;
  bodyHeightNom: number;
  /** Lead contact length / terminal thickness (mm) */
  leadContactNom: number;
  leadContactTol: number;
  /** Lead width (mm) */
  leadWidthNom: number;
  leadWidthTol: number;
  /** Lead pitch (mm) */
  pitch: number;
  /** Fabrication allowance (etch tolerance F, mm) */
  fabricationTol?: number;
  /** Placement accuracy allowance (P, mm) */
  placementAccuracy?: number;
}

/**
 * Calculated IPC-7351 land pattern dimensions
 */
export interface IpcCalculationResult {
  /** Maximum overall outer span (Z_max, mm) */
  zMax: number;
  /** Minimum inner clear span between pads (G_min, mm) */
  gMin: number;
  /** Pad dimension along lead longitudinal axis (Y, mm) */
  padLength: number;
  /** Pad dimension lateral / width along lead pitch (X, mm) */
  padWidth: number;
  /** Center-to-center pad span (C, mm) */
  padCenterSpan: number;
  /** Courtyard dimensions (width x height, mm) */
  courtyardWidth: number;
  courtyardHeight: number;
  /** Recommended solder mask expansion (mm) */
  solderMaskExpansion: number;
  /** Recommended paste mask expansion (mm) */
  pasteMaskExpansion: number;
}

/**
 * Computes IPC-7351A/B mathematical formulas for land pattern geometry:
 * Z_max = L_min + 2*J_T + sqrt(C_L^2 + F^2 + P^2)
 * G_min = S_max - 2*J_H - sqrt(C_S^2 + F^2 + P^2)
 * X_max = W_min + 2*J_S + sqrt(C_W^2 + F^2 + P^2)
 * Pad Length Y = (Z_max - G_min) / 2
 * Pad Center C = (Z_max + G_min) / 2
 */
export function calculateIpc7351LandPattern(
  comp: IpcComponentDimensions,
  density: IpcDensityLevel = 'B'
): IpcCalculationResult {
  const fillets = IPC_7351_FILLET_TABLE[comp.leadType][density];
  const F = comp.fabricationTol ?? (density === 'A' ? 0.10 : density === 'B' ? 0.08 : 0.05);
  const P = comp.placementAccuracy ?? (density === 'A' ? 0.05 : density === 'B' ? 0.04 : 0.025);

  const lMin = comp.overallSpanNom - comp.overallSpanTol / 2;
  const lMax = comp.overallSpanNom + comp.overallSpanTol / 2;
  const tMin = Math.max(0.1, comp.leadContactNom - comp.leadContactTol / 2);
  const tMax = comp.leadContactNom + comp.leadContactTol / 2;
  const sMax = lMax - 2 * tMin; // Inner span maximum
  const wMin = Math.max(0.08, comp.leadWidthNom - comp.leadWidthTol / 2);

  // Component tolerances
  const cL = comp.overallSpanTol;
  const cS = Math.sqrt(comp.overallSpanTol ** 2 + 4 * (comp.leadContactTol ** 2));
  const cW = comp.leadWidthTol;

  // Statistical RMS tolerance values
  const sL = Math.sqrt(cL ** 2 + F ** 2 + P ** 2);
  const sS = Math.sqrt(cS ** 2 + F ** 2 + P ** 2);
  const sW = Math.sqrt(cW ** 2 + F ** 2 + P ** 2);

  // Calculate Z_max, G_min, X_max
  const zMax = Number((lMin + 2 * fillets.toe + sL).toFixed(3));
  const gMin = Number((Math.max(0.1, sMax - 2 * fillets.heel - sS)).toFixed(3));
  const padLength = Number(((zMax - gMin) / 2).toFixed(3));
  const padCenterSpan = Number(((zMax + gMin) / 2).toFixed(3));
  const padWidth = Number((wMin + 2 * fillets.side + sW).toFixed(3));

  // Courtyard calculation
  const cyExcess = fillets.courtyard;
  const courtyardWidth = Number((Math.max(comp.bodyLengthNom + cyExcess * 2, zMax + cyExcess * 2)).toFixed(2));
  const courtyardHeight = Number((Math.max(comp.bodyWidthNom + cyExcess * 2, comp.pitch > 0 ? padWidth + cyExcess * 2 : padWidth)).toFixed(2));

  // Mask margins
  const solderMaskExpansion = density === 'A' ? 0.075 : density === 'B' ? 0.05 : 0.035;
  const pasteMaskExpansion = 0.0;

  return {
    zMax,
    gMin,
    padLength,
    padWidth,
    padCenterSpan,
    courtyardWidth,
    courtyardHeight,
    solderMaskExpansion,
    pasteMaskExpansion
  };
}

/**
 * Standard Two-Pin Chip Component Presets (IPC-7351B)
 * Resistors and Capacitors 0201, 0402, 0603, 0805, 1206, 1210, 2512
 */
export interface ChipPresetDef {
  imperialName: string;
  metricName: string;
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  padWidth: number;  // Y dimension
  padLength: number; // X dimension
  rowSpacing: number;// Center-to-center pad span
}

export const IPC_CHIP_PRESETS: Record<string, ChipPresetDef> = {
  '0201': { imperialName: '0201', metricName: '0603M', bodyLength: 0.60, bodyWidth: 0.30, bodyHeight: 0.25, padWidth: 0.35, padLength: 0.35, rowSpacing: 0.60 },
  '0402': { imperialName: '0402', metricName: '1005M', bodyLength: 1.00, bodyWidth: 0.50, bodyHeight: 0.35, padWidth: 0.60, padLength: 0.55, rowSpacing: 0.95 },
  '0603': { imperialName: '0603', metricName: '1608M', bodyLength: 1.60, bodyWidth: 0.80, bodyHeight: 0.45, padWidth: 0.95, padLength: 0.90, rowSpacing: 1.55 },
  '0805': { imperialName: '0805', metricName: '2012M', bodyLength: 2.00, bodyWidth: 1.25, bodyHeight: 0.60, padWidth: 1.35, padLength: 1.05, rowSpacing: 1.90 },
  '1206': { imperialName: '1206', metricName: '3216M', bodyLength: 3.20, bodyWidth: 1.60, bodyHeight: 0.70, padWidth: 1.75, padLength: 1.20, rowSpacing: 3.00 },
  '1210': { imperialName: '1210', metricName: '3225M', bodyLength: 3.20, bodyWidth: 2.50, bodyHeight: 0.80, padWidth: 2.60, padLength: 1.20, rowSpacing: 3.00 },
  '2512': { imperialName: '2512', metricName: '6432M', bodyLength: 6.40, bodyWidth: 3.20, bodyHeight: 0.90, padWidth: 3.35, padLength: 1.35, rowSpacing: 5.75 }
};

/**
 * Standard SOIC / SOP / TSSOP / MSOP Presets
 */
export interface GullwingPresetDef {
  name: string;
  family: 'SOIC';
  pinCount: number;
  pitch: number;
  rowSpacing: number; // pad center-to-center span
  padWidth: number;   // pad length (along lead)
  padHeight: number;  // pad width (along pitch)
  bodyWidth: number;
  bodyLength: number;
  bodyHeight: number;
}

export const IPC_GULLWING_PRESETS: Record<string, GullwingPresetDef> = {
  'SOIC-8':   { name: 'SOIC-8',   family: 'SOIC', pinCount: 8,  pitch: 1.27, rowSpacing: 5.40, padWidth: 1.55, padHeight: 0.65, bodyWidth: 3.90, bodyLength: 4.90, bodyHeight: 1.50 },
  'SOIC-14':  { name: 'SOIC-14',  family: 'SOIC', pinCount: 14, pitch: 1.27, rowSpacing: 5.40, padWidth: 1.55, padHeight: 0.65, bodyWidth: 3.90, bodyLength: 8.65, bodyHeight: 1.50 },
  'SOIC-16':  { name: 'SOIC-16',  family: 'SOIC', pinCount: 16, pitch: 1.27, rowSpacing: 5.40, padWidth: 1.55, padHeight: 0.65, bodyWidth: 3.90, bodyLength: 9.90, bodyHeight: 1.50 },
  'SOIC-16W': { name: 'SOIC-16W', family: 'SOIC', pinCount: 16, pitch: 1.27, rowSpacing: 9.30, padWidth: 2.00, padHeight: 0.65, bodyWidth: 7.50, bodyLength: 10.30, bodyHeight: 2.35 },
  'SOP-8':    { name: 'SOP-8',    family: 'SOIC', pinCount: 8,  pitch: 0.65, rowSpacing: 5.40, padWidth: 1.45, padHeight: 0.40, bodyWidth: 3.90, bodyLength: 3.00, bodyHeight: 1.40 },
  'TSSOP-14': { name: 'TSSOP-14', family: 'SOIC', pinCount: 14, pitch: 0.65, rowSpacing: 5.70, padWidth: 1.35, padHeight: 0.40, bodyWidth: 4.40, bodyLength: 5.00, bodyHeight: 1.10 },
  'TSSOP-16': { name: 'TSSOP-16', family: 'SOIC', pinCount: 16, pitch: 0.65, rowSpacing: 5.70, padWidth: 1.35, padHeight: 0.40, bodyWidth: 4.40, bodyLength: 5.00, bodyHeight: 1.10 },
  'TSSOP-20': { name: 'TSSOP-20', family: 'SOIC', pinCount: 20, pitch: 0.65, rowSpacing: 5.70, padWidth: 1.35, padHeight: 0.40, bodyWidth: 4.40, bodyLength: 6.50, bodyHeight: 1.10 },
  'MSOP-8':   { name: 'MSOP-8',   family: 'SOIC', pinCount: 8,  pitch: 0.65, rowSpacing: 4.40, padWidth: 1.25, padHeight: 0.40, bodyWidth: 3.00, bodyLength: 3.00, bodyHeight: 1.10 },
  'MSOP-10':  { name: 'MSOP-10',  family: 'SOIC', pinCount: 10, pitch: 0.50, rowSpacing: 4.40, padWidth: 1.25, padHeight: 0.30, bodyWidth: 3.00, bodyLength: 3.00, bodyHeight: 1.10 }
};

/**
 * Standard QFP / LQFP / TQFP Presets (4-sided gullwing)
 */
export interface QfpPresetDef {
  name: string;
  pinCount: number;
  pitch: number;
  rowSpacing: number; // pad center-to-center span across opposing rows
  padWidth: number;   // radial pad length
  padHeight: number;  // tangential pad width
  bodyWidth: number;
  bodyLength: number;
  bodyHeight: number;
}

export const IPC_QFP_PRESETS: Record<string, QfpPresetDef> = {
  'QFP-32_0.8':  { name: 'QFP-32_0.8',  pinCount: 32,  pitch: 0.80, rowSpacing: 9.00, padWidth: 1.50, padHeight: 0.50, bodyWidth: 7.00, bodyLength: 7.00, bodyHeight: 1.40 },
  'QFP-44_0.8':  { name: 'QFP-44_0.8',  pinCount: 44,  pitch: 0.80, rowSpacing: 12.0, padWidth: 1.50, padHeight: 0.50, bodyWidth: 10.0, bodyLength: 10.0, bodyHeight: 2.00 },
  'LQFP-48_0.5': { name: 'LQFP-48_0.5', pinCount: 48,  pitch: 0.50, rowSpacing: 8.40, padWidth: 1.30, padHeight: 0.30, bodyWidth: 7.00,  bodyLength: 7.00,  bodyHeight: 1.40 },
  'LQFP-64_0.5': { name: 'LQFP-64_0.5', pinCount: 64,  pitch: 0.50, rowSpacing: 11.4, padWidth: 1.30, padHeight: 0.30, bodyWidth: 10.0, bodyLength: 10.0, bodyHeight: 1.40 },
  'TQFP-100_0.4':{ name: 'TQFP-100_0.4',pinCount: 100, pitch: 0.40, rowSpacing: 15.4, padWidth: 1.15, padHeight: 0.22, bodyWidth: 14.0, bodyLength: 14.0, bodyHeight: 1.00 },
  'TQFP-100_0.5':{ name: 'TQFP-100_0.5',pinCount: 100, pitch: 0.50, rowSpacing: 15.4, padWidth: 1.30, padHeight: 0.30, bodyWidth: 14.0, bodyLength: 14.0, bodyHeight: 1.00 }
};

/**
 * Standard QFN / DFN Presets (Leadless with Exposed Thermal Pad)
 */
export interface QfnDfnPresetDef {
  name: string;
  family: 'QFN' | 'DFN';
  pinCount: number;
  pitch: number;
  rowSpacing: number;
  padWidth: number;
  padHeight: number;
  bodyWidth: number;
  bodyLength: number;
  bodyHeight: number;
  thermalPadSize: number;
}

export const IPC_QFN_DFN_PRESETS: Record<string, QfnDfnPresetDef> = {
  'DFN-6_2x2':    { name: 'DFN-6_2x2',    family: 'DFN', pinCount: 6,  pitch: 0.65, rowSpacing: 1.90, padWidth: 0.65, padHeight: 0.30, bodyWidth: 2.0, bodyLength: 2.0, bodyHeight: 0.75, thermalPadSize: 1.20 },
  'DFN-8_3x3':    { name: 'DFN-8_3x3',    family: 'DFN', pinCount: 8,  pitch: 0.50, rowSpacing: 2.80, padWidth: 0.70, padHeight: 0.28, bodyWidth: 3.0, bodyLength: 3.0, bodyHeight: 0.75, thermalPadSize: 1.70 },
  'QFN-16_3x3':   { name: 'QFN-16_3x3',   family: 'QFN', pinCount: 16, pitch: 0.50, rowSpacing: 2.85, padWidth: 0.75, padHeight: 0.28, bodyWidth: 3.0, bodyLength: 3.0, bodyHeight: 0.85, thermalPadSize: 1.65 },
  'QFN-24_4x4':   { name: 'QFN-24_4x4',   family: 'QFN', pinCount: 24, pitch: 0.50, rowSpacing: 3.85, padWidth: 0.80, padHeight: 0.28, bodyWidth: 4.0, bodyLength: 4.0, bodyHeight: 0.85, thermalPadSize: 2.45 },
  'QFN-32_5x5':   { name: 'QFN-32_5x5',   family: 'QFN', pinCount: 32, pitch: 0.50, rowSpacing: 4.85, padWidth: 0.85, padHeight: 0.28, bodyWidth: 5.0, bodyLength: 5.0, bodyHeight: 0.85, thermalPadSize: 3.20 },
  'QFN-48_7x7':   { name: 'QFN-48_7x7',   family: 'QFN', pinCount: 48, pitch: 0.50, rowSpacing: 6.85, padWidth: 0.85, padHeight: 0.28, bodyWidth: 7.0, bodyLength: 7.0, bodyHeight: 0.85, thermalPadSize: 5.10 }
};

/**
 * Standard BGA Presets (IPC-7351B NSMD Pad Diameters)
 * 1.0mm pitch -> 0.45-0.50mm pad
 * 0.8mm pitch -> 0.40mm pad
 * 0.5mm pitch -> 0.30mm pad
 * 0.4mm pitch -> 0.25mm pad
 */
export interface BgaPresetDef {
  name: string;
  pinCount: number;
  pitch: number;
  cols: number;
  rows: number;
  padDiameter: number;
  bodyWidth: number;
  bodyLength: number;
  bodyHeight: number;
}

export const IPC_BGA_PRESETS: Record<string, BgaPresetDef> = {
  'BGA-16_1.0':  { name: 'BGA-16_1.0',  pinCount: 16,  pitch: 1.00, cols: 4,  rows: 4,  padDiameter: 0.50, bodyWidth: 5.0,  bodyLength: 5.0,  bodyHeight: 1.20 },
  'BGA-64_0.8':  { name: 'BGA-64_0.8',  pinCount: 64,  pitch: 0.80, cols: 8,  rows: 8,  padDiameter: 0.40, bodyWidth: 8.0,  bodyLength: 8.0,  bodyHeight: 1.20 },
  'BGA-100_0.8': { name: 'BGA-100_0.8', pinCount: 100, pitch: 0.80, cols: 10, rows: 10, padDiameter: 0.40, bodyWidth: 10.0, bodyLength: 10.0, bodyHeight: 1.20 },
  'BGA-144_0.8': { name: 'BGA-144_0.8', pinCount: 144, pitch: 0.80, cols: 12, rows: 12, padDiameter: 0.40, bodyWidth: 12.0, bodyLength: 12.0, bodyHeight: 1.40 },
  'BGA-256_1.0': { name: 'BGA-256_1.0', pinCount: 256, pitch: 1.00, cols: 16, rows: 16, padDiameter: 0.50, bodyWidth: 17.0, bodyLength: 17.0, bodyHeight: 1.60 },
  'BGA-256_0.5': { name: 'BGA-256_0.5', pinCount: 256, pitch: 0.50, cols: 16, rows: 16, padDiameter: 0.30, bodyWidth: 9.0,  bodyLength: 9.0,  bodyHeight: 1.10 }
};

/**
 * Standard Through-Hole Presets (DIP, SIP)
 */
export interface ThdPresetDef {
  name: string;
  family: 'DIP' | 'SIP';
  pinCount: number;
  pitch: number;
  rowSpacing: number;
  padWidth: number;
  padHeight: number;
  holeDiameter: number;
  bodyWidth: number;
  bodyLength: number;
  bodyHeight: number;
}

export const IPC_THD_PRESETS: Record<string, ThdPresetDef> = {
  'DIP-8':  { name: 'DIP-8',  family: 'DIP', pinCount: 8,  pitch: 2.54, rowSpacing: 7.62, padWidth: 1.60, padHeight: 1.60, holeDiameter: 0.85, bodyWidth: 6.4, bodyLength: 9.6,  bodyHeight: 3.4 },
  'DIP-14': { name: 'DIP-14', family: 'DIP', pinCount: 14, pitch: 2.54, rowSpacing: 7.62, padWidth: 1.60, padHeight: 1.60, holeDiameter: 0.85, bodyWidth: 6.4, bodyLength: 19.0, bodyHeight: 3.4 },
  'DIP-16': { name: 'DIP-16', family: 'DIP', pinCount: 16, pitch: 2.54, rowSpacing: 7.62, padWidth: 1.60, padHeight: 1.60, holeDiameter: 0.85, bodyWidth: 6.4, bodyLength: 20.0, bodyHeight: 3.4 },
  'DIP-28': { name: 'DIP-28', family: 'DIP', pinCount: 28, pitch: 2.54, rowSpacing: 15.24,padWidth: 1.80, padHeight: 1.80, holeDiameter: 0.90, bodyWidth: 14.5,bodyLength: 35.6, bodyHeight: 4.0 },
  'SIP-4':  { name: 'SIP-4',  family: 'SIP', pinCount: 4,  pitch: 2.54, rowSpacing: 0.00, padWidth: 1.70, padHeight: 1.70, holeDiameter: 0.90, bodyWidth: 2.8, bodyLength: 10.2, bodyHeight: 5.0 },
  'SIP-8':  { name: 'SIP-8',  family: 'SIP', pinCount: 8,  pitch: 2.54, rowSpacing: 0.00, padWidth: 1.70, padHeight: 1.70, holeDiameter: 0.90, bodyWidth: 2.8, bodyLength: 20.4, bodyHeight: 5.0 },
  'SIP-10': { name: 'SIP-10', family: 'SIP', pinCount: 10, pitch: 2.54, rowSpacing: 0.00, padWidth: 1.70, padHeight: 1.70, holeDiameter: 0.90, bodyWidth: 2.8, bodyLength: 25.4, bodyHeight: 5.0 }
};

/**
 * Calculates standard IPC Through-Hole pad dimensions:
 * Minimum hole diameter = Max lead diameter + 0.25mm (A) / 0.20mm (B) / 0.15mm (C)
 * Minimum annular ring = Hole diameter + 0.50mm (A) / + 0.40mm (B) / + 0.30mm (C)
 */
export function calculateIpcThroughHolePad(
  leadDiameter: number,
  density: IpcDensityLevel = 'B'
): { holeDiameter: number; padDiameter: number; annularRing: number } {
  const holeOffset = density === 'A' ? 0.25 : density === 'B' ? 0.20 : 0.15;
  const annularOffset = density === 'A' ? 0.50 : density === 'B' ? 0.40 : 0.30;
  const holeDiameter = Number((leadDiameter + holeOffset).toFixed(2));
  const padDiameter = Number((holeDiameter + annularOffset).toFixed(2));
  const annularRing = Number(((padDiameter - holeDiameter) / 2).toFixed(2));
  return { holeDiameter, padDiameter, annularRing };
}
