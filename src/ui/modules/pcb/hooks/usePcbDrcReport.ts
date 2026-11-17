import { useCallback, useState } from 'react';
import { DrcError, PcbProject } from '../../../../core/types';
import { runPcbDrc } from '../../../../engines/drc';

export type PcbDrcReport =
  | { status: 'not-run' | 'stale' }
  | { status: 'current'; issues: DrcError[] };

const drcInputs = [
  'components', 'traces', 'vias', 'copperPours', 'boardOutline', 'cutouts',
  'keepouts', 'shapes', 'designRules', 'netClasses', 'netClassAssignments',
  'diffPairs', 'drcWaivers', 'layerCount'
] as const satisfies readonly (keyof PcbProject)[];

export const NO_DRC_ISSUES: DrcError[] = [];

export function usePcbDrcReport(pcb: PcbProject) {
  const [lastRun, setLastRun] = useState<{ board: PcbProject; issues: DrcError[] } | null>(null);
  const report: PcbDrcReport = !lastRun
    ? { status: 'not-run' }
    : drcInputs.every((key) => pcb[key] === lastRun.board[key])
      ? { status: 'current', issues: lastRun.issues }
      : { status: 'stale' };

  const runDrc = useCallback(() => {
    const issues = runPcbDrc(pcb);
    setLastRun({ board: pcb, issues });
    const errors = issues.filter((issue) => issue.severity === 'Error').length;
    const warnings = issues.length - errors;
    return issues.length === 0
      ? 'Проверка DRC завершена. Нарушений не обнаружено.'
      : `Проверка DRC: ошибок ${errors}, предупреждений ${warnings}.`;
  }, [pcb]);

  const clearDrc = useCallback(() => setLastRun(null), []);
  return { report, runDrc, clearDrc };
}
