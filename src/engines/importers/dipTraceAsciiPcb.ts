import { PcbProject } from '../../core/types';
import { parseDipTraceAsciiPcbFull } from './dipTraceImporter';

/** Parses DipTrace ASCII PCB (.dip / .asc) with automatic US->GOST conversion. */
export function parseDipTraceAsciiPcb(ascii: string): PcbProject {
  return parseDipTraceAsciiPcbFull(ascii);
}
