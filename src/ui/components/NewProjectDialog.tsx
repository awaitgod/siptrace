import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GostAccuracyClass, SheetFormatId, Units } from '../../core/types';
import {
  buildDefaultNewProjectOptions,
  NewProjectMode,
  NewProjectOptions
} from '../../core/store';
import { SHEET_FORMATS } from '../../gost/gostTitleBlock';

export interface NewProjectDialogProps {
  initialMode?: NewProjectMode;
  onCreate: (opts: NewProjectOptions) => void;
  onClose: () => void;
}

/** Unified project creation modal shared by Launcher, Schematic, and PCB editors. */
export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({
  initialMode = 'schematic_and_pcb',
  onCreate,
  onClose
}) => {
  const [opts, setOpts] = useState<NewProjectOptions>(() => buildDefaultNewProjectOptions(initialMode));
  const [titleEditedManually, setTitleEditedManually] = useState(false);
  const [widthDraft, setWidthDraft] = useState(() => String(buildDefaultNewProjectOptions(initialMode).boardWidthMm));
  const [heightDraft, setHeightDraft] = useState(() => String(buildDefaultNewProjectOptions(initialMode).boardHeightMm));
  const [radiusDraft, setRadiusDraft] = useState(() => String(buildDefaultNewProjectOptions(initialMode).boardCornerRadiusMm));
  const [nameError, setNameError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Capture the opener during render, before React moves focus into the dialog.
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);

    (nameInputRef.current ?? focusable()[0] ?? dialog).focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) {
        e.preventDefault();
        dialog.focus();
      } else if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const upd = <K extends keyof NewProjectOptions>(key: K, val: NewProjectOptions[K]) => {
    setOpts((prev) => ({ ...prev, [key]: val }));
  };

  const handleNameChange = (val: string) => {
    if (nameError && val.trim()) setNameError(null);
    setOpts((prev) => ({
      ...prev,
      projectName: val,
      titleName: titleEditedManually ? prev.titleName : val || 'Новое устройство'
    }));
  };

  const clampNum = (raw: string, fallback: number, min: number, max: number) => {
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const isDemo = opts.mode === 'demo_rs485' || opts.mode === 'demo_mcu';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDemo && !opts.projectName.trim()) {
      setNameError('Введите непустое название проекта.');
      nameInputRef.current?.focus();
      return;
    }
    const finalOpts: NewProjectOptions = {
      ...opts,
      projectName: opts.projectName.trim() || 'Новый_проект',
      boardWidthMm: clampNum(widthDraft, opts.boardWidthMm, 10, 1000),
      boardHeightMm: clampNum(heightDraft, opts.boardHeightMm, 10, 1000),
      boardCornerRadiusMm: opts.boardIsCircle ? 0 : clampNum(radiusDraft, opts.boardCornerRadiusMm, 0, 200)
    };
    onCreate(finalOpts);
  };

  return (
    <div className="dt-modal-backdrop" onClick={onClose}>
      <div
        className="dt-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        tabIndex={-1}
        style={{ width: 480, minWidth: 340, maxWidth: '94vw', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dt-modal-title">
          <strong id="new-project-title">Новый проект — SIPTrace</strong>
          <button type="button" aria-label="Закрыть" className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Тип создания:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                <button
                  type="button"
                  aria-pressed={opts.mode === 'schematic_and_pcb'}
                  className={`dt-btn ${opts.mode === 'schematic_and_pcb' ? 'primary' : ''}`}
                  style={{ height: 24, fontSize: 10.5, minWidth: 0, padding: '0 4px' }}
                  onClick={() => upd('mode', 'schematic_and_pcb')}
                >
                  Схема + Плата
                </button>
                <button
                  type="button"
                  aria-pressed={opts.mode === 'schematic_only'}
                  className={`dt-btn ${opts.mode === 'schematic_only' ? 'primary' : ''}`}
                  style={{ height: 24, fontSize: 10.5, minWidth: 0, padding: '0 4px' }}
                  onClick={() => upd('mode', 'schematic_only')}
                >
                  Только Схема
                </button>
                <button
                  type="button"
                  aria-pressed={opts.mode === 'pcb_only'}
                  className={`dt-btn ${opts.mode === 'pcb_only' ? 'primary' : ''}`}
                  style={{ height: 24, fontSize: 10.5, minWidth: 0, padding: '0 4px' }}
                  onClick={() => upd('mode', 'pcb_only')}
                >
                  Только плата
                </button>
                <button
                  type="button"
                  aria-pressed={isDemo}
                  className={`dt-btn ${isDemo ? 'primary' : ''}`}
                  style={{ height: 24, fontSize: 10.5, minWidth: 0, padding: '0 4px' }}
                  onClick={() => upd('mode', isDemo ? opts.mode : 'demo_rs485')}
                >
                  Демо
                </button>
              </div>
            </div>

            {isDemo ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span>Выберите демонстрационный проект:</span>
                <select
                  className="dt-select"
                  value={opts.mode}
                  onChange={(e) => upd('mode', e.target.value as NewProjectMode)}
                >
                  <option value="demo_rs485">Гальваническая развязка RS-485 (Схема + Плата)</option>
                  <option value="demo_mcu">Контроллер К1986ВЕ92QI + КР142ЕН5А</option>
                </select>
              </label>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span>Название проекта:</span>
                    <input
                      className="dt-input"
                      ref={nameInputRef}
                      required
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={nameError ? 'new-project-name-error' : undefined}
                      value={opts.projectName}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span>Обозначение (ЕСКД):</span>
                    <input
                      className="dt-input"
                      value={opts.designation}
                      onChange={(e) => upd('designation', e.target.value)}
                    />
                  </label>
                </div>
                {nameError && (
                  <div id="new-project-name-error" role="alert" className="dt-error-message" style={{ fontSize: 11, marginTop: -4 }}>{nameError}</div>
                )}

                {(opts.mode === 'schematic_and_pcb' || opts.mode === 'schematic_only') && (
                  <>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span>Наименование изделия (Графа 1 штампа):</span>
                      <input
                        className="dt-input"
                        value={opts.titleName}
                        onChange={(e) => {
                          setTitleEditedManually(true);
                          upd('titleName', e.target.value);
                        }}
                      />
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: opts.mode === 'schematic_and_pcb' ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', gap: 8 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span>Формат первого листа (ГОСТ 2.301-68):</span>
                        <select
                          className="dt-select"
                          value={opts.sheetFormat}
                          onChange={(e) => upd('sheetFormat', e.target.value as SheetFormatId)}
                        >
                          {Object.entries(SHEET_FORMATS).map(([id, d]) => (
                            <option key={id} value={id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {opts.mode === 'schematic_and_pcb' && (
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span>Слоёв меди платы:</span>
                          <select
                            className="dt-select"
                            value={opts.boardLayers}
                            onChange={(e) => upd('boardLayers', Number(e.target.value) === 4 ? 4 : 2)}
                          >
                            <option value={2}>2 слоя (Верх / Низ)</option>
                            <option value={4}>4 слоя (Многослойная)</option>
                          </select>
                        </label>
                      )}
                    </div>
                  </>
                )}

                {opts.mode === 'pcb_only' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span>Ширина (мм):</span>
                        <input
                          type="number"
                          min={10}
                          max={1000}
                          step="any"
                          className="dt-input"
                          value={widthDraft}
                          onChange={(e) => setWidthDraft(e.target.value)}
                          onBlur={() => {
                            const v = clampNum(widthDraft, 100, 10, 1000);
                            setWidthDraft(String(v));
                            upd('boardWidthMm', v);
                          }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span>Высота (мм):</span>
                        <input
                          type="number"
                          min={10}
                          max={1000}
                          step="any"
                          className="dt-input"
                          value={heightDraft}
                          onChange={(e) => setHeightDraft(e.target.value)}
                          onBlur={() => {
                            const v = clampNum(heightDraft, 70, 10, 1000);
                            setHeightDraft(String(v));
                            upd('boardHeightMm', v);
                          }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span>Радиус угла (мм):</span>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          step="any"
                          disabled={opts.boardIsCircle}
                          className="dt-input"
                          value={opts.boardIsCircle ? '0' : radiusDraft}
                          onChange={(e) => setRadiusDraft(e.target.value)}
                          onBlur={() => {
                            const v = clampNum(radiusDraft, 0, 0, 200);
                            setRadiusDraft(String(v));
                            upd('boardCornerRadiusMm', v);
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span>Слоёв меди:</span>
                        <select
                          className="dt-select"
                          value={opts.boardLayers}
                          onChange={(e) => upd('boardLayers', Number(e.target.value) === 4 ? 4 : 2)}
                        >
                          <option value={2}>2 слоя (Верх / Низ)</option>
                          <option value={4}>4 слоя (Многослойная)</option>
                        </select>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14 }}>
                        <input
                          type="checkbox"
                          checked={opts.boardIsCircle}
                          onChange={(e) => upd('boardIsCircle', e.target.checked)}
                        />
                        <span>Круглая / овал</span>
                      </label>
                    </div>
                  </>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.7fr)', gap: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span>Класс ПП (ГОСТ 23751):</span>
                    <select
                      className="dt-select"
                      value={opts.accuracyClass}
                      onChange={(e) => upd('accuracyClass', Number(e.target.value) as GostAccuracyClass)}
                    >
                      <option value={1}>Класс 1 (0.75 мм)</option>
                      <option value={2}>Класс 2 (0.45 мм)</option>
                      <option value={3}>Класс 3 (0.25 мм)</option>
                      <option value={4}>Класс 4 (0.15 мм)</option>
                      <option value={5}>Класс 5 (0.10 мм)</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span>Единицы:</span>
                    <select
                      className="dt-select"
                      value={opts.units}
                      onChange={(e) => upd('units', e.target.value as Units)}
                    >
                      <option value="mm">мм</option>
                      <option value="mil">mil</option>
                      <option value="in">in</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span>Разработчик:</span>
                    <input
                      className="dt-input"
                      value={opts.developer}
                      onChange={(e) => upd('developer', e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span>Организация:</span>
                    <input
                      className="dt-input"
                      value={opts.organization}
                      onChange={(e) => upd('organization', e.target.value)}
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="dt-modal-footer">
            <button type="submit" className="dt-btn primary">
              Создать
            </button>
            <button type="button" className="dt-btn" onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
