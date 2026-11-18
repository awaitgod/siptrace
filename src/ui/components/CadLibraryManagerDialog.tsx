import React, { useEffect, useMemo, useState } from 'react';
import { ComponentDef, PatternDef } from '../../core/types';
import {
  CadLibraryBundle,
  createUserLibrary,
  deleteImportedLibraryBundle,
  deleteUserComponent,
  deleteUserPattern,
  duplicateUserComponent,
  duplicateUserPattern,
  exportLibraryBundleAsGostlib,
  loadImportedLibraryBundles,
  loadUserComponents,
  loadUserPatterns,
  registerImportedLibraryBundle,
  subscribeEdaEvents
} from '../../core/store';
import { pickCadFiles, saveTextFile } from '../../core/utils/fileIo';
import { importExternalCadLibrary } from '../../engines/importers';
import { findPatternById } from '../../gost/libraries/gostPatterns';
import { PatternPreviewCanvas, SymbolPreviewCanvas } from './CadPreviewCanvas';
import './CadLibraryManagerDialog.css';

export interface CadLibraryManagerDialogProps {
  onClose: () => void;
  initialTab?: 'components' | 'patterns';
  onSelectComponent?: (comp: ComponentDef) => void | boolean;
  onSelectPattern?: (pat: PatternDef) => void | boolean;
}

const SUPPORTED_EXT_ACCEPT =
  '.eli,.elixml,.lib,.libxml,.kicad_sym,.kicad_mod,.lbr,.json,.gostlib,.zip,.asc,.txt';

export const CadLibraryManagerDialog: React.FC<CadLibraryManagerDialogProps> = ({
  onClose,
  initialTab = 'components',
  onSelectComponent,
  onSelectPattern
}) => {
  const [bundles, setBundles] = useState<CadLibraryBundle[]>(() => loadImportedLibraryBundles());
  const [userComponents, setUserComponents] = useState<ComponentDef[]>(() => loadUserComponents());
  const [userPatterns, setUserPatterns] = useState<PatternDef[]>(() => loadUserPatterns());

  const [selectedBundleId, setSelectedBundleId] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'components' | 'patterns'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [adaptToGost, setAdaptToGost] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>(
    'Поддерживаются бинарные и ASCII библиотеки DipTrace (.eli, .lib), KiCad (.kicad_sym, .kicad_mod), Eagle (.lbr), EasyEDA (.json), .gostlib и .zip.'
  );
  const [warnings, setWarnings] = useState<string[]>([]);

  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [selectedPatId, setSelectedPatId] = useState<string>('');

  const refreshFromStore = () => {
    setBundles(loadImportedLibraryBundles());
    setUserComponents(loadUserComponents());
    setUserPatterns(loadUserPatterns());
  };

  useEffect(() => {
    return subscribeEdaEvents((ch) => {
      if (ch === 'libraries:updated') refreshFromStore();
    });
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const b of bundles) {
      if (b.category) set.add(b.category);
    }
    return Array.from(set);
  }, [bundles]);

  const activeBundle = useMemo(
    () => (selectedBundleId === 'ALL' ? null : bundles.find((b) => b.id === selectedBundleId) ?? null),
    [bundles, selectedBundleId]
  );

  const categoryBundles = useMemo(
    () => categoryFilter === 'ALL' ? null : bundles.filter((bundle) => bundle.category === categoryFilter),
    [bundles, categoryFilter]
  );

  const filteredComponents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return userComponents.filter((c) => {
      if (activeBundle && !activeBundle.componentIds.includes(c.id) && c.library !== activeBundle.name) {
        return false;
      }
      if (categoryBundles && !categoryBundles.some((bundle) => bundle.componentIds.includes(c.id) || bundle.name === c.library)) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.refDesPrefix.toLowerCase().includes(q) ||
        (c.gostStandard ?? '').toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        (c.defaultValue ?? '').toLowerCase().includes(q) ||
        c.patternId.toLowerCase().includes(q) ||
        c.library.toLowerCase().includes(q)
      );
    });
  }, [userComponents, activeBundle, categoryBundles, searchQuery]);

  const filteredPatterns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return userPatterns.filter((p) => {
      if (activeBundle && !activeBundle.patternIds.includes(p.id) && p.library !== activeBundle.name) {
        return false;
      }
      if (categoryBundles && !categoryBundles.some((bundle) => bundle.patternIds.includes(p.id) || bundle.name === p.library)) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.gostName ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.library.toLowerCase().includes(q)
      );
    });
  }, [userPatterns, activeBundle, categoryBundles, searchQuery]);

  const selectedComp = useMemo(
    () =>
      filteredComponents.find((c) => c.id === selectedCompId) ??
      filteredComponents[0] ??
      null,
    [filteredComponents, selectedCompId]
  );

  const resolvedLinkedPattern = useMemo(() => {
    if (activeTab === 'patterns') {
      return (
        filteredPatterns.find((p) => p.id === selectedPatId) ??
        filteredPatterns[0] ??
        null
      );
    }
    if (!selectedComp) return null;
    const pid = selectedComp.patternId;
    if (!pid) return null;
    return (
      userPatterns.find((p) => p.id === pid || p.name.toUpperCase() === pid.toUpperCase()) ??
      findPatternById(pid) ??
      null
    );
  }, [activeTab, filteredPatterns, selectedPatId, selectedComp, userPatterns]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (activeTab === 'components' && filteredComponents.length > 0) {
          e.preventDefault();
          const curId = selectedComp?.id;
          const idx = filteredComponents.findIndex((c) => c.id === curId);
          const nextIdx =
            e.key === 'ArrowDown'
              ? (idx + 1) % filteredComponents.length
              : (idx - 1 + filteredComponents.length) % filteredComponents.length;
          setSelectedCompId(filteredComponents[nextIdx].id);
        } else if (activeTab === 'patterns' && filteredPatterns.length > 0) {
          e.preventDefault();
          const curId = resolvedLinkedPattern?.id;
          const idx = filteredPatterns.findIndex((p) => p.id === curId);
          const nextIdx =
            e.key === 'ArrowDown'
              ? (idx + 1) % filteredPatterns.length
              : (idx - 1 + filteredPatterns.length) % filteredPatterns.length;
          setSelectedPatId(filteredPatterns[nextIdx].id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, activeTab, filteredComponents, filteredPatterns, selectedComp, resolvedLinkedPattern]);

  const handleImportFiles = async () => {
    const pickedList = await pickCadFiles(SUPPORTED_EXT_ACCEPT);
    if (pickedList.length === 0) return;
    setBusy(true);
    setWarnings([]);

    try {
      const parsedList = [];
      const collectedWarnings: string[] = [];
      for (const picked of pickedList) {
        const res = await importExternalCadLibrary(picked.bytes, picked.name, { adaptToGost });
        parsedList.push({ picked, res });
        if (res.report.warnings) collectedWarnings.push(...res.report.warnings);
      }

      // Cross-link imported components <-> patterns across all selected files (e.g. .eli + .lib picked together)
      const allImportedPatterns = parsedList.flatMap((x) => x.res.patterns);
      const patternNameMap = new Map<string, string>();
      for (const p of [...userPatterns, ...allImportedPatterns]) {
        patternNameMap.set(p.name.toUpperCase(), p.id);
        patternNameMap.set(p.id.toUpperCase(), p.id);
      }
      for (const entry of parsedList) {
        for (const c of entry.res.components) {
          const origRaw = c.attributes?.originalFootprint ?? '';
          const origShort = origRaw.includes(':') ? origRaw.split(':').pop() ?? origRaw : origRaw;
          const matchedPatId =
            patternNameMap.get((c.patternId || '').toUpperCase()) ??
            (origRaw ? patternNameMap.get(origRaw.toUpperCase()) : undefined) ??
            (origShort ? patternNameMap.get(origShort.toUpperCase()) : undefined);
          if (matchedPatId) {
            c.patternId = matchedPatId;
          }
        }
      }

      // Group paired .eli + .lib with the same stem or register individually
      const totalComps = parsedList.reduce((acc, x) => acc + x.res.components.length, 0);
      const totalPats = parsedList.reduce((acc, x) => acc + x.res.patterns.length, 0);

      let lastBundle: CadLibraryBundle | null = null;
      const stems = new Set(parsedList.map((x) => x.picked.name.replace(/\.[^.]+$/, '').toLowerCase()));
      if (parsedList.length > 1 && stems.size === 1) {
        const primary = parsedList[0];
        lastBundle = registerImportedLibraryBundle({
          name: primary.res.libraryName,
          sourceFormat: parsedList.map((x) => x.res.detectedFormat).join(' + '),
          sourceFile: parsedList.map((x) => x.picked.name).join(', '),
          category: primary.res.categories[0] || 'DipTrace (.eli + .lib)',
          gostAdapted: adaptToGost,
          components: parsedList.flatMap((x) => x.res.components),
          patterns: allImportedPatterns
        });
      } else {
        for (const entry of parsedList) {
          if (entry.res.components.length === 0 && entry.res.patterns.length === 0) continue;
          lastBundle = registerImportedLibraryBundle({
            name: entry.res.libraryName,
            sourceFormat: entry.res.detectedFormat,
            sourceFile: entry.picked.name,
            category: entry.res.categories[0] || 'Импорт CAD',
            gostAdapted: adaptToGost,
            components: entry.res.components,
            patterns: entry.res.patterns
          });
        }
      }

      refreshFromStore();
      if (lastBundle) {
        setSelectedBundleId(lastBundle.id);
        setCategoryFilter('ALL');
        setSearchQuery('');
      }
      if (totalComps > 0) setActiveTab('components');
      else if (totalPats > 0) setActiveTab('patterns');

      setWarnings(collectedWarnings.slice(0, 15));
      setStatusMsg(
        `Импортировано: ${totalComps} комп., ${totalPats} корп. (${parsedList.map((x) => x.res.detectedFormat).join(', ')})`
      );
    } catch (err) {
      setStatusMsg(`Ошибка импорта: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportBundle = async (bundle: CadLibraryBundle) => {
    const json = exportLibraryBundleAsGostlib(bundle.id);
    const safeName = bundle.name.replace(/[^A-Za-z0-9А-Яа-я_-]/g, '_') || 'library';
    await saveTextFile(`${safeName}.gostlib`, json);
    setStatusMsg(`Библиотека "${bundle.name}" экспортирована в ${safeName}.gostlib`);
  };

  const handleDeleteBundle = (bundle: CadLibraryBundle) => {
    if (!window.confirm(`Удалить библиотеку «${bundle.name}» вместе с принадлежащими только ей УГО и корпусами?`)) return;
    deleteImportedLibraryBundle(bundle.id);
    if (selectedBundleId === bundle.id) {
      setSelectedBundleId('ALL');
    }
    refreshFromStore();
    setStatusMsg(`Удалена библиотека "${bundle.name}".`);
  };

  const handleCreateNewLibrary = () => {
    const name = window.prompt('Введите имя новой библиотеки:');
    if (!name || !name.trim()) return;
    const bundle = createUserLibrary(name.trim());
    refreshFromStore();
    setSelectedBundleId(bundle.id);
    setStatusMsg(`Создана новая библиотека «${bundle.name}».`);
  };

  const handleDuplicateComponent = (c: ComponentDef) => {
    const clone = duplicateUserComponent(c.id);
    if (clone) {
      refreshFromStore();
      setSelectedCompId(clone.id);
      setStatusMsg(`Компонент «${c.name}» сдублирован как «${clone.name}».`);
    }
  };

  const handleDeleteComponent = (c: ComponentDef) => {
    if (!window.confirm(`Удалить компонент «${c.name}» из библиотеки?`)) return;
    deleteUserComponent(c.id);
    refreshFromStore();
    setStatusMsg(`Компонент «${c.name}» удалён.`);
  };

  const handleDuplicatePattern = (p: PatternDef) => {
    const clone = duplicateUserPattern(p.id);
    if (clone) {
      refreshFromStore();
      setSelectedPatId(clone.id);
      setStatusMsg(`Корпус «${p.name}» сдублирован как «${clone.name}».`);
    }
  };

  const handleDeletePattern = (p: PatternDef) => {
    if (!window.confirm(`Удалить корпус «${p.name}» из библиотеки?`)) return;
    deleteUserPattern(p.id);
    refreshFromStore();
    setStatusMsg(`Корпус «${p.name}» удалён.`);
  };

  const openComponent = (component: ComponentDef) => {
    if (onSelectComponent && onSelectComponent(component) !== false) onClose();
  };

  const openPattern = (pattern: PatternDef) => {
    if (onSelectPattern && onSelectPattern(pattern) !== false) onClose();
  };

  return (
    <div className="dt-modal-backdrop" data-testid="cad-library-manager-modal">
      <div className="dt-modal" role="dialog" aria-modal="true" aria-label="Библиотеки внешних CAD" aria-labelledby="cad-lib-title" style={{ width: 960, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dt-modal-title">
          <span id="cad-lib-title">Библиотеки внешних CAD (DipTrace .eli/.lib, KiCad, Eagle, EasyEDA, ZIP)</span>
          <button className="dt-btn" aria-label="Закрыть менеджер библиотек" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>

        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', flex: 1 }}>
          {/* Top Action Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottom: '1px solid var(--ui-border)' }}>
            <button
              className="dt-btn dt-btn-primary"
              data-testid="cadlib-import-btn"
              disabled={busy}
              onClick={handleImportFiles}
            >
              {busy ? 'Импорт...' : '+ Импортировать библиотеку CAD...'}
            </button>
            <button
              className="dt-btn"
              data-testid="cadlib-new-btn"
              onClick={handleCreateNewLibrary}
            >
              + Новая библиотека...
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={adaptToGost}
                onChange={(e) => setAdaptToGost(e.target.checked)}
              />
              Адаптировать к ГОСТ 2.710-81 (обозначения, номиналы, УГО)
            </label>
            <div style={{ flex: 1 }} />
            <select
              className="dt-select"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setSelectedBundleId('ALL');
              }}
              style={{ minWidth: 160 }}
              title="Фильтр по категории"
            >
              <option value="ALL">Все категории ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Main 3-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(135px, 1fr) minmax(220px, 1.75fr) minmax(150px, 1.1fr)', gap: 10, minHeight: 0, flex: '1 1 390px', overflow: 'auto' }}>
            {/* Left: Library Bundles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--ui-border)', background: 'var(--ui-surface)', overflowY: 'auto', padding: 4 }}>
              <div style={{ fontWeight: 'bold', fontSize: 11, padding: '2px 4px', borderBottom: '1px solid var(--ui-border)' }}>
                Библиотеки ({bundles.length})
              </div>
              <button
                className={`dt-btn ${selectedBundleId === 'ALL' ? 'active' : ''}`}
                aria-pressed={selectedBundleId === 'ALL'}
                style={{ justifyContent: 'space-between', display: 'flex', textAlign: 'left', padding: '4px 6px' }}
                onClick={() => setSelectedBundleId('ALL')}
              >
                <span>Все внешние</span>
                <span style={{ opacity: 0.75 }}>{userComponents.length}/{userPatterns.length}</span>
              </button>

              {(categoryBundles ?? bundles).map((b) => {
                const isActive = selectedBundleId === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBundleId(b.id)}
                    style={{
                      padding: '5px 6px',
                      border: isActive ? '1px solid var(--ui-accent)' : '1px solid var(--ui-border)',
                      background: isActive ? 'var(--ui-selected)' : 'var(--ui-subtle)',
                      cursor: 'pointer',
                      fontSize: 11,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <button className="dt-btn" aria-pressed={isActive} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => setSelectedBundleId(b.id)} title={b.name}>
                        {b.name}
                      </button>
                      <span style={{ fontSize: 10, background: 'var(--ui-accent-soft)', padding: '0 4px', borderRadius: 2 }}>
                        {b.gostAdapted ? 'ГОСТ' : 'CAD'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--ui-muted)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.sourceFormat}>
                      {b.sourceFormat}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                      <span>УГО: {b.componentIds.length} · Корп: {b.patternIds.length}</span>
                      <span style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="dt-btn"
                          style={{ minWidth: 20, height: 18, padding: '0 4px', fontSize: 10 }}
                          title="Экспорт в .gostlib"
                          aria-label={`Экспортировать библиотеку ${b.name}`}
                          onClick={() => handleExportBundle(b)}
                        >
                          ↓
                        </button>
                        <button
                          className="dt-btn"
                          style={{ minWidth: 20, height: 18, padding: '0 4px', fontSize: 10 }}
                          title="Удалить библиотеку"
                          aria-label={`Удалить библиотеку ${b.name}`}
                          onClick={() => handleDeleteBundle(b)}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}

              {bundles.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--ui-muted)', padding: 8, textAlign: 'center' }}>
                  Внешних библиотек пока нет. Нажмите «+ Импортировать библиотеку CAD...».
                </div>
              )}
            </div>

            {/* Center: Search & Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="dt-input"
                  data-testid="cadlib-search-input"
                  data-autofocus="true"
                  placeholder={activeTab === 'components' ? 'Поиск по УГО…' : 'Поиск по корпусам…'}
                  aria-label={activeTab === 'components' ? 'Поиск по УГО' : 'Поиск по корпусам'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  className={`dt-btn ${activeTab === 'components' ? 'active' : ''}`}
                  aria-pressed={activeTab === 'components'}
                  onClick={() => setActiveTab('components')}
                >
                  УГО ({filteredComponents.length})
                </button>
                <button
                  className={`dt-btn ${activeTab === 'patterns' ? 'active' : ''}`}
                  aria-pressed={activeTab === 'patterns'}
                  onClick={() => setActiveTab('patterns')}
                >
                  Корпуса ({filteredPatterns.length})
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--ui-border)', background: 'var(--ui-surface)' }}>
                {activeTab === 'components' ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--ui-subtle)', position: 'sticky', top: 0, textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>Компонент</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>Обозн.</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>Корпус</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>Библиотека</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComponents.map((c) => {
                        const sel = selectedComp?.id === c.id;
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedCompId(c.id)}
                            onDoubleClick={() => openComponent(c)}
                            style={{ background: sel ? '#316AC5' : undefined, color: sel ? '#FFFFFF' : undefined, cursor: 'pointer' }}
                          >
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>
                              <button type="button" className="cad-library-item" aria-pressed={sel} onClick={() => setSelectedCompId(c.id)}>{c.name}</button>
                            </td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>{c.refDesPrefix}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>{c.patternId || '—'}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>{c.library}</td>
                          </tr>
                        );
                      })}
                      {filteredComponents.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 14, textAlign: 'center', color: 'var(--ui-muted)' }}>
                            Нет компонентов по выбранному фильтру.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--ui-subtle)', position: 'sticky', top: 0, textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>Корпус</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>Контактных площадок</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>ГОСТ / Тип</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--ui-border)' }}>Библиотека</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatterns.map((p) => {
                        const sel = resolvedLinkedPattern?.id === p.id;
                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelectedPatId(p.id)}
                            onDoubleClick={() => openPattern(p)}
                            style={{ background: sel ? '#316AC5' : undefined, color: sel ? '#FFFFFF' : undefined, cursor: 'pointer' }}
                          >
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>
                              <button type="button" className="cad-library-item" aria-pressed={sel} onClick={() => setSelectedPatId(p.id)}>{p.name}</button>
                            </td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>{p.pads.length}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>{p.gostName || 'CAD'}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--ui-border)' }}>{p.library}</td>
                          </tr>
                        );
                      })}
                      {filteredPatterns.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 14, textAlign: 'center', color: 'var(--ui-muted)' }}>
                            Нет корпусов по выбранному фильтру.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Right: Dual Live Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--ui-border)', background: 'var(--ui-subtle)', padding: 6, overflowY: 'auto' }}>
              {activeTab === 'components' && (
                <>
                  <div style={{ fontWeight: 'bold', fontSize: 11 }}>Предпросмотр УГО</div>
                  <SymbolPreviewCanvas component={selectedComp} />
                </>
              )}
              <div style={{ fontWeight: 'bold', fontSize: 11, marginTop: 2 }}>
                Предпросмотр корпуса {resolvedLinkedPattern ? `(${resolvedLinkedPattern.name})` : ''}
              </div>
              <PatternPreviewCanvas pattern={resolvedLinkedPattern} />

              {activeTab === 'components' && selectedComp && (
                <div style={{ fontSize: 11, lineHeight: 1.4, background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', padding: 6 }}>
                  <div><b>Имя:</b> {selectedComp.name}</div>
                  <div><b>Позиционное обозначение:</b> {selectedComp.refDesPrefix} {selectedComp.defaultValue ? `(${selectedComp.defaultValue})` : ''}</div>
                  <div><b>Секций:</b> {selectedComp.parts.length}</div>
                  <div><b>Выводов по секциям:</b> {selectedComp.parts.map((part) => part.pins.length).join(' / ')}</div>
                  <div><b>Корпус:</b> {selectedComp.patternId || 'не назначен'}</div>
                  <div><b>ГОСТ:</b> {selectedComp.gostStandard || '—'}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      className="dt-btn"
                      style={{ flex: 1 }}
                      title="Дублировать выбранный компонент"
                      onClick={() => handleDuplicateComponent(selectedComp)}
                    >
                      Дублировать
                    </button>
                    <button
                      className="dt-btn"
                      style={{ flex: 1, color: '#d9534f' }}
                      title="Удалить выбранный компонент"
                      onClick={() => handleDeleteComponent(selectedComp)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'patterns' && resolvedLinkedPattern && (
                <div style={{ fontSize: 11, lineHeight: 1.4, background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', padding: 6 }}>
                  <div><b>Корпус:</b> {resolvedLinkedPattern.name}</div>
                  <div><b>Площадок:</b> {resolvedLinkedPattern.pads.length}</div>
                  <div><b>3D-модель:</b> {resolvedLinkedPattern.model3d?.shape ?? 'Box'}</div>
                  <div><b>Описание:</b> {resolvedLinkedPattern.description}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      className="dt-btn"
                      style={{ flex: 1 }}
                      title="Дублировать выбранный корпус"
                      onClick={() => handleDuplicatePattern(resolvedLinkedPattern)}
                    >
                      Дублировать
                    </button>
                    <button
                      className="dt-btn"
                      style={{ flex: 1, color: '#d9534f' }}
                      title="Удалить выбранный корпус"
                      onClick={() => handleDeletePattern(resolvedLinkedPattern)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'components' && selectedComp && onSelectComponent && (
                <button
                  className="dt-btn dt-btn-primary"
                  onClick={() => openComponent(selectedComp)}
                >
                  Выбрать компонент
                </button>
              )}
              {activeTab === 'patterns' && resolvedLinkedPattern && onSelectPattern && (
                <button
                  className="dt-btn dt-btn-primary"
                  onClick={() => openPattern(resolvedLinkedPattern)}
                >
                  Выбрать корпус
                </button>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div style={{ maxHeight: 54, overflowY: 'auto', fontSize: 11, background: 'var(--ui-warning-bg)', border: '1px solid var(--ui-warning-border)', padding: '4px 6px' }}>
              <b>Замечания импорта:</b> {warnings.join(' | ')}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--ui-border)', paddingTop: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--ui-muted)' }} data-testid="cadlib-status" role="status">{statusMsg}</span>
            <button className="dt-btn" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
};
