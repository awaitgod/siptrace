import { HotkeyMap } from '../models';
import { readStorageJson, writeStorageJson } from './jsonStorage';
import { STORAGE_KEYS } from './storageKeys';
export const DEFAULT_HOTKEYS: HotkeyMap = {
    selectTool: 'Esc',
    placeWire: 'W',
    placeBus: 'B',
    placePort: 'P',
    rotate: 'R',
    flipX: 'X',
    flipY: 'Y',
    zoomFit: 'Home',
    zoomIn: '+',
    zoomOut: '-',
    toggleGrid: 'F11',
    runCheck: 'F9',
    convertToPcb: 'Ctrl+B',
    routeManual: 'M',
    placeVia: 'V',
    updatePours: 'Ctrl+Shift+U',
    undo: 'Ctrl+Z',
    redo: 'Ctrl+Y',
    save: 'Ctrl+S',
    find: 'Ctrl+F',
    selectAll: 'Ctrl+A', cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', duplicate: 'Ctrl+D',
    print: 'Ctrl+P', properties: 'E', saveAs: 'Ctrl+Shift+S', placeComponent: 'A', placeText: 'T', placeJunction: 'J',
    placeBusTap: 'Q', placeCircle: 'O', noConnect: 'N'
};
/**
 * Matches a DOM KeyboardEvent against a user-configured hotkey string (e.g. "Ctrl+B", "W", "F11", "+"),
 * supporting physical key codes so shortcuts keep working in non-Latin keyboard layouts.
 */
export function matchesHotkey(e: KeyboardEvent, spec: string | undefined): boolean {
    if (!spec)
        return false;
    const parts = spec
        .split('+')
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length === 0 && spec.trim() !== '+')
        return false;
    // Handle standalone '+' character (split('+') produces empty array)
    const rawTrim = spec.trim();
    if (rawTrim === '+') {
        return !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd');
    }
    if (rawTrim === '-') {
        return !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract');
    }
    let needCtrl = false;
    let needShift = false;
    let needAlt = false;
    let keyToken = '';
    for (const part of parts) {
        const low = part.toLowerCase();
        if (low === 'ctrl' || low === 'control')
            needCtrl = true;
        else if (low === 'shift')
            needShift = true;
        else if (low === 'alt')
            needAlt = true;
        else
            keyToken = part;
    }
    // Handle "Ctrl++" etc.
    if (!keyToken && rawTrim.endsWith('+'))
        keyToken = '+';
    if ((e.ctrlKey || e.metaKey) !== needCtrl)
        return false;
    if (e.altKey !== needAlt)
        return false;
    if (needShift && !e.shiftKey)
        return false;
    if (!needShift && needCtrl && e.shiftKey && keyToken !== '+')
        return false;
    const lowKey = keyToken.toLowerCase();
    if (lowKey === 'esc' || lowKey === 'escape')
        return e.key === 'Escape';
    if (lowKey === 'del' || lowKey === 'delete')
        return e.key === 'Delete';
    if (lowKey === 'space')
        return e.key === ' ' || e.code === 'Space';
    if (lowKey === 'home')
        return e.key === 'Home';
    if (/^f\d{1,2}$/.test(lowKey))
        return e.key.toLowerCase() === lowKey;
    if (lowKey === '+')
        return e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd';
    if (lowKey === '-')
        return e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract';
    if (keyToken.length === 1) {
        const upper = keyToken.toUpperCase();
        if (upper >= 'A' && upper <= 'Z') {
            return e.key.toLowerCase() === lowKey || e.code === `Key${upper}`;
        }
        if (upper >= '0' && upper <= '9') {
            return e.key === keyToken || e.code === `Digit${upper}` || e.code === `Numpad${upper}`;
        }
    }
    return e.key.toLowerCase() === lowKey;
}
export function validateHotkeys(map: HotkeyMap): string[] {
    const errors: string[] = [], seen = new Map<string, string>();
    for (const [name, raw] of Object.entries(map)) {
        const spec = raw.trim();
        if (!spec)
            continue;
        if (!/^(?:(?:Ctrl|Alt|Shift)\+)*(?:[A-Za-z0-9]|F(?:[1-9]|1[0-2])|Esc|Escape|Home|End|Delete|Del|Space|Enter|Tab|[+\-])$/i.test(spec)) {
            errors.push(`${name}: некорректная комбинация «${spec}»`);
            continue;
        }
        const normalized = spec.toLowerCase().replace('escape', 'esc');
        if (seen.has(normalized))
            errors.push(`«${spec}»: конфликт ${seen.get(normalized)} и ${name}`);
        else
            seen.set(normalized, name);
        if (/^(alt\+f4|ctrl\+w|ctrl\+r)$/i.test(spec))
            errors.push(`«${spec}» зарезервирована окном приложения.`);
    }
    return errors;
}
/**
 * Loads user-configured hotkeys merged with defaults.
 */
export function loadHotkeys(): HotkeyMap {
    const parsed = readStorageJson<HotkeyMap>(STORAGE_KEYS.HOTKEYS);
    return parsed ? { ...DEFAULT_HOTKEYS, ...parsed } : { ...DEFAULT_HOTKEYS };
}
/**
 * Persists user-configured hotkeys.
 */
export function saveHotkeys(hk: HotkeyMap): void {
    writeStorageJson(STORAGE_KEYS.HOTKEYS, hk);
}
