import { ComponentDef, ComponentLibrary } from '../../../core/types';
import { libGeneral } from './general';
import { libResistors } from './resistors';
import { libCapacitors } from './capacitors';
import { libInductors } from './inductors';
import { libDiodes } from './diodes';
import { libTransistors } from './transistors';
import { libOpto } from './opto';
import { libAnalogIC } from './analogIc';
import { libDigitalIC } from './digitalIc';
import { libRussianMcu } from './russianMcu';
import { libAvrMcu } from './avrMcu';
import { libIndicatorsAndSensors, libLabInterfacesAndPower } from './labModules';
import { libConnectorsAndSwitch } from './connectorsAndSwitch';

export const GOST_COMPONENT_LIBRARIES: ComponentLibrary[] = [
  libGeneral,
  libResistors,
  libCapacitors,
  libInductors,
  libDiodes,
  libTransistors,
  libOpto,
  libAnalogIC,
  libDigitalIC,
  libRussianMcu,
  libAvrMcu,
  libIndicatorsAndSensors,
  libLabInterfacesAndPower,
  libConnectorsAndSwitch
];

export const ALL_GOST_COMPONENTS: ComponentDef[] = GOST_COMPONENT_LIBRARIES.flatMap((l) => l.components);

export function findComponentById(id: string, customDefs?: Record<string, ComponentDef>): ComponentDef | undefined {
  if (customDefs && customDefs[id]) return customDefs[id];
  return ALL_GOST_COMPONENTS.find((c) => c.id === id);
}
