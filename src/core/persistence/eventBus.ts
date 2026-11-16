const EDA_EVENT_CHANNEL = 'gosttrace-eda-events';
const TAB_SENDER_ID = `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;

export type EdaEventListener = (channel: string, payload: unknown) => void;

const LOCAL_EVENT_NAME = 'siptrace:eda-local-event';

/**
 * Broadcasts an EDA synchronization event across browser tabs via BroadcastChannel,
 * and delivers library synchronization events to listeners in the same tab.
 */
export function broadcastEdaEvent(channel: string, payload: unknown): void {
  if (typeof window !== 'undefined' && channel === 'libraries:updated') {
    try {
      window.dispatchEvent(new CustomEvent(LOCAL_EVENT_NAME, { detail: { channel, payload } }));
    } catch {
      // Ignore in restricted contexts
    }
  }
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const bc = new BroadcastChannel(EDA_EVENT_CHANNEL);
    bc.postMessage({ channel, payload, senderId: TAB_SENDER_ID });
    bc.close();
  } catch {
    // Ignore serialization or channel errors in restricted contexts
  }
}

/**
 * Subscribes to cross-tab (and same-tab library) EDA synchronization events and returns an unsubscribe callback.
 */
export function subscribeEdaEvents(listener: EdaEventListener): () => void {
  const localHandler = (ev: Event) => {
    const detail = (ev as CustomEvent<{ channel?: string; payload?: unknown }>).detail;
    if (detail && typeof detail.channel === 'string') {
      listener(detail.channel, detail.payload);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener(LOCAL_EVENT_NAME, localHandler);
  }
  if (typeof BroadcastChannel === 'undefined') {
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener(LOCAL_EVENT_NAME, localHandler);
    };
  }
  const bc = new BroadcastChannel(EDA_EVENT_CHANNEL);
  const handler = (ev: MessageEvent<{ channel?: string; payload?: unknown; senderId?: string }>) => {
    if (ev.data && ev.data.senderId !== TAB_SENDER_ID && typeof ev.data.channel === 'string') {
      listener(ev.data.channel, ev.data.payload);
    }
  };
  bc.addEventListener('message', handler);
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(LOCAL_EVENT_NAME, localHandler);
    }
    bc.removeEventListener('message', handler);
    bc.close();
  };
}
