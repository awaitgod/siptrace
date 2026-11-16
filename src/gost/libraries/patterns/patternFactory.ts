import { PatternDef } from '../../../core/types';

export function makePattern(
  id: string,
  name: string,
  library: string,
  gostName: string,
  description: string,
  base: PatternDef,
  color3d?: string
): PatternDef {
  return {
    ...base,
    id,
    name,
    library,
    gostName,
    description,
    model3d: color3d ? { ...base.model3d, color: color3d } : base.model3d
  };
}
