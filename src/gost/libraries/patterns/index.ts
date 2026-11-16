import { PatternDef, PatternLibrary } from '../../../core/types';
import { passivePatterns } from './passivePatterns';
import { semiPatterns } from './semiPatterns';
import { icPatterns } from './icPatterns';
import { connPatterns } from './connPatterns';
import {
  labExtraConnAndModulePatterns,
  labExtraIcPatterns,
  labExtraSemiAndPassivePatterns
} from './labPatterns';

export const GOST_PATTERN_LIBRARIES: PatternLibrary[] = [
  {
    id: 'lib_pat_passive',
    name: 'Корпуса пассивных ЭРЭ (ГОСТ)',
    description: 'Резисторы, конденсаторы, индуктивности по ОСТ/ГОСТ и метрике МЭК',
    patterns: [...passivePatterns, ...labExtraSemiAndPassivePatterns.filter((p) => ['PAT_POT_SP3_4', 'PAT_RES_NET_4', 'PAT_FUSE_1812'].includes(p.id))]
  },
  {
    id: 'lib_pat_semi',
    name: 'Корпуса полупроводников (ГОСТ)',
    description: 'Диоды, светодиоды, транзисторы, стабилизаторы (КТ-13, КТ-26, КТ-27, КТ-28, SOT-223)',
    patterns: [...semiPatterns, ...labExtraSemiAndPassivePatterns.filter((p) => ['PAT_SOT223', 'PAT_SOT23_5'].includes(p.id))]
  },
  {
    id: 'lib_pat_ic',
    name: 'Корпуса микросхем ИМС (ГОСТ)',
    description: 'Корпуса по ГОСТ 17467-88 (DIP-8..40, SOIC, SSOP, TQFP, LQFP)',
    patterns: [...icPatterns, ...labExtraIcPatterns]
  },
  {
    id: 'lib_pat_conn',
    name: 'Корпуса соединителей, индикаторов и модулей (ГОСТ)',
    description: 'Соединители ПЛС/ПЛД/ICSP/USB/DB-9, ЖКИ 16×2, АЛС324, энкодер EC11',
    patterns: [...connPatterns, ...labExtraConnAndModulePatterns]
  }
];

export const ALL_GOST_PATTERNS: PatternDef[] = GOST_PATTERN_LIBRARIES.flatMap((l) => l.patterns);

export function findPatternById(id: string, customPatterns?: Record<string, PatternDef>): PatternDef | undefined {
  if (customPatterns && customPatterns[id]) return customPatterns[id];
  return ALL_GOST_PATTERNS.find((p) => p.id === id) ?? ALL_GOST_PATTERNS.find((p) => p.name === id);
}
