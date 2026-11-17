import { DocumentErrorBoundary } from './ui/components/DocumentErrorBoundary';
import { useInteractionAccessibility } from './ui/components/interactionAccessibility';
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { AppModuleId } from './core/types';
import { loadSettings, STORAGE_KEYS } from './core/store';
import { LauncherModule } from './ui/modules/launcher/LauncherModule';
import { SchematicSplash } from './ui/modules/schematic/SchematicSplash';
const SchematicModule = React.lazy(() => import('./ui/modules/schematic/SchematicModule').then(m => ({ default: m.SchematicModule })));
const PcbModule = React.lazy(() => import('./ui/modules/pcb/PcbModule').then(m => ({ default: m.PcbModule })));
const ComponentEditorModule = React.lazy(() => import('./ui/modules/componentEditor/ComponentEditorModule').then(m => ({ default: m.ComponentEditorModule })));
const PatternEditorModule = React.lazy(() => import('./ui/modules/patternEditor/PatternEditorModule').then(m => ({ default: m.PatternEditorModule })));
const Pcb3dModule = React.lazy(() => import('./ui/modules/pcb3d/Pcb3dModule').then(m => ({ default: m.Pcb3dModule })));

function EditorReady({ children, onReady }: { children: React.ReactNode; onReady: () => void }) {
    useEffect(() => {
        let second = 0;
        const first = requestAnimationFrame(() => { second = requestAnimationFrame(onReady); });
        return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }, [onReady]);
    return <>{children}</>;
}

function EditorEntry({ moduleId, onSwitchModule }: { moduleId: Exclude<AppModuleId, 'launcher'>; onSwitchModule: (module: AppModuleId) => void }) {
    const [ready, setReady] = useState(false);
    const onReady = useCallback(() => setReady(true), []);
    const Editor = { schematic: SchematicModule, pcb: PcbModule, componentEditor: ComponentEditorModule, patternEditor: PatternEditorModule, pcb3d: Pcb3dModule }[moduleId];
    return <><Suspense fallback={null}><EditorReady onReady={onReady}><Editor onSwitchModule={onSwitchModule}/></EditorReady></Suspense><SchematicSplash ready={ready} moduleId={moduleId}/></>;
}
function resolveInitialModule(): AppModuleId {
    const params = new URLSearchParams(window.location.search);
    const m = params.get('module') as AppModuleId | null;
    if (m === 'launcher' ||
        m === 'schematic' ||
        m === 'pcb' ||
        m === 'componentEditor' ||
        m === 'patternEditor' ||
        m === 'pcb3d') {
        return m;
    }
    return 'launcher';
}
export const App: React.FC = () => {
    useInteractionAccessibility();
    useEffect(() => {
        const syncTheme = () => {
            document.documentElement.dataset.theme = loadSettings().colorScheme === 'dark' ? 'dark' : 'light';
        };
        const onStorage = (event: Event) => {
            const key = event instanceof StorageEvent ? event.key : (event as CustomEvent<{ key?: string }>).detail?.key;
            if (key === STORAGE_KEYS.SETTINGS || key === null) syncTheme();
        };
        syncTheme();
        window.addEventListener('siptrace:storage', onStorage);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener('siptrace:storage', onStorage);
            window.removeEventListener('storage', onStorage);
        };
    }, []);
    const [activeModule, setActiveModule] = useState<AppModuleId>(() => resolveInitialModule());
    const [launcherVisited, setLauncherVisited] = useState(activeModule === 'launcher');
    useEffect(() => {
        const onPop = () => {
            const module = resolveInitialModule();
            if (module === 'launcher') setLauncherVisited(true);
            setActiveModule(module);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);
    useEffect(() => {
        document.documentElement.classList.toggle('siptrace-launcher-window', activeModule === 'launcher' && isTauri());
    }, [activeModule]);
    const handleSwitchModule = (m: AppModuleId) => {
        if (m === activeModule) return;
        const url = new URL(window.location.href);
        url.searchParams.set('module', m);
        window.history.pushState({}, '', url.toString());
        if (m === 'launcher') setLauncherVisited(true);
        setActiveModule(m);
    };
    const launcherActive = activeModule === 'launcher';
    return <>
        {launcherVisited && <LauncherModule active={launcherActive} onSwitchModule={handleSwitchModule}/>}
        {activeModule !== 'launcher' && <DocumentErrorBoundary>
            <EditorEntry key={activeModule} moduleId={activeModule} onSwitchModule={handleSwitchModule}/>
        </DocumentErrorBoundary>}
    </>;
};
export default App;



