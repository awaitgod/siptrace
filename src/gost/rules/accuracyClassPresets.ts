import { GostAccuracyClass, PcbDesignRules } from '../../core/types';

// ГОСТ 23751-86 / ГОСТ Р 53429-2009 — Классы точности печатных плат
export const GOST_ACCURACY_CLASS_PRESETS: Record<GostAccuracyClass, Omit<PcbDesignRules, 'realTimeDrc' | 'checkUnroutedNets' | 'checkSilkOverPads'>> = {
  1: {
    gostAccuracyClass: 1,
    clearanceTraceToTrace: 0.75,
    clearanceTraceToPad: 0.75,
    clearancePadToPad: 0.75,
    clearanceViaToAny: 0.75,
    clearanceHoleToHole: 0.50,
    clearanceCopperToBoard: 0.5,
    minTraceWidth: 0.75,
    defaultTraceWidth: 0.8,
    maxTraceWidth: 10.0,
    minViaOuter: 2.0,
    minViaHole: 1.0,
    minAnnularRing: 0.3,
    minSilkWidth: 0.2,
    silkToPadClearance: 0.25,
    diffPairMaxLengthMismatch: 1.0
  },
  2: {
    gostAccuracyClass: 2,
    clearanceTraceToTrace: 0.45,
    clearanceTraceToPad: 0.45,
    clearancePadToPad: 0.45,
    clearanceViaToAny: 0.45,
    clearanceHoleToHole: 0.35,
    clearanceCopperToBoard: 0.4,
    minTraceWidth: 0.45,
    defaultTraceWidth: 0.5,
    maxTraceWidth: 10.0,
    minViaOuter: 1.4,
    minViaHole: 0.7,
    minAnnularRing: 0.2,
    minSilkWidth: 0.18,
    silkToPadClearance: 0.2,
    diffPairMaxLengthMismatch: 0.5
  },
  3: {
    gostAccuracyClass: 3,
    clearanceTraceToTrace: 0.25,
    clearanceTraceToPad: 0.25,
    clearancePadToPad: 0.25,
    clearanceViaToAny: 0.25,
    clearanceHoleToHole: 0.25,
    clearanceCopperToBoard: 0.3,
    minTraceWidth: 0.25,
    defaultTraceWidth: 0.3,
    maxTraceWidth: 10.0,
    minViaOuter: 0.9,
    minViaHole: 0.45,
    minAnnularRing: 0.1,
    minSilkWidth: 0.15,
    silkToPadClearance: 0.15,
    diffPairMaxLengthMismatch: 0.25
  },
  4: {
    gostAccuracyClass: 4,
    clearanceTraceToTrace: 0.15,
    clearanceTraceToPad: 0.15,
    clearancePadToPad: 0.15,
    clearanceViaToAny: 0.15,
    clearanceHoleToHole: 0.20,
    clearanceCopperToBoard: 0.25,
    minTraceWidth: 0.15,
    defaultTraceWidth: 0.2,
    maxTraceWidth: 10.0,
    minViaOuter: 0.6,
    minViaHole: 0.3,
    minAnnularRing: 0.05,
    minSilkWidth: 0.12,
    silkToPadClearance: 0.12,
    diffPairMaxLengthMismatch: 0.15
  },
  5: {
    gostAccuracyClass: 5,
    clearanceTraceToTrace: 0.10,
    clearanceTraceToPad: 0.10,
    clearancePadToPad: 0.10,
    clearanceViaToAny: 0.10,
    clearanceHoleToHole: 0.15,
    clearanceCopperToBoard: 0.2,
    minTraceWidth: 0.10,
    defaultTraceWidth: 0.125,
    maxTraceWidth: 10.0,
    minViaOuter: 0.45,
    minViaHole: 0.2,
    minAnnularRing: 0.025,
    minSilkWidth: 0.10,
    silkToPadClearance: 0.1,
    diffPairMaxLengthMismatch: 0.05
  }
};

/** Builds PCB design rules from a GOST accuracy class preset. */
export function createGostDesignRules(accuracyClass: GostAccuracyClass = 4): PcbDesignRules {
  return {
    ...GOST_ACCURACY_CLASS_PRESETS[accuracyClass],
    realTimeDrc: true,
    checkUnroutedNets: true,
    checkSilkOverPads: true
  };
}
