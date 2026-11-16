import { validateHotkeys } from '../../core/persistence/hotkeysStore';
import React, { useState } from 'react';
import { BomEntry, ColorSchemeId, GostTitleBlockData, HotkeyMap, SchematicProject, SheetFormatId, SpiceSimResult } from '../../core/types';
import { SHEET_FORMATS } from '../../gost/gostTitleBlock';
import { exportGostBomToCsv, exportGostBomToHtml } from '../../gost/gostBom';
import { DEFAULT_HOTKEYS } from '../../core/store';
export const TitleBlockDialog: React.FC<{
    format: SheetFormatId;
    titleBlock: GostTitleBlockData;
    onApply: (format: SheetFormatId, tb: GostTitleBlockData) => void;
    onClose: () => void;
}> = ({ format, titleBlock, onApply, onClose }) => {
    const [fmt, setFmt] = useState<SheetFormatId>(format);
    const [tb, setTb] = useState<GostTitleBlockData>({ ...titleBlock });
    const upd = <K extends keyof GostTitleBlockData>(k: K, v: GostTitleBlockData[K]) => {
        setTb((prev) => ({ ...prev, [k]: v }));
    };
    return (<div className="dt-modal-backdrop">
      <div className="dt-modal" style={{ width: 560 }}>
        <div className="dt-modal-title">
          <span>Заголовки и настройка листа (ГОСТ 2.104-2006 / 2.301-68)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Формат листа (ГОСТ 2.301-68):</span>
              <select className="dt-select" value={fmt} onChange={(e) => setFmt(e.target.value as SheetFormatId)}>
                {Object.entries(SHEET_FORMATS).map(([id, d]) => (<option key={id} value={id}>{d.label}</option>))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Форма основной надписи (ГОСТ 2.104):</span>
              <select className="dt-select" value={tb.form} onChange={(e) => upd('form', e.target.value as GostTitleBlockData['form'])}>
                <option value="Form1">Форма 1 (185×55 мм — Первый лист)</option>
                <option value="Form2">Форма 2 (185×40 мм — Текстовая)</option>
                <option value="Form2a">Форма 2а (185×15 мм — Последующие)</option>
                <option value="None">Без основной надписи</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
            <label><input type="checkbox" checked={tb.enabled} onChange={(e) => upd('enabled', e.target.checked)}/> Отображать рамку и штамп</label>
            <label><input type="checkbox" checked={tb.showZones} onChange={(e) => upd('showZones', e.target.checked)}/> Зоны координат (1..8, А..Г)</label>
            <label><input type="checkbox" checked={tb.showCornerStamp26} onChange={(e) => upd('showCornerStamp26', e.target.checked)}/> Графа 26 (70×14 мм)</label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Обозначение (Графа 2):</span>
              <input className="dt-input" value={tb.designation} onChange={(e) => upd('designation', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Организация (Графа 9):</span>
              <input className="dt-input" value={tb.organization} onChange={(e) => upd('organization', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Наименование изделия (Графа 1):</span>
              <input className="dt-input" value={tb.name} onChange={(e) => upd('name', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Наименование документа (подстрока):</span>
              <input className="dt-input" value={tb.subName ?? ''} onChange={(e) => upd('subName', e.target.value)}/>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Литера:</span>
              <input className="dt-input" value={tb.litera} onChange={(e) => upd('litera', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Масштаб:</span>
              <input className="dt-input" value={tb.scale} onChange={(e) => upd('scale', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Лист №:</span>
              <input className="dt-input" type="number" value={tb.sheetNumber} onChange={(e) => upd('sheetNumber', Number(e.target.value))}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Листов:</span>
              <input className="dt-input" type="number" value={tb.totalSheets} onChange={(e) => upd('totalSheets', Number(e.target.value))}/>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Разраб.:</span>
              <input className="dt-input" value={tb.developer} onChange={(e) => upd('developer', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Пров.:</span>
              <input className="dt-input" value={tb.checker} onChange={(e) => upd('checker', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Т. контр.:</span>
              <input className="dt-input" value={tb.techControl} onChange={(e) => upd('techControl', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Н. контр.:</span>
              <input className="dt-input" value={tb.normControl} onChange={(e) => upd('normControl', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Утв.:</span>
              <input className="dt-input" value={tb.approver} onChange={(e) => upd('approver', e.target.value)}/>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Дата:</span>
              <input className="dt-input" value={tb.date} onChange={(e) => upd('date', e.target.value)}/>
            </label>
          </div>
        </div>
        <div className="dt-modal-footer">
          <button className="dt-btn primary" onClick={() => { onApply(fmt, tb); onClose(); }}>Применить</button>
          <button className="dt-btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>);
};
export const GostBomDialog: React.FC<{
    project: SchematicProject;
    entries: BomEntry[];
    onSaveFile: (filename: string, content: string, ext: string) => void;
    onInsertAsTable?: (entries: BomEntry[]) => void;
    onClose: () => void;
}> = ({ project, entries, onSaveFile, onInsertAsTable, onClose }) => {
    const [showPatternCol, setShowPatternCol] = useState(false);
    const grouped = new Map<string, BomEntry[]>();
    for (const e of entries) {
        if (!grouped.has(e.groupTitle))
            grouped.set(e.groupTitle, []);
        grouped.get(e.groupTitle)!.push(e);
    }
    const totalQty = entries.reduce((acc, e) => acc + e.quantity, 0);
    return (<div className="dt-modal-backdrop">
      <div className="dt-modal" style={{ width: 780 }}>
        <div className="dt-modal-title">
          <span>Перечень элементов (ГОСТ 2.701-2008 / ГОСТ 2.106-96)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, color: '#222' }}>
            <div>
              Обозначение документа: <b>{(project.sheets[0]?.titleBlock.designation || 'ГТРС.001 Э3').replace('Э3', 'ПЭ3')}</b> | Позиций: <b>{entries.length}</b> (шт.: <b>{totalQty}</b>)
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
              <input type="checkbox" checked={showPatternCol} onChange={(e) => setShowPatternCol(e.target.checked)}/>
              Показать столбец «Корпус» (инж.)
            </label>
          </div>
          <div style={{ maxHeight: 390, overflowY: 'auto', border: '1px solid #000', background: '#fff' }}>
            <table className="dt-table" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 105, textAlign: 'center', borderRight: '1px solid #999' }}>Поз. обозначение</th>
                  <th style={{ borderRight: '1px solid #999' }}>Наименование</th>
                  <th style={{ width: 52, textAlign: 'center', borderRight: '1px solid #999' }}>Кол.</th>
                  <th style={{ width: 170 }}>Примечание</th>
                  {showPatternCol && <th style={{ width: 110, borderLeft: '1px solid #999' }}>Корпус</th>}
                </tr>
              </thead>
              <tbody>
                {Array.from(grouped.entries()).map(([group, list], gi) => (<React.Fragment key={group}>
                    {gi > 0 && (<tr>
                        <td style={{ height: 16 }}/>
                        <td />
                        <td />
                        <td />
                        {showPatternCol && <td />}
                      </tr>)}
                    <tr style={{ background: '#f7f7f7' }}>
                      <td />
                      <td style={{ textAlign: 'center', fontWeight: 600, textDecoration: 'underline' }}>{group}</td>
                      <td />
                      <td />
                      {showPatternCol && <td />}
                    </tr>
                    {list.map((e, i) => (<tr key={`${group}_${i}`}>
                        <td style={{ textAlign: 'center' }}>{e.refDesList}</td>
                        <td>{e.name}</td>
                        <td style={{ textAlign: 'center' }}>{e.quantity}</td>
                        <td>{e.note}</td>
                        {showPatternCol && <td style={{ color: '#444' }}>{e.pattern}</td>}
                      </tr>))}
                  </React.Fragment>))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="dt-modal-footer">
          {onInsertAsTable && (<button className="dt-btn" onClick={() => { onInsertAsTable(entries); onClose(); }}>
              Разместить таблицу на листе
            </button>)}
          <button className="dt-btn" onClick={() => onSaveFile(`${project.projectName}_ПЭ3.csv`, exportGostBomToCsv(entries), 'csv')}>
            Экспорт CSV (Excel)
          </button>
          <button className="dt-btn primary" onClick={() => onSaveFile(`${project.projectName}_ПЭ3_ГОСТ.html`, exportGostBomToHtml(project, entries), 'html')}>
            Экспорт HTML / Печать ГОСТ
          </button>
          <button className="dt-btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>);
};
export const SpiceSimDialog: React.FC<{
    result: SpiceSimResult;
    onExportNetlist: (content: string) => void;
    onRunMode?: (mode: 'DC' | 'Transient' | 'AC', stopTimeMs?: number) => void;
    onClose: () => void;
}> = ({ result, onExportNetlist, onRunMode, onClose }) => {
    const [plotMode, setPlotMode] = useState<'Transient' | 'AC'>(
        result.mode === 'AC'
            ? 'AC'
            : result.timePoints.length > 0
                ? 'Transient'
                : (result.frequencies && result.frequencies.length > 0 ? 'AC' : 'Transient')
    );
    const netNames = Object.keys(result.waveforms).filter((n) => !n.startsWith('#')).slice(0, 6);
    const acNetNames = Object.keys(result.acMagnitudeDb ?? {}).filter((n) => !n.startsWith('#')).slice(0, 6);
    const colors = ['#00ff66', '#ffaa00', '#00ccff', '#ff5577', '#ffff44', '#cc88ff'];
    const handleSwitchMode = (m: 'Transient' | 'AC') => {
        setPlotMode(m);
        if (m === 'AC' && (!result.frequencies || result.frequencies.length === 0) && onRunMode) {
            onRunMode('AC');
        }
        else if (m === 'Transient' && result.timePoints.length === 0 && onRunMode) {
            onRunMode('Transient', 5);
        }
    };
    const renderAcBodeSvg = () => {
        const freqs = result.frequencies ?? [];
        const acData = result.acMagnitudeDb ?? {};
        const w = 520, h = 210, padL = 44, padB = 24, padT = 12, padR = 12;
        const pw = w - padL - padR;
        const ph = h - padT - padB;
        if (freqs.length < 2 || acNetNames.length === 0) {
            return (<div style={{ width: w, height: h, background: '#080c10', border: '1px solid #555', color: '#9aa8b6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Нажмите «Расчёт АЧХ» для построения графика Боде (10 Гц .. 10 МГц)
        </div>);
        }
        const logMin = Math.log10(Math.max(1, freqs[0]));
        const logMax = Math.log10(Math.max(10, freqs[freqs.length - 1]));
        const logSpan = Math.max(0.5, logMax - logMin);
        let dbMin = -40, dbMax = 10;
        for (const n of acNetNames) {
            for (const db of acData[n] ?? []) {
                if (db < dbMin)
                    dbMin = Math.floor(db / 10) * 10;
                if (db > dbMax)
                    dbMax = Math.ceil(db / 10) * 10;
            }
        }
        const dbSpan = Math.max(10, dbMax - dbMin);
        return (<svg width={w} height={h} style={{ background: '#080c10', border: '1px solid #555' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const y = padT + f * ph;
                const dbVal = (dbMax - f * dbSpan).toFixed(0);
                return (<g key={f}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#23303d" strokeDasharray="2,2"/>
              <text x={4} y={y + 4} fill="#9aa8b6" fontSize="10">{dbVal} дБ</text>
            </g>);
            })}
        {acNetNames.map((n, ni) => {
                const pts = (acData[n] ?? [])
                    .map((db, i) => {
                    const lf = Math.log10(Math.max(1, freqs[i] ?? 1));
                    const x = padL + ((lf - logMin) / logSpan) * pw;
                    const y = padT + (1 - (db - dbMin) / dbSpan) * ph;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                    .join(' ');
                return <polyline key={n} points={pts} fill="none" stroke={colors[ni % colors.length]} strokeWidth="1.6"/>;
            })}
        <text x={w / 2} y={h - 6} fill="#9aa8b6" fontSize="10" textAnchor="middle">
          Частота f (логарифмическая шкала, {freqs[0]} Гц .. {(freqs[freqs.length - 1] / 1e6).toFixed(1)} МГц)
        </text>
      </svg>);
    };
    const renderWaveformSvg = () => {
        const w = 520, h = 210, padL = 42, padB = 24, padT = 12, padR = 12;
        const pw = w - padL - padR;
        const ph = h - padT - padB;
        const tMax = result.timePoints[result.timePoints.length - 1] || 1;
        let vMin = 0, vMax = 5.5;
        for (const n of netNames) {
            for (const v of result.waveforms[n]) {
                if (v < vMin)
                    vMin = v;
                if (v > vMax)
                    vMax = v;
            }
        }
        const vSpan = Math.max(0.5, vMax - vMin);
        return (<svg width={w} height={h} style={{ background: '#080c10', border: '1px solid #555' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const y = padT + f * ph;
                const vVal = (vMax - f * vSpan).toFixed(1);
                return (<g key={f}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#23303d" strokeDasharray="2,2"/>
              <text x={4} y={y + 4} fill="#9aa8b6" fontSize="10">{vVal} В</text>
            </g>);
            })}
        {netNames.map((n, ni) => {
                const pts = result.waveforms[n]
                    .map((v, i) => {
                    const x = padL + ((result.timePoints[i] || 0) / tMax) * pw;
                    const y = padT + (1 - (v - vMin) / vSpan) * ph;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                    .join(' ');
                return <polyline key={n} points={pts} fill="none" stroke={colors[ni % colors.length]} strokeWidth="1.6"/>;
            })}
        <text x={w / 2} y={h - 6} fill="#9aa8b6" fontSize="10" textAnchor="middle">
          Время, мс (0 .. {tMax.toFixed(2)} мс)
        </text>
      </svg>);
    };
    const activeLegend = plotMode === 'AC' ? acNetNames : netNames;
    return (<div className="dt-modal-backdrop">
      <div className="dt-modal" style={{ width: 840 }}>
        <div className="dt-modal-title">
          <span>SPICE-симуляция (Модифицированный узловой анализ MNA)</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, background: '#e8f6ea', border: '1px solid #82c991', padding: '4px 8px' }}>
              {result.message}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`dt-btn ${plotMode === 'Transient' ? 'primary' : ''}`} onClick={() => handleSwitchMode('Transient')}>
                Переходный процесс (TRAN)
              </button>
              <button className={`dt-btn ${plotMode === 'AC' ? 'primary' : ''}`} onClick={() => handleSwitchMode('AC')}>
                АЧХ / Боде (AC Sweep)
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {plotMode === 'AC' ? 'Амплитудно-частотная характеристика (дБ):' : 'Осциллограмма переходного процесса:'}
              </div>
              {plotMode === 'AC' ? renderAcBodeSvg() : renderWaveformSvg()}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {activeLegend.map((n, i) => (<span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 3, background: colors[i % colors.length], display: 'inline-block' }}/>
                    {n}
                  </span>))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Потенциалы узлов (DC):</div>
              <div style={{ maxHeight: 210, overflowY: 'auto', border: '1px solid #aaa' }}>
                <table className="dt-table">
                  <thead>
                    <tr><th>Цепь</th><th>Udc, В</th></tr>
                  </thead>
                  <tbody>
                    {result.dcNodes.map((n) => (<tr key={n.netName}>
                        <td>{n.netName}</td>
                        <td>{n.dcVoltage.toFixed(3)}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>Экспортированный SPICE-нетлист (.cir):</div>
            <textarea readOnly value={result.spiceNetlist} style={{ width: '100%', height: 90, fontFamily: 'Consolas, monospace', fontSize: 11 }}/>
          </div>
        </div>
        <div className="dt-modal-footer">
          <button className="dt-btn" onClick={() => onExportNetlist(result.spiceNetlist)}>Сохранить .cir</button>
          <button className="dt-btn primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>);
};
export const HotkeySettingsDialog: React.FC<{
    hotkeys: HotkeyMap;
    onSave: (next: HotkeyMap) => void;
    onClose: () => void;
}> = ({ hotkeys, onSave, onClose }) => {
    const [map, setMap] = useState<HotkeyMap>({ ...hotkeys });
    const errors = validateHotkeys(map);
    const labels: Record<string, string> = {
        selectAll:'Выделить всё',cut:'Вырезать',copy:'Копировать',paste:'Вставить',duplicate:'Дублировать',properties:'Свойства объекта',saveAs:'Сохранить как',print:'Печать',placeComponent:'Разместить компонент',placeText:'Текст',placeJunction:'Узел соединения',placeBusTap:'Отвод шины',placeCircle:'Окружность',noConnect:'Не подключать',
        selectTool: 'Режим выделения',
        placeWire: 'Проводник (цепь)',
        placeBus: 'Шина',
        placePort: 'Порт цепи',
        rotate: 'Повернуть на 90°',
        flipX: 'Отразить по горизонтали',
        flipY: 'Отразить по вертикали',
        zoomFit: 'Показать весь лист / плату',
        zoomIn: 'Приблизить масштаб',
        zoomOut: 'Отдалить масштаб',
        toggleGrid: 'Сетка Вкл/Выкл',
        runCheck: 'Проверка ERC / DRC',
        convertToPcb: 'Конвертировать в плату',
        routeManual: 'Ручная трассировка (Плата)',
        placeVia: 'Переходное отверстие (Via)',
        updatePours: 'Обновить все полигоны',
        undo: 'Отменить',
        redo: 'Повторить',
        save: 'Сохранить проект',
        find: 'Поиск компонентов / цепей'
    };
    return (<div className="dt-modal-backdrop">
      <div className="dt-modal" style={{ width: 480 }}>
        <div className="dt-modal-title">
          <span>Настройка горячих клавиш</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table className="dt-table">
            <thead>
              <tr><th>Команда</th><th style={{ width: 130 }}>Комбинация</th></tr>
            </thead>
            <tbody>
              {Object.entries(map).map(([k, v]) => (<tr key={k}>
                  <td>{labels[k] ?? k}</td>
                  <td>
                    <input className="dt-input" style={{ width: '100%' }} value={v} onKeyDown={(e) => { if (['Tab', 'Backspace', 'Delete'].includes(e.key))
            return; e.preventDefault(); if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key))
            return; const code = e.code.startsWith('Key') ? e.code.slice(3) : e.key === 'Escape' ? 'Esc' : e.key === ' ' ? 'Space' : e.key; setMap(prev => ({ ...prev, [k]: [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey && code !== '+' ? 'Shift' : '', code].filter(Boolean).join('+') })); }} onChange={(e) => setMap((prev) => ({ ...prev, [k]: e.target.value }))}/>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
        {errors.length > 0 && <div role="alert" style={{ color: '#b00', padding: 8 }}>{errors.join('; ')}</div>}
        <div className="dt-modal-footer">
          <button className="dt-btn" onClick={() => setMap({ ...DEFAULT_HOTKEYS })}>Сбросить</button>
          <button className="dt-btn primary" disabled={errors.length > 0} onClick={() => { onSave(map); onClose(); }}>Сохранить</button>
          <button className="dt-btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>);
};
export const ColorSettingsDialog: React.FC<{
    scheme: ColorSchemeId;
    onApply: (s: ColorSchemeId) => void;
    onClose: () => void;
}> = ({ scheme, onApply, onClose }) => {
    const [val, setVal] = useState<ColorSchemeId>(scheme);
    return (<div className="dt-modal-backdrop">
      <div className="dt-modal" style={{ width: 380 }}>
        <div className="dt-modal-title">
          <span>Цветовая схема рабочего поля</span>
          <button className="dt-btn" style={{ minWidth: 22, height: 18, padding: 0 }} onClick={onClose}>×</button>
        </div>
        <div className="dt-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label><input type="radio" checked={val === 'dark'} onChange={() => setVal('dark')}/> Классическая чёрная (как в DipTrace)</label>
          <label><input type="radio" checked={val === 'light'} onChange={() => setVal('light')}/> Светлая (цветные цепи на белом листе)</label>
          <label><input type="radio" checked={val === 'gost-bw'} onChange={() => setVal('gost-bw')}/> Чёрно-белая ЕСКД (строго под печать ГОСТ)</label>
        </div>
        <div className="dt-modal-footer">
          <button className="dt-btn primary" onClick={() => { onApply(val); onClose(); }}>ОК</button>
          <button className="dt-btn" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>);
};
