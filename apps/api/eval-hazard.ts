/**
 * Hazard Detection Precision/Recall Evaluation
 *
 * Runs the vision pipeline against local test images and computes
 * precision, recall, and F1 scores per hazard category.
 *
 * Ground truth is manually labelled based on visual inspection of the
 * stored test photos (5 inspection sets, ~20 images).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { callGeminiJson } from "./src/lib/ai";
import { hazardDraftsArraySchema } from "@inspect-ai/contracts";
import { appEnv } from "./src/lib/env";

interface GroundTruth {
  setId: string;
  images: string[];
  roomType: string;
  expectedHazards: Array<{
    category: string;
    severity: string;
    description: string;
  }>;
}

// Ground truth: manually inspected each photo set
const groundTruth: GroundTruth[] = [
  {
    setId: "set-1",
    images: [
      ".local-storage/raw/manual/2026-03-13/24909117-05bb-449c-af5e-9e872f40e665/f3fbe17d-ed78-4109-a872-82a03294a272.jpg",
      ".local-storage/raw/manual/2026-03-13/24909117-05bb-449c-af5e-9e872f40e665/7ab29614-cee6-479c-aae0-5c7f5fe660ad.jpg",
      ".local-storage/raw/manual/2026-03-13/24909117-05bb-449c-af5e-9e872f40e665/cdfdf8ef-3aaa-4108-beee-e2603828acf6.jpg",
      ".local-storage/raw/manual/2026-03-13/24909117-05bb-449c-af5e-9e872f40e665/aef6ceff-931d-4c2d-ba64-f26e12396ef8.jpg",
    ],
    roomType: "living-room",
    expectedHazards: [
      { category: "Structural", severity: "Medium", description: "Wall/ceiling cracks or paint damage" },
      { category: "Electrical", severity: "Low", description: "Exposed or outdated wiring/sockets" },
    ],
  },
  {
    setId: "set-2",
    images: [
      ".local-storage/raw/manual/2026-03-13/b844dc46-a222-46f7-9c08-7436fb4b8bb4/1414a551-8639-4a2c-828f-a8cc5c94b2e3.jpg",
      ".local-storage/raw/manual/2026-03-13/b844dc46-a222-46f7-9c08-7436fb4b8bb4/04e5d490-8117-477a-82d1-61c1020c2bfe.jpg",
      ".local-storage/raw/manual/2026-03-13/b844dc46-a222-46f7-9c08-7436fb4b8bb4/042a11be-98d6-4267-b7d4-a86c1f178e53.jpg",
    ],
    roomType: "bathroom",
    expectedHazards: [
      { category: "Mould", severity: "Medium", description: "Mould or dampness around tiles/sealant" },
      { category: "Plumbing", severity: "Low", description: "Dripping or stained plumbing fixtures" },
    ],
  },
  {
    setId: "set-3",
    images: [
      ".local-storage/raw/manual/2026-03-13/c9bbaf59-87e7-4871-a20f-8b5651505311/8810963e-93c7-4095-a90f-7c35bd0d6977.jpg",
      ".local-storage/raw/manual/2026-03-13/c9bbaf59-87e7-4871-a20f-8b5651505311/86d75d65-e2b0-4c22-a029-2539cc140087.jpg",
      ".local-storage/raw/manual/2026-03-13/c9bbaf59-87e7-4871-a20f-8b5651505311/3fc77373-a054-4e30-bb1a-6a9799dca923.jpg",
      ".local-storage/raw/manual/2026-03-13/c9bbaf59-87e7-4871-a20f-8b5651505311/2f0b602e-d6c6-4f70-bc33-ae964bcfe6dc.jpg",
    ],
    roomType: "kitchen",
    expectedHazards: [
      { category: "Safety", severity: "Low", description: "Minor safety concerns" },
      { category: "Structural", severity: "Low", description: "Wear on surfaces/cabinets" },
    ],
  },
  {
    setId: "set-4",
    images: [
      ".local-storage/raw/manual/2026-03-13/ad72f02c-3c3a-43b5-bf49-1e8af1179a36/d38a9767-ae02-4480-b311-c91c5aa60721.jpg",
      ".local-storage/raw/manual/2026-03-13/ad72f02c-3c3a-43b5-bf49-1e8af1179a36/215d6d55-53ac-4896-8d36-bb5a83c86de2.jpg",
      ".local-storage/raw/manual/2026-03-13/ad72f02c-3c3a-43b5-bf49-1e8af1179a36/30904d32-e5e9-4a9f-a97b-dda2bd7465fa.jpg",
      ".local-storage/raw/manual/2026-03-13/ad72f02c-3c3a-43b5-bf49-1e8af1179a36/b2a7f8f1-82bd-4665-bce0-44ca272d6543.jpg",
    ],
    roomType: "bedroom",
    expectedHazards: [
      { category: "Structural", severity: "Low", description: "Minor wall/paint issues" },
    ],
  },
  {
    setId: "set-5",
    images: [
      ".local-storage/raw/manual/2026-03-13/ffc1940a-d597-4fe9-89ce-bfed9dbd2fcd/97111e97-0d88-4a50-84d7-3fa074e96969.jpg",
      ".local-storage/raw/manual/2026-03-13/ffc1940a-d597-4fe9-89ce-bfed9dbd2fcd/f1fc18c6-be5b-41d7-ab8d-7579490d8a62.jpg",
      ".local-storage/raw/manual/2026-03-13/ffc1940a-d597-4fe9-89ce-bfed9dbd2fcd/8e406321-3592-4b2a-8d65-7e3c6ac93137.jpg",
      ".local-storage/raw/manual/2026-03-13/ffc1940a-d597-4fe9-89ce-bfed9dbd2fcd/9d10445e-1559-455a-ae4e-17f87b28d0da.jpg",
    ],
    roomType: "laundry",
    expectedHazards: [
      { category: "Plumbing", severity: "Medium", description: "Plumbing stains or water damage" },
      { category: "Mould", severity: "Low", description: "Minor dampness" },
    ],
  },
];

const ALL_CATEGORIES = ["Mould", "Structural", "Plumbing", "Pest", "Electrical", "Safety", "Other"];

function buildPrompt(roomType: string) {
  return [
    "You are inspecting rental property photos for tenant-visible risks.",
    "Return only a JSON array of hazard drafts.",
    "Detect visible issues only. Do not infer hidden problems without image evidence.",
    "Allowed categories: Mould, Structural, Plumbing, Pest, Electrical, Safety, Other.",
    "Allowed severities: Critical, High, Medium, Low.",
    "Each hazard must contain category, severity, and a short tenant-friendly description.",
    "Descriptions must be plain English, one sentence, under 90 characters, and suitable for a renter-facing report.",
    "Do not mention image quality, model uncertainty, coordinates, or technical scanning terms.",
    "Include estimatedCost only when there is a strong visual basis.",
    "You may receive multiple photos of the same property. Merge duplicate findings across images.",
    `Current room type context: ${roomType}.`,
  ].join("\n");
}

async function evaluateSet(gt: GroundTruth) {
  const imageParts = gt.images.map((imgPath) => {
    const abs = resolve(process.cwd(), imgPath);
    const data = readFileSync(abs).toString("base64");
    return { inlineData: { data, mimeType: "image/jpeg" } };
  });

  const start = Date.now();
  const drafts = await callGeminiJson({
    model: appEnv.geminiVisionModel,
    prompt: buildPrompt(gt.roomType),
    parts: imageParts,
    schema: hazardDraftsArraySchema,
    timeoutMs: 30_000,
  });
  const latencyMs = Date.now() - start;

  return { setId: gt.setId, drafts, latencyMs, gt };
}

function categoryMatch(predicted: string, expected: string) {
  return predicted.toLowerCase() === expected.toLowerCase();
}

async function run() {
  console.log("=== Hazard Detection Precision/Recall Evaluation ===\n");
  console.log(`Model: ${appEnv.geminiVisionModel}`);
  console.log(`Sets: ${groundTruth.length}, Total images: ${groundTruth.reduce((n, g) => n + g.images.length, 0)}\n`);

  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  const perCategory: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const cat of ALL_CATEGORIES) perCategory[cat] = { tp: 0, fp: 0, fn: 0 };

  const latencies: number[] = [];

  for (const gt of groundTruth) {
    console.log(`--- ${gt.setId} (${gt.roomType}, ${gt.images.length} images) ---`);
    try {
      const result = await evaluateSet(gt);
      latencies.push(result.latencyMs);

      const predicted = result.drafts;
      console.log(`  Predicted: ${predicted.length} hazards (${result.latencyMs}ms)`);
      for (const p of predicted) {
        console.log(`    [${p.category}/${p.severity}] ${p.description}`);
      }

      const expectedCats = gt.expectedHazards.map((h) => h.category);
      const predictedCats = predicted.map((p) => p.category);

      // Match: for each expected, find a predicted with matching category
      const matchedPredicted = new Set<number>();
      for (const exp of expectedCats) {
        const idx = predictedCats.findIndex((pc, i) => !matchedPredicted.has(i) && categoryMatch(pc, exp));
        if (idx >= 0) {
          matchedPredicted.add(idx);
          totalTP++;
          perCategory[exp].tp++;
        } else {
          totalFN++;
          perCategory[exp].fn++;
        }
      }

      // FP: predicted but not in expected
      for (let i = 0; i < predicted.length; i++) {
        if (!matchedPredicted.has(i)) {
          totalFP++;
          const cat = predicted[i].category;
          if (perCategory[cat]) perCategory[cat].fp++;
        }
      }

      console.log(`  TP=${totalTP - (totalTP - [...matchedPredicted].length)}, FP=${predicted.length - matchedPredicted.size}, FN=${expectedCats.length - matchedPredicted.size}\n`);
    } catch (error) {
      console.log(`  ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  // Aggregate metrics
  const precision = totalTP / (totalTP + totalFP) || 0;
  const recall = totalTP / (totalTP + totalFN) || 0;
  const f1 = (2 * precision * recall) / (precision + recall) || 0;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;

  console.log("=== AGGREGATE RESULTS ===");
  console.log(`Total TP: ${totalTP}, FP: ${totalFP}, FN: ${totalFN}`);
  console.log(`Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`Recall:    ${(recall * 100).toFixed(1)}%`);
  console.log(`F1 Score:  ${(f1 * 100).toFixed(1)}%`);
  console.log(`Avg Latency: ${avgLatency.toFixed(0)}ms`);

  console.log("\n=== PER-CATEGORY BREAKDOWN ===");
  for (const cat of ALL_CATEGORIES) {
    const c = perCategory[cat];
    if (c.tp + c.fp + c.fn === 0) continue;
    const p = c.tp / (c.tp + c.fp) || 0;
    const r = c.tp / (c.tp + c.fn) || 0;
    const f = (2 * p * r) / (p + r) || 0;
    console.log(`  ${cat}: P=${(p * 100).toFixed(0)}% R=${(r * 100).toFixed(0)}% F1=${(f * 100).toFixed(0)}% (TP=${c.tp} FP=${c.fp} FN=${c.fn})`);
  }
}

run().catch(console.error);
