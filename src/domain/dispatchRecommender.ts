import type { GpsFreshness, VehicleType, WorkflowType } from './types';

export interface TechnicianSuggestionCandidate {
  userId: string;
  fullName: string;
  employeeCode: string;
  vehicleType: VehicleType;
  gpsFreshness: GpsFreshness;
  activeJobCount: number;
  streetEtaSeconds: number;
  streetDistanceMeters: number;
}

export interface RankedTechnicianSuggestion
  extends TechnicianSuggestionCandidate {
  score: number;
  recommendationReason: string;
}

export function rankTechnicianSuggestions(input: {
  workflowType: WorkflowType;
  candidates: TechnicianSuggestionCandidate[];
}): RankedTechnicianSuggestion[] {
  const { workflowType, candidates } = input;

  return candidates
    .filter((c) => c.gpsFreshness !== 'OFFLINE')
    .map((c) => {
      // Lower score = higher dispatch suitability (measured in effective seconds)
      let effectiveCost = c.streetEtaSeconds;
      effectiveCost += c.activeJobCount * 360; // +6 min penalty per queued job
      if (c.gpsFreshness === 'STALE') {
        effectiveCost += 420; // Prefer LIVE telemetry over STALE last-known position
      }

      // L300 splice/ladder vans are preferred for NEW_INSTALL & TRANSFER; 2-wheelers excel at rapid REPAIR
      const prefersVan =
        workflowType === 'NEW_INSTALL' || workflowType === 'TRANSFER';
      if (prefersVan && c.vehicleType === 'l300_van') {
        effectiveCost -= 240;
      } else if (workflowType === 'REPAIR' && c.vehicleType === 'motorbike') {
        effectiveCost -= 150;
      }

      const etaMins = Math.max(1, Math.round(c.streetEtaSeconds / 60));
      const vehicleLabel =
        c.vehicleType === 'l300_van' ? 'L300 Splice Van' : '2-Wheeler Rapid';
      const gpsLabel =
        c.gpsFreshness === 'LIVE' ? 'Live GPS' : 'Last-Known GPS';

      return {
        ...c,
        score: Math.round(effectiveCost),
        recommendationReason: `${etaMins} min Cavite street ETA • ${vehicleLabel} • ${c.activeJobCount} active job(s) • ${gpsLabel}`,
      };
    })
    .sort((a, b) => a.score - b.score);
}
