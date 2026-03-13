import type { ReportSnapshot } from "@inspect-ai/contracts";
import { buildPeoplePaperworkChecks, ensureLightingSnapshot, sanitizeReportSnapshot } from "@inspect-ai/contracts";
import { calculatePropertyRiskScore } from "@/lib/scoring";

export function normalizeReportSnapshot(snapshot: ReportSnapshot): ReportSnapshot {
  const withLighting = ensureLightingSnapshot(snapshot);
  const sanitized = sanitizeReportSnapshot(withLighting);

  return {
    ...sanitized,
    propertyRiskScore: calculatePropertyRiskScore(sanitized.hazards, {
      inspectionChecklist: sanitized.inputs.inspectionChecklist,
      inspectionMode: sanitized.inputs.mode,
    }),
    comparisonEligible: sanitized.comparisonEligible ?? true,
    paperworkChecks: sanitized.paperworkChecks ?? buildPeoplePaperworkChecks(sanitized),
  };
}
