import { describe, expect, it } from "vitest";
import { applyLiveChecklistCapture } from "@/lib/inspectionChecklist";

describe("applyLiveChecklistCapture", () => {
  it("writes plain text checklist captures", () => {
    const next = applyLiveChecklistCapture(null, {
      section: "security",
      field: "entryAccess",
      value: "Keycard required for lobby access.",
      confidence: "high",
    });

    expect(next.security?.entryAccess).toBe("Keycard required for lobby access.");
  });

  it("merges list captures without duplicates", () => {
    const next = applyLiveChecklistCapture(
      {
        entryCondition: {
          inventoryItems: ["Desk", "Chair"],
        },
      },
      {
        section: "entryCondition",
        field: "inventoryItems",
        value: "Chair\nMicrowave",
        confidence: "high",
      },
      { listMode: true }
    );

    expect(next.entryCondition?.inventoryItems).toEqual(["Desk", "Chair", "Microwave"]);
  });
});

