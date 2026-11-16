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
  const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePickerFn }).showSaveFilePicker;

  if (saveKey && !saveAs) {
    const existing = rememberedSaveHandles.get(saveKey);
    if (existing) {
      try {
        const writable = await existing.createWritable();
        await writable.write(content);
        await writable.close();
        return existing.name;
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
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      rememberedSaveHandles.set(saveKey, handle);
      return handle.name;
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

/** Opens a CAD file (text or binary ZIP/.pdsprj/.zip) via browser file picker. */
export async function pickCadFile(accept: string, _filters: CadFileFilter[] = []): Promise<PickedCadFile | null> {
  return new Promise((resolve) => {
    let settled = false;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
    };

    const finish = (res: PickedCadFile | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(res);
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finish(null);
        }
      }, 350);
    };

    input.addEventListener('cancel', () => finish(null));
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) {
        finish(null);
        return;
      }
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        finish({ name: f.name, filePath: f.name, bytes: buf });
      } catch {
        finish(null);
      }
    };

    window.addEventListener('focus', onWindowFocus, { once: true });
    input.click();
  });
}
