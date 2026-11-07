export type Role =
  | 'TECHNICIAN'
  | 'JOB_CONTROLLER'
  | 'SUPERVISOR'
  | 'ADMINISTRATOR';

export type SurfaceScope = 'ops' | 'tech';

export type WorkflowType = 'REPAIR' | 'NEW_INSTALL' | 'TRANSFER';

export type WorkOrderStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'WORKING'
  | 'COMPLETED'
  | 'FB_ISSUE'
  | 'CUST_ISSUE'
  | 'CANCELLED';

export type WorkOrderPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type NapPortStatus = 'FREE' | 'OCCUPIED' | 'FAULTY' | 'LOCKED_TRANSFER';

export type OpticalSignalBand = 'PASS' | 'MARGINAL_WARNING' | 'FAIL_OUT_OF_RANGE';

export type GpsFreshness = 'LIVE' | 'STALE' | 'OFFLINE';

export type VehicleType = 'motorbike' | 'l300_van';

export type EvidenceKind =
  | 'CAMERA_NAP'
  | 'CAMERA_OPTICAL'
  | 'CAMERA_ONU'
  | 'SUBSCRIBER_SIGNATURE'
  | 'SIGNED_HARDCOPY';

export type CaptureMode =
  | 'WEBRTC_CAMERA'
  | 'SIMULATED_FTTH_FEED'
  | 'SIGNATURE_PAD'
  | 'BETA_HARDCOPY_SCAN';

export type DiscrepancyStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const CAVITE_LIMITS = {
  minLng: 120.58,
  minLat: 14.05,
  maxLng: 121.08,
  maxLat: 14.50,
  center: { lat: 14.385, lng: 120.938 },
  maxBoundsLngLat: [
    [120.52, 14.0],
    [121.12, 14.54],
  ] as [[number, number], [number, number]],
} as const;

export const OPTICAL_THRESHOLDS_DBM = {
  maxPassDbm: -8.0,
  minPassDbm: -25.0,
  minMarginalDbm: -27.9,
} as const;

export const GPS_INTEGRITY_THRESHOLDS = {
  mismatchMeters: 30,
  staleThresholdMs: 5 * 60 * 1000, // 5 minutes
} as const;

export interface AuthenticatedUser {
  id: string;
  employeeCode: string;
  email: string;
  fullName: string;
  role: Role;
  sessionVersion?: number;
}

export interface TechnicianTelemetryView {
  userId: string;
  employeeCode: string;
  fullName: string;
  vehicleType: VehicleType;
  homeBarangay: string;
  phone: string;
  sessionActive: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastGpsAt: string | null;
  lastSpeedKmh: number | null;
  gpsFreshness: GpsFreshness;
  activeJobCount: number;
}

export interface NapPortRecord {
  napBoxId: string;
  portNumber: number;
  status: NapPortStatus;
  subscriberId: string | null;
  fiberTag: string | null;
  lockedByWoId: string | null;
  updatedAt: string;
}

export interface NapBoxRecord {
  id: string;
  code: string;
  municipality: string;
  barangay: string;
  lat: number;
  lng: number;
  totalPorts: number;
  oltCode: string;
  coordsVerified: boolean;
  ports: NapPortRecord[];
}

export interface SubscriberRecord {
  id: string;
  accountNumber: string;
  fullName: string;
  phone: string;
  municipality: string;
  barangay: string;
  streetAddress: string;
  planName: string;
  lat: number | null;
  lng: number | null;
  coordsVerified: boolean;
  activeNapBoxId: string | null;
  activePortNumber: number | null;
  onuSerial: string | null;
  fiberTag: string | null;
  lastOpticalDbm: number | null;
}

export interface FieldEvidenceRecord {
  id: string;
  workOrderId: string;
  uploadedBy: string;
  kind: EvidenceKind;
  captureMode: CaptureMode;
  mimeType: string;
  sha256: string;
  capturedLat: number | null;
  capturedLng: number | null;
  watermark: string;
  createdAt: string;
  dataUrl?: string;
}

export interface WorkOrderRecord {
  id: string;
  ticketNumber: string;
  workflowType: WorkflowType;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  subscriberId: string;
  subscriberName: string;
  subscriberAccount: string;
  subscriberPhone: string;
  subscriberPlan: string;
  coordsVerified: boolean;
  assignedTechId: string | null;
  assignedTechName: string | null;
  sourceChannel: 'EXCEL_BATCH' | 'DIGITAL_INTAKE' | 'SEED';
  summaryTitle: string;
  issueDescription: string;
  targetLat: number;
  targetLng: number;
  targetMunicipality: string;
  targetBarangay: string;
  targetAddress: string;
  oldAddress: string | null;
  oldLat: number | null;
  oldLng: number | null;
  oldNapBoxId: string | null;
  oldPortNumber: number | null;
  assignedNapBoxId: string | null;
  assignedPortNumber: number | null;
  fiberTag: string | null;
  onuSerial: string | null;
  opticalRxDbm: number | null;
  opticalSignalBand: OpticalSignalBand | null;
  supervisorReviewRequired: boolean;
  supervisorReviewedAt: string | null;
  supervisorReviewedBy: string | null;
  exceptionReasonCode: string | null;
  exceptionNotes: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  evidence: FieldEvidenceRecord[];
}

export interface LocationDiscrepancyRecord {
  id: string;
  workOrderId: string;
  ticketNumber: string;
  subscriberId: string;
  subscriberName: string;
  capturedById: string;
  capturedByName: string;
  recordedLat: number;
  recordedLng: number;
  capturedLat: number;
  capturedLng: number;
  distanceMeters: number;
  status: DiscrepancyStatus;
  reviewedById: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface IntegrationOutboxRecord {
  id: string;
  workOrderId: string;
  ticketNumber: string;
  targetSystem: 'CRM_BILLING' | 'OLT_PROVISIONING' | 'NAP_INVENTORY';
  eventType: string;
  payloadJson: string;
  gateStatus: 'GATED_DRY_RUN';
  createdAt: string;
}

export interface AuditLogRecord {
  seq: number;
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  detailJson: string;
  prevHash: string;
  entryHash: string;
  createdAt: string;
}
