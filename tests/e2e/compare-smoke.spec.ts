import { expect, test } from "@playwright/test";

const SEEDED_REPORTS = [
  {
    reportId: "report-alpha",
    inspectionId: "inspection-alpha",
    createdAt: 1738368000000,
    inputs: {
      mode: "manual",
      address: "15 Dandenong Rd, Clayton VIC 3168",
      agency: "Ray White Clayton",
      propertyNotes: "Bright living area with good transport access.",
    },
    hazards: [],
    intelligence: {
      geoAnalysis: {
        noiseRisk: "Low",
        transitScore: 82,
        nearbyTransit: ["Clayton Station - 12 min"],
        destinationConvenience: ["Monash University - 18 min"],
      },
      communityInsight: {
        summary: "Positive local renter sentiment.",
        sentiment: "positive",
        citations: [],
      },
      agencyBackground: {
        agencyName: "Ray White Clayton",
        sentimentScore: 4.1,
        commonComplaints: [],
        negotiationLeverage: "Ask for written repair commitments.",
        citations: [],
      },
    },
    propertyRiskScore: 90,
    lightingScoreAuto: 76,
    askingRent: 610,
    comparisonEligible: true,
  },
  {
    reportId: "report-beta",
    inspectionId: "inspection-beta",
    createdAt: 1738368600000,
    inputs: {
      mode: "manual",
      address: "22 Wellington Rd, Clayton VIC 3168",
      agency: "Buxton Oakleigh",
      propertyNotes: "Dim bedroom and visible mould near the window.",
    },
    hazards: [
      {
        id: "haz-1",
        category: "Mould",
        severity: "High",
        description: "Mould patch near the bedroom window.",
        detectedAt: 1738368600000,
        roomType: "bedroom",
      },
    ],
    intelligence: {
      geoAnalysis: {
        noiseRisk: "High",
        transitScore: 54,
        nearbyTransit: [],
        destinationConvenience: [],
      },
      communityInsight: {
        summary: "Mixed sentiment around traffic noise.",
        sentiment: "mixed",
        citations: [],
      },
      agencyBackground: {
        agencyName: "Buxton Oakleigh",
        sentimentScore: 3.1,
        commonComplaints: ["Slow maintenance"],
        negotiationLeverage: "Request written remediation dates.",
        citations: [],
      },
    },
    propertyRiskScore: 68,
    lightingScoreAuto: 42,
    askingRent: 670,
    comparisonEligible: true,
  },
];

test("saved reports can generate a comparison report and appear in history", async ({ page }) => {
  await page.route("**/api/compare", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        report: {
          comparisonId: "cmp-smoke-1",
          createdAt: 1738369200000,
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
              candidateId: "report-alpha",
              reportId: "report-alpha",
              address: "15 Dandenong Rd, Clayton VIC 3168",
              totalScore: 84,
              fitLabel: "Strong Match",
              lightingScoreUsed: 76,
              askingRent: 610,
              breakdown: {
                budget: 92,
                commute: 82,
                noise: 86,
                lighting: 76,
                condition: 90,
                agency: 82,
                community: 85,
              },
              strengths: ["Strong transit score"],
              tradeoffs: ["No major trade-offs dominate the current weighted profile."],
              cautions: [],
            },
            {
              candidateId: "report-beta",
              reportId: "report-beta",
              address: "22 Wellington Rd, Clayton VIC 3168",
              totalScore: 51,
              fitLabel: "Conditional Match",
              lightingScoreUsed: 42,
              askingRent: 670,
              breakdown: {
                budget: 40,
                commute: 54,
                noise: 28,
                lighting: 42,
                condition: 68,
                agency: 62,
                community: 52,
              },
              strengths: ["No single factor dominates; the property is a blended trade-off."],
              tradeoffs: ["Rent is above the stated budget range."],
              cautions: ["Critical hazards were detected in the inspection evidence."],
            },
          ],
          topRecommendation: {
            candidateId: "report-alpha",
            reportId: "report-alpha",
            address: "15 Dandenong Rd, Clayton VIC 3168",
            summary: "15 Dandenong Rd, Clayton VIC 3168 ranks first with a 84/100 weighted fit score.",
          },
          tradeoffSummary: ["22 Wellington Rd, Clayton VIC 3168: Rent is above the stated budget range."],
          whyThisWins: ["Strong transit score", "It leads the next best option by 33 points."],
          whyOthersLost: ["22 Wellington Rd, Clayton VIC 3168: Rent is above the stated budget range."],
          knowledgeMatches: [
            {
              sourceId: "budget-buffer",
              title: "Budget Buffer Guidance",
              snippet: "A rental at or below budget is not automatically the best option if repair risk is high.",
              tags: ["budget", "rent", "comparison"],
            },
          ],
          paperworkChecks: {
            checklist: ["Request the lease draft"],
            riskFlags: [],
            requiredDocuments: ["Lease draft"],
            suggestedQuestions: ["Who holds the bond?"],
          },
        },
      }),
    });
  });

  await page.goto("/");

  await page.evaluate(async (snapshots) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("inspect-ai-db", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("report_snapshots")) {
          const store = db.createObjectStore("report_snapshots", { keyPath: "reportId" });
          store.createIndex("by-created-at", "createdAt");
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("report_snapshots", "readwrite");
        const store = tx.objectStore("report_snapshots");
        for (const snapshot of snapshots) {
          store.put(snapshot);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, SEEDED_REPORTS);

  await page.goto("/compare");
  await expect(page.getByText("Multi-property weighted recommendation", { exact: true })).toBeVisible();
  await expect(page.getByText("15 Dandenong Rd, Clayton VIC 3168", { exact: true })).toBeVisible();
  await expect(page.getByText("22 Wellington Rd, Clayton VIC 3168", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /generate comparison report/i }).click();

  await expect(page).toHaveURL(/\/compare\/cmp-smoke-1$/, { timeout: 15_000 });
  await expect(page.getByText("Weighted property recommendation", { exact: true })).toBeVisible();
  await expect(page.getByText("15 Dandenong Rd, Clayton VIC 3168 ranks first with a 84/100 weighted fit score.", { exact: true })).toBeVisible();

  await page.goto("/history");
  await expect(page.getByText("Compare 2 properties", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /open comparison/i })).toBeVisible();
});
