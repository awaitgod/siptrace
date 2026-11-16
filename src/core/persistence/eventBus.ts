const EDA_EVENT_CHANNEL = 'gosttrace-eda-events';
const TAB_SENDER_ID = `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;

export type EdaEventListener = (channel: string, payload: unknown) => void;

/**
 * Broadcasts an EDA synchronization event across browser tabs via BroadcastChannel.
 */
export function broadcastEdaEvent(channel: string, payload: unknown): void {
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
 * Subscribes to cross-tab EDA synchronization events and returns an unsubscribe callback.
 */
export function subscribeEdaEvents(listener: EdaEventListener): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const bc = new BroadcastChannel(EDA_EVENT_CHANNEL);
  const handler = (ev: MessageEvent<{ channel?: string; payload?: unknown; senderId?: string }>) => {
    if (ev.data && ev.data.senderId !== TAB_SENDER_ID && typeof ev.data.channel === 'string') {
      listener(ev.data.channel, ev.data.payload);
    }
  };
  bc.addEventListener('message', handler);
  return () => {
    bc.removeEventListener('message', handler);
    bc.close();
  };
}
