import { describe, expect, it } from "vitest";
import { buildReportScoreBundle } from "./scoring";
import type { Hazard } from "./schemas";

function createHazard(partial?: Partial<Hazard>): Hazard {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    category: partial?.category ?? "Safety",
    severity: partial?.severity ?? "Low",
    description: partial?.description ?? "Minor issue",
    detectedAt: partial?.detectedAt ?? Date.now(),
    roomType: partial?.roomType ?? "unknown",
    boundingBox: partial?.boundingBox,
    estimatedCost: partial?.estimatedCost,
    sourceEventId: partial?.sourceEventId,
  };
}

describe("report scoring", () => {
  it("reduces fit score when paperwork and condition signals are weak", () => {
    const strong = buildReportScoreBundle({
      hazards: [],
      inspectionMode: "manual",
      askingRent: 610,
      lightingScoreAuto: 78,
      preferenceProfile: {
        budget: 650,
        noiseTolerance: "medium",
      },
      inspectionChecklist: {
        utilities: {
          hotWater: "Working well",
          drainage: "No issues",
        },
        leaseCosts: {
          bondHandling: "Bond lodged correctly",
          utilityResponsibility: "Utilities clearly split",
          hiddenFees: "No hidden fees",
        },
        livability: {
          bedDeskFit: "Desk and bed fit comfortably",
          workFromHomeFit: "Suitable for daily work",
        },
      },
      intelligence: {
        geoAnalysis: {
          noiseRisk: "Low",
          transitScore: 84,
          nearbyTransit: ["Oakleigh Station - 10 min"],
          destinationConvenience: ["CBD - 28 min"],
        },
        communityInsight: {
          summary: "Convenient and generally steady local renter sentiment.",
          sentiment: "positive",
          citations: [{ sourceId: "1", title: "Forum", url: "https://reddit.com/example" }],
        },
        agencyBackground: {
          agencyName: "Woodards",
          summary: "Mostly positive public signals.",
          sentimentScore: 4.2,
          commonComplaints: [],
          negotiationLeverage: "Confirm timelines in writing.",
          citations: [{ sourceId: "2", title: "Review", url: "https://productreview.com.au/example" }],
        },
      },
    });

    const weak = buildReportScoreBundle({
      hazards: [
        createHazard({ severity: "High", category: "Structural", description: "Crack near window frame" }),
      ],
      inspectionMode: "live",
      askingRent: 780,
      preferenceProfile: {
        budget: 650,
        noiseTolerance: "low",
      },
      inspectionChecklist: {
        utilities: {
          hotWater: "Slow and unstable",
          drainage: "Drain smells and seems blocked",
        },
        leaseCosts: {
          hiddenFees: "Possible extra fees not yet clarified",
        },
        security: {
          smokeAlarm: "Unknown / not confirmed",
        },
      },
      paperworkChecks: {
        checklist: ["Confirm agency identity"],
        riskFlags: ["Written commitments missing", "Bond process unclear"],
        requiredDocuments: ["Lease draft"],
        suggestedQuestions: ["Who holds the bond?"],
      },
      intelligence: {
        geoAnalysis: {
          noiseRisk: "High",
          transitScore: 58,
          nearbyTransit: [],
          destinationConvenience: [],
        },
        communityInsight: {
          summary: "Mixed local feedback with traffic complaints.",
          sentiment: "mixed",
          citations: [],
        },
        agencyBackground: {
          agencyName: "Unknown",
          summary: "Limited public evidence.",
          sentimentScore: 2.8,
          commonComplaints: ["Slow repairs"],
          negotiationLeverage: "Ask for written commitments.",
          citations: [],
        },
      },
    });

    expect(weak.propertyRiskScore).toBeLessThan(strong.propertyRiskScore);
    expect(weak.fitScore.score).toBeLessThan(strong.fitScore.score);
    expect(["Inspect Further", "Walk Away", "Negotiate"]).toContain(weak.recommendation.outcome);
  });
});
