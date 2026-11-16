import { PcbLayerConfig } from '../../core/types';

/** Creates standard 2-layer or 4-layer DipTrace-compatible PCB layer configuration. */
export function createDefaultPcbLayers(layerCount: 2 | 4 = 2): PcbLayerConfig[] {
  const layers: PcbLayerConfig[] = [
    { id: 'TopCopper', name: 'Верхний (Top)', kind: 'Signal', routingDirection: 'Horizontal', color: '#FF3030', visible: true, enabled: true }
  ];
  if (layerCount === 4) {
    layers.push(
      { id: 'Inner1', name: 'Внутренний 1 (GND)', kind: 'Plane', routingDirection: 'Any', color: '#FFAA00', visible: true, enabled: true },
      { id: 'Inner2', name: 'Внутренний 2 (PWR)', kind: 'Plane', routingDirection: 'Any', color: '#00CCCC', visible: true, enabled: true }
    );
  }
  layers.push(
    { id: 'BottomCopper', name: 'Нижний (Bottom)', kind: 'Signal', routingDirection: 'Vertical', color: '#3078FF', visible: true, enabled: true },
    { id: 'TopSilk', name: 'Шелкография Верх', kind: 'NonSignal', routingDirection: 'Any', color: '#FFFFFF', visible: true, enabled: true },
    { id: 'BottomSilk', name: 'Шелкография Низ', kind: 'NonSignal', routingDirection: 'Any', color: '#AA88FF', visible: true, enabled: true },
    { id: 'TopMask', name: 'Маска Верх', kind: 'NonSignal', routingDirection: 'Any', color: '#9933AA', visible: false, enabled: true },
    { id: 'BottomMask', name: 'Маска Низ', kind: 'NonSignal', routingDirection: 'Any', color: '#662288', visible: false, enabled: true },
    { id: 'TopPaste', name: 'Паста Верх', kind: 'NonSignal', routingDirection: 'Any', color: '#999999', visible: false, enabled: true },
    { id: 'BottomPaste', name: 'Паста Низ', kind: 'NonSignal', routingDirection: 'Any', color: '#777777', visible: false, enabled: true },
    { id: 'TopAssembly', name: 'Сборочный Верх', kind: 'NonSignal', routingDirection: 'Any', color: '#FFCC00', visible: false, enabled: true },
    { id: 'Courtyard', name: 'Двор (Courtyard)', kind: 'NonSignal', routingDirection: 'Any', color: '#808080', visible: true, enabled: true },
    { id: 'BoardOutline', name: 'Контур платы', kind: 'NonSignal', routingDirection: 'Any', color: '#CC44FF', visible: true, enabled: true },
    { id: 'Keepout', name: 'Запрет (Keepout)', kind: 'NonSignal', routingDirection: 'Any', color: '#FF0088', visible: true, enabled: true }
  );
  return layers;
}
