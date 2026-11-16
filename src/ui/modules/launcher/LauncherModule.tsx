import React, { useEffect } from 'react';
import { AppModuleId } from '../../../core/types';
import { DipIcon, DipIconName } from '../../theme/DipTraceIcons';

interface Props {
  onSwitchModule: (moduleId: AppModuleId) => void;
}

const MODULES: { id: AppModuleId; title: string; icon: DipIconName }[] = [
  { id: 'schematic', title: 'Схемотехника (Schematic Capture)', icon: 'launcherSch' },
  { id: 'pcb', title: 'Плата (PCB Layout & Autorouter)', icon: 'launcherPcb' },
  { id: 'componentEditor', title: 'Редактор компонентов (Component Editor)', icon: 'launcherComp' },
  { id: 'patternEditor', title: 'Редактор корпусов (Pattern Editor)', icon: 'launcherPat' },
  { id: 'pcb3d', title: '3D-просмотр платы (3D Preview)', icon: 'launcher3d' }
];

/** Minimal DipTrace-style 5-module launcher window. */
export const LauncherModule: React.FC<Props> = ({ onSwitchModule }) => {
  useEffect(() => {
    document.title = 'SIPTrace';
  }, []);

  return (
    <div className="dt-launcher-win">
      <div className="dt-launcher-inner">
        {MODULES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="dt-launcher-module-btn"
            onClick={() => onSwitchModule(m.id)}
          >
            <DipIcon name={m.icon} size={36} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
