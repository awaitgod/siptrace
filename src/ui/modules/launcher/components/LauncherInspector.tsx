import React, { useState } from 'react';
import { IconDots, IconPin, IconX } from '@tabler/icons-react';
import type { AppModuleId, ColorSchemeId } from '../../../../core/types';
import type { RecentProjectItem, RecentProjectSnapshot } from '../../../../core/store';
import { SHEET_FORMATS } from '../../../../gost/gostTitleBlock';
import { exportGerberZipBytes } from '../../../../engines/camBundle';
import { exportTextFile } from '../../../../core/utils/fileIo';
import { polygonBounds } from '../../../../core/geometry';
import { DipIcon } from '../../../theme/DipTraceIcons';
import { formatProjectDate } from '../projectDocuments';
import { LauncherDocumentPreview } from './LauncherDocumentPreview';

type Props = {
  project: RecentProjectItem;
  documents: RecentProjectSnapshot;
  theme: ColorSchemeId;
  onClose: () => void;
  onOpenFile: () => void;
  onOpenProject: (project: RecentProjectItem, target?: AppModuleId) => void;
  onTogglePin: (id: string) => void;
  onRemoveProject: (id: string) => void;
  onShowMessage: (message: string) => void;
};

export function LauncherInspector({
  project, documents, theme, onClose, onOpenFile, onOpenProject, onTogglePin, onRemoveProject, onShowMessage
}: Props) {
  const { schematic, pcb } = documents;
  const [preview, setPreview] = useState<'schematic' | 'pcb'>(project.module === 'schematic' ? 'schematic' : 'pcb');
  const [exporting, setExporting] = useState(false);
  const board = preview === 'pcb';
  const sheet = schematic?.sheets.find(sheet => sheet.id === schematic.activeSheetId) ?? schematic?.sheets[0];
  const format = sheet && SHEET_FORMATS[sheet.format];
  const canOpen = project.module === 'schematic' ? Boolean(sheet) : Boolean(pcb);
  const bounds = pcb?.boardOutline.length ? polygonBounds(pcb.boardOutline) : null;
  const dimensions = bounds && [bounds.maxX - bounds.minX, bounds.maxY - bounds.minY]
    .map(value => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })).join(' × ') + ' мм';
  const properties = [
    ['Обозначение', (board ? project.designation : sheet?.titleBlock.designation || project.designation) || '—'],
    ...(board && pcb ? [['Слои меди', pcb.layerCount], ['Толщина', pcb.boardThickness + ' мм']] : []),
    ...(board && dimensions ? [['Габариты', dimensions]] : []),
    ...(!board && format ? [['Формат', format.label], ['Листов', schematic?.sheets.length]] : []),
    ['Изменён', formatProjectDate(project.updatedAt)]
  ];

  async function exportGerber() {
    if (!pcb || exporting) return;
    setExporting(true);
    try {
      const filename = project.name.replace(/[<>:"/\\|?*]/g, '_') + '_CAM_Gerber.zip';
      const bytes = new Uint8Array(exportGerberZipBytes(pcb, true, true));
      const result = await exportTextFile(filename, bytes, 'zip', 'Gerber ZIP');
      if (result) onShowMessage('Сформирован архив «' + filename + '».');
    } catch {
      onShowMessage('Не удалось сохранить архив Gerber.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <aside id="launch-project-inspector" className="dt-right-sidebar launch-inspector" aria-label="Свойства выбранного проекта">
      <header className="dt-panel-header launch-inspector-header">
        <span className="launch-inspector-title" title={project.name}>{project.name}</span>
        <button className="dt-tb-btn" type="button" aria-label={project.isPinned ? 'Открепить проект' : 'Закрепить проект'}
          aria-pressed={Boolean(project.isPinned)} onClick={() => onTogglePin(project.id)}><IconPin size={15} /></button>
        <button className="dt-tb-btn" type="button" aria-label="Закрыть свойства" onClick={onClose}><IconX size={15} /></button>
      </header>
      <div className="launch-inspector-content">
        <LauncherDocumentPreview documents={documents} board={board} theme={theme} />
        {schematic && pcb && <div className="launch-preview-tabs" role="group" aria-label="Документ для предпросмотра">
          <button type="button" className="dt-btn" aria-pressed={!board} onClick={() => setPreview('schematic')}>Схема</button>
          <button type="button" className="dt-btn" aria-pressed={board} onClick={() => setPreview('pcb')}>Плата</button>
        </div>}
        <div className="launch-inspector-actions">
          <button type="button" className="dt-btn primary launch-open-document"
            onClick={() => canOpen ? onOpenProject(project) : onOpenFile()}>
            <DipIcon name={project.module === 'schematic' ? 'wire' : project.module === 'pcb3d' ? 'view3d' : 'toPcb'} size={15} />
            {canOpen ? (project.module === 'schematic' ? 'Открыть схему' : project.module === 'pcb' ? 'Открыть плату' : 'Открыть 3D-просмотр') : 'Открыть с диска…'}
          </button>
          <details className="launch-project-menu" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
          }} onKeyDown={event => {
            if (event.key === 'Escape') {
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary className="dt-btn" aria-label="Действия с проектом" title="Действия с проектом"><IconDots size={16} /></summary>
            <div className="launch-project-menu-items">
              {sheet && project.module !== 'schematic' && <button className="dt-btn" onClick={() => onOpenProject(project, 'schematic')}>Открыть схему</button>}
              {pcb && project.module !== 'pcb' && <button className="dt-btn" onClick={() => onOpenProject(project, 'pcb')}>Открыть плату</button>}
              {pcb && project.module !== 'pcb3d' && <button className="dt-btn" onClick={() => onOpenProject(project, 'pcb3d')}>3D-просмотр</button>}
              {pcb && <button className="dt-btn" disabled={exporting} onClick={exportGerber}>Экспорт Gerber (ZIP)</button>}
              <button className="dt-btn" onClick={() => onRemoveProject(project.id)}>Убрать из недавних</button>
            </div>
          </details>
        </div>
        <div className="dt-panel-header">Свойства</div>
        <dl className="launch-properties">
          {properties.map(([label, value]) => <div className="dt-prop-row" key={label}>
            <dt className="dt-prop-key">{label}</dt>
            <dd className="dt-prop-val">{value}</dd>
          </div>)}
        </dl>
      </div>
    </aside>
  );
}
