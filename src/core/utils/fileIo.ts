import { invoke, isTauri } from '@tauri-apps/api/core';

export interface CadFileFilter {
  name: string;
  extensions: string[];
}

export interface PickedCadFile {
  name: string;
  filePath: string;
  bytes: Uint8Array;
}

export interface SaveFileOptions {
  /** Logical slot key (e.g. 'schematic' | 'pcb') used to remember the chosen file handle for subsequent Ctrl+S saves. */
  saveKey?: string;
  /** Forces prompting for a new file location even if a handle was previously remembered. */
  saveAs?: boolean;
}

/** Derives a native project filename without reusing a foreign CAD extension. */
export function nativeCadFilename(filename: string | undefined, projectName: string, extension: 'gostsch' | 'gostpcb'): string {
  const basename = filename?.split(/[\\/]/).pop();
  const stem = basename?.replace(/\.[^.]+$/, '') || projectName;
  return `${stem}.${extension}`;
}

interface FileSystemWritableLike {
  write: (data: string | BufferSource) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandleLike {
  name: string;
  createWritable: () => Promise<FileSystemWritableLike>;
}

type ShowSaveFilePickerFn = (options?: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandleLike>;

const rememberedSaveHandles = new Map<string, FileSystemFileHandleLike>();

/** Clears the remembered disk handle for a document slot (call when creating or opening a different project). */
export function clearSavedFileHandle(saveKey: string): void {
  rememberedSaveHandles.delete(saveKey);
}

/** Triggers a browser download for a generated Blob and cleans up the object URL. */
function triggerBlobDownload(defaultName: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName;
}

function buildPickerTypes(filters: CadFileFilter[]) {
  return filters
    .filter((f) => f.extensions.length > 0)
    .map((f) => ({
      description: f.name,
      accept: {
        'application/octet-stream': f.extensions.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
      }
    }));
}

function getSaveFilePicker(): ShowSaveFilePickerFn | undefined {
  return (window as Window & { showSaveFilePicker?: ShowSaveFilePickerFn }).showSaveFilePicker?.bind(window);
}

async function writeTextToHandle(handle: FileSystemFileHandleLike, content: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return handle.name;
}

/** Prompts for an export destination without changing the project's remembered save handle. */
export async function exportTextFile(
  filename: string,
  content: string | Uint8Array<ArrayBuffer>,
  extension: string,
  description: string
): Promise<{ method: 'saved' | 'download'; name: string } | null> {
  if (isTauri()) {
    const payload = typeof content === 'string' ? { content } : { bytes: Array.from(content) };
    const path = await invoke<string | null>('export_text_file', { filename, ...payload, extension, description });
    return path === null ? null : { method: 'saved', name: path };
  }

  const picker = getSaveFilePicker();
  if (picker) {
    let handle: FileSystemFileHandleLike | undefined;
    try {
      handle = await picker({
        suggestedName: filename,
        types: buildPickerTypes([{ name: description, extensions: [extension] }])
      });
    } catch (error) {
      const name = (error as Error)?.name;
      if (name === 'AbortError') return null;
      if (name !== 'SecurityError') throw error;
    }
    if (handle) {
      return { method: 'saved', name: await writeTextToHandle(handle, content) };
    }
  }

  const blob = new Blob([content], { type: typeof content === 'string' ? 'text/plain;charset=utf-8' : 'application/octet-stream' });
  return { method: 'download', name: triggerBlobDownload(filename, blob) };
}

/**
 * Saves a UTF-8 text file. Uses File System Access API (overwrite in place on Ctrl+S)
 * when available in browser/WebView2, falling back to browser download.
 */
export async function saveTextFile(
  defaultName: string,
  content: string,
  filters: CadFileFilter[] = [],
  options: SaveFileOptions = {}
): Promise<string | null> {
  const { saveKey, saveAs } = options;
  const picker = getSaveFilePicker();

  if (saveKey && !saveAs) {
    const existing = rememberedSaveHandles.get(saveKey);
    if (existing) {
      try {
        return await writeTextToHandle(existing, content);
      } catch {
        rememberedSaveHandles.delete(saveKey);
      }
    }
  }

  if (picker && saveKey) {
    try {
      const types = buildPickerTypes(filters);
      const handle = await picker({
        suggestedName: defaultName,
        ...(types.length > 0 ? { types } : {})
      });
      const name = await writeTextToHandle(handle, content);
      rememberedSaveHandles.set(saveKey, handle);
      return name;
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'AbortError') {
        return null;
      }
      // Fall through to Blob download if picker is unsupported/blocked in current context
    }
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  return triggerBlobDownload(defaultName, blob);
}

/** Saves binary bytes (e.g., ZIP / PDSPRJ / PNG) via browser download. */
export async function saveBinaryFile(
  defaultName: string,
  bytes: Uint8Array,
  _filters: CadFileFilter[] = []
): Promise<string | null> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/octet-stream' });
  return triggerBlobDownload(defaultName, blob);
}

async function openFilePickerInternal(accept: string, multiple: boolean): Promise<PickedCadFile[]> {
  return new Promise((resolve) => {
    let settled = false;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
    };

    const finish = (res: PickedCadFile[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(res);
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finish([]);
        }
      }, 350);
    };

    input.addEventListener('cancel', () => finish([]));
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        finish([]);
        return;
      }
      try {
        const picked: PickedCadFile[] = [];
        for (const f of files) {
          const buf = new Uint8Array(await f.arrayBuffer());
          picked.push({ name: f.name, filePath: f.name, bytes: buf });
        }
        finish(picked);
      } catch {
        finish([]);
      }
    };

    window.addEventListener('focus', onWindowFocus, { once: true });
    input.click();
  });
}

/** Opens one or more CAD files (text or binary) via browser file picker. */
export async function pickCadFiles(accept: string, _filters: CadFileFilter[] = []): Promise<PickedCadFile[]> {
  return openFilePickerInternal(accept, true);
}

/** Opens a CAD file. Omit accept to allow the importer to identify any selected file. */
export async function pickCadFile(accept = '', _filters: CadFileFilter[] = []): Promise<PickedCadFile | null> {
  const files = await openFilePickerInternal(accept, false);
  return files[0] ?? null;
}
