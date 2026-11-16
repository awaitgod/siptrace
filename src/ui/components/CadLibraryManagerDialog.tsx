import React, { useEffect, useMemo, useState } from 'react';
import { ComponentDef, PatternDef } from '../../core/types';
import {
  CadLibraryBundle,
  deleteImportedLibraryBundle,
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

export interface CadLibraryManagerDialogProps {
  onClose: () => void;
  initialTab?: 'components' | 'patterns';
  onSelectComponent?: (comp: ComponentDef) => void;
  onSelectPattern?: (pat: PatternDef) => void;
}

const SUPPORTED_EXT_ACCEPT =
  '.eli,.lib,.kicad_sym,.kicad_mod,.lbr,.json,.gostlib,.zip,.asc,.txt';

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

  const filteredComponents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const allowedLibs = categoryFilter === 'ALL'
      ? null
      : new Set(bundles.filter((b) => b.category === categoryFilter).map((b) => b.name));
    return userComponents.filter((c) => {
      if (activeBundle && !activeBundle.componentIds.includes(c.id) && c.library !== activeBundle.name) {
        return false;
      }
      if (allowedLibs && !allowedLibs.has(c.library)) {
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
  }, [userComponents, bundles, activeBundle, categoryFilter, searchQuery]);

  const filteredPatterns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return userPatterns.filter((p) => {
      if (activeBundle && !activeBundle.patternIds.includes(p.id) && p.library !== activeBundle.name) {
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
  }, [userPatterns, activeBundle, searchQuery]);

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
    deleteImportedLibraryBundle(bundle.id);
    if (selectedBundleId === bundle.id) {
      setSelectedBundleId('ALL');
    }
    refreshFromStore();
    setStatusMsg(`Удалена библиотека "${bundle.name}".`);
  };

  return (
    <div className="dt-modal-backdrop" data-testid="cad-library-manager-modal">
      <div className="dt-modal" style={{ width: 960, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dt-modal-title">
          <span>Библиотеки внешних CAD (DipTrace .eli/.lib, KiCad, Eagle, EasyEDA, ZIP)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>

        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', flex: 1 }}>
          {/* Top Action Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottom: '1px solid #9A9A9A' }}>
            <button
              className="dt-btn dt-btn-primary"
              data-testid="cadlib-import-btn"
              disabled={busy}
              onClick={handleImportFiles}
            >
              {busy ? 'Импорт...' : '+ Импортировать библиотеку CAD...'}
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
              onChange={(e) => setCategoryFilter(e.target.value)}
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
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 270px', gap: 10, minHeight: 390, flex: 1, overflow: 'hidden' }}>
            {/* Left: Library Bundles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid #A0A0A0', background: '#FFFFFF', overflowY: 'auto', padding: 4 }}>
              <div style={{ fontWeight: 'bold', fontSize: 11, padding: '2px 4px', borderBottom: '1px solid #D0D0D0' }}>
                Библиотеки ({bundles.length})
              </div>
              <button
                className={`dt-btn ${selectedBundleId === 'ALL' ? 'active' : ''}`}
                style={{ justifyContent: 'space-between', display: 'flex', textAlign: 'left', padding: '4px 6px' }}
                onClick={() => setSelectedBundleId('ALL')}
              >
                <span>Все внешние</span>
                <span style={{ opacity: 0.75 }}>{userComponents.length}/{userPatterns.length}</span>
              </button>

              {bundles.map((b) => {
                const isActive = selectedBundleId === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBundleId(b.id)}
                    style={{
                      padding: '5px 6px',
                      border: isActive ? '1px solid #2A5CA8' : '1px solid #D8D8D8',
                      background: isActive ? '#E6EFFA' : '#FAFAFA',
                      cursor: 'pointer',
                      fontSize: 11,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.name}>
                        {b.name}
                      </strong>
                      <span style={{ fontSize: 10, background: b.gostAdapted ? '#DCF0DC' : '#ECECEC', padding: '0 4px', borderRadius: 2 }}>
                        {b.gostAdapted ? 'ГОСТ' : 'CAD'}
                      </span>
                    </div>
                    <div style={{ color: '#555', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.sourceFormat}>
                      {b.sourceFormat}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                      <span>УГО: {b.componentIds.length} · Корп: {b.patternIds.length}</span>
                      <span style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="dt-btn"
                          style={{ minWidth: 20, height: 18, padding: '0 4px', fontSize: 10 }}
                          title="Экспорт в .gostlib"
                          onClick={() => handleExportBundle(b)}
                        >
                          ↓
                        </button>
                        <button
                          className="dt-btn"
                          style={{ minWidth: 20, height: 18, padding: '0 4px', fontSize: 10 }}
                          title="Удалить библиотеку"
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
                <div style={{ fontSize: 11, color: '#666', padding: 8, textAlign: 'center' }}>
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
                  placeholder="Поиск (имя, номинал, RefDes, корпус, ГОСТ)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className={`dt-btn ${activeTab === 'components' ? 'active' : ''}`}
                  onClick={() => setActiveTab('components')}
                >
                  УГО ({filteredComponents.length})
                </button>
                <button
                  className={`dt-btn ${activeTab === 'patterns' ? 'active' : ''}`}
                  onClick={() => setActiveTab('patterns')}
                >
                  Корпуса ({filteredPatterns.length})
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #A0A0A0', background: '#FFFFFF' }}>
                {activeTab === 'components' ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#ECECEC', position: 'sticky', top: 0, textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>Компонент</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>Обозн.</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>Корпус</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>Библиотека</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComponents.map((c) => {
                        const sel = selectedComp?.id === c.id;
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedCompId(c.id)}
                            onDoubleClick={() => {
                              if (onSelectComponent) {
                                onSelectComponent(c);
                                onClose();
                              }
                            }}
                            style={{ background: sel ? '#316AC5' : undefined, color: sel ? '#FFFFFF' : undefined, cursor: 'pointer' }}
                          >
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{c.name}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{c.refDesPrefix}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{c.patternId || '—'}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{c.library}</td>
                          </tr>
                        );
                      })}
                      {filteredComponents.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 14, textAlign: 'center', color: '#777' }}>
                            Нет компонентов по выбранному фильтру.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#ECECEC', position: 'sticky', top: 0, textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>Корпус</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>Падов</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>ГОСТ / Тип</th>
                        <th style={{ padding: '4px 6px', borderBottom: '1px solid #C0C0C0' }}>Библиотека</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatterns.map((p) => {
                        const sel = resolvedLinkedPattern?.id === p.id;
                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelectedPatId(p.id)}
                            onDoubleClick={() => {
                              if (onSelectPattern) {
                                onSelectPattern(p);
                                onClose();
                              }
                            }}
                            style={{ background: sel ? '#316AC5' : undefined, color: sel ? '#FFFFFF' : undefined, cursor: 'pointer' }}
                          >
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{p.name}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{p.pads.length}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{p.gostName || 'CAD'}</td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #EEE' }}>{p.library}</td>
                          </tr>
                        );
                      })}
                      {filteredPatterns.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 14, textAlign: 'center', color: '#777' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid #A0A0A0', background: '#F4F4F4', padding: 6, overflowY: 'auto' }}>
              <div style={{ fontWeight: 'bold', fontSize: 11 }}>Предпросмотр УГО</div>
              <SymbolPreviewCanvas component={activeTab === 'components' ? selectedComp : null} />
              <div style={{ fontWeight: 'bold', fontSize: 11, marginTop: 2 }}>
                Предпросмотр корпуса {resolvedLinkedPattern ? `(${resolvedLinkedPattern.name})` : ''}
              </div>
              <PatternPreviewCanvas pattern={resolvedLinkedPattern} />

              {activeTab === 'components' && selectedComp && (
                <div style={{ fontSize: 11, lineHeight: 1.4, background: '#FFF', border: '1px solid #CCC', padding: 6 }}>
                  <div><b>Имя:</b> {selectedComp.name}</div>
                  <div><b>RefDes:</b> {selectedComp.refDesPrefix} {selectedComp.defaultValue ? `(${selectedComp.defaultValue})` : ''}</div>
                  <div><b>Выводов:</b> {selectedComp.parts[0]?.pins.length ?? 0}</div>
                  <div><b>Корпус:</b> {selectedComp.patternId || 'не назначен'}</div>
                  <div><b>ГОСТ:</b> {selectedComp.gostStandard || '—'}</div>
                </div>
              )}

              {activeTab === 'patterns' && resolvedLinkedPattern && (
                <div style={{ fontSize: 11, lineHeight: 1.4, background: '#FFF', border: '1px solid #CCC', padding: 6 }}>
                  <div><b>Корпус:</b> {resolvedLinkedPattern.name}</div>
                  <div><b>Падов:</b> {resolvedLinkedPattern.pads.length}</div>
                  <div><b>3D-модель:</b> {resolvedLinkedPattern.model3d?.shape ?? 'Box'}</div>
                  <div><b>Описание:</b> {resolvedLinkedPattern.description}</div>
                </div>
              )}

              {activeTab === 'components' && selectedComp && onSelectComponent && (
                <button
                  className="dt-btn dt-btn-primary"
                  onClick={() => {
                    onSelectComponent(selectedComp);
                    onClose();
                  }}
                >
                  Выбрать компонент
                </button>
              )}
              {activeTab === 'patterns' && resolvedLinkedPattern && onSelectPattern && (
                <button
                  className="dt-btn dt-btn-primary"
                  onClick={() => {
                    onSelectPattern(resolvedLinkedPattern);
                    onClose();
                  }}
                >
                  Выбрать корпус
                </button>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div style={{ maxHeight: 54, overflowY: 'auto', fontSize: 11, background: '#FFF8E1', border: '1px solid #E0C070', padding: '4px 6px' }}>
              <b>Замечания импорта:</b> {warnings.join(' | ')}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #9A9A9A', paddingTop: 6 }}>
            <span style={{ fontSize: 11, color: '#333' }} data-testid="cadlib-status">{statusMsg}</span>
            <button className="dt-btn" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
};
