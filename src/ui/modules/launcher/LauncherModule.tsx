import React, { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { AppModuleId } from '../../../core/types';
import { DipIcon, DipIconName } from '../../theme/DipTraceIcons';

interface Props {
  onSwitchModule: (moduleId: AppModuleId) => void;
}

const MODULES: { id: AppModuleId; title: string; icon: DipIconName }[] = [
  { id: 'schematic', title: 'Редактор схем', icon: 'launcherSch' },
  { id: 'pcb', title: 'Редактор плат', icon: 'launcherPcb' },
  { id: 'componentEditor', title: 'Редактор компонентов', icon: 'launcherComp' },
  { id: 'patternEditor', title: 'Редактор посадочных мест', icon: 'launcherPat' },
  { id: 'pcb3d', title: '3D-просмотр платы', icon: 'launcher3d' }
];

/** Minimal DipTrace-style 5-module launcher window. */
export const LauncherModule: React.FC<Props> = ({ onSwitchModule }) => {
  const desktop = isTauri();
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
            title={desktop ? m.title : `${m.title} (Ctrl+клик — открыть в новой вкладке)`}
            onClick={(e) => {
              if (!desktop && (e.ctrlKey || e.metaKey)) {
                window.open(`?module=${m.id}`, '_blank');
              } else {
                onSwitchModule(m.id);
              }
            }}
            onAuxClick={(e) => {
              if (!desktop && e.button === 1) {
                e.preventDefault();
                window.open(`?module=${m.id}`, '_blank');
              }
            }}
          >
            <DipIcon name={m.icon} size={36} />
            <span>{m.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
