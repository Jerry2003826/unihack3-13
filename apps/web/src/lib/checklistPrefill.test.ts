import { describe, expect, it } from "vitest";
import type { InspectionChecklist } from "@inspect-ai/contracts";
import { mergeChecklistPrefill } from "./checklistPrefill";

describe("mergeChecklistPrefill", () => {
  it("fills empty checklist fields from remote prefill", () => {
    const current: InspectionChecklist = {
      utilities: {
        hotWater: "Working well",
      },
    };

    const prefill: InspectionChecklist = {
      noise: {
        weekdayMorning: "Public signals suggest some traffic noise during peak hour.",
      },
    };

    const merged = mergeChecklistPrefill({
      current,
      prefill,
      responseFieldKeys: ["noise.weekdayMorning"],
      managedFieldKeys: [],
    });

    expect(merged.checklist?.noise?.weekdayMorning).toContain("traffic noise");
    expect(merged.appliedFieldKeys).toEqual(["noise.weekdayMorning"]);
  });

  it("does not overwrite a manual value unless the field was previously AI-managed", () => {
    const current: InspectionChecklist = {
      noise: {
        weekdayMorning: "Manual note from in-person inspection",
      },
    };

    const prefill: InspectionChecklist = {
      noise: {
        weekdayMorning: "Remote note that should not replace manual entry",
      },
    };

    const merged = mergeChecklistPrefill({
      current,
      prefill,
      responseFieldKeys: ["noise.weekdayMorning"],
      managedFieldKeys: [],
    });

    expect(merged.checklist?.noise?.weekdayMorning).toBe("Manual note from in-person inspection");
    expect(merged.appliedFieldKeys).toEqual([]);
  });
});
