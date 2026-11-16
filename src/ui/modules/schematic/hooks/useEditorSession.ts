import { Dispatch, SetStateAction, useEffect, useState } from 'react';
const values = new Map<string, unknown>();
export function useEditorSession<T>(key: string, initial: T | (() => T)): [
    T,
    Dispatch<SetStateAction<T>>
] {
    const [value, setValue] = useState<T>(() => values.has(key) ? values.get(key) as T : typeof initial === 'function' ? (initial as () => T)() : initial);
    useEffect(() => { values.set(key, value); }, [key, value]);
    return [value, setValue];
}
