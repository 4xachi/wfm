import type {
  LocationDiscrepancyRecord,
  NapBoxRecord,
  TechnicianTelemetryView,
  VehicleType,
  WorkOrderRecord,
} from '@/domain/types';

export type MapStageMode = 'ops-fleet' | 'tech-navigation' | 'supervisor-diff';

export interface CaviteMapStageProps {
  mode: MapStageMode;
  workOrders?: WorkOrderRecord[];
  selectedWorkOrder?: WorkOrderRecord | null;
  onSelectWorkOrder?: (workOrderId: string) => void;
  napBoxes?: NapBoxRecord[];
  technicians?: TechnicianTelemetryView[];
  selectedDiscrepancy?: LocationDiscrepancyRecord | null;
  activeTechPosition?: { lat: number; lng: number } | null;
  vehicleProfile?: VehicleType;
  offlineMode?: boolean;
  onTelemetryPing?: (coords: {
    lat: number;
    lng: number;
    speedKmh: number;
  }) => void;
  onFieldPinCaptured?: (coords: { lat: number; lng: number }) => void;
  compactHeight?: boolean;
}
