import type {
  AuthenticatedUser,
  CaptureMode,
  EvidenceKind,
  NapBoxRecord,
  TechnicianTelemetryView,
  WorkOrderRecord,
} from '@/domain/types';

export type TechTabId = 'assigned' | 'nav' | 'execute' | 'sync';

export type FieldTheme = 'field-light' | 'field-dark';

export interface DraftEvidenceItem {
  id: string;
  kind: EvidenceKind;
  captureMode: CaptureMode;
  dataUrl: string;
  watermark: string;
  createdAt: string;
}

export interface SubmitOutcomePayload {
  idempotencyKey: string;
  workOrderId: string;
  outcomeStatus: 'COMPLETED' | 'FB_ISSUE' | 'CUST_ISSUE';
  selectedNapBoxId?: string | null;
  selectedPortNumber?: number | null;
  fiberTag?: string | null;
  onuSerial?: string | null;
  opticalRxDbm?: number | null;
  capturedLat?: number | null;
  capturedLng?: number | null;
  exceptionReasonCode?: string | null;
  exceptionNotes?: string | null;
  evidenceItems?: Array<{
    kind: EvidenceKind;
    captureMode: CaptureMode;
    dataUrl: string;
    watermark: string;
  }>;
}

export interface OnlineSyncReceipt {
  idempotencyKey: string;
  endpoint: '/api/work-orders/start' | '/api/work-orders/outcome';
  workOrderId: string;
  ticketNumber: string;
  summary: string;
  payload: Record<string, unknown>;
  syncedAt: string;
  replayed: boolean;
  note: string;
}

export interface TechBootstrapResponse {
  user: AuthenticatedUser;
  workOrders: WorkOrderRecord[];
  napBoxes: NapBoxRecord[];
  technicians: TechnicianTelemetryView[];
  kpis: {
    totalOrders: number;
    activeFieldCount: number;
    completedCount: number;
    fbIssueCount: number;
    custIssueCount: number;
  };
}

export const FB_ISSUE_REASONS: Array<{ code: string; label: string }> = [
  {
    code: 'FEEDER_SPLICE_LOSS',
    label: 'Feeder Trunk High Loss / Low Optical Power (< -27.9 dBm)',
  },
  {
    code: 'NAP_ALL_PORTS_FAULTY',
    label: 'All Distribution NAP Ports Faulty / Exhausted',
  },
  {
    code: 'OLT_PON_DOWN',
    label: 'Upstream OLT PON Port LOS / Outage',
  },
  {
    code: 'POLE_ACCESS_HAZARD',
    label: 'Electrical / Pole Structural Safety Hazard',
  },
];

export const CUST_ISSUE_REASONS: Array<{ code: string; label: string }> = [
  {
    code: 'SUBSCRIBER_UNAVAILABLE',
    label: 'Subscriber / Authorized Adult Unavailable on Site',
  },
  {
    code: 'SUBDIVISION_PERMIT_PENDING',
    label: 'HOA / Subdivision Gate Work Permit Pending',
  },
  {
    code: 'INDOOR_CONDUIT_BLOCKED',
    label: 'Subscriber In-House Conduit Blocked / Civil Work Needed',
  },
  {
    code: 'CUSTOMER_REQUESTED_RESCHEDULE',
    label: 'Subscriber Requested New Appointment Window',
  },
];
