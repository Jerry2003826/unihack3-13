import { beforeEach, describe, expect, it } from "vitest";
import type { ComparisonReportSnapshot, SearchHistoryEntry } from "@inspect-ai/contracts";
import {
  getComparisonReport,
  listComparisonReports,
  listSearchHistory,
  saveComparisonReport,
  saveSearchHistory,
} from "./historyStore";

beforeEach(async () => {
  indexedDB.deleteDatabase("inspect-ai-history-db");
});

describe("historyStore", () => {
  it("saves and lists recent search history", async () => {
    const entry: SearchHistoryEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      type: "live",
      label: "15 Dandenong Rd, Clayton",
      payload: {
        address: "15 Dandenong Rd, Clayton VIC 3168",
        agency: "Ray White Clayton",
      },
    };

    await saveSearchHistory(entry);

    const results = await listSearchHistory();
    expect(results[0]).toEqual(entry);
  });

  it("saves and reloads comparison reports", async () => {
    const report: ComparisonReportSnapshot = {
      comparisonId: "cmp-42",
      createdAt: Date.now(),
      weights: {
        budgetWeight: 18,
        commuteWeight: 18,
        noiseWeight: 10,
        lightingWeight: 12,
        conditionWeight: 20,
        agencyWeight: 10,
        communityWeight: 12,
      },
      rankedCandidates: [
        {
          candidateId: "report-a",
          reportId: "report-a",
          address: "15 Dandenong Rd, Clayton VIC 3168",
          totalScore: 82,
          fitLabel: "Strong Match",
          lightingScoreUsed: 74,
          breakdown: {
            budget: 88,
            commute: 80,
            noise: 62,
            lighting: 74,
            condition: 90,
            agency: 76,
            community: 68,
          },
          strengths: ["High condition score"],
          tradeoffs: ["Moderate road noise"],
          cautions: [],
        },
      ],
      topRecommendation: {
        candidateId: "report-a",
        reportId: "report-a",
        address: "15 Dandenong Rd, Clayton VIC 3168",
        summary: "Best overall fit.",
      },
      tradeoffSummary: ["Moderate road noise"],
      whyThisWins: ["High condition score"],
      whyOthersLost: [],
      knowledgeMatches: [],
      paperworkChecks: {
        checklist: ["Request the lease draft"],
        riskFlags: [],
        requiredDocuments: ["Lease draft"],
        suggestedQuestions: ["Who holds the bond?"],
      },
    };

    await saveComparisonReport(report);

    await expect(getComparisonReport("cmp-42")).resolves.toEqual(report);
    await expect(listComparisonReports()).resolves.toEqual([
      {
        comparisonId: "cmp-42",
        createdAt: report.createdAt,
        report,
      },
    ]);
  });
});
