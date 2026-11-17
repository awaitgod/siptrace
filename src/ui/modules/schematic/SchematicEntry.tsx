import React, { Suspense, useEffect, useState } from 'react';
import { AppModuleId } from '../../../core/types';
import { SchematicSplash } from './SchematicSplash';

const SchematicModule = React.lazy(() => import('./SchematicModule').then(module => ({ default: module.SchematicModule })));

function ReadyEditor({ onSwitchModule, onReady }: { onSwitchModule: (module: AppModuleId) => void; onReady: () => void }) {
  useEffect(() => { const frame = requestAnimationFrame(() => requestAnimationFrame(onReady)); return () => cancelAnimationFrame(frame); }, [onReady]);
  return <SchematicModule onSwitchModule={onSwitchModule} />;
}

export function SchematicEntry({ onSwitchModule }: { onSwitchModule: (module: AppModuleId) => void }) {
  const [ready, setReady] = useState(false);
  return <><Suspense fallback={null}><ReadyEditor onSwitchModule={onSwitchModule} onReady={React.useCallback(() => setReady(true), [])} /></Suspense><SchematicSplash ready={ready} /></>;
}
