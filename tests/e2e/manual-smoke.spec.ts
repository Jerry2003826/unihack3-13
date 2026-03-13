import { expect, test } from "@playwright/test";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnJxZ4AAAAASUVORK5CYII=",
  "base64"
);

test("manual upload can generate a report with mocked services", async ({ page }) => {
  await page.route("**/api/upload/sign", async (route) => {
    const payload = route.request().postDataJSON() as {
      inspectionId: string;
      files: Array<{ fileName: string }>;
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploads: payload.files.map((file, index) => ({
          uploadUrl: `/mock-upload/${index + 1}`,
          objectKey: `inspections/${payload.inspectionId}/${index + 1}-${file.fileName}`,
        })),
      }),
    });
  });

  await page.route("**/mock-upload/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "PUT, OPTIONS",
        "access-control-allow-headers": "*",
      },
      body: "",
    });
  });

  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hazards: [
          {
            id: "haz-manual-1",
            category: "Plumbing",
            severity: "High",
            description: "Bathroom leak under the vanity pipe.",
            detectedAt: 1738368000000,
            roomType: "bathroom",
            estimatedCost: {
              amount: 450,
              currency: "AUD",
              reason: "Pipe reseal and cabinet drying",
            },
          },
          {
            id: "haz-manual-2",
            category: "Mould",
            severity: "Medium",
            description: "Window-side mould patch needs remediation.",
            detectedAt: 1738368060000,
            roomType: "bedroom",
          },
        ],
      }),
    });
  });

  await page.route("**/api/intelligence", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        intelligence: {
          address: "15 Dandenong Rd, Clayton VIC 3168",
          geoAnalysis: {
            noiseRisk: "Medium",
            transitScore: 78,
            warning: "Moderate arterial road noise in peak periods.",
            nearbyTransit: ["Bus stop 180m away", "Clayton Station 1.3km away"],
            destinationConvenience: ["Monash University 12 min by bus"],
          },
          communityInsight: {
            summary: "Local renter discussion is mixed but generally positive about convenience.",
            sentiment: "mixed",
            citations: [
              {
                sourceId: "community-1",
                title: "Clayton renter thread",
                url: "https://example.com/community-1",
              },
            ],
          },
          agencyBackground: {
            agencyName: "Ray White Clayton",
            sentimentScore: 3.6,
            commonComplaints: ["Slow maintenance follow-up"],
            negotiationLeverage: "Ask for a written repair timeline before signing.",
            citations: [
              {
                sourceId: "agency-1",
                title: "Agency public reviews",
                url: "https://example.com/agency-1",
              },
            ],
          },
        },
      }),
    });
  });

  await page.route("**/api/negotiate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        emailTemplate: "Please confirm the leak repair timeline before lease signing.",
        keyPoints: ["Confirm repair timing", "Request written maintenance commitment"],
        decisionRecommendation: {
          outcome: "Negotiate",
          summary: "Negotiate repairs before committing to the lease.",
          reasons: ["A high severity plumbing issue is still open."],
        },
        fitScore: {
          score: 62,
          summary: "Convenient location, but active repairs reduce short-term fit.",
          drivers: ["Transit access is solid", "Repairs should be resolved before move-in"],
        },
        evidenceSummary: [
          {
            type: "hazard",
            summary: "Visible bathroom plumbing leak",
            confidence: "high",
            source: "Manual upload analysis",
          },
        ],
        inspectionCoverage: {
          roomsSeen: ["bathroom", "bedroom"],
          missingAreas: ["kitchen", "living-room"],
          confidence: "medium",
          warning: "Only two rooms were captured in the uploaded images.",
        },
        preLeaseActionGuide: {
          negotiatePoints: ["Request leak remediation before bond payment"],
          furtherInspectionItems: ["Inspect adjacent walls for water damage"],
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /upload photos/i }).click();

  await expect(page).toHaveURL(/\/manual$/, { timeout: 15_000 });

  await page.locator('input[type="file"]').setInputFiles([
    { name: "bathroom.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG },
    { name: "bedroom.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG },
  ]);
  await page.getByPlaceholder("e.g. 15 Dandenong Rd, Clayton").fill("15 Dandenong Rd, Clayton VIC 3168");
  await page.getByPlaceholder("e.g. Ray White Clayton").fill("Ray White Clayton");
  await page
    .getByPlaceholder("e.g. Top-floor apartment, visible wall stain near the window.")
    .fill("Visible wall stain near the bedroom window.");
  await page.getByRole("button", { name: /generate report/i }).click();

  await expect(page).toHaveURL(/\/report\//, { timeout: 15_000 });
  await expect(page.getByText("Report Snapshot", { exact: true })).toBeVisible();
  await expect(page.getByText("2 detected hazards", { exact: true })).toBeVisible();
  await expect(page.getByText("Bathroom leak under the vanity pipe.", { exact: true })).toBeVisible();
  await expect(page.getByText("Negotiate repairs before committing to the lease.", { exact: true })).toBeVisible();
});
