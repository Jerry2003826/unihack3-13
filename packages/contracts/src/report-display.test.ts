import { describe, expect, it } from "vitest";
import type { ReportSnapshot } from "./schemas";
import {
  formatRoomTypeLabel,
  sanitizeDisplayText,
  sanitizePropertyIntelligence,
  sanitizeReportSnapshot,
} from "./report-display";

function createSnapshot(partial?: Partial<ReportSnapshot>): ReportSnapshot {
  return {
    reportId: partial?.reportId ?? crypto.randomUUID(),
    inspectionId: partial?.inspectionId ?? crypto.randomUUID(),
    createdAt: partial?.createdAt ?? Date.now(),
    inputs: {
      mode: partial?.inputs?.mode ?? "live",
      address: partial?.inputs?.address ?? "1425 North Rd, Oakleigh East VIC 3166, Australia",
      agency: partial?.inputs?.agency ?? "qwer",
      coordinates: partial?.inputs?.coordinates,
      propertyNotes: partial?.inputs?.propertyNotes,
      targetDestinations: partial?.inputs?.targetDestinations,
      preferenceProfile: partial?.inputs?.preferenceProfile,
    },
    hazards: partial?.hazards ?? [],
    intelligence: partial?.intelligence,
    propertyRiskScore: partial?.propertyRiskScore ?? 94,
    lightingScoreAuto: partial?.lightingScoreAuto,
    lightingScoreManual: partial?.lightingScoreManual,
    askingRent: partial?.askingRent,
    comparisonEligible: partial?.comparisonEligible,
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

describe("report display sanitization", () => {
  it("collapses noisy scraped text into a short readable sentence", () => {
    const raw =
      'Belle Property Caulfield 616 Glen Huntly Rd, Caulfield South VIC 3162, Australia Price8 Design and architecture8.3 ## Reviews User Name Select your rating Start your review Monday 09:00 AM - 05:30 PM Woodards Real Estate Oakleigh is a reputable agency known for its professionalism and dedication to customer satisfaction.';

    const sanitized = sanitizeDisplayText(raw, { maxLength: 140 });

    expect(sanitized).toContain("Woodards Real Estate Oakleigh");
    expect(sanitized).not.toContain("User Name");
    expect(sanitized).not.toContain("09:00 AM");
    expect(sanitized.length).toBeLessThanOrEqual(143);
  });

  it("sanitizes intelligence warnings and summaries for display", () => {
    const sanitized = sanitizePropertyIntelligence({
      address: "1425 North Rd, Oakleigh East VIC 3166, Australia",
      geoAnalysis: {
        noiseRisk: "Medium",
        transitScore: 71,
        warning:
          'Belle Property Caulfield 616 Glen Huntly Rd, Caulfield South VIC 3162, Australia ## Reviews User Name Start your review of Woodards Real Estate Oakleigh 4.3/5',
        nearbyTransit: [
          "Clayton Station/Carinish Rd - Clayton VIC 3168, Australia",
          "Clayton - Clayton VIC 3168, Australia",
        ],
        destinationConvenience: [],
      },
      communityInsight: {
        summary:
          "## Reviews User Name Start your review Public renter discussion mentions convenience, but the evidence is mixed and should be verified in person.",
        sentiment: "mixed",
        citations: [],
      },
      agencyBackground: {
        agencyName: "qwer",
        sentimentScore: 3,
        commonComplaints: [],
        negotiationLeverage:
          "Public agency research is incomplete: Search request failed. Ask for repairs, inspection records, and written commitments.",
        citations: [],
      },
    });

    expect(sanitized.geoAnalysis?.warning).not.toContain("User Name");
    expect(sanitized.geoAnalysis?.warning?.length).toBeLessThanOrEqual(170);
    expect(sanitized.communityInsight?.summary).not.toContain("## Reviews");
  });

  it("sanitizes a stored report snapshot and keeps unknown room labels human-readable", () => {
    const snapshot = sanitizeReportSnapshot(
      createSnapshot({
        recommendation: {
          outcome: "Apply",
          summary: "Current signals are acceptable, provided the lease terms remain clean.",
          reasons: [
            'Belle Property Caulfield 616 Glen Huntly Rd, Caulfield South VIC 3162, Australia ## Reviews User Name Select your rating Woodards Real Estate Oakleigh is a reputable agency known for its professionalism.',
          ],
        },
        fitScore: {
          score: 82,
          summary: "Good overall fit if lease terms and repairs are documented.",
          drivers: ["Visual hazard penalty: 8", "Transit score: 71", "Agency sentiment: 3"],
        },
        evidenceSummary: [
          {
            type: "hazard",
            summary: "Low Structural: Visible scuff marks or minor damage on the door.",
            confidence: "medium",
            source: "unknown",
          },
        ],
        inspectionCoverage: {
          roomsSeen: ["unknown"],
          missingAreas: ["Hidden plumbing", "Ceiling corners", "Power outlets"],
          confidence: "medium",
        },
      })
    );

    expect(snapshot.recommendation?.reasons[0]).not.toContain("User Name");
    expect(snapshot.evidenceSummary?.[0]?.source).toBe("general scan");
    expect(formatRoomTypeLabel("unknown")).toBe("general area");
  });
});
