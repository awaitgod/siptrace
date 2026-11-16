import { SchematicProject } from '../../core/types';
import { parseDipTraceAsciiSchematicFull } from './dipTraceImporter';

/** Parses DipTrace ASCII Schematic (.dch / .asc) with automatic US->GOST conversion. */
export function parseDipTraceAsciiSchematic(ascii: string): SchematicProject {
  return parseDipTraceAsciiSchematicFull(ascii);
}
