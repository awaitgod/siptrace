import { GostTitleBlockData } from '../../core/types';
import { loadSettings } from '../../core/store';

/** Creates default GOST 2.104-2006 Form 1 title block metadata seeded from user settings. */
export function createDefaultGostTitleBlock(overrides?: Partial<GostTitleBlockData>): GostTitleBlockData {
  const s = loadSettings();
  return {
    enabled: true,
    form: 'Form1',
    showZones: true,
    showCornerStamp26: true,
    designation: 'ГТРС.468364.001 Э3',
    name: 'Гальваническая развязка RS-485',
    subName: 'Схема электрическая принципиальная',
    organization: s.organization || 'АО «НИИ Приборостроения»',
    litera: 'О',
    mass: '—',
    scale: '—',
    sheetNumber: 1,
    totalSheets: 1,
    developer: s.authorName || 'Иванов А.С.',
    checker: s.checkerName || 'Петров В.И.',
    techControl: '',
    normControl: s.normControlName || 'Сидорова Е.М.',
    approver: s.approverName || 'Кузнецов Д.Н.',
    date: '16.11.2026',
    documentCode: 'Э3',
    ...overrides
  };
}
