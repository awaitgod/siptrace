/** Reference designator prefix metadata per GOST 2.710-81. */
export interface GostPrefixInfo {
  prefix: string;
  groupName: string;
  description: string;
}

// ГОСТ 2.710-81 — Обозначения буквенно-цифровые в электрических схемах
export const GOST_REFDES_GROUPS: GostPrefixInfo[] = [
  { prefix: 'DA', groupName: 'Микросхемы аналоговые', description: 'Операционные усилители, компараторы, стабилизаторы' },
  { prefix: 'DD', groupName: 'Микросхемы цифровые', description: 'Логические элементы, триггеры, счётчики, микроконтроллеры' },
  { prefix: 'D', groupName: 'Микросхемы интегральные', description: 'Прочие интегральные микросхемы' },
  { prefix: 'C', groupName: 'Конденсаторы', description: 'Керамические, электролитические, танталовые, плёночные' },
  { prefix: 'L', groupName: 'Катушки индуктивности и дроссели', description: 'Дроссели, катушки без сердечника и с сердечником' },
  { prefix: 'R', groupName: 'Резисторы', description: 'Постоянные, переменные, подстроечные, варисторы' },
  { prefix: 'RK', groupName: 'Терморезисторы', description: 'Терморезисторы NTC/PTC' },
  { prefix: 'RP', groupName: 'Потенциометры и сборки', description: 'Резисторные матрицы и делители' },
  { prefix: 'VD', groupName: 'Приборы полупроводниковые диодные', description: 'Диоды, стабилитроны, светодиоды, фотодиоды, варикапы' },
  { prefix: 'VT', groupName: 'Транзисторы', description: 'Биполярные, полевые, IGBT' },
  { prefix: 'VS', groupName: 'Тиристоры и симисторы', description: 'Управляемые вентили' },
  { prefix: 'U', groupName: 'Устройства и оптопары', description: 'Оптопары, модули, преобразователи' },
  { prefix: 'VU', groupName: 'Оптопары (альт. ЕСКД)', description: 'Оптоэлектронные развязки' },
  { prefix: 'XP', groupName: 'Соединители штыревые (Вилки)', description: 'Вилки кабельные и приборные' },
  { prefix: 'XS', groupName: 'Соединители гнездовые (Розетки)', description: 'Розетки и разъёмы на плату' },
  { prefix: 'XT', groupName: 'Клеммы и колодки соединительные', description: 'Винтовые и пружинные клеммники' },
  { prefix: 'X', groupName: 'Перемычки и соединители прочие', description: 'Джамперы, перемычки цепей' },
  { prefix: 'SA', groupName: 'Выключатели и переключатели', description: 'Тумблеры, DIP-переключатели, галетные' },
  { prefix: 'SB', groupName: 'Кнопки', description: 'Кнопки тактовые и нажимные' },
  { prefix: 'K', groupName: 'Реле и контакторы', description: 'Электромагнитные и твердотельные реле' },
  { prefix: 'T', groupName: 'Трансформаторы', description: 'Силовые, импульсные, согласующие' },
  { prefix: 'F', groupName: 'Предохранители и разрядники', description: 'Плавкие вставки, самовосстанавливающиеся предохранители' },
  { prefix: 'FU', groupName: 'Предохранители плавкие', description: 'Плавкие вставки' },
  { prefix: 'HL', groupName: 'Приборы световой сигнализации', description: 'Лампы, светодиодные индикаторы' },
  { prefix: 'HG', groupName: 'Индикаторы символьные', description: 'Семисегментные, ЖКИ' },
  { prefix: 'BQ', groupName: 'Кварцевые резонаторы', description: 'Кварцы и ПАВ-резонаторы' },
  { prefix: 'BA', groupName: 'Громкоговорители и излучатели', description: 'Пьезоизлучатели, зуммеры' },
  { prefix: 'B', groupName: 'Датчики и энкодеры', description: 'Преобразователи неэлектрических величин' },
  { prefix: 'M', groupName: 'Двигатели и приводы', description: 'Сервоприводы, шаговые двигатели' },
  { prefix: 'P', groupName: 'Приборы измерительные и интерфейсы', description: 'Виртуальные терминалы, приборы' },
  { prefix: 'GB', groupName: 'Батареи и аккумуляторы', description: 'Химические источники тока' },
  { prefix: 'W', groupName: 'Антенны и линии СВЧ', description: 'Антенные элементы' },
  { prefix: 'Z', groupName: 'Фильтры и линии задержки', description: 'Кварцевые, керамические, LC-фильтры' }
];

export const GOST_GROUP_ORDER = [
  'A', 'B', 'BA', 'BQ', 'C', 'D', 'DA', 'DD', 'F', 'FU', 'GB', 'HG', 'HL', 'K', 'L',
  'M', 'P', 'R', 'RK', 'RP', 'SA', 'SB', 'T', 'U', 'VD', 'VS', 'VT', 'VU', 'W', 'X', 'XP', 'XS', 'XT', 'Z'
];
