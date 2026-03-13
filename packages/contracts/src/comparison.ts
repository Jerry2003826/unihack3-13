import type {
  ComparisonCandidate,
  ComparisonRankedCandidate,
  ComparisonReportSnapshot,
  FactorWeights,
  PreferenceProfile,
} from "./schemas";
import {
  scoreAgencySentiment,
  scoreBudgetFit,
  scoreCommunitySentiment,
  scoreNoiseFit,
} from "./scoring";

export const DEFAULT_FACTOR_WEIGHTS: FactorWeights = {
  budgetWeight: 16,
  commuteWeight: 16,
  noiseWeight: 12,
  lightingWeight: 8,
  conditionWeight: 28,
  agencyWeight: 8,
  communityWeight: 12,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fitLabel(totalScore: number): ComparisonRankedCandidate["fitLabel"] {
  if (totalScore >= 80) {
    return "Strong Match";
  }

  if (totalScore >= 65) {
    return "Good Match";
  }

  if (totalScore >= 45) {
    return "Conditional Match";
  }

  return "Weak Match";
}

export function normalizeFactorWeights(weights?: Partial<FactorWeights>): FactorWeights {
  const merged = {
    ...DEFAULT_FACTOR_WEIGHTS,
    ...weights,
  };

  return {
    budgetWeight: clamp(merged.budgetWeight, 0, 100),
    commuteWeight: clamp(merged.commuteWeight, 0, 100),
    noiseWeight: clamp(merged.noiseWeight, 0, 100),
    lightingWeight: clamp(merged.lightingWeight, 0, 100),
    conditionWeight: clamp(merged.conditionWeight, 0, 100),
    agencyWeight: clamp(merged.agencyWeight, 0, 100),
    communityWeight: clamp(merged.communityWeight, 0, 100),
  };
}

export function scoreComparisonCandidate(args: {
  candidate: ComparisonCandidate;
  weights: FactorWeights;
  preferenceProfile?: PreferenceProfile;
}): ComparisonRankedCandidate {
  const { candidate, preferenceProfile } = args;
  const snapshot = candidate.reportSnapshot;
  const lightingScoreUsed =
    candidate.userOverrides?.lightingScoreManual ??
    snapshot.lightingScoreManual ??
    snapshot.lightingScoreAuto ??
    55;
  const askingRent = candidate.userOverrides?.askingRent ?? snapshot.askingRent;

  const breakdown = {
    budget: scoreBudgetFit(askingRent, preferenceProfile?.budget),
    commute: snapshot.intelligence?.geoAnalysis?.transitScore ?? 50,
    noise: scoreNoiseFit(snapshot.intelligence?.geoAnalysis?.noiseRisk, preferenceProfile?.noiseTolerance),
    lighting: clamp(lightingScoreUsed, 0, 100),
    condition: clamp(snapshot.propertyRiskScore, 0, 100),
    agency: scoreAgencySentiment(
      snapshot.intelligence?.agencyBackground?.sentimentScore,
      snapshot.intelligence?.agencyBackground?.citations.length ?? 0,
      snapshot.intelligence?.agencyBackground?.commonComplaints.length ?? 0
    ),
    community: scoreCommunitySentiment(
      snapshot.intelligence?.communityInsight?.sentiment,
      snapshot.intelligence?.communityInsight?.citations.length ?? 0,
      snapshot.intelligence?.fusion?.confidence
    ),
  };

  const weightedFactors: Array<[keyof FactorWeights, number | null]> = [
    ["budgetWeight", breakdown.budget],
    ["commuteWeight", breakdown.commute],
    ["noiseWeight", breakdown.noise],
    ["lightingWeight", breakdown.lighting],
    ["conditionWeight", breakdown.condition],
    ["agencyWeight", breakdown.agency],
    ["communityWeight", breakdown.community],
  ];

  const denominator = weightedFactors.reduce((sum, [weightKey, factorScore]) => {
    return factorScore === null ? sum : sum + args.weights[weightKey];
  }, 0);

  const numerator = weightedFactors.reduce((sum, [weightKey, factorScore]) => {
    return factorScore === null ? sum : sum + factorScore * args.weights[weightKey];
  }, 0);

  const totalScore = denominator > 0 ? clamp(Math.round(numerator / denominator), 0, 100) : 0;
  const address = candidate.address || snapshot.inputs.address || "Unknown address";
  const strengths: string[] = [];
  const tradeoffs: string[] = [];
  const cautions: string[] = [];

  if ((breakdown.condition ?? 0) >= 80) strengths.push(`Condition score ${breakdown.condition} based on low visible risk.`);
  if ((breakdown.commute ?? 0) >= 75) strengths.push(`Transit score ${breakdown.commute} supports the commute.`);
  if ((breakdown.lighting ?? 0) >= 75) strengths.push(`Lighting score ${breakdown.lighting} suggests a brighter space.`);
  if ((breakdown.community ?? 0) >= 75) strengths.push("Community signals are more positive than average.");

  if ((breakdown.budget ?? 100) < 55) tradeoffs.push("Rent is above the stated budget range.");
  if ((breakdown.noise ?? 100) < 50) tradeoffs.push("Noise exposure may be uncomfortable for this preference profile.");
  if ((breakdown.agency ?? 100) < 50) tradeoffs.push("Agency sentiment suggests you should push for written commitments.");
  if ((breakdown.condition ?? 100) < 60) tradeoffs.push("Property condition needs negotiation or further inspection.");
  if ((snapshot.paperworkChecks?.riskFlags.length ?? 0) > 0) {
    tradeoffs.push("Paperwork and due-diligence risks still need written clarification.");
  }

  if (snapshot.hazards.some((hazard) => hazard.severity === "Critical")) {
    cautions.push("Critical hazards were detected in the inspection evidence.");
  }
  if (!snapshot.intelligence?.communityInsight?.citations.length) {
    cautions.push("Community evidence is limited; verify local conditions manually.");
  }
  if (!snapshot.intelligence?.agencyBackground?.citations.length) {
    cautions.push("Agency background is incomplete; request paperwork in writing.");
  }

  if (strengths.length === 0) {
    strengths.push("No single factor dominates; the property is a blended trade-off.");
  }

  if (tradeoffs.length === 0) {
    tradeoffs.push("No major trade-offs dominate the current weighted profile.");
  }

  return {
    candidateId: candidate.candidateId,
    reportId: candidate.reportId,
    address,
    totalScore,
    fitLabel: fitLabel(totalScore),
    lightingScoreUsed: clamp(Math.round(lightingScoreUsed), 0, 100),
    askingRent,
    breakdown,
    strengths: strengths.slice(0, 4),
    tradeoffs: tradeoffs.slice(0, 4),
    cautions: cautions.slice(0, 4),
    notes: candidate.userOverrides?.notes,
  };
}

export function buildComparisonReport(args: {
  comparisonId: string;
  createdAt: number;
  candidates: ComparisonCandidate[];
  weights: FactorWeights;
  preferenceProfile?: PreferenceProfile;
}): Omit<ComparisonReportSnapshot, "knowledgeMatches" | "paperworkChecks"> {
  const rankedCandidates = args.candidates
    .map((candidate) =>
      scoreComparisonCandidate({
        candidate,
        weights: args.weights,
        preferenceProfile: args.preferenceProfile,
      })
    )
    .sort((left, right) => right.totalScore - left.totalScore);

  const winner = rankedCandidates[0];
  const runnerUp = rankedCandidates[1];

  const whyThisWins = [
    winner?.strengths[0] ?? "It produced the strongest overall weighted score.",
    winner?.tradeoffs[0]
      ? `Its main compromise is still acceptable: ${winner.tradeoffs[0]}`
      : "Its trade-offs are more manageable than the alternatives.",
    runnerUp
      ? `It leads the next best option by ${Math.max(1, winner.totalScore - runnerUp.totalScore)} points.`
      : "There are no competing candidates in the current comparison set.",
  ];

  const whyOthersLost = rankedCandidates.slice(1).flatMap((candidate) =>
    candidate.tradeoffs.slice(0, 1).map((tradeoff) => `${candidate.address}: ${tradeoff}`)
  );

  const tradeoffSummary = rankedCandidates.flatMap((candidate) =>
    candidate.tradeoffs.slice(0, 1).map((tradeoff) => `${candidate.address}: ${tradeoff}`)
  );

  return {
    comparisonId: args.comparisonId,
    createdAt: args.createdAt,
    weights: args.weights,
    preferenceProfile: args.preferenceProfile,
    rankedCandidates,
    topRecommendation: {
      candidateId: winner.candidateId,
      reportId: winner.reportId,
      address: winner.address,
      summary: `${winner.address} ranks first with a ${winner.totalScore}/100 weighted fit score.`,
    },
    tradeoffSummary: tradeoffSummary.slice(0, 6),
    whyThisWins: whyThisWins.slice(0, 4),
    whyOthersLost: whyOthersLost.slice(0, 6),
  };
}
