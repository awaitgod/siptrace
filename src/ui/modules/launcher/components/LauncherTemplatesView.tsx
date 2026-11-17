import React from 'react';
import {
  IconCpu,
  IconLayersLinked,
  IconFileText,
  IconPlus,
  IconCheck
} from '@tabler/icons-react';
import type { AppModuleId } from '../../../../core/types';
import {
  buildDefaultNewProjectOptions,
  createProjectFromOptions,
  NewProjectOptions
} from '../../../../core/store';
import { DipIcon } from '../../../theme/DipTraceIcons';

interface LauncherTemplatesViewProps {
  onSwitchModule: (moduleId: AppModuleId) => void;
  onShowMessage: (msg: string) => void;
}

export const LauncherTemplatesView: React.FC<LauncherTemplatesViewProps> = ({
  onSwitchModule,
  onShowMessage
}) => {
  const handleCreateDemo = (mode: 'demo_rs485' | 'demo_mcu', target: 'schematic' | 'pcb') => {
    const opts = buildDefaultNewProjectOptions(mode);
    createProjectFromOptions(opts, target);
    onShowMessage(`Проект «${opts.titleName}» успешно создан по ГОСТ.`);
    onSwitchModule(target);
  };

  const handleCreateBlankBoard = (layers: 2 | 4, width: number, height: number, name: string) => {
    const opts: NewProjectOptions = {
      ...buildDefaultNewProjectOptions('schematic_and_pcb'),
      projectName: name,
      titleName: name,
      boardLayers: layers,
      boardWidthMm: width,
      boardHeightMm: height
    };
    createProjectFromOptions(opts, 'pcb');
    onShowMessage(`Создана заготовка платы ${width}×${height} мм (${layers} слоя).`);
    onSwitchModule('pcb');
  };

  const handleCreateGostSheet = (format: 'A3_L' | 'A4_P', title: string) => {
    const opts: NewProjectOptions = {
      ...buildDefaultNewProjectOptions('schematic_only'),
      projectName: title,
      titleName: title,
      sheetFormat: format
    };
    createProjectFromOptions(opts, 'schematic');
    onShowMessage(`Создан чистый схемный проект ГОСТ (${format}).`);
    onSwitchModule('schematic');
  };

  return (
    <div className="launch-templates-view">
      {/* Category 1 */}
      <section className="launch-template-section">
        <div className="launch-template-header">
          <IconCpu size={18} />
          <h2>Отечественная электроника и эталонные проекты ГОСТ</h2>
        </div>
        <div className="launch-template-grid">
          <div className="dt-panel-card launch-template-card">
            <div className="launch-template-card-badge gost">ГОСТ 2.104 • ЕСКД</div>
            <h3>Контроллер К1986ВЕ92QI (ПКК «Миландр»)</h3>
            <p className="launch-template-desc">
              32-разрядный микроконтроллер архитектуры ARM Cortex-M3, стабилизатор КР142ЕН5А, кварц РК-169.
              Лист формата А3, угловой штамп Форма 1, децимальный номер ГТРС.468332.005 Э3.
            </p>
            <div className="launch-template-specs">
              <span>Схема: Формат А3</span>
              <span>Деталей: 48</span>
              <span>Литера: О</span>
            </div>
            <button
              type="button"
              className="dt-btn primary launch-template-btn"
              onClick={() => handleCreateDemo('demo_mcu', 'schematic')}
            >
              <IconPlus size={14} />
              <span>Создать проект по образцу</span>
            </button>
          </div>

          <div className="dt-panel-card launch-template-card">
            <div className="launch-template-card-badge ready">Схема + Плата</div>
            <h3>Преобразователь RS-485 с гальваноразвязкой</h3>
            <p className="launch-template-desc">
              Схемотехнический проект и 2-слойная топология печатной платы 90×55 мм. Изолятор интерфейса,
              разделение земляных полигонов GND/GND_ISO, маркировка шелкографией по ГОСТ 28836.
            </p>
            <div className="launch-template-specs">
              <span>Плата: 90×55 мм</span>
              <span>Слоёв: 2 (Top/Bottom)</span>
              <span>Связность: 100%</span>
            </div>
            <div className="launch-template-actions-row">
              <button
                type="button"
                className="dt-btn primary launch-template-btn"
                onClick={() => handleCreateDemo('demo_rs485', 'schematic')}
              >
                <DipIcon name="wire" size={14} />
                <span>В схему</span>
              </button>
              <button
                type="button"
                className="dt-btn launch-template-btn"
                onClick={() => handleCreateDemo('demo_rs485', 'pcb')}
              >
                <DipIcon name="toPcb" size={14} />
                <span>В плату</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Category 2 */}
      <section className="launch-template-section">
        <div className="launch-template-header">
          <IconLayersLinked size={18} />
          <h2>Типовые заготовки печатных плат (Blank PCB)</h2>
        </div>
        <div className="launch-template-grid">
          <div className="dt-panel-card launch-template-card">
            <div className="launch-template-card-badge">2 слоя • Стандарт</div>
            <h3>Двухсторонняя плата 100 × 100 мм</h3>
            <p className="launch-template-desc">
              Классическая заготовка печатной платы. Толщина диэлектрика FR-4 1.6 мм, фольга 35 мкм (1 oz).
              Класс точности 3 по ГОСТ 23751-86 (минимальный зазор/дорожка 0.20 мм).
            </p>
            <button
              type="button"
              className="dt-btn launch-template-btn"
              onClick={() => handleCreateBlankBoard(2, 100, 100, 'Плата_100x100_2L')}
            >
              <IconPlus size={14} />
              <span>Создать плату 100×100 мм</span>
            </button>
          </div>

          <div className="dt-panel-card launch-template-card">
            <div className="launch-template-card-badge rf">4 слоя • Импеданс</div>
            <h3>4-слойная плата с контролируемым импедансом</h3>
            <p className="launch-template-desc">
              Стек слоёв: Top Copper (50 Ом ВЧ-линии) — Inner 1 (Сплошная земля GND) — Inner 2 (Питание PWR) —
              Bottom Copper (дифференциальные пары 90/100 Ом USB/Ethernet).
            </p>
            <button
              type="button"
              className="dt-btn launch-template-btn"
              onClick={() => handleCreateBlankBoard(4, 120, 80, 'Плата_Импеданс_4L')}
            >
              <IconPlus size={14} />
              <span>Создать 4-слойную заготовку</span>
            </button>
          </div>
        </div>
      </section>

      {/* Category 3 */}
      <section className="launch-template-section">
        <div className="launch-template-header">
          <IconFileText size={18} />
          <h2>Чистые бланки схем по ГОСТ 2.104-2006</h2>
        </div>
        <div className="launch-template-grid">
          <div className="dt-panel-card launch-template-card">
            <div className="launch-template-card-badge gost">Форма 1 (А3-L)</div>
            <h3>Бланк формата А3 (Альбомный)</h3>
            <p className="launch-template-desc">
              Основная надпись (штамп 185×55 мм) по ГОСТ 2.104 Форма 1. Координатная сетка зон 1..8, А..Г,
              графа 26 для инвентарных номеров.
            </p>
            <button
              type="button"
              className="dt-btn launch-template-btn"
              onClick={() => handleCreateGostSheet('A3_L', 'Схема_А3_ГОСТ')}
            >
              <IconPlus size={14} />
              <span>Открыть бланк А3</span>
            </button>
          </div>

          <div className="dt-panel-card launch-template-card">
            <div className="launch-template-card-badge gost">Форма 2 (А4-P)</div>
            <h3>Бланк формата А4 (Вертикальный)</h3>
            <p className="launch-template-desc">
              Вертикальный формат А4 (210×297 мм) с рамкой (левое поле 20 мм под переплёт) и угловым штампом
              Форма 2 по ГОСТ 2.104.
            </p>
            <button
              type="button"
              className="dt-btn launch-template-btn"
              onClick={() => handleCreateGostSheet('A4_P', 'Схема_А4_ГОСТ')}
            >
              <IconPlus size={14} />
              <span>Открыть бланк А4</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
