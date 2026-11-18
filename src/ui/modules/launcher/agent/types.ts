import type { ColorSchemeId, SchematicProject, PcbProject } from '../../../../core/models';
import type { RecentProjectItem, RecentProjectSnapshot } from '../../../../core/store';
import type { AgentDraft, AgentCapture } from './workspace';
import type { AppModuleId } from '../../../../core/types';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  details?: string;
  verification?: string;
  status?: string;
}

export interface RunStats {
  requests: number;
  tokens: number;
  decisionCost: number;
  decisions: number;
}

export interface SavedDraft extends AgentDraft {
  task?: string;
  conversation?: Message[];
  stats?: RunStats;
}

export interface AiConnectionSettings {
  endpoint: string;
  key: string;
  model: string;
}

export interface Props {
  visible: boolean;
  theme: ColorSchemeId;
  selected?: RecentProjectItem;
  selectedDocuments?: RecentProjectSnapshot;
  onSaved: (id: string) => void;
  onSwitchModule?: (moduleId: AppModuleId) => void;
}

export const PRESET_ENDPOINTS = [
  { label: 'AITunnel (Прокси)', url: 'https://api.aitunnel.ru/v1' },
  { label: 'Локальный Ollama', url: 'http://127.0.0.1:11434/v1' },
  { label: 'Локальный vLLM / LM Studio', url: 'http://127.0.0.1:8000/v1' },
  { label: 'Корпоративный шлюз компании', url: 'http://llm.corp.internal/v1' }
] as const;

export const DEFAULT_MODELS = [
  'deepseek-v4.1-flash-1017',
  'claude-haiku-5.5',
  'qwen2.5-coder:32b',
  'gpt-4o'
] as const;

export const toolLabels: Record<string, string> = {
  query_library: 'Подбор компонентов',
  search_library: 'Поиск в библиотеке',
  read_library: 'Чтение определения',
  create_schematic: 'Создание схемы',
  place_component: 'Размещение компонента',
  connect_net: 'Соединение цепи',
  wire: 'Прокладка проводника',
  configure_document: 'Оформление документа по ГОСТ',
  set_frame: 'Настройка листа и рамки',
  create_board: 'Создание печатной платы',
  place_target_footprints: 'Размещение по техническому заданию',
  sync_target_pad_nets: 'Сверка назначений площадок',
  route_remaining: 'Пакетная разводка по техническому заданию',
  route_nets: 'Локальная переразводка нескольких цепей',
  route_between_pads: 'Соединение контактных площадок',
  route_trace: 'Прокладка печатного проводника',
  check: 'Контроль проекта (ERC/DRC)',
  compare_requirements: 'Сверка с техническим заданием',
  finalize_project: 'Итоговая верификация проекта',
  screenshot: 'Снимок документа',
  render_review: 'Визуальный контроль геометрии',
  set_targets: 'Фиксация требований ТЗ',
  set_component_labels: 'Размещение позиционных обозначений',
  set_component_values: 'Обновление номиналов',
  rename_net: 'Переименование цепи',
  sync_board_from_schematic: 'Синхронизация платы со схемой',
  remember: 'Обновление плана проектирования',
  inspect: 'Инспекция состояния проекта',
  finish: 'Формирование комплекта документации',
  restore_verified: 'Восстановление верифицированной версии',
  delete_schematic: 'Удаление элементов схемы',
  delete_board: 'Удаление элементов платы',
  refill_copper: 'Пересчёт полигонов металлизации'
};
