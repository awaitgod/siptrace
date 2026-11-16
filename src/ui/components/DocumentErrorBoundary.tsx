import React from 'react';
import { pickCadFile } from '../../core/utils/fileIo';
import { importCadSchematic } from '../../engines/importers';
import { STORAGE_KEYS } from '../../core/persistence/storageKeys';
export class DocumentErrorBoundary extends React.Component<{
    children: React.ReactNode;
}, {
    error: string | null;
}> {
    state: {
        error: string | null;
    } = { error: null };
    static getDerivedStateFromError(error: Error) { return { error: error.message }; }
    render() { if (!this.state.error)
        return this.props.children; return <main style={{ padding: 30, fontFamily: 'Segoe UI' }}><h1>Не удалось открыть документ</h1><p role="alert">{this.state.error}</p><p>Исходная локальная копия сохранена. Можно выгрузить её для восстановления или открыть исправленный файл.</p><button onClick={() => { const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SCHEMATIC) ?? ''; const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'schematic-recovery.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Скачать исходные данные</button><button onClick={async () => { try {
        const f = await pickCadFile('.gostsch,.json');
        if (!f)
            return;
        const result = await importCadSchematic(f.bytes, f.name);
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHEMATIC, JSON.stringify(result.project));
        location.reload();
    }
    catch (e) {
        this.setState({ error: String(e) });
    } }}>Открыть исправленную схему</button><button onClick={() => { const backup = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_SCHEMATIC + '.backup'); if (backup) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHEMATIC, backup);
        location.reload();
    }
    else
        this.setState({ error: 'Резервная копия в этой сессии отсутствует.' }); }}>Восстановить резервную копию</button></main>; }
}
