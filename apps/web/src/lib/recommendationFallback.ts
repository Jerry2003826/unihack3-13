import type {
  DecisionRecommendation,
  EvidenceItem,
  Hazard,
  InspectionChecklist,
  InspectionCoverage,
  InspectionMode,
  LiveRoomScanState,
  PeoplePaperworkChecks,
  PreferenceProfile,
  PreLeaseActionGuide,
  PropertyIntelligence,
  RoomVerdict,
} from "@inspect-ai/contracts";
import { buildReportScoreBundle } from "@inspect-ai/contracts";
import { buildInspectionCoverageFromRoomStates } from "@/lib/liveRoomState";

function buildInspectionCoverage(args: {
  mode: InspectionMode;
  hazards: Hazard[];
  roomScanStates?: LiveRoomScanState[];
  roomVerdicts?: RoomVerdict[];
}): InspectionCoverage {
  if (args.roomScanStates?.length) {
    return buildInspectionCoverageFromRoomStates({
      roomStates: args.roomScanStates,
      roomVerdicts: args.roomVerdicts,
    });
  }

  const { mode, hazards } = args;
  const roomsSeen = [...new Set(hazards.map((hazard) => hazard.roomType).filter(Boolean))] as InspectionCoverage["roomsSeen"];
  const confidence = hazards.length >= 4 ? "high" : hazards.length >= 2 ? "medium" : "low";

  return {
    summary:
      hazards.length === 0
        ? "Coverage is limited because no hazards were confirmed in this pass."
        : roomsSeen.length >= 3
          ? "Coverage is moderate, but some hidden-risk areas still need a manual check."
          : "Coverage is partial and should be expanded before lease signing.",
    roomsSeen,
    missingAreas:
      roomsSeen.length >= 4
        ? []
        : mode === "manual"
          ? ["Entry points", "Ceiling corners", "Wet areas", "Power outlets"]
          : ["Hidden plumbing", "Ceiling corners", "Power outlets"],
    confidence,
    warning:
      hazards.length === 0
        ? "No hazards were confirmed. This may reflect limited coverage rather than a clean bill of health."
        : undefined,
  };
}

function buildEvidenceSummary(hazards: Hazard[], intelligence?: PropertyIntelligence): EvidenceItem[] {
  const hazardEvidence: EvidenceItem[] = hazards.slice(0, 4).map((hazard) => ({
    type: "hazard",
    summary: `${hazard.severity} ${hazard.category}: ${hazard.description}`,
    confidence: hazard.severity === "Critical" || hazard.severity === "High" ? "high" : "medium",
    source: hazard.roomType ?? "visual scan",
  }));

  const intelligenceEvidence: EvidenceItem[] = [];

  if (intelligence?.communityInsight?.summary) {
    intelligenceEvidence.push({
      type: "community",
      summary: intelligence.communityInsight.summary,
      confidence: intelligence.communityInsight.citations.length > 0 ? "medium" : "low",
      source: "community research",
    });
  }

  if (intelligence?.geoAnalysis?.warning) {
    intelligenceEvidence.push({
      type: "geo",
      summary: intelligence.geoAnalysis.warning,
      confidence: "medium",
      source: "geo analysis",
    });
  }

  if (intelligence?.agencyBackground?.negotiationLeverage) {
    intelligenceEvidence.push({
      type: "agency",
      summary: intelligence.agencyBackground.negotiationLeverage,
      confidence: intelligence.agencyBackground.citations.length > 0 ? "medium" : "low",
      source: intelligence.agencyBackground.agencyName,
    });
  }

  return [...hazardEvidence, ...intelligenceEvidence].slice(0, 8);
}

function buildActionGuide(args: {
  hazards: Hazard[];
  intelligence?: PropertyIntelligence;
  recommendation: DecisionRecommendation;
}): PreLeaseActionGuide {
  const negotiatePoints = [
    ...args.hazards.slice(0, 3).map((hazard) => `Ask for written remediation on: ${hazard.description}`),
  ];

  if (args.intelligence?.agencyBackground?.negotiationLeverage) {
    negotiatePoints.push(args.intelligence.agencyBackground.negotiationLeverage);
  }

  if (args.intelligence?.geoAnalysis?.warning) {
    negotiatePoints.push(`Clarify local condition risk: ${args.intelligence.geoAnalysis.warning}`);
  }

  const furtherInspectionItems = [
    "Test all taps, drains, windows, and power outlets during the next visit.",
    "Request the condition report and any recent repair invoices.",
  ];

  if (args.recommendation.outcome === "Inspect Further" || args.recommendation.outcome === "Walk Away") {
    furtherInspectionItems.push("If you still want the property, get an independent building or pest inspection.");
  }

  return {
    summary:
      args.recommendation.outcome === "Apply"
        ? "Proceed only after the owner confirms the current condition and lease details in writing."
        : "Use the items below as the minimum checklist before you commit to this property.",
    negotiatePoints: negotiatePoints.slice(0, 5),
    furtherInspectionItems,
  };
}

export function buildRecommendationFallbackBundle(args: {
  hazards: Hazard[];
  intelligence?: PropertyIntelligence;
  inspectionMode: InspectionMode;
  inspectionChecklist?: InspectionChecklist;
  paperworkChecks?: PeoplePaperworkChecks;
  askingRent?: number;
  lightingScoreAuto?: number;
  lightingScoreManual?: number;
  preferenceProfile?: PreferenceProfile;
  roomScanStates?: LiveRoomScanState[];
  roomVerdicts?: RoomVerdict[];
}) {
  const { recommendation, fitScore } = buildReportScoreBundle({
    hazards: args.hazards,
    intelligence: args.intelligence,
    inspectionChecklist: args.inspectionChecklist,
    inspectionMode: args.inspectionMode,
    paperworkChecks: args.paperworkChecks,
    askingRent: args.askingRent,
    lightingScoreAuto: args.lightingScoreAuto,
    lightingScoreManual: args.lightingScoreManual,
    preferenceProfile: args.preferenceProfile,
  });
  const evidenceSummary = buildEvidenceSummary(args.hazards, args.intelligence);
  const inspectionCoverage = buildInspectionCoverage({
    mode: args.inspectionMode,
    hazards: args.hazards,
    roomScanStates: args.roomScanStates,
    roomVerdicts: args.roomVerdicts,
  });
  const preLeaseActionGuide = buildActionGuide({
    hazards: args.hazards,
    intelligence: args.intelligence,
    recommendation,
  });

  return {
    recommendation,
    fitScore,
    evidenceSummary,
    inspectionCoverage,
    preLeaseActionGuide,
  };
}
