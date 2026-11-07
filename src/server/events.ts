import { EventEmitter } from 'node:events';

export type WfmRealtimeEventType =
  | 'WORK_ORDER_UPDATED'
  | 'TECHNICIAN_GPS'
  | 'DISCREPANCY_UPDATED'
  | 'BATCH_IMPORTED'
  | 'DEMO_RESET'
  | 'SESSION_CHANGED';

export interface WfmRealtimeEvent {
  id: string;
  type: WfmRealtimeEventType;
  timestamp: string;
  summary: string;
  entityId?: string;
}

class WfmEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(
    type: WfmRealtimeEventType,
    summary: string,
    entityId?: string,
  ): WfmRealtimeEvent {
    const evt: WfmRealtimeEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: new Date().toISOString(),
      summary,
      entityId,
    };
    this.emitter.emit('wfm-event', evt);
    return evt;
  }

  subscribe(listener: (evt: WfmRealtimeEvent) => void): () => void {
    this.emitter.on('wfm-event', listener);
    return () => {
      this.emitter.off('wfm-event', listener);
    };
  }
}

const globalForEvents = globalThis as unknown as {
  __fiberblazeEventBus?: WfmEventBus;
};

export const wfmEventBus =
  globalForEvents.__fiberblazeEventBus ?? new WfmEventBus();

if (!globalForEvents.__fiberblazeEventBus) {
  globalForEvents.__fiberblazeEventBus = wfmEventBus;
}
