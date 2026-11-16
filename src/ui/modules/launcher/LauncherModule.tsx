import React, { useEffect, useRef, useState } from 'react';
import { AppModuleId, ColorSchemeId, GostAccuracyClass, Units } from '../../../core/types';
import {
  AppSettings,
  createProjectFromOptions,
  loadRecentProjectSnapshot,
  loadSettings,
  NewProjectOptions,
  openPickedProjectFile,
  RecentProjectItem,
  saveActivePcb,
  saveActiveSchematic,
  saveSettings
} from '../../../core/store';
import { pickCadFile } from '../../../core/utils/fileIo';
import { NewProjectDialog } from '../../components/NewProjectDialog';
import { DipIcon, DipIconName } from '../../theme/DipTraceIcons';

interface Props {
  onSwitchModule: (moduleId: AppModuleId) => void;
}

const MODULES: { id: AppModuleId; title: string; icon: DipIconName }[] = [
  { id: 'schematic', title: 'Схемотехника (Schematic Capture)', icon: 'launcherSch' },
  { id: 'pcb', title: 'Плата (PCB Layout & Autorouter)', icon: 'launcherPcb' },
  { id: 'componentEditor', title: 'Редактор компонентов (Component Editor)', icon: 'launcherComp' },
  { id: 'patternEditor', title: 'Редактор корпусов (Pattern Editor)', icon: 'launcherPat' },
  { id: 'pcb3d', title: '3D-просмотр платы (3D Preview)', icon: 'launcher3d' }
];

export const LauncherModule: React.FC<Props> = ({ onSwitchModule }) => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showRecentMenu, setShowRecentMenu] = useState(false);
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const recentRef = useRef<HTMLDivElement>(null);
  const logoSrc = `${import.meta.env?.BASE_URL ?? './'}logo.svg`;

  useEffect(() => {
    document.title = 'SIPTrace';
  }, []);

  useEffect(() => {
    if (!showRecentMenu) return;
    const onDown = (e: MouseEvent) => {
      if (recentRef.current && !recentRef.current.contains(e.target as Node)) {
        setShowRecentMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRecentMenu(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [showRecentMenu]);

  const updateSetting = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      saveSettings(next);
      return next;
    });
  };

  const handleCreateProject = (opts: NewProjectOptions) => {
    const res = createProjectFromOptions(opts);
    setSettings(loadSettings());
    setShowNewDialog(false);
    setLauncherError(null);
    onSwitchModule(res.targetModule);
  };

  const handleOpenAnyFile = async () => {
    setLauncherError(null);
    const picked = await pickCadFile(
      '.gostsch,.gostpcb,.gostlib,.dch,.dchxml,.dip,.asc,.xml,.pdsprj,.sec,.sdf,.kicad_sch,.kicad_pcb,.kicad_sym,.kicad_mod,.sch,.brd,.lbr,.eli,.lib,.json,.esch,.epcb,.schdoc,.pcbdoc,.edf,.cir,.dxf,.gbr,.gtl,.gbl,.zip',
      [
        {
          name: 'Проекты и файлы САПР (SIPTrace / DipTrace / KiCad / Proteus / Eagle / Altium / Gerber)',
          extensions: [
            'gostsch',
            'gostpcb',
            'gostlib',
            'dch',
            'dchxml',
            'dip',
            'asc',
            'xml',
            'pdsprj',
            'kicad_sch',
            'kicad_pcb',
            'kicad_sym',
            'kicad_mod',
            'sch',
            'brd',
            'lbr',
            'eli',
            'lib',
            'json',
            'dxf',
            'gbr',
            'zip'
          ]
        }
      ]
    );
    if (!picked) return;
    try {
      const opened = await openPickedProjectFile(picked);
      setSettings(loadSettings());
      onSwitchModule(opened.targetModule);
    } catch (err) {
      setLauncherError(`Не удалось открыть файл: ${(err as Error).message}`);
    }
  };

  const handleOpenRecent = (item: RecentProjectItem) => {
    setShowRecentMenu(false);
    setLauncherError(null);
    if (item.demoKey === 'rs485') {
      const res = createProjectFromOptions(
        {
          mode: 'demo_rs485',
          projectName: item.name,
          titleName: item.name,
          designation: item.designation,
          sheetFormat: 'A3_L',
          boardWidthMm: 90,
          boardHeightMm: 55,
          boardCornerRadiusMm: 0,
          boardIsCircle: false,
          boardLayers: 2,
          accuracyClass: settings.defaultAccuracyClass,
          units: settings.units,
          developer: settings.authorName,
          checker: settings.checkerName ?? '',
          normControl: settings.normControlName ?? '',
          organization: settings.organization
        },
        item.module === 'pcb' ? 'pcb' : 'schematic'
      );
      onSwitchModule(item.module === 'pcb3d' ? 'pcb3d' : res.targetModule);
      return;
    }
    if (item.demoKey === 'mcu') {
      const res = createProjectFromOptions(
        {
          mode: 'demo_mcu',
          projectName: item.name,
          titleName: item.name,
          designation: item.designation,
          sheetFormat: 'A3_L',
          boardWidthMm: 100,
          boardHeightMm: 70,
          boardCornerRadiusMm: 0,
          boardIsCircle: false,
          boardLayers: 2,
          accuracyClass: settings.defaultAccuracyClass,
          units: settings.units,
          developer: settings.authorName,
          checker: settings.checkerName ?? '',
          normControl: settings.normControlName ?? '',
          organization: settings.organization
        },
        item.module === 'pcb' ? 'pcb' : 'schematic'
      );
      onSwitchModule(item.module === 'pcb3d' ? 'pcb3d' : res.targetModule);
      return;
    }
    const snap = loadRecentProjectSnapshot(item.id);
    if (!snap || (item.module === 'schematic' && !snap.schematic) || (item.module === 'pcb' && !snap.pcb)) {
      setLauncherError(`Снимок проекта «${item.name}» не найден. Откройте файл проекта вручную через «Открыть...».`);
      return;
    }
    if (snap.schematic) saveActiveSchematic(snap.schematic);
    if (snap.pcb) saveActivePcb(snap.pcb);
    onSwitchModule(item.module);
  };

  const recentList = settings.recentProjects ?? [];

  return (
    <div className="dt-launcher-win">
      <div className="dt-launcher-inner">
        <div className="dt-launcher-brand">
          <img src={logoSrc} alt="SIPTrace" width={36} height={36} className="dt-launcher-logo" />
          <div className="dt-launcher-brand-title">SIPTrace</div>
        </div>

        <div className="dt-launcher-actions" ref={recentRef}>
          <button
            type="button"
            className="dt-btn primary"
            style={{ height: 28, fontWeight: 600 }}
            onClick={() => {
              setShowRecentMenu(false);
              setShowNewDialog(true);
            }}
          >
            + Создать проект...
          </button>
          <button
            type="button"
            className="dt-btn"
            style={{ height: 28 }}
            onClick={() => {
              setShowRecentMenu(false);
              handleOpenAnyFile();
            }}
          >
            Открыть...
          </button>
          <button
            type="button"
            className="dt-btn"
            style={{ height: 28 }}
            disabled={recentList.length === 0}
            onClick={() => setShowRecentMenu((v) => !v)}
          >
            Недавние ▾
          </button>

          {showRecentMenu && recentList.length > 0 && (
            <div className="dt-launcher-recent-menu">
              {recentList.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="dt-launcher-recent-item"
                  title={`${r.name}${r.designation ? ` (${r.designation})` : ''} · ${r.updatedAt}`}
                  onClick={() => handleOpenRecent(r)}
                >
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#555555', flexShrink: 0 }}>
                    {r.module === 'pcb' ? 'Плата' : r.module === 'pcb3d' ? '3D' : 'Схема'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {launcherError && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: 4 }}>
            <span style={{ overflowWrap: 'anywhere' }}>{launcherError}</span>
            <button
              type="button"
              onClick={() => setLauncherError(null)}
              style={{ border: 'none', background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontWeight: 700, padding: '0 2px', flexShrink: 0 }}
              aria-label="Закрыть ошибку"
            >
              ×
            </button>
          </div>
        )}

        {MODULES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="dt-launcher-module-btn"
            onClick={() => onSwitchModule(m.id)}
          >
            <DipIcon name={m.icon} size={40} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.title}
            </span>
          </button>
        ))}

        <div className="dt-launcher-settings">
          <div style={{ fontSize: 11, fontWeight: 600, color: '#333', marginBottom: 2 }}>
            Параметры по умолчанию (ЕСКД ГОСТ 2.104 / 23751)
          </div>

          <label className="dt-launcher-field">
            <span>Разработчик</span>
            <input
              className="dt-input"
              value={settings.authorName}
              onChange={(e) => updateSetting('authorName', e.target.value)}
            />
          </label>

          <label className="dt-launcher-field">
            <span>Проверил</span>
            <input
              className="dt-input"
              value={settings.checkerName ?? ''}
              onChange={(e) => updateSetting('checkerName', e.target.value)}
            />
          </label>

          <label className="dt-launcher-field">
            <span>Н. контр.</span>
            <input
              className="dt-input"
              value={settings.normControlName ?? ''}
              onChange={(e) => updateSetting('normControlName', e.target.value)}
            />
          </label>

          <label className="dt-launcher-field">
            <span>Организация</span>
            <input
              className="dt-input"
              value={settings.organization}
              onChange={(e) => updateSetting('organization', e.target.value)}
            />
          </label>

          <label className="dt-launcher-field">
            <span>Класс ПП</span>
            <select
              className="dt-select"
              value={settings.defaultAccuracyClass}
              onChange={(e) => updateSetting('defaultAccuracyClass', Number(e.target.value) as GostAccuracyClass)}
            >
              <option value={1}>Класс 1 (0.75 мм / ГОСТ 23751-86)</option>
              <option value={2}>Класс 2 (0.45 мм / ГОСТ 23751-86)</option>
              <option value={3}>Класс 3 (0.25 мм / ГОСТ 23751-86)</option>
              <option value={4}>Класс 4 (0.15 мм / ГОСТ 23751-86)</option>
              <option value={5}>Класс 5 (0.10 мм / ГОСТ 23751-86)</option>
            </select>
          </label>

          <label className="dt-launcher-field">
            <span>Единицы</span>
            <select
              className="dt-select"
              value={settings.units}
              onChange={(e) => updateSetting('units', e.target.value as Units)}
            >
              <option value="mm">Миллиметры (мм)</option>
              <option value="mil">Милы (mil)</option>
              <option value="in">Дюймы (in)</option>
            </select>
          </label>

          <label className="dt-launcher-field">
            <span>Тема листа</span>
            <select
              className="dt-select"
              value={settings.colorScheme}
              onChange={(e) => updateSetting('colorScheme', e.target.value as ColorSchemeId)}
            >
              <option value="dark">Классическая чёрная (DipTrace)</option>
              <option value="gost-bw">Чёрно-белая ЕСКД (печать ГОСТ)</option>
              <option value="light">Светлая инженерная</option>
            </select>
          </label>
        </div>
      </div>

      {showNewDialog && (
        <NewProjectDialog
          initialMode="schematic_and_pcb"
          onCreate={handleCreateProject}
          onClose={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
};
