import React, { useEffect, useState } from 'react';
import './SchematicSplash.css';
import loader from './loader.svg';
import { AppModuleId } from '../../../core/types';

export function SchematicSplash({ ready, moduleId = 'schematic' }: { ready: boolean; moduleId?: Exclude<AppModuleId, 'launcher'> }) {
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!ready) return;
    const start = window.setTimeout(() => setLeaving(true), 100);
    const end = window.setTimeout(() => setVisible(false), 350);
    return () => { window.clearTimeout(start); window.clearTimeout(end); };
  }, [ready]);
  if (!visible) return null;
  const labels = { schematic: 'Открываем редактор схем', pcb: 'Открываем редактор плат', componentEditor: 'Открываем редактор компонентов', patternEditor: 'Открываем редактор посадочных мест', pcb3d: 'Открываем 3D-просмотр платы' };
  return <div className={`sch-splash${leaving ? ' sch-splash--leaving' : ''}`} role="status" aria-label={labels[moduleId]}>
    <img className="sch-splash__ready-loader" src={loader} alt="" />
  </div>;
}


