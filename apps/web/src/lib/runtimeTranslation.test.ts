import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  comparisonReportSnapshotSchema,
  reportSnapshotSchema,
} from "@inspect-ai/contracts";
import { localizeReportSnapshot, localizeComparisonReport, translateTextBatch } from "./runtimeTranslation";

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function buildMinimalSnapshot() {
  return reportSnapshotSchema.parse({
    reportId: "test-report-1",
    inspectionId: "test-inspection-1",
    createdAt: Date.now(),
    inputs: {
      mode: "live",
      address: "123 Test Street, Sydney",
    },
    hazards: [
      {
        id: "h1",
        category: "Mould",
        severity: "High",
        description: "Visible mould patch near the bathroom ceiling corner.",
        detectedAt: Date.now(),
        estimatedCost: {
          amount: 350,
          currency: "AUD",
          reason: "Professional mould removal and repainting required.",
        },
      },
      {
        id: "h2",
        category: "Structural",
        severity: "Medium",
        description: "Hairline crack along the living room wall.",
        detectedAt: Date.now(),
      },
    ],
    propertyRiskScore: 45,
    recommendation: {
      outcome: "Negotiate",
      summary: "Proceed with caution. Negotiate for mould remediation before signing.",
      reasons: [
        "Mould in bathroom is a health concern and should be remediated professionally.",
        "Structural crack appears cosmetic but should be noted in the condition report.",
      ],
    },
    fitScore: {
      score: 72,
      summary: "Good fit overall with some concerns about bathroom condition.",
      drivers: ["Spacious living area", "Good natural light", "Mould remediation needed"],
    },
    intelligence: {
      geoAnalysis: {
        noiseRisk: "Medium",
        transitScore: 85,
        warning: "Nearby construction may cause intermittent noise on weekdays.",
        keySignals: ["Bus stop within 200m", "Train station 1.2km away"],
        nearbyTransit: ["Bus route 420 - 3 min walk", "Central Station - 15 min walk"],
        destinationConvenience: ["USYD campus - 22 min by bus", "CBD - 30 min by train"],
        nearbyEssentials: [
          {
            name: "Woolworths Metro",
            category: "Grocery",
            distanceMeters: 350,
            businessStatus: "OPERATIONAL",
            openNowText: "Open now · Closes 10pm",
            editorialSummary: "Well-stocked metro supermarket with fresh produce section.",
            accessibilityHighlights: ["Wheelchair-accessible entrance", "Wheelchair-accessible parking"],
            parkingHighlights: ["Free underground parking for customers"],
          },
        ],
      },
      communityInsight: {
        sentiment: "mixed" as const,
        summary: "Residents appreciate the location but note occasional noise from the main road.",
        highlights: ["Great coffee shops nearby", "Friendly neighbourhood feel"],
        citations: [],
      },
      agencyBackground: {
        agencyName: "Ray White Sydney",
        sentimentScore: 3.8,
        summary: "Generally positive reputation with some complaints about maintenance responsiveness.",
        negotiationLeverage: "Market is competitive. Use inspection findings to negotiate rent reduction.",
        highlights: ["Professional communication", "Quick application processing"],
        commonComplaints: ["Slow maintenance response", "Strict bond claim process"],
        citations: [],
      },
      fusion: {
        confidence: "medium" as const,
        mapSignals: [
          {
            topic: "geo" as const,
            title: "Public Transport Access",
            summary: "Good access to multiple bus routes and a train station within walking distance.",
            highlights: ["Express bus to CBD available"],
            confidence: "medium" as const,
          },
        ],
        webSignals: [
          {
            topic: "community" as const,
            title: "Neighbourhood Safety",
            summary: "Low crime rate reported in the area with active neighbourhood watch.",
            highlights: ["Safe for families", "Well-lit streets"],
            confidence: "medium" as const,
          },
        ],
        conflicts: ["Map shows closer bus stop than web reviews suggest - verify on-site."],
      },
    },
    evidenceSummary: [
      {
        type: "hazard" as const,
        confidence: "high" as const,
        summary: "Clear photo evidence of mould patch in bathroom ceiling corner.",
        source: "Bathroom photo #2",
      },
    ],
    inspectionCoverage: {
      confidence: "medium" as const,
      coverageStatus: "mixed",
      roomsSeen: ["bathroom", "living-room"],
      summary: "Two key rooms inspected. Kitchen and bedroom remain unchecked.",
      warning: "Missing kitchen inspection may hide additional hazards.",
      missingAreas: ["Kitchen not inspected", "Bedroom not inspected"],
    },
    preLeaseActionGuide: {
      summary: "Request professional mould remediation and a second inspection of the kitchen before signing.",
      negotiatePoints: ["Ask for $20/week rent reduction until mould is fixed", "Request 2-week delay for remediation"],
      furtherInspectionItems: ["Check under kitchen sink for leaks", "Test all power outlets in bedroom"],
    },
    knowledgeMatches: [
      {
        sourceId: "kb-001",
        title: "Mould in Rental Properties NSW",
        snippet: "Tenants have the right to request mould remediation under NSW tenancy laws.",
        tags: ["mould", "legal"],
        chunkId: "chunk-1",
        retrievalScore: 0.92,
        rerankScore: 0.88,
      },
    ],
    paperworkChecks: {
      checklist: ["Verify landlord's identity via NSW Fair Trading", "Check bond lodgement receipt"],
      riskFlags: ["Agent uses non-standard lease template"],
      requiredDocuments: ["Photo ID", "Proof of income", "Rental history ledger"],
      suggestedQuestions: ["Ask about rent increase frequency", "Clarify pet policy in writing"],
    },
  });
}

function buildMinimalComparisonReport() {
  return comparisonReportSnapshotSchema.parse({
    comparisonId: "test-comparison-1",
    createdAt: Date.now(),
    weights: {
      budgetWeight: 30,
      commuteWeight: 20,
      noiseWeight: 15,
      lightingWeight: 10,
      conditionWeight: 15,
      agencyWeight: 5,
      communityWeight: 5,
    },
    rankedCandidates: [
      {
        candidateId: "c1",
        reportId: "r1",
        address: "123 Test Street, Sydney",
        fitLabel: "Strong Match" as const,
        totalScore: 88,
        lightingScoreUsed: 75,
        breakdown: {
          budget: 80,
          commute: 90,
          noise: 60,
          lighting: 75,
          condition: 55,
          agency: 75,
          community: 80,
        },
        notes: "Best overall fit despite minor condition concerns.",
        strengths: ["Excellent commute options", "Spacious living area"],
        tradeoffs: ["Minor mould issue in bathroom"],
        cautions: ["Verify kitchen condition before signing"],
      },
    ],
    topRecommendation: {
      candidateId: "c1",
      reportId: "r1",
      address: "123 Test Street, Sydney",
      summary: "This property offers the best balance of commute convenience and living space.",
    },
    tradeoffSummary: ["Trade-off between condition and location"],
    whyThisWins: ["Best commute score", "Largest living area"],
    whyOthersLost: ["Higher rent for similar quality", "Poorer transit access"],
    knowledgeMatches: [],
    paperworkChecks: {
      checklist: ["Verify landlord identity"],
      riskFlags: [],
      requiredDocuments: ["Photo ID"],
      suggestedQuestions: ["Ask about rent increase frequency"],
    },
  });
}

function stubFetch(responseInit: Response | Error) {
  const mock = vi.fn<(...args: unknown[]) => Promise<Response>>();
  if (responseInit instanceof Error) {
    mock.mockRejectedValue(responseInit);
  } else {
    mock.mockResolvedValue(responseInit);
  }
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("runtimeTranslation — english passthrough", () => {
  it("translateTextBatch returns texts unchanged for 'en' locale", async () => {
    const texts = ["Hello world", "Some description", "Another text"];
    const result = await translateTextBatch("en", texts);
    expect(result).toEqual(texts);
  });

  it("localizeReportSnapshot returns the same snapshot for 'en' locale", async () => {
    const snapshot = buildMinimalSnapshot();
    const result = await localizeReportSnapshot(snapshot, "en");
    expect(result).toBe(snapshot);
  });

  it("localizeComparisonReport returns the same report for 'en' locale", async () => {
    const report = buildMinimalComparisonReport();
    const result = await localizeComparisonReport(report, "en");
    expect(result).toBe(report);
  });
});

describe("runtimeTranslation — fetch failure fallback", () => {
  it("translateTextBatch returns original texts when fetch fails", async () => {
    stubFetch(new Error("Network error"));

    const texts = ["Hello world", "Some description"];
    const result = await translateTextBatch("zh", texts);
    expect(result).toEqual(texts);
  });

  it("translateTextBatch returns original texts when fetch returns non-ok", async () => {
    stubFetch(new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 }));

    const texts = ["Hello world"];
    const result = await translateTextBatch("zh", texts);
    expect(result).toEqual(texts);
  });

  it("localizeReportSnapshot does not throw on fetch failure", async () => {
    stubFetch(new Error("Network error"));

    const snapshot = buildMinimalSnapshot();
    const result = await localizeReportSnapshot(snapshot, "zh");
    // The result is a clone, not the same reference
    expect(result).not.toBe(snapshot);
    // Text content preserved (original English since translation failed)
    expect(result.hazards[0].description).toBe(snapshot.hazards[0].description);
  });

  it("localizeComparisonReport does not throw on fetch failure", async () => {
    stubFetch(new Error("Network error"));

    const report = buildMinimalComparisonReport();
    const result = await localizeComparisonReport(report, "zh");
    expect(result).not.toBe(report);
    expect(result.topRecommendation.summary).toBe(report.topRecommendation.summary);
  });
});

describe("runtimeTranslation — successful translation path", () => {
  it("translateTextBatch translates texts via API and caches results", async () => {
    const translated = ["你好世界", "一些描述"];
    stubFetch(new Response(JSON.stringify({ translations: translated }), { status: 200 }));

    const texts = ["Hello world", "Some description"];
    const result = await translateTextBatch("zh", texts);
    expect(result).toEqual(translated);

    // Second call should use cache (no fetch)
    vi.stubGlobal("fetch", vi.fn());
    const result2 = await translateTextBatch("zh", texts);
    expect(result2).toEqual(translated);
    // fetch should not be called again because results are cached
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it("localizeReportSnapshot translates hazard descriptions for zh locale", async () => {
    const translatedDescription = "浴室天花板角落可见霉斑。";
    stubFetch(new Response(JSON.stringify({ translations: [translatedDescription] }), { status: 200 }));

    const snapshot = buildMinimalSnapshot();
    const result = await localizeReportSnapshot(snapshot, "zh");

    // Description should be translated
    expect(result.hazards[0].description).toBe(translatedDescription);
    // Structural fields should be unchanged
    expect(result.hazards[0].id).toBe(snapshot.hazards[0].id);
    expect(result.hazards[0].severity).toBe(snapshot.hazards[0].severity);
    expect(result.propertyRiskScore).toBe(snapshot.propertyRiskScore);
    // Original snapshot should be unmodified
    expect(snapshot.hazards[0].description).toBe("Visible mould patch near the bathroom ceiling corner.");
  });

  it("localizeComparisonReport translates summary for zh locale", async () => {
    const translatedSummary = "该房源在通勤便利性和居住空间之间取得了最佳平衡。";
    stubFetch(new Response(JSON.stringify({ translations: [translatedSummary] }), { status: 200 }));

    const report = buildMinimalComparisonReport();
    const result = await localizeComparisonReport(report, "zh");

    expect(result.topRecommendation.summary).toBe(translatedSummary);
    // Original should be unmodified
    expect(report.topRecommendation.summary).toBe(
      "This property offers the best balance of commute convenience and living space."
    );
  });
});

describe("runtimeTranslation — text classification (shouldTranslate)", () => {
  it("skips numeric-only and whitespace-only strings during translation", async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ translations: [] }), { status: 200 })
    );

    // Numeric-only strings match the [\d\s.,:/+-]+ pattern and are skipped
    const texts = ["12345", "42.5", "Some text", "3,000", "", "   "];
    await translateTextBatch("zh", texts);

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.texts).not.toContain("12345");
    expect(body.texts).not.toContain("42.5");
    expect(body.texts).not.toContain("3,000");
    expect(body.texts).not.toContain("");
    expect(body.texts).not.toContain("   ");
    expect(body.texts).toContain("Some text");
  });
});

describe("runtimeTranslation — structural integrity", () => {
  it("localizeReportSnapshot preserves all non-text fields", async () => {
    stubFetch(new Response(JSON.stringify({ translations: ["Translated"] }), { status: 200 }));

    const snapshot = buildMinimalSnapshot();
    const result = await localizeReportSnapshot(snapshot, "zh");

    // All structural fields should be intact
    expect(result.reportId).toBe(snapshot.reportId);
    expect(result.inspectionId).toBe(snapshot.inspectionId);
    expect(result.createdAt).toBe(snapshot.createdAt);
    expect(result.inputs.mode).toBe(snapshot.inputs.mode);
    expect(result.hazards.length).toBe(snapshot.hazards.length);
    expect(result.hazards[0].id).toBe(snapshot.hazards[0].id);
    expect(result.hazards[0].category).toBe(snapshot.hazards[0].category);
    expect(result.hazards[0].severity).toBe(snapshot.hazards[0].severity);
    expect(result.hazards[0].estimatedCost?.amount).toBe(snapshot.hazards[0].estimatedCost?.amount);
    expect(result.hazards[0].estimatedCost?.currency).toBe(snapshot.hazards[0].estimatedCost?.currency);
    expect(result.propertyRiskScore).toBe(snapshot.propertyRiskScore);
    expect(result.recommendation?.outcome).toBe(snapshot.recommendation?.outcome);
    expect(result.fitScore?.score).toBe(snapshot.fitScore?.score);
    expect(result.intelligence?.geoAnalysis?.noiseRisk).toBe(snapshot.intelligence?.geoAnalysis?.noiseRisk);
    expect(result.intelligence?.geoAnalysis?.transitScore).toBe(snapshot.intelligence?.geoAnalysis?.transitScore);
    expect(result.intelligence?.communityInsight?.sentiment).toBe(snapshot.intelligence?.communityInsight?.sentiment);
    expect(result.intelligence?.agencyBackground?.agencyName).toBe(snapshot.intelligence?.agencyBackground?.agencyName);
    expect(result.intelligence?.agencyBackground?.sentimentScore).toBe(snapshot.intelligence?.agencyBackground?.sentimentScore);
    expect(result.intelligence?.fusion?.confidence).toBe(snapshot.intelligence?.fusion?.confidence);
    expect(result.evidenceSummary?.[0].type).toBe(snapshot.evidenceSummary?.[0].type);
    expect(result.evidenceSummary?.[0].confidence).toBe(snapshot.evidenceSummary?.[0].confidence);
    expect(result.inspectionCoverage?.confidence).toBe(snapshot.inspectionCoverage?.confidence);
    expect(result.inspectionCoverage?.coverageStatus).toBe(snapshot.inspectionCoverage?.coverageStatus);
  });

  it("localizeComparisonReport preserves all non-text fields", async () => {
    stubFetch(new Response(JSON.stringify({ translations: ["Translated"] }), { status: 200 }));

    const report = buildMinimalComparisonReport();
    const result = await localizeComparisonReport(report, "zh");

    expect(result.comparisonId).toBe(report.comparisonId);
    expect(result.createdAt).toBe(report.createdAt);
    expect(result.rankedCandidates.length).toBe(report.rankedCandidates.length);
    expect(result.rankedCandidates[0].reportId).toBe(report.rankedCandidates[0].reportId);
    expect(result.rankedCandidates[0].address).toBe(report.rankedCandidates[0].address);
    expect(result.rankedCandidates[0].totalScore).toBe(report.rankedCandidates[0].totalScore);
    expect(result.topRecommendation.reportId).toBe(report.topRecommendation.reportId);
    expect(result.topRecommendation.address).toBe(report.topRecommendation.address);
  });
});
