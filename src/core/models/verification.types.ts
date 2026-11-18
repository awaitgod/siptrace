import { PcbLayerId } from './pcb.types';

export interface ErcError {
  id: string;
  severity: 'Error' | 'Warning' | 'Info';
  sheetId: string;
  x: number;
  y: number;
  code: string;
  message: string;
  objectId?: string;
  netName?: string;
  pinNumber?: string;
}

export interface DrcError {
  id: string;
  signature?: string;
  waived?: boolean;
  waiveReason?: string;
  severity: 'Error' | 'Warning';
  layer: PcbLayerId | 'All';
  x: number;
  y: number;
  code: string;
  message: string;
  objectIds: string[];
}

export interface BomEntry {
  groupTitle: string;
  refDesList: string;
  name: string;
  quantity: number;
  note: string;
  gostStandard?: string;
  pattern?: string;
}

export interface SpiceNodeResult {
  netName: string;
  dcVoltage: number;
}

export interface SpiceSimResult {
  mode: 'DC' | 'Transient' | 'AC';
  converged: boolean;
  message: string;
  dcNodes: SpiceNodeResult[];
  timePoints: number[];
  waveforms: Record<string, number[]>;
  frequencies?: number[];
  acMagnitudeDb?: Record<string, number[]>;
  acPhaseDeg?: Record<string, number[]>;
  branchCurrents?: Record<string, number>;
  spiceNetlist: string;
}
