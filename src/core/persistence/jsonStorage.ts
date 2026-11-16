/**
 * Safely reads and parses a JSON value from localStorage.
 */
export function readStorageJson<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return null;
        return JSON.parse(raw) as T;
    }
    catch {
        return null;
    }
}
/**
 * Safely serializes and stores a value into localStorage.
 */
export function writeStorageJson<T>(key: string, value: T): boolean {
    try {
        const serialized = JSON.stringify(value), previous = localStorage.getItem(key);
        if (previous && previous !== serialized && key.includes('active_schematic')) {
            try {
                sessionStorage.setItem(key + '.backup', previous);
            }
            catch { /* Backup failure must not prevent the primary save. */ }
        }
        localStorage.setItem(key, serialized);
        if (typeof window !== 'undefined')
            window.dispatchEvent(new CustomEvent('siptrace:storage', { detail: { key, ok: true, at: Date.now() } }));
        return true;
    }
    catch (error) {
        if (typeof window !== 'undefined')
            window.dispatchEvent(new CustomEvent('siptrace:storage', { detail: { key, ok: false, message: String(error) } }));
        return false;
    }
}
