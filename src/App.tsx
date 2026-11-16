import React, { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { AppModuleId } from './core/types';
import { LauncherModule } from './ui/modules/launcher/LauncherModule';
import { SchematicModule } from './ui/modules/schematic/SchematicModule';
import { PcbModule } from './ui/modules/pcb/PcbModule';
import { ComponentEditorModule } from './ui/modules/componentEditor/ComponentEditorModule';
import { PatternEditorModule } from './ui/modules/patternEditor/PatternEditorModule';
import { Pcb3dModule } from './ui/modules/pcb3d/Pcb3dModule';

function resolveInitialModule(): AppModuleId {
  const params = new URLSearchParams(window.location.search);
  const m = params.get('module') as AppModuleId | null;
  if (
    m === 'launcher' ||
    m === 'schematic' ||
    m === 'pcb' ||
    m === 'componentEditor' ||
    m === 'patternEditor' ||
    m === 'pcb3d'
  ) {
    return m;
  }
  return 'launcher';
}

export const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<AppModuleId>(() => resolveInitialModule());
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    const onPop = () => setActiveModule(resolveInitialModule());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const first = isFirstRenderRef.current;
    isFirstRenderRef.current = false;
    if (!isTauri()) return;
    if (first && activeModule === 'launcher') return;
    invoke('set_module_window_size', { isLauncher: activeModule === 'launcher' }).catch(() => {});
  }, [activeModule]);

  const handleSwitchModule = (m: AppModuleId) => {
    const url = new URL(window.location.href);
    url.searchParams.set('module', m);
    window.history.pushState({}, '', url.toString());
    setActiveModule(m);
  };

  switch (activeModule) {
    case 'schematic':
      return <SchematicModule onSwitchModule={handleSwitchModule} />;
    case 'pcb':
      return <PcbModule onSwitchModule={handleSwitchModule} />;
    case 'componentEditor':
      return <ComponentEditorModule onSwitchModule={handleSwitchModule} />;
    case 'patternEditor':
      return <PatternEditorModule onSwitchModule={handleSwitchModule} />;
    case 'pcb3d':
      return <Pcb3dModule onSwitchModule={handleSwitchModule} />;
    default:
      return <LauncherModule onSwitchModule={handleSwitchModule} />;
  }
};

export default App;
