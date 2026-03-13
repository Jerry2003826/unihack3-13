import { describe, expect, it } from "vitest";
import type { Hazard } from "@inspect-ai/contracts";
import {
  calculatePropertyRiskScore,
  getRiskDrivers,
  getSeverityBreakdown,
} from "./scoring";

function createHazard(partial: Partial<Hazard>): Hazard {
  return {
    id: partial.id ?? crypto.randomUUID(),
    category: partial.category ?? "Safety",
    severity: partial.severity ?? "Low",
    description: partial.description ?? "Test hazard",
    detectedAt: partial.detectedAt ?? Date.now(),
    roomType: partial.roomType ?? "unknown",
    boundingBox: partial.boundingBox,
    estimatedCost: partial.estimatedCost,
    sourceEventId: partial.sourceEventId,
  };
}

describe("scoring", () => {
  it("calculates the heuristic property risk score from severity penalties", () => {
    const hazards = [
      createHazard({ severity: "Critical" }),
      createHazard({ severity: "High" }),
      createHazard({ severity: "Medium" }),
      createHazard({ severity: "Low" }),
    ];

    expect(calculatePropertyRiskScore(hazards)).toBe(49);
  });

  it("never returns a negative risk score", () => {
    const hazards = Array.from({ length: 10 }, () => createHazard({ severity: "Critical" }));
    expect(calculatePropertyRiskScore(hazards)).toBe(0);
  });

  it("does not return a perfect risk score when no hazards were found but coverage is thin", () => {
    expect(calculatePropertyRiskScore([], { inspectionMode: "live" })).toBeLessThan(100);
  });

  it("penalizes checklist concerns even when no hazards were detected", () => {
    const cleanScore = calculatePropertyRiskScore([], {
      inspectionMode: "manual",
      inspectionChecklist: {
        utilities: {
          hotWater: "Working well",
          drainage: "No issues",
        },
      },
    });

    const concerningScore = calculatePropertyRiskScore([], {
      inspectionMode: "manual",
      inspectionChecklist: {
        utilities: {
          hotWater: "Slow to heat and unstable",
          drainage: "Drain smells and seems blocked",
        },
        pestsHiddenIssues: {
          pests: "Possible cockroach activity under sink",
        },
      },
    });

    expect(concerningScore).toBeLessThan(cleanScore);
  });

  it("returns severity breakdown and readable risk drivers", () => {
    const hazards = [
      createHazard({ severity: "High", category: "Mould", roomType: "bathroom" }),
      createHazard({ severity: "High", category: "Plumbing", roomType: "laundry" }),
      createHazard({ severity: "Medium", category: "Safety", roomType: "balcony" }),
    ];

    expect(getSeverityBreakdown(hazards)).toEqual({
      Critical: 0,
      High: 2,
      Medium: 1,
      Low: 0,
    });

    const riskState = getRiskDrivers(hazards);
    expect(riskState.highestWeightIssue?.category).toBe("Mould");
    expect(riskState.drivers).toContain("2 high severity issues");
    expect(riskState.drivers).toContain("Top concern: Mould in bathroom");
  });

  it("humanizes unknown room labels in risk drivers", () => {
    const riskState = getRiskDrivers([
      createHazard({ severity: "Low", category: "Structural", roomType: "unknown" }),
    ]);

    expect(riskState.drivers).toContain("Top concern: Structural in general area");
  });
});
