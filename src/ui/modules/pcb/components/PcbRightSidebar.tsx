import React from 'react';
import { PcbPlacedComponent, PcbProject } from '../../../../core/types';
import { DipIcon } from '../../../theme/DipTraceIcons';
import { CopperLayerId, PcbExtraSelection } from '../types';
import { updateAllCopperPours } from '../../../../engines/copperPour';
import { PcbDrcReport } from '../hooks/usePcbDrcReport';

export interface PcbRightSidebarProps {
  pcb: PcbProject;
  activeLayer: CopperLayerId;
  switchCopperLayer: (layer: CopperLayerId) => void;
  rightTopTab: 'layers' | 'objects';
  setRightTopTab: (t: 'layers' | 'objects') => void;
  managerTab: 'components' | 'nets' | 'drc';
  setManagerTab: (t: 'components' | 'nets' | 'drc') => void;
  showRatlines: boolean;
  setShowRatlines: (v: boolean) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  handleApplyViaStitching: () => void;
  selectedCompId: string | null;
  setSelectedCompId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedTraceId?: string | null;
  setSelectedTraceId?: React.Dispatch<React.SetStateAction<string | null>>;
  selectedViaId?: string | null;
  setSelectedViaId?: React.Dispatch<React.SetStateAction<string | null>>;
  selectedExtraObj?: PcbExtraSelection | null;
  setSelectedExtraObj?: React.Dispatch<React.SetStateAction<PcbExtraSelection | null>>;
  highlightedNet: string | null;
  setHighlightedNet: React.Dispatch<React.SetStateAction<string | null>>;
  netNames: string[];
  drcReport: PcbDrcReport;
  onRunDrc: () => void;
  selectedComp: PcbPlacedComponent | null;
  ratlineCount: number;
  onCenterWorldPt?: (x: number, y: number) => void;
  commitPcb: (updater: (prev: PcbProject) => PcbProject, pushUndo?: boolean) => void;
}

const treeButtonStyle: React.CSSProperties = {
  display: 'block', width: '100%', border: 0, backgroundColor: 'transparent', textAlign: 'left', color: 'inherit'
};

function rightTabButtonStyle(selected: boolean): React.CSSProperties {
  return { ...treeButtonStyle, backgroundColor: selected ? '#99ccff' : undefined };
}

/** Right sidebar housing Layer Stack, Options, Project Manager (Components/Nets/DRC), and Inspector. */
export const PcbRightSidebar: React.FC<PcbRightSidebarProps> = (p) => (
  <div className="dt-right-sidebar">
    <div className="dt-panel-card" style={{ height: '34%' }}>
      <div className="dt-panel-header">
        <span>{p.rightTopTab === 'layers' ? 'Слои' : 'Объекты платы'}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="dt-btn" aria-pressed={p.rightTopTab === 'layers'} style={{ minWidth: 40, height: 16, padding: '0 4px', fontSize: 10 }} onClick={() => p.setRightTopTab('layers')}>Слои</button>
          <button className="dt-btn" aria-pressed={p.rightTopTab === 'objects'} style={{ minWidth: 48, height: 16, padding: '0 4px', fontSize: 10 }} onClick={() => p.setRightTopTab('objects')}>Опции</button>
        </div>
      </div>
      <div className="dt-panel-body">
        {p.rightTopTab === 'layers' ? (
          p.pcb.layers.map((lay) => {
            const id = lay.id;
            const copper = id === 'TopCopper' || id === 'Inner1' || id === 'Inner2' || id === 'BottomCopper';
            return (
            <div
              key={lay.id}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '1px 6px', fontSize: 11 }}
            >
              <input
                type="checkbox"
                aria-label={`Показывать слой «${lay.name}»`}
                checked={lay.visible}
                onChange={(e) =>
                  p.commitPcb(
                    (prev) => ({
                      ...prev,
                      layers: prev.layers.map((l) => (l.id === lay.id ? { ...l, visible: e.target.checked } : l))
                    }),
                    false
                  )
                }
              />
              <span style={{ width: 10, height: 10, background: lay.color, border: '1px solid #333', display: 'inline-block', flexShrink: 0 }} />
              {copper ? (
                <button type="button" className={`dt-tree-row ${id === p.activeLayer ? 'selected' : ''}`} style={rightTabButtonStyle(id === p.activeLayer)} aria-pressed={id === p.activeLayer} onClick={() => p.switchCopperLayer(id)}>
                  {lay.name}
                </button>
              ) : <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{lay.name}</span>}
            </div>
            );
          })
        ) : (
          <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label><input type="checkbox" checked={p.showRatlines} onChange={(e) => p.setShowRatlines(e.target.checked)} /> Связи (Ratlines)</label>
            <label><input type="checkbox" checked={p.showGrid} onChange={(e) => p.setShowGrid(e.target.checked)} /> Сетка координат</label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(p.pcb.teardropsEnabled)}
                onChange={(e) => p.commitPcb((prev) => ({ ...prev, teardropsEnabled: e.target.checked }))}
              /> Каплевидные скругления
            </label>
            <button className="dt-btn" onClick={p.handleApplyViaStitching}>Прошить GND переходами</button>
          </div>
        )}
      </div>
    </div>

    <div className="dt-panel-card" style={{ flex: 1 }}>
      <div className="dt-panel-header">
        <span>Менеджер проекта</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className={`dt-tb-btn ${p.managerTab === 'components' ? 'active' : ''}`} aria-pressed={p.managerTab === 'components'} style={{ width: 18, height: 16 }} title="Компоненты" onClick={() => p.setManagerTab('components')}><DipIcon name="managerComp" size={13} /></button>
          <button className={`dt-tb-btn ${p.managerTab === 'nets' ? 'active' : ''}`} aria-pressed={p.managerTab === 'nets'} style={{ width: 18, height: 16 }} title="Цепи" onClick={() => p.setManagerTab('nets')}><DipIcon name="managerNet" size={13} /></button>
          <button className={`dt-tb-btn ${p.managerTab === 'drc' ? 'active' : ''}`} aria-pressed={p.managerTab === 'drc'} style={{ width: 18, height: 16 }} title="Ошибки DRC" onClick={() => p.setManagerTab('drc')}><DipIcon name="managerErr" size={13} /></button>
        </div>
      </div>
      <div className="dt-panel-body">
        {p.managerTab === 'components' &&
          p.pcb.components.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`dt-tree-row ${c.id === p.selectedCompId ? 'selected' : ''}`}
              style={rightTabButtonStyle(c.id === p.selectedCompId)}
              aria-pressed={c.id === p.selectedCompId}
              onClick={() => {
                p.setSelectedCompId(c.id);
                p.setSelectedTraceId?.(null);
                p.setSelectedViaId?.(null);
                p.setSelectedExtraObj?.(null);
                p.setHighlightedNet(null);
                p.onCenterWorldPt?.(c.x, c.y);
              }}
            >
              {c.refDes} ({c.side}) — {c.typeName}
            </button>
          ))}

        {p.managerTab === 'nets' &&
          p.netNames.map((n) => (
            <button
              key={n}
              type="button"
              className={`dt-tree-row ${p.highlightedNet === n ? 'selected' : ''}`}
              style={rightTabButtonStyle(p.highlightedNet === n)}
              aria-pressed={p.highlightedNet === n}
              onClick={() => p.setHighlightedNet((cur) => (cur === n ? null : n))}
            >
              {n}
            </button>
          ))}

        {p.managerTab === 'drc' && (p.drcReport.status !== 'current' ? (
          <div style={{ padding: 8 }}>
            <p role="status" style={{ margin: '0 0 6px' }}>{p.drcReport.status === 'stale'
              ? 'Плата изменена после проверки DRC.'
              : 'Проверка DRC ещё не запускалась.'}</p>
            <button type="button" className="dt-btn" onClick={p.onRunDrc}>Запустить проверку DRC</button>
          </div>
        ) : p.drcReport.issues.length === 0 ? (
          <div role="status" style={{ padding: 8, color: '#2b7a2b' }}>Проверка DRC завершена. Нарушений не обнаружено.</div>
        ) : (
            p.drcReport.issues.map((err) => (
              <button
                key={err.id}
                type="button"
                className="dt-tree-row"
                style={{ ...treeButtonStyle, color: err.severity === 'Error' ? '#c00' : '#996000', whiteSpace: 'normal', padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}
                onClick={() => p.onCenterWorldPt?.(err.x, err.y)}
              >
                <b>[{err.code}]</b> {err.message}
              </button>
            ))
          ))}
      </div>
    </div>

    <div className="dt-panel-card" style={{ height: '27%' }}>
      <div className="dt-panel-header">
        <span>Свойства</span>
        <span style={{ fontSize: 10, color: '#666' }}>
          {p.selectedComp
            ? p.selectedComp.refDes
            : p.selectedViaId
              ? 'Via'
              : p.selectedTraceId
                ? 'Дорожка'
                : p.selectedExtraObj
                  ? p.selectedExtraObj.kind
                  : 'Плата'}
        </span>
      </div>
      <div className="dt-panel-body">
        {p.selectedComp ? (
          <>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Поз. обозн.</div>
              <div className="dt-prop-val">{p.selectedComp.refDes}</div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Сторона</div>
              <div className="dt-prop-val">
                <select
                  className="dt-prop-input"
                  aria-label="Сторона компонента"
                  disabled={p.selectedComp.locked}
                  value={p.selectedComp.side}
                  onChange={(e) =>
                    p.commitPcb((prev) => ({
                      ...prev,
                      components: prev.components.map((c) =>
                        c.id === p.selectedComp!.id && !c.locked ? { ...c, side: e.target.value as 'Top' | 'Bottom' } : c
                      )
                    }))
                  }
                >
                  <option value="Top">Top (Верх)</option>
                  <option value="Bottom">Bottom (Низ)</option>
                </select>
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Угол, °</div>
              <div className="dt-prop-val">
                <input
                  type="number"
                  className="dt-prop-input"
                  aria-label="Угол компонента в градусах"
                  disabled={p.selectedComp.locked}
                  value={p.selectedComp.angle}
                  onChange={(e) =>
                    p.commitPcb((prev) => ({
                      ...prev,
                      components: prev.components.map((c) =>
                        c.id === p.selectedComp!.id && !c.locked ? { ...c, angle: Number(e.target.value) || 0 } : c
                      )
                    }))
                  }
                />
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">X, мм</div>
              <div className="dt-prop-val">
                <input
                  type="number"
                  step="0.25"
                  className="dt-prop-input"
                  aria-label="Координата X компонента в миллиметрах"
                  disabled={p.selectedComp.locked}
                  value={Number(p.selectedComp.x.toFixed(2))}
                  onChange={(e) => {
                    const nx = parseFloat(e.target.value);
                    if (!Number.isFinite(nx)) return;
                    p.commitPcb((prev) => ({
                      ...prev,
                      components: prev.components.map((c) =>
                        c.id === p.selectedComp!.id && !c.locked ? { ...c, x: nx } : c
                      )
                    }));
                  }}
                />
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Y, мм</div>
              <div className="dt-prop-val">
                <input
                  type="number"
                  step="0.25"
                  className="dt-prop-input"
                  aria-label="Координата Y компонента в миллиметрах"
                  disabled={p.selectedComp.locked}
                  value={Number(p.selectedComp.y.toFixed(2))}
                  onChange={(e) => {
                    const ny = parseFloat(e.target.value);
                    if (!Number.isFinite(ny)) return;
                    p.commitPcb((prev) => ({
                      ...prev,
                      components: prev.components.map((c) =>
                        c.id === p.selectedComp!.id && !c.locked ? { ...c, y: ny } : c
                      )
                    }));
                  }}
                />
              </div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Закреплён</div>
              <div className="dt-prop-val">
                <input
                  type="checkbox"
                  aria-label="Закрепить компонент"
                  checked={Boolean(p.selectedComp.locked)}
                  onChange={(e) =>
                    p.commitPcb((prev) => ({
                      ...prev,
                      components: prev.components.map((c) =>
                        c.id === p.selectedComp!.id ? { ...c, locked: e.target.checked } : c
                      )
                    }))
                  }
                />
              </div>
            </div>
          </>
        ) : p.selectedViaId && p.pcb.vias.some((v) => v.id === p.selectedViaId) ? (
          (() => {
            const via = p.pcb.vias.find((v) => v.id === p.selectedViaId)!;
            return (
              <>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Цепь</div>
                  <div className="dt-prop-val">{via.netName || 'Без цепи'}</div>
                </div>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">X, Y (мм)</div>
                  <div className="dt-prop-val">{via.x.toFixed(2)}, {via.y.toFixed(2)}</div>
                </div>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Ø внеш / отв</div>
                  <div className="dt-prop-val">{via.outerDiameter.toFixed(2)} / {via.holeDiameter.toFixed(2)}</div>
                </div>
                <div style={{ padding: 4 }}>
                  <button
                    className="dt-btn"
                    style={{ width: '100%' }}
                    onClick={() => {
                      p.commitPcb((prev) => ({ ...prev, vias: prev.vias.filter((v) => v.id !== via.id) }));
                      p.setSelectedViaId?.(null);
                    }}
                  >
                    Удалить переход (Del)
                  </button>
                </div>
              </>
            );
          })()
        ) : p.selectedTraceId && p.pcb.traces.some((tr) => tr.id === p.selectedTraceId) ? (
          (() => {
            const tr = p.pcb.traces.find((t) => t.id === p.selectedTraceId)!;
            return (
              <>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Цепь</div>
                  <div className="dt-prop-val">{tr.netName || 'Без цепи'}</div>
                </div>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Слой</div>
                  <div className="dt-prop-val">{tr.layer}</div>
                </div>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Ширина, мм</div>
                  <div className="dt-prop-val">
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      className="dt-prop-input"
                      value={tr.width}
                      onChange={(e) => {
                        const nw = Math.max(0.1, parseFloat(e.target.value) || 0.25);
                        p.commitPcb((prev) => ({
                          ...prev,
                          traces: prev.traces.map((t) => (t.id === tr.id ? { ...t, width: nw } : t))
                        }));
                      }}
                    />
                  </div>
                </div>
                <div style={{ padding: 4 }}>
                  <button
                    className="dt-btn"
                    style={{ width: '100%' }}
                    onClick={() => {
                      p.commitPcb((prev) => ({ ...prev, traces: prev.traces.filter((t) => t.id !== tr.id) }));
                      p.setSelectedTraceId?.(null);
                    }}
                  >
                    Удалить дорожку (Del)
                  </button>
                </div>
              </>
            );
          })()
        ) : p.selectedExtraObj ? (
          (() => {
            const obj = p.selectedExtraObj;
            const sh = obj.kind === 'shape' ? p.pcb.shapes.find((s) => s.id === obj.id) : undefined;
            const pour = obj.kind === 'pour' ? p.pcb.copperPours.find((c) => c.id === obj.id) : undefined;
            return (
              <>
                <div className="dt-prop-row">
                  <div className="dt-prop-key">Объект</div>
                  <div className="dt-prop-val">
                    {sh ? `Графика (${sh.type})` : pour ? `Полигон (${pour.netName})` : obj.kind === 'cutout' ? 'Вырез платы' : 'Зона запрета'}
                  </div>
                </div>
                {sh?.type === 'text' && (
                  <div className="dt-prop-row">
                    <div className="dt-prop-key">Текст</div>
                    <div className="dt-prop-val">
                      <input
                        className="dt-prop-input"
                        value={sh.text ?? ''}
                        onChange={(e) =>
                          p.commitPcb((prev) => ({
                            ...prev,
                            shapes: prev.shapes.map((s) => (s.id === sh.id ? { ...s, text: e.target.value } : s))
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
                <div style={{ padding: 4 }}>
                  <button
                    className="dt-btn"
                    style={{ width: '100%' }}
                    onClick={() => {
                      p.commitPcb((prev) => {
                        if (obj.kind === 'shape') return { ...prev, shapes: prev.shapes.filter((s) => s.id !== obj.id) };
                        if (obj.kind === 'cutout') return updateAllCopperPours({ ...prev, cutouts: prev.cutouts.filter((c) => c.id !== obj.id) });
                        if (obj.kind === 'keepout') return updateAllCopperPours({ ...prev, keepouts: prev.keepouts.filter((k) => k.id !== obj.id) });
                        return { ...prev, copperPours: prev.copperPours.filter((cp) => cp.id !== obj.id) };
                      });
                      p.setSelectedExtraObj?.(null);
                    }}
                  >
                    Удалить объект (Del)
                  </button>
                </div>
              </>
            );
          })()
        ) : (
          <>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Проект</div>
              <div className="dt-prop-val">{p.pcb.projectName}</div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Слои меди</div>
              <div className="dt-prop-val">{p.pcb.layerCount}</div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Толщина, мм</div>
              <div className="dt-prop-val">{p.pcb.boardThickness}</div>
            </div>
            <div className="dt-prop-row">
              <div className="dt-prop-key">Неразвед.</div>
              <div className="dt-prop-val">{p.ratlineCount}</div>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
);
