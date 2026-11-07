import type {
  AuditLogRecord,
  AuthenticatedUser,
  GpsFreshness,
  IntegrationOutboxRecord,
  LocationDiscrepancyRecord,
  NapBoxRecord,
  NapPortStatus,
  OpticalSignalBand,
  TechnicianTelemetryView,
  WorkOrderPriority,
  WorkOrderRecord,
  WorkOrderStatus,
} from '@/domain/types';

export type OpsTabId = 'fleet' | 'intake' | 'governance' | 'audit';

export interface OpsKpiSummary {
  totalOrders: number;
  unassignedCount: number;
  activeFieldCount: number;
  completedCount: number;
  fbIssueCount: number;
  custIssueCount: number;
  pendingReviewCount: number;
  pendingGpsDiffCount: number;
  liveTechCount: number;
}

export interface AuditIntegritySummary {
  valid: boolean;
  checkedCount: number;
  brokenAtSeq?: number;
}

export interface OpsBootstrapPayload {
  user: AuthenticatedUser;
  workOrders: WorkOrderRecord[];
  napBoxes: NapBoxRecord[];
  technicians: TechnicianTelemetryView[];
  discrepancies: LocationDiscrepancyRecord[];
  outbox: IntegrationOutboxRecord[];
  auditLogs: AuditLogRecord[];
  auditIntegrity: AuditIntegritySummary;
  kpis: OpsKpiSummary;
}

export interface OpsStatusBanner {
  tone: 'ok' | 'warn' | 'fault' | 'info';
  message: string;
}

export interface CaviteBarangayPreset {
  municipality: string;
  barangay: string;
  lat: number;
  lng: number;
  defaultStreet: string;
}

export const CAVITE_BARANGAY_PRESETS: CaviteBarangayPreset[] = [
  {
    municipality: 'Imus',
    barangay: 'Tanzang Luma II',
    lat: 14.4294,
    lng: 120.9367,
    defaultStreet: 'Blk 4 Lot 11 Nueno Ave Ext',
  },
  {
    municipality: 'Imus',
    barangay: 'Buhay na Tubig',
    lat: 14.4162,
    lng: 120.9554,
    defaultStreet: 'Blk 9 Lot 14 Green Estate Ph 2',
  },
  {
    municipality: 'Imus',
    barangay: 'Anabu I-C',
    lat: 14.3992,
    lng: 120.9412,
    defaultStreet: 'Unit 8 Aguinaldo Highway Strip',
  },
  {
    municipality: 'Bacoor',
    barangay: 'Habay I',
    lat: 14.4426,
    lng: 120.9488,
    defaultStreet: '108 Tirona Highway Commercial',
  },
  {
    municipality: 'Bacoor',
    barangay: 'Molino III',
    lat: 14.3984,
    lng: 120.9781,
    defaultStreet: '42 Avenida Rizal, Queens Row East',
  },
  {
    municipality: 'Dasmariñas',
    barangay: 'Salitran II',
    lat: 14.3468,
    lng: 120.9392,
    defaultStreet: 'Lot 7 Jose Abad Santos Ave',
  },
  {
    municipality: 'General Trias',
    barangay: 'San Francisco',
    lat: 14.3165,
    lng: 120.9082,
    defaultStreet: 'Blk 3 Lot 22 Tierra Nevada Ph 4',
  },
  {
    municipality: 'Kawit',
    barangay: 'Binakayan-Kanluran',
    lat: 14.4472,
    lng: 120.9038,
    defaultStreet: '118 Covelandia Access Rd',
  },
];

export function getGpsAgeMinutes(lastGpsAt: string | null): number | null {
  if (!lastGpsAt) return null;
  const ms = Date.parse(lastGpsAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((Date.now() - ms) / 60_000));
}

export function formatCoords(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return 'NO FIX';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatEtaSeconds(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

export function formatTimestampCompact(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function getWorkOrderStatusBadge(status: WorkOrderStatus): {
  bg: string;
  border: string;
  color: string;
  label: string;
} {
  switch (status) {
    case 'COMPLETED':
      return {
        bg: 'var(--status-ok-soft)',
        border: 'var(--status-ok)',
        color: 'var(--status-ok)',
        label: 'COMPLETED',
      };
    case 'WORKING':
      return {
        bg: 'var(--status-info-soft)',
        border: 'var(--status-info)',
        color: 'var(--status-info)',
        label: 'WORKING',
      };
    case 'ASSIGNED':
      return {
        bg: 'var(--accent-blaze-soft)',
        border: 'var(--accent-blaze)',
        color: 'var(--accent-blaze)',
        label: 'ASSIGNED',
      };
    case 'FB_ISSUE':
      return {
        bg: 'var(--status-fault-soft)',
        border: 'var(--status-fault)',
        color: 'var(--status-fault)',
        label: 'FB-ISSUE',
      };
    case 'CUST_ISSUE':
      return {
        bg: 'var(--status-warn-soft)',
        border: 'var(--status-warn)',
        color: 'var(--status-warn)',
        label: 'CUST-ISSUE',
      };
    case 'CANCELLED':
      return {
        bg: 'var(--bg-elevated)',
        border: 'var(--border-subtle)',
        color: 'var(--text-muted)',
        label: 'CANCELLED',
      };
    case 'UNASSIGNED':
    default:
      return {
        bg: 'var(--bg-elevated)',
        border: 'var(--border-strong)',
        color: 'var(--text-secondary)',
        label: 'UNASSIGNED',
      };
  }
}

export function getPriorityBadge(priority: WorkOrderPriority): {
  bg: string;
  border: string;
  color: string;
} {
  if (priority === 'URGENT') {
    return {
      bg: 'var(--status-fault-soft)',
      border: 'var(--status-fault)',
      color: 'var(--status-fault)',
    };
  }
  if (priority === 'HIGH') {
    return {
      bg: 'var(--status-warn-soft)',
      border: 'var(--status-warn)',
      color: 'var(--status-warn)',
    };
  }
  return {
    bg: 'var(--bg-elevated)',
    border: 'var(--border-subtle)',
    color: 'var(--text-muted)',
  };
}

export function getGpsHonestyBadge(
  freshness: GpsFreshness,
  lastGpsAt: string | null,
): {
  bg: string;
  border: string;
  color: string;
  label: string;
} {
  const ageMins = getGpsAgeMinutes(lastGpsAt);
  if (freshness === 'LIVE') {
    return {
      bg: 'var(--status-ok-soft)',
      border: 'var(--status-ok)',
      color: 'var(--status-ok)',
      label: ageMins !== null ? `LIVE • ${ageMins}m` : 'LIVE',
    };
  }
  if (freshness === 'STALE') {
    return {
      bg: 'var(--status-warn-soft)',
      border: 'var(--status-warn)',
      color: 'var(--status-warn)',
      label:
        ageMins !== null
          ? `STALE / LAST KNOWN • ${ageMins}m`
          : 'STALE / LAST KNOWN',
    };
  }
  return {
    bg: 'var(--bg-elevated)',
    border: 'var(--border-subtle)',
    color: 'var(--text-muted)',
    label: 'OFFLINE',
  };
}

export function getOpticalBandStyle(band: OpticalSignalBand | null): {
  bg: string;
  border: string;
  color: string;
} {
  if (band === 'PASS') {
    return {
      bg: 'var(--status-ok-soft)',
      border: 'var(--status-ok)',
      color: 'var(--status-ok)',
    };
  }
  if (band === 'MARGINAL_WARNING') {
    return {
      bg: 'var(--status-warn-soft)',
      border: 'var(--status-warn)',
      color: 'var(--status-warn)',
    };
  }
  if (band === 'FAIL_OUT_OF_RANGE') {
    return {
      bg: 'var(--status-fault-soft)',
      border: 'var(--status-fault)',
      color: 'var(--status-fault)',
    };
  }
  return {
    bg: 'var(--bg-elevated)',
    border: 'var(--border-subtle)',
    color: 'var(--text-muted)',
  };
}

export function getNapPortStyle(status: NapPortStatus): {
  bg: string;
  border: string;
  color: string;
  shortLabel: string;
} {
  switch (status) {
    case 'FREE':
      return {
        bg: 'var(--status-ok-soft)',
        border: 'var(--status-ok)',
        color: 'var(--status-ok)',
        shortLabel: 'FREE',
      };
    case 'OCCUPIED':
      return {
        bg: 'var(--status-info-soft)',
        border: 'var(--status-info)',
        color: 'var(--status-info)',
        shortLabel: 'OCCUPIED',
      };
    case 'LOCKED_TRANSFER':
      return {
        bg: 'var(--status-warn-soft)',
        border: 'var(--status-warn)',
        color: 'var(--status-warn)',
        shortLabel: 'LOCKED XFER',
      };
    case 'FAULTY':
    default:
      return {
        bg: 'var(--status-fault-soft)',
        border: 'var(--status-fault)',
        color: 'var(--status-fault)',
        shortLabel: 'FAULTY',
      };
  }
}
