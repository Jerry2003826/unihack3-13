import type {
  DecisionRecommendation,
  EvidenceItem,
  FitScore,
  Hazard,
  InspectionCoverage,
  InspectionMode,
  PreLeaseActionGuide,
  PropertyIntelligence,
} from "@inspect-ai/contracts";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function severityPenalty(severity: Hazard["severity"]) {
  switch (severity) {
    case "Critical":
      return 35;
    case "High":
      return 20;
    case "Medium":
      return 10;
    case "Low":
      return 4;
  }
}

function buildInspectionCoverage(mode: InspectionMode, hazards: Hazard[]): InspectionCoverage {
  const roomsSeen = [...new Set(hazards.map((hazard) => hazard.roomType).filter(Boolean))] as InspectionCoverage["roomsSeen"];
  const confidence = hazards.length >= 4 ? "high" : hazards.length >= 2 ? "medium" : "low";

  return {
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

function computeDecisionAndFit(args: {
  hazards: Hazard[];
  intelligence?: PropertyIntelligence;
}) {
  const riskPenalty = args.hazards.reduce((total, hazard) => total + severityPenalty(hazard.severity), 0);
  const hazardPenalty = clamp(riskPenalty, 0, 100);

  const noisePenalty =
    args.intelligence?.geoAnalysis?.noiseRisk === "High"
      ? 15
      : args.intelligence?.geoAnalysis?.noiseRisk === "Medium"
        ? 8
        : 0;
  const transitBonus = Math.round((args.intelligence?.geoAnalysis?.transitScore ?? 50) / 6);
  const agencyDelta = Math.round(((args.intelligence?.agencyBackground?.sentimentScore ?? 3) - 3) * 8);

  const fitScoreValue = clamp(82 - hazardPenalty * 0.5 - noisePenalty + transitBonus + agencyDelta, 0, 100);

  const reasons: string[] = [];
  if (hazardPenalty >= 70) {
    reasons.push("Multiple severe hazards materially increase repair and safety risk.");
  } else if (hazardPenalty >= 35) {
    reasons.push("Visible issues likely require repair commitments or follow-up inspections.");
  } else {
    reasons.push("Observed visual risk is limited, but not comprehensive.");
  }

  if (args.intelligence?.geoAnalysis?.warning) {
    reasons.push(args.intelligence.geoAnalysis.warning);
  }

  if (args.intelligence?.agencyBackground?.commonComplaints.length) {
    reasons.push(`Agency complaints: ${args.intelligence.agencyBackground.commonComplaints.slice(0, 2).join(", ")}.`);
  }

  let outcome: DecisionRecommendation["outcome"] = "Apply";
  if (hazardPenalty >= 70) {
    outcome = "Walk Away";
  } else if (hazardPenalty >= 40 || noisePenalty >= 15) {
    outcome = "Inspect Further";
  } else if (hazardPenalty >= 15 || agencyDelta < 0) {
    outcome = "Negotiate";
  }

  const recommendation: DecisionRecommendation = {
    outcome,
    summary:
      outcome === "Walk Away"
        ? "Risk is elevated enough that another property is likely a safer choice."
        : outcome === "Inspect Further"
          ? "Proceed only after getting more evidence, repair commitments, or specialist checks."
          : outcome === "Negotiate"
            ? "Proceed with caution and use the identified issues to negotiate terms."
            : "Current signals are acceptable, provided the lease terms remain clean.",
    reasons,
  };

  const fitScore: FitScore = {
    score: fitScoreValue,
    summary:
      fitScoreValue >= 75
        ? "Good overall fit if lease terms and repairs are documented."
        : fitScoreValue >= 50
          ? "Moderate fit with some trade-offs that should be negotiated."
          : "Weak fit unless the owner addresses several concerns first.",
    drivers: [
      `Visual hazard penalty: ${hazardPenalty}`,
      `Transit score: ${args.intelligence?.geoAnalysis?.transitScore ?? 50}`,
      `Agency sentiment: ${args.intelligence?.agencyBackground?.sentimentScore ?? 3}`,
    ],
  };

  return { recommendation, fitScore };
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
    negotiatePoints: negotiatePoints.slice(0, 5),
    furtherInspectionItems,
  };
}

export function buildRecommendationFallbackBundle(args: {
  hazards: Hazard[];
  intelligence?: PropertyIntelligence;
  inspectionMode: InspectionMode;
}) {
  const { recommendation, fitScore } = computeDecisionAndFit(args);
  const evidenceSummary = buildEvidenceSummary(args.hazards, args.intelligence);
  const inspectionCoverage = buildInspectionCoverage(args.inspectionMode, args.hazards);
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
