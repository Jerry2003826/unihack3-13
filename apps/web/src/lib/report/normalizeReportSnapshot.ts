import type { ReportSnapshot } from "@inspect-ai/contracts";
import { buildPeoplePaperworkChecks, ensureLightingSnapshot } from "@inspect-ai/contracts";
import { calculatePropertyRiskScore } from "@/lib/scoring";

export function normalizeReportSnapshot(snapshot: ReportSnapshot): ReportSnapshot {
  const withLighting = ensureLightingSnapshot(snapshot);

  return {
    ...withLighting,
    propertyRiskScore: calculatePropertyRiskScore(withLighting.hazards),
    comparisonEligible: withLighting.comparisonEligible ?? true,
    paperworkChecks: withLighting.paperworkChecks ?? buildPeoplePaperworkChecks(withLighting),
  };
}
