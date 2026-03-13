import type {
  DecisionRecommendation,
  FactorWeights,
  FitScore,
  Hazard,
  InspectionChecklist,
  InspectionMode,
  NoiseRisk,
  NoiseTolerance,
  PeoplePaperworkChecks,
  PreferenceProfile,
  PropertyIntelligence,
  RoomType,
} from "./schemas";

export const DEFAULT_REPORT_SCORE_WEIGHTS = {
  condition: 30,
  budget: 12,
  transit: 12,
  noise: 10,
  lighting: 6,
  agency: 8,
  community: 8,
  paperwork: 8,
  livability: 6,
} as const;

const HAZARD_PENALTY_BY_SEVERITY: Record<Hazard["severity"], number> = {
  Critical: 25,
  High: 15,
  Medium: 8,
  Low: 3,
};

const POSITIVE_PATTERNS = [
  /no issues?/i,
  /no damage/i,
  /no stains?/i,
  /no marks?/i,
  /no mould/i,
  /no mold/i,
  /no leaks?/i,
  /no cracks?/i,
  /no smell/i,
  /no odou?r/i,
  /no pests?/i,
  /working/i,
  /works/i,
  /good/i,
  /great/i,
  /fine/i,
  /normal/i,
  /stable/i,
  /quiet/i,
  /clean/i,
  /dry/i,
  /secure/i,
  /bright/i,
  /tested/i,
  /present/i,
  /compliant/i,
  /adequate/i,
  /spacious/i,
  /available/i,
  /well ventilated/i,
  /well-ventilated/i,
  /well lit/i,
  /well-lit/i,
  /没有/i,
  /无/i,
  /正常/i,
  /安静/i,
  /整洁/i,
  /良好/i,
  /不错/i,
  /可以/i,
  /干净/i,
  /明亮/i,
  /无异味/i,
  /无裂/i,
  /无霉/i,
  /无渗水/i,
];

const CONCERN_PATTERNS = [
  /not working/i,
  /doesn't work/i,
  /doesnt work/i,
  /not quiet/i,
  /not secure/i,
  /broken/i,
  /issue/i,
  /problem/i,
  /leak/i,
  /leaking/i,
  /mould/i,
  /mold/i,
  /damp/i,
  /water stain/i,
  /water damage/i,
  /crack/i,
  /stain/i,
  /damage/i,
  /weak/i,
  /slow/i,
  /blocked/i,
  /clog/i,
  /unsafe/i,
  /expired/i,
  /unclear/i,
  /unknown/i,
  /dispute/i,
  /delay/i,
  /hidden fee/i,
  /extra fee/i,
  /loud/i,
  /noise/i,
  /crowded/i,
  /tight/i,
  /small/i,
  /smell/i,
  /odou?r/i,
  /pest/i,
  /cockroach/i,
  /roach/i,
  /ant\b/i,
  /rodent/i,
  /\bmouse\b/i,
  /\bmice\b/i,
  /limited/i,
  /poor/i,
  /bad/i,
  /repair needed/i,
  /渗水/i,
  /漏水/i,
  /霉/i,
  /裂/i,
  /坏/i,
  /异味/i,
  /噪音/i,
  /拥挤/i,
  /潮/i,
  /虫/i,
  /鼠/i,
  /慢/i,
  /堵/i,
  /卡/i,
  /问题/i,
  /不明/i,
  /过期/i,
  /不安全/i,
  /不足/i,
];

const PROPERTY_CHECKLIST_PENALTIES = {
  "utilities.hotWater": 5,
  "utilities.waterPressure": 4,
  "utilities.drainage": 5,
  "utilities.powerPoints": 4,
  "utilities.heatingCooling": 4,
  "security.doorLocks": 6,
  "security.intercom": 2,
  "security.smokeAlarm": 8,
  "security.nightEntryRoute": 4,
  "security.entryAccess": 3,
  "kitchenBathroom.toiletFlush": 4,
  "kitchenBathroom.hotColdTaps": 4,
  "kitchenBathroom.washerDryer": 2,
  "kitchenBathroom.kitchenExhaust": 3,
  "kitchenBathroom.bathroomVentilation": 4,
  "kitchenBathroom.dampness": 7,
  "pestsHiddenIssues.pests": 8,
  "pestsHiddenIssues.cabinetUnderSink": 4,
  "pestsHiddenIssues.windowSeals": 4,
  "pestsHiddenIssues.bathroomSealant": 4,
  "pestsHiddenIssues.skirtingFloorEdges": 4,
  "entryCondition.electricalSafetyCheck": 4,
  "entryCondition.gasSafetyCheck": 4,
} as const;

const PAPERWORK_FIELD_WEIGHTS = {
  "leaseCosts.bondHandling": 5,
  "leaseCosts.utilityResponsibility": 4,
  "leaseCosts.hiddenFees": 6,
  "entryCondition.conditionPhotosTaken": 5,
  "entryCondition.electricalSafetyCheck": 4,
  "entryCondition.gasSafetyCheck": 4,
  "security.smokeAlarm": 4,
} as const;

const LIVABILITY_FIELD_WEIGHTS = {
  "noise.weekdayMorning": 4,
  "noise.lateNight": 4,
  "noise.weekend": 3,
  "noise.bedroomClosedWindows": 4,
  "noise.balconyNoise": 2,
  "livability.wardrobeStorage": 3,
  "livability.kitchenStorage": 3,
  "livability.fridgePlacement": 2,
  "livability.bulkyItemsStorage": 2,
  "livability.bedDeskFit": 4,
  "livability.workFromHomeFit": 3,
  "livability.twoPersonFit": 3,
  "buildingManagement.managerResponse": 2,
  "buildingManagement.repairTurnaround": 2,
  "buildingManagement.facilityBooking": 1,
  "buildingManagement.visitorParking": 1,
  "buildingManagement.bulkyWaste": 1,
} as const;

type ChecklistFieldMap = Record<string, number>;
type ReportBreakdownKey =
  | "condition"
  | "budget"
  | "transit"
  | "noise"
  | "lighting"
  | "agency"
  | "community"
  | "paperwork"
  | "livability";

export interface ReportScoringBreakdown {
  condition: number;
  budget: number | null;
  transit: number | null;
  noise: number | null;
  lighting: number | null;
  agency: number | null;
  community: number | null;
  paperwork: number | null;
  livability: number | null;
  coverage: number;
}

export interface ReportScoreBundle {
  propertyRiskScore: number;
  fitScore: FitScore;
  recommendation: DecisionRecommendation;
  breakdown: ReportScoringBreakdown;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(" | ").trim();
  }
  return value?.trim() ?? "";
}

function getChecklistValue(checklist: InspectionChecklist | undefined, path: string) {
  if (!checklist) {
    return undefined;
  }

  const segments = path.split(".");
  let current: unknown = checklist;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (Array.isArray(current)) {
    return current.map((item) => String(item));
  }

  return typeof current === "string" ? current : undefined;
}

function classifyChecklistValue(value: string | string[] | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (POSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "positive" as const;
  }

  if (CONCERN_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "concern" as const;
  }

  return "neutral" as const;
}

function scoreChecklistComposite(checklist: InspectionChecklist | undefined, weights: ChecklistFieldMap) {
  let weightedScore = 0;
  let totalWeight = 0;
  let filledFields = 0;
  let concernCount = 0;

  for (const [path, weight] of Object.entries(weights)) {
    const value = getChecklistValue(checklist, path);
    const state = classifyChecklistValue(value);
    if (!state) {
      continue;
    }

    filledFields += 1;
    totalWeight += weight;

    if (state === "positive") {
      weightedScore += 90 * weight;
      continue;
    }

    if (state === "concern") {
      concernCount += 1;
      weightedScore += 28 * weight;
      continue;
    }

    weightedScore += 65 * weight;
  }

  return {
    score: totalWeight > 0 ? clamp(Math.round(weightedScore / totalWeight), 0, 100) : null,
    filledFields,
    concernCount,
  };
}

function countFilledChecklistFields(checklist: InspectionChecklist | undefined) {
  if (!checklist) {
    return 0;
  }

  let count = 0;

  function walk(value: unknown) {
    if (Array.isArray(value)) {
      if (value.length > 0) {
        count += 1;
      }
      return;
    }

    if (typeof value === "string") {
      if (value.trim()) {
        count += 1;
      }
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    for (const child of Object.values(value)) {
      walk(child);
    }
  }

  walk(checklist);
  return count;
}

function computeCoverageScore(args: {
  hazards: Hazard[];
  inspectionChecklist?: InspectionChecklist;
  inspectionMode?: InspectionMode;
}) {
  const filledFields = countFilledChecklistFields(args.inspectionChecklist);

  if (args.hazards.length >= 4 || filledFields >= 14) {
    return 88;
  }
  if (args.hazards.length >= 2 || filledFields >= 8) {
    return 74;
  }
  if (args.hazards.length >= 1 || filledFields >= 4) {
    return 62;
  }

  return args.inspectionMode === "manual" ? 55 : 48;
}

function computePropertyChecklistPenalty(checklist: InspectionChecklist | undefined) {
  let penalty = 0;

  for (const [path, weight] of Object.entries(PROPERTY_CHECKLIST_PENALTIES)) {
    if (classifyChecklistValue(getChecklistValue(checklist, path)) === "concern") {
      penalty += weight;
    }
  }

  if ((checklist?.entryCondition?.renterDisagreements?.length ?? 0) > 0) {
    penalty += 4;
  }

  return clamp(penalty, 0, 36);
}

function computeCoveragePenalty(args: {
  hazards: Hazard[];
  inspectionChecklist?: InspectionChecklist;
  inspectionMode?: InspectionMode;
}) {
  if (!args.inspectionMode) {
    return 0;
  }

  const filledFields = countFilledChecklistFields(args.inspectionChecklist);

  if (args.hazards.length === 0) {
    if (filledFields >= 14) {
      return 5;
    }
    if (filledFields >= 8) {
      return 8;
    }
    return args.inspectionMode === "manual" ? 10 : 12;
  }

  if (filledFields < 4) {
    return args.inspectionMode === "manual" ? 2 : 4;
  }

  return 0;
}

function hazardPenalty(hazards: Hazard[]) {
  return clamp(
    hazards.reduce((sum, hazard) => sum + HAZARD_PENALTY_BY_SEVERITY[hazard.severity], 0),
    0,
    100
  );
}

export function calculatePropertyRiskScore(args: {
  hazards: Hazard[];
  inspectionChecklist?: InspectionChecklist;
  inspectionMode?: InspectionMode;
}) {
  const baseHazardPenalty = hazardPenalty(args.hazards);
  const checklistPenalty = computePropertyChecklistPenalty(args.inspectionChecklist);
  const coveragePenalty = computeCoveragePenalty(args);

  const rawScore = clamp(100 - baseHazardPenalty - checklistPenalty - coveragePenalty, 0, 100);
  const cap = args.hazards.length === 0 ? 95 : 100;
  return clamp(Math.round(rawScore), 0, cap);
}

export function scoreBudgetFit(askingRent?: number, budget?: number) {
  if (!askingRent || !budget || budget <= 0) {
    return null;
  }

  const diffRatio = (askingRent - budget) / budget;

  if (diffRatio <= -0.1) {
    return 97;
  }

  if (diffRatio <= 0) {
    return clamp(92 - Math.abs(diffRatio) * 30, 82, 97);
  }

  return clamp(92 - diffRatio * 220, 0, 92);
}

export function scoreNoiseFit(risk: NoiseRisk | undefined, tolerance?: NoiseTolerance) {
  const base =
    risk === "Low"
      ? 88
      : risk === "Medium"
        ? 60
        : risk === "High"
          ? 28
          : 55;

  if (tolerance === "low") {
    return clamp(base - (risk === "Medium" ? 8 : risk === "High" ? 12 : 0), 0, 100);
  }

  if (tolerance === "high") {
    return clamp(base + (risk === "Medium" ? 8 : risk === "Low" ? 4 : 0), 0, 100);
  }

  return clamp(base, 0, 100);
}

export function scoreAgencySentiment(
  sentimentScoreValue?: number,
  citationsCount = 0,
  complaintCount = 0
) {
  let score = typeof sentimentScoreValue === "number" ? sentimentScoreValue * 20 : 52;

  if (citationsCount === 0) {
    score -= 6;
  } else if (citationsCount >= 2) {
    score += 3;
  }

  score -= Math.min(complaintCount, 3) * 4;
  return clamp(Math.round(score), 0, 100);
}

export function scoreCommunitySentiment(
  sentiment: "positive" | "neutral" | "mixed" | "negative" | "unknown" | undefined,
  citationsCount = 0,
  fusionConfidence?: "low" | "medium" | "high"
) {
  let score =
    sentiment === "positive"
      ? 85
      : sentiment === "neutral"
        ? 65
        : sentiment === "mixed"
          ? 52
          : sentiment === "negative"
            ? 28
            : 50;

  if (citationsCount === 0) {
    score -= 8;
  } else if (citationsCount >= 2) {
    score += 4;
  }

  if (fusionConfidence === "high") {
    score += 3;
  } else if (fusionConfidence === "low") {
    score -= 3;
  }

  return clamp(Math.round(score), 0, 100);
}

function scorePaperworkReadiness(args: {
  inspectionChecklist?: InspectionChecklist;
  paperworkChecks?: PeoplePaperworkChecks;
  intelligence?: PropertyIntelligence;
}) {
  const checklistComposite = scoreChecklistComposite(args.inspectionChecklist, PAPERWORK_FIELD_WEIGHTS);
  let score = checklistComposite.score ?? 68;

  if (args.paperworkChecks) {
    score -= Math.min(args.paperworkChecks.riskFlags.length, 4) * 7;
    if (args.paperworkChecks.riskFlags.length === 0) {
      score += 4;
    }
  }

  if ((args.intelligence?.agencyBackground?.sentimentScore ?? 3) < 3.2) {
    score -= 5;
  }

  if (!args.intelligence?.agencyBackground?.citations.length) {
    score -= 4;
  }

  return clamp(Math.round(score), 20, 95);
}

function scoreLivability(args: {
  inspectionChecklist?: InspectionChecklist;
  intelligence?: PropertyIntelligence;
}) {
  const checklistComposite = scoreChecklistComposite(args.inspectionChecklist, LIVABILITY_FIELD_WEIGHTS);
  let score = checklistComposite.score ?? 60;

  const essentialsCount = args.intelligence?.geoAnalysis?.nearbyEssentials?.length ?? 0;
  if (essentialsCount >= 3) {
    score += 4;
  } else if (essentialsCount >= 1) {
    score += 2;
  }

  const transitScore = args.intelligence?.geoAnalysis?.transitScore;
  if (typeof transitScore === "number" && transitScore >= 75) {
    score += 3;
  }

  if (args.intelligence?.geoAnalysis?.noiseRisk === "High") {
    score -= 8;
  } else if (args.intelligence?.geoAnalysis?.noiseRisk === "Medium") {
    score -= 3;
  }

  return clamp(Math.round(score), 25, 95);
}

function scoreLighting(args: { lightingScoreAuto?: number; lightingScoreManual?: number }) {
  const value = args.lightingScoreManual ?? args.lightingScoreAuto;
  return typeof value === "number" ? clamp(Math.round(value), 0, 100) : null;
}

function weightedAverage(
  breakdown: Record<ReportBreakdownKey, number | null>,
  weights: Record<ReportBreakdownKey, number>
) {
  let numerator = 0;
  let denominator = 0;

  for (const key of Object.keys(weights) as ReportBreakdownKey[]) {
    const value = breakdown[key];
    if (value === null) {
      continue;
    }
    numerator += value * weights[key];
    denominator += weights[key];
  }

  return denominator > 0 ? clamp(Math.round(numerator / denominator), 0, 100) : 0;
}

function resolveReportWeights(preferenceProfile?: PreferenceProfile) {
  const weights = { ...DEFAULT_REPORT_SCORE_WEIGHTS };

  if (preferenceProfile?.commutePriority === "high") {
    weights.transit += 4;
    weights.community -= 2;
    weights.livability -= 2;
  } else if (preferenceProfile?.commutePriority === "low") {
    weights.transit -= 4;
    weights.condition += 2;
    weights.livability += 2;
  }

  return weights;
}

function coverageReason(score: number) {
  if (score >= 80) {
    return "Inspection coverage is reasonably complete for a rental decision.";
  }
  if (score >= 60) {
    return "Inspection coverage is partial; hidden issues still need manual checks.";
  }
  return "Inspection coverage is limited, so apparent cleanliness may overstate the real condition.";
}

function pickPrimaryRoom(hazards: Hazard[]) {
  const firstKnown = hazards.find((hazard) => hazard.roomType && hazard.roomType !== "unknown");
  return firstKnown?.roomType ?? hazards[0]?.roomType ?? "unknown";
}

function formatRoomTypeLabel(roomType: RoomType | undefined) {
  switch (roomType) {
    case "living-room":
      return "living room";
    case "unknown":
    case undefined:
      return "general area";
    default:
      return roomType.replace("-", " ");
  }
}

function buildFitDrivers(breakdown: ReportScoringBreakdown, hazardPenaltyValue: number) {
  const drivers = [
    { label: `Condition: ${breakdown.condition}`, score: breakdown.condition },
    { label: breakdown.paperwork !== null ? `Paperwork: ${breakdown.paperwork}` : "Paperwork: pending", score: breakdown.paperwork ?? 50 },
    { label: breakdown.budget !== null ? `Budget fit: ${breakdown.budget}` : "Budget fit: n/a", score: breakdown.budget ?? 50 },
    { label: breakdown.transit !== null ? `Transit: ${breakdown.transit}` : "Transit: pending", score: breakdown.transit ?? 50 },
    { label: `Noise comfort: ${breakdown.noise ?? 55}`, score: breakdown.noise ?? 55 },
    { label: breakdown.lighting !== null ? `Lighting: ${breakdown.lighting}` : "Lighting: pending", score: breakdown.lighting ?? 55 },
    { label: breakdown.agency !== null ? `Agency trust: ${breakdown.agency}` : "Agency trust: pending", score: breakdown.agency ?? 50 },
    { label: breakdown.community !== null ? `Local signal: ${breakdown.community}` : "Local signal: pending", score: breakdown.community ?? 50 },
    { label: `Visual risk penalty: ${hazardPenaltyValue}`, score: 100 - hazardPenaltyValue },
  ];

  return drivers
    .sort((left, right) => left.score - right.score)
    .slice(0, 4)
    .map((item) => item.label);
}

export function buildReportScoreBundle(args: {
  hazards: Hazard[];
  intelligence?: PropertyIntelligence;
  inspectionChecklist?: InspectionChecklist;
  inspectionMode?: InspectionMode;
  paperworkChecks?: PeoplePaperworkChecks;
  askingRent?: number;
  lightingScoreAuto?: number;
  lightingScoreManual?: number;
  preferenceProfile?: PreferenceProfile;
}) {
  const propertyRiskScore = calculatePropertyRiskScore({
    hazards: args.hazards,
    inspectionChecklist: args.inspectionChecklist,
    inspectionMode: args.inspectionMode,
  });
  const coverage = computeCoverageScore(args);
  const breakdown: ReportScoringBreakdown = {
    condition: propertyRiskScore,
    budget: scoreBudgetFit(args.askingRent, args.preferenceProfile?.budget),
    transit:
      typeof args.intelligence?.geoAnalysis?.transitScore === "number"
        ? clamp(Math.round(args.intelligence.geoAnalysis.transitScore), 0, 100)
        : null,
    noise:
      args.intelligence?.geoAnalysis?.noiseRisk
        ? scoreNoiseFit(args.intelligence.geoAnalysis.noiseRisk, args.preferenceProfile?.noiseTolerance)
        : null,
    lighting: scoreLighting(args),
    agency: args.intelligence?.agencyBackground
      ? scoreAgencySentiment(
          args.intelligence.agencyBackground.sentimentScore,
          args.intelligence.agencyBackground.citations.length,
          args.intelligence.agencyBackground.commonComplaints.length
        )
      : null,
    community: args.intelligence?.communityInsight
      ? scoreCommunitySentiment(
          args.intelligence.communityInsight.sentiment,
          args.intelligence.communityInsight.citations.length,
          args.intelligence.fusion?.confidence
        )
      : null,
    paperwork: scorePaperworkReadiness(args),
    livability: scoreLivability(args),
    coverage,
  };

  const weightedFitScore = weightedAverage(
    {
      condition: breakdown.condition,
      budget: breakdown.budget,
      transit: breakdown.transit,
      noise: breakdown.noise,
      lighting: breakdown.lighting,
      agency: breakdown.agency,
      community: breakdown.community,
      paperwork: breakdown.paperwork,
      livability: breakdown.livability,
    },
    resolveReportWeights(args.preferenceProfile)
  );

  const hazardPenaltyValue = hazardPenalty(args.hazards);
  const criticalHazards = args.hazards.filter((hazard) => hazard.severity === "Critical").length;
  const highHazards = args.hazards.filter((hazard) => hazard.severity === "High").length;
  const strongestConcerns: string[] = [];

  if (criticalHazards > 0) {
    strongestConcerns.push(`${criticalHazards} critical issue${criticalHazards > 1 ? "s" : ""} in ${formatRoomTypeLabel(pickPrimaryRoom(args.hazards))}.`);
  } else if (highHazards > 0) {
    strongestConcerns.push(`${highHazards} high-severity issue${highHazards > 1 ? "s" : ""} need written remediation.`);
  } else if (propertyRiskScore >= 80) {
    strongestConcerns.push("Visible property condition is relatively strong for a first-pass inspection.");
  } else if (propertyRiskScore >= 60) {
    strongestConcerns.push("Condition is workable, but some physical issues still need follow-up.");
  } else {
    strongestConcerns.push("Physical condition risk is material enough to justify deeper checks.");
  }

  if ((breakdown.paperwork ?? 70) < 55) {
    strongestConcerns.push("Paperwork readiness is weak; confirm bond, repairs, and lease terms in writing.");
  }

  if ((breakdown.budget ?? 70) < 55) {
    strongestConcerns.push("The rent sits above the stated budget range.");
  }

  if ((breakdown.noise ?? 70) < 45) {
    strongestConcerns.push("Noise and after-hours comfort look risky for this preference profile.");
  }

  if ((breakdown.agency ?? 70) < 50) {
    strongestConcerns.push("Agency trust signals are weak; rely on written commitments, not verbal assurances.");
  }

  if ((breakdown.community ?? 70) < 45) {
    strongestConcerns.push("Community and local evidence remain mixed or under-supported.");
  }

  strongestConcerns.push(coverageReason(coverage));

  let outcome: DecisionRecommendation["outcome"] = "Apply";
  if (
    criticalHazards > 0 ||
    propertyRiskScore < 45 ||
    ((breakdown.paperwork ?? 100) < 35 && (breakdown.agency ?? 100) < 45)
  ) {
    outcome = "Walk Away";
  } else if (
    propertyRiskScore < 60 ||
    coverage < 60 ||
    (breakdown.noise ?? 100) < 40 ||
    (breakdown.paperwork ?? 100) < 50
  ) {
    outcome = "Inspect Further";
  } else if (
    (breakdown.budget ?? 100) < 60 ||
    (breakdown.agency ?? 100) < 60 ||
    (breakdown.community ?? 100) < 55 ||
    (breakdown.livability ?? 100) < 55
  ) {
    outcome = "Negotiate";
  }

  const recommendation: DecisionRecommendation = {
    outcome,
    summary:
      outcome === "Walk Away"
        ? "Risk remains too elevated relative to the current evidence and paperwork confidence."
        : outcome === "Inspect Further"
          ? "Proceed only after a deeper check closes the current evidence and paperwork gaps."
          : outcome === "Negotiate"
            ? "The property can work, but the score still depends on written repairs and clean lease terms."
            : "Current signals support proceeding, provided the final lease pack stays consistent.",
    reasons: strongestConcerns.slice(0, 4),
  };

  const fitScore: FitScore = {
    score: weightedFitScore,
    summary:
      weightedFitScore >= 80
        ? "Strong fit across condition, practicality, and renter due-diligence signals."
        : weightedFitScore >= 65
          ? "Usable overall fit, but at least one negotiation area still needs attention."
          : weightedFitScore >= 50
            ? "Mixed fit with enough trade-offs to justify another round of checks."
            : "Weak fit unless several issues are resolved before signing.",
    drivers: buildFitDrivers(breakdown, hazardPenaltyValue),
  };

  return {
    propertyRiskScore,
    fitScore,
    recommendation,
    breakdown,
  };
}
