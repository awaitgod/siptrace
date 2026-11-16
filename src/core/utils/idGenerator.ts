/**
 * Generates a compact pseudo-unique identifier with an optional prefix.
 */
export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}
