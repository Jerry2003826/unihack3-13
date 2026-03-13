import {
  calculatePropertyRiskScore as calculatePropertyRiskScoreBase,
  formatRoomTypeLabel,
  type Hazard,
  type InspectionChecklist,
  type InspectionMode,
  type SeverityLevel,
} from "@inspect-ai/contracts";

const penaltyBySeverity: Record<SeverityLevel, number> = {
  Critical: 25,
  High: 15,
  Medium: 8,
  Low: 3,
};

export function calculatePropertyRiskScore(
  hazards: Hazard[],
  options?: {
    inspectionChecklist?: InspectionChecklist;
    inspectionMode?: InspectionMode;
  }
) {
  return calculatePropertyRiskScoreBase({
    hazards,
    inspectionChecklist: options?.inspectionChecklist,
    inspectionMode: options?.inspectionMode,
  });
}

export function getSeverityBreakdown(hazards: Hazard[]) {
  return hazards.reduce<Record<SeverityLevel, number>>(
    (acc, hazard) => {
      acc[hazard.severity] += 1;
      return acc;
    },
    {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    }
  );
}

export function getRiskDrivers(hazards: Hazard[]) {
  const breakdown = getSeverityBreakdown(hazards);
  const sortedHazards = [...hazards].sort((left, right) => penaltyBySeverity[right.severity] - penaltyBySeverity[left.severity]);
  const highestWeightIssue = sortedHazards[0];

  const drivers = [
    breakdown.Critical > 0 ? `${breakdown.Critical} critical issue${breakdown.Critical > 1 ? "s" : ""}` : null,
    breakdown.High > 0 ? `${breakdown.High} high severity issue${breakdown.High > 1 ? "s" : ""}` : null,
    highestWeightIssue ? `Top concern: ${highestWeightIssue.category} in ${formatRoomTypeLabel(highestWeightIssue.roomType)}` : null,
  ].filter(Boolean);

  return {
    breakdown,
    highestWeightIssue,
    drivers,
  };
}
