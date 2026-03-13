import { describe, expect, it } from "vitest";
import { buildComparisonReport, DEFAULT_FACTOR_WEIGHTS, normalizeFactorWeights, scoreComparisonCandidate } from "./comparison";
import type { ComparisonCandidate, ReportSnapshot } from "./schemas";

function createSnapshot(partial?: Partial<ReportSnapshot>): ReportSnapshot {
  return {
    reportId: partial?.reportId ?? crypto.randomUUID(),
    inspectionId: partial?.inspectionId ?? crypto.randomUUID(),
    createdAt: partial?.createdAt ?? Date.now(),
    inputs: {
      mode: partial?.inputs?.mode ?? "manual",
      address: partial?.inputs?.address ?? "15 Dandenong Rd, Clayton VIC 3168",
      agency: partial?.inputs?.agency ?? "Ray White Clayton",
      coordinates: partial?.inputs?.coordinates,
      propertyNotes: partial?.inputs?.propertyNotes,
      targetDestinations: partial?.inputs?.targetDestinations,
      preferenceProfile: partial?.inputs?.preferenceProfile,
    },
    hazards: partial?.hazards ?? [],
    intelligence: partial?.intelligence ?? {
      geoAnalysis: {
        noiseRisk: "Low",
        transitScore: 82,
        nearbyTransit: ["Clayton Station - 12 min"],
        destinationConvenience: ["Monash University - 18 min"],
      },
      communityInsight: {
        summary: "Positive local renter sentiment around convenience.",
        sentiment: "positive",
        citations: [],
      },
      agencyBackground: {
        agencyName: "Ray White Clayton",
        sentimentScore: 4.2,
        commonComplaints: [],
        negotiationLeverage: "Ask for written repair dates.",
        citations: [],
      },
    },
    propertyRiskScore: partial?.propertyRiskScore ?? 88,
    lightingScoreAuto: partial?.lightingScoreAuto ?? 62,
    lightingScoreManual: partial?.lightingScoreManual,
    askingRent: partial?.askingRent,
    comparisonEligible: partial?.comparisonEligible ?? true,
    recommendation: partial?.recommendation,
    fitScore: partial?.fitScore,
    inspectionCoverage: partial?.inspectionCoverage,
    evidenceSummary: partial?.evidenceSummary,
    preLeaseActionGuide: partial?.preLeaseActionGuide,
    knowledgeMatches: partial?.knowledgeMatches,
    paperworkChecks: partial?.paperworkChecks,
    exportAssets: partial?.exportAssets,
  };
}

function createCandidate(partial?: Partial<ComparisonCandidate>): ComparisonCandidate {
  const snapshot = partial?.reportSnapshot ?? createSnapshot();
  return {
    candidateId: partial?.candidateId ?? snapshot.reportId,
    reportId: partial?.reportId ?? snapshot.reportId,
    address: partial?.address ?? snapshot.inputs.address,
    reportSnapshot: snapshot,
    userOverrides: partial?.userOverrides,
  };
}

describe("comparison scoring", () => {
  it("normalizes weights into the allowed range", () => {
    expect(
      normalizeFactorWeights({
        ...DEFAULT_FACTOR_WEIGHTS,
        budgetWeight: 200,
        noiseWeight: -10,
      })
    ).toEqual({
      ...DEFAULT_FACTOR_WEIGHTS,
      budgetWeight: 100,
      noiseWeight: 0,
    });
  });

  it("recomputes the denominator when a factor is missing", () => {
    const candidate = createCandidate({
      reportSnapshot: createSnapshot({
        askingRent: undefined,
        propertyRiskScore: 90,
      }),
    });

    const scored = scoreComparisonCandidate({
      candidate,
      weights: DEFAULT_FACTOR_WEIGHTS,
      preferenceProfile: {
        budget: 650,
      },
    });

    expect(scored.breakdown.budget).toBeNull();
    expect(scored.totalScore).toBeGreaterThan(0);
  });

  it("prefers manual lighting overrides over auto lighting", () => {
    const candidate = createCandidate({
      reportSnapshot: createSnapshot({
        lightingScoreAuto: 42,
        lightingScoreManual: 68,
      }),
      userOverrides: {
        lightingScoreManual: 91,
      },
    });

    const scored = scoreComparisonCandidate({
      candidate,
      weights: DEFAULT_FACTOR_WEIGHTS,
    });

    expect(scored.lightingScoreUsed).toBe(91);
  });

  it("builds a ranked comparison report with a stable winner", () => {
    const winner = createCandidate({
      reportSnapshot: createSnapshot({
        reportId: "winner",
        propertyRiskScore: 92,
        askingRent: 610,
        lightingScoreAuto: 78,
      }),
    });
    const runnerUp = createCandidate({
      reportSnapshot: createSnapshot({
        reportId: "runner-up",
        propertyRiskScore: 72,
        askingRent: 690,
        lightingScoreAuto: 55,
        intelligence: {
          geoAnalysis: {
            noiseRisk: "High",
            transitScore: 54,
            nearbyTransit: [],
            destinationConvenience: [],
          },
          communityInsight: {
            summary: "Mixed renter sentiment.",
            sentiment: "mixed",
            citations: [],
          },
          agencyBackground: {
            agencyName: "Unknown",
            sentimentScore: 2.9,
            commonComplaints: ["Slow maintenance"],
            negotiationLeverage: "Request written timelines.",
            citations: [],
          },
        },
      }),
    });

    const report = buildComparisonReport({
      comparisonId: "cmp-1",
      createdAt: Date.now(),
      candidates: [runnerUp, winner],
      weights: DEFAULT_FACTOR_WEIGHTS,
      preferenceProfile: {
        budget: 650,
        noiseTolerance: "low",
      },
    });

    expect(report.topRecommendation.reportId).toBe("winner");
    expect(report.rankedCandidates[0]?.reportId).toBe("winner");
    expect(report.rankedCandidates[0]?.totalScore).toBeGreaterThan(report.rankedCandidates[1]?.totalScore ?? 0);
  });
});
