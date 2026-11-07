export interface QueuedFieldMutation {
  idempotencyKey: string;
  endpoint: '/api/work-orders/start' | '/api/work-orders/outcome';
  workOrderId: string;
  ticketNumber: string;
  summary: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
  status: 'QUEUED' | 'SYNCED' | 'CONFLICT';
  lastResultNote?: string;
}

const DB_NAME = 'fiberblaze_wfm_offline_v1';
const STORE_NAME = 'field_mutations';

let queueDbPromise: Promise<IDBDatabase> | null = null;
let isFlushing = false;
let deadZoneSimulated = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function isDeadZoneActive(): boolean {
  if (deadZoneSimulated) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  return false;
}

export function setSimulatedDeadZone(enabled: boolean): void {
  deadZoneSimulated = enabled;
  notify();
}

export function subscribeOfflineState(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', cb);
    window.addEventListener('offline', cb);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', cb);
      window.removeEventListener('offline', cb);
    }
  };
}

function openQueueDb(): Promise<IDBDatabase> {
  if (!queueDbPromise) {
    queueDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'idempotencyKey' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        queueDbPromise = null;
        reject(req.error);
      };
    });
  }
  return queueDbPromise;
}

export async function listQueuedMutations(): Promise<QueuedFieldMutation[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const items = (req.result as QueuedFieldMutation[]).sort((a, b) =>
        b.queuedAt.localeCompare(a.queuedAt),
      );
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueFieldMutation(
  item: Omit<QueuedFieldMutation, 'queuedAt' | 'attempts' | 'status'>,
): Promise<QueuedFieldMutation> {
  const record: QueuedFieldMutation = {
    ...item,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    status: 'QUEUED',
  };
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
  return record;
}

async function updateQueueRecord(record: QueuedFieldMutation): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
}

export async function clearSyncedMutations(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const items = await listQueuedMutations();
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const item of items) {
      if (item.status === 'SYNCED') {
        store.delete(item.idempotencyKey);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
}

export async function clearAllQueuedMutations(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
}

export async function flushOfflineMutations(): Promise<{
  syncedCount: number;
  replayedCount: number;
  conflictCount: number;
}> {
  if (isFlushing) {
    throw new Error('Offline synchronization already in flight.');
  }
  if (isDeadZoneActive()) {
    throw new Error('Cannot sync while Dead-Zone Offline Mode is active.');
  }

  isFlushing = true;
  try {
    const all = await listQueuedMutations();
    // Replay in chronological order (oldest first so START_WORK runs before SUBMIT_OUTCOME!)
    const pending = [...all]
      .filter((i) => i.status === 'QUEUED')
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));

    let syncedCount = 0;
    let replayedCount = 0;
    let conflictCount = 0;

    for (const item of pending) {
      try {
        const res = await fetch(item.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-FB-Surface': 'tech',
          },
          body: JSON.stringify({
            ...item.payload,
            idempotencyKey: item.idempotencyKey,
          }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          replayed?: boolean;
        };

        if (res.ok) {
          syncedCount += 1;
          if (body.replayed) replayedCount += 1;
          await updateQueueRecord({
            ...item,
            attempts: item.attempts + 1,
            status: 'SYNCED',
            lastResultNote: body.replayed
              ? 'Idempotent replay confirmed (0 duplicates)'
              : 'Synced cleanly to FiberBlaze WFM core',
          });
        } else if (
          res.status === 400 ||
          res.status === 403 ||
          res.status === 404 ||
          res.status === 409 ||
          res.status === 422
        ) {
          conflictCount += 1;
          await updateQueueRecord({
            ...item,
            attempts: item.attempts + 1,
            status: 'CONFLICT',
            lastResultNote: body.error ?? `Rejected (${res.status})`,
          });
        } else {
          // 5xx or server transient error - keep QUEUED for retry
          await updateQueueRecord({
            ...item,
            attempts: item.attempts + 1,
            lastResultNote: body.error ?? `Server error (${res.status})`,
          });
        }
      } catch (networkErr) {
        // Network connection error - keep in QUEUED state
        await updateQueueRecord({
          ...item,
          attempts: item.attempts + 1,
          lastResultNote:
            networkErr instanceof Error
              ? `Network offline: ${networkErr.message}`
              : 'Network request failed',
        });
      }
    }

    return { syncedCount, replayedCount, conflictCount };
  } finally {
    isFlushing = false;
  }
}
