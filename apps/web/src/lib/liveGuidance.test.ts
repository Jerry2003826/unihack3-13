import { describe, expect, it } from "vitest";
import {
  buildGuidanceAlertKey,
  getGuidanceProgress,
  getGuidanceTargetForElapsed,
  getNextGuidanceTarget,
  getRoomGuidancePlan,
} from "@/lib/liveGuidance";

describe("liveGuidance", () => {
  it("returns a room-specific plan", () => {
    const plan = getRoomGuidancePlan("bathroom");
    expect(plan.length).toBeGreaterThan(1);
    expect(plan[0]?.id).toBe("shower-seals");
  });

  it("rotates guidance targets over time", () => {
    const first = getGuidanceTargetForElapsed({ roomType: "kitchen", elapsedMs: 0 });
    const second = getGuidanceTargetForElapsed({ roomType: "kitchen", elapsedMs: 8_500 });
    expect(first.id).not.toBe(second.id);
  });

  it("builds a stable alert key per room and target", () => {
    expect(buildGuidanceAlertKey({ roomType: "bedroom", targetId: "window-corners" })).toBe(
      "guide:bedroom:window-corners"
    );
  });

  it("selects the next incomplete guidance target", () => {
    const next = getNextGuidanceTarget({
      roomType: "bedroom",
      completedIds: ["window-corners"],
    });

    expect(next?.id).toBe("wardrobe-base");
  });

  it("skips the current target when asked to advance without marking it complete", () => {
    const next = getNextGuidanceTarget({
      roomType: "hallway",
      skipTargetId: "entry-safety",
    });

    expect(next?.id).toBe("parcel-mailbox");
  });

  it("reports room guidance progress from completed ids", () => {
    expect(
      getGuidanceProgress({
        roomType: "hallway",
        completedIds: ["entry-safety", "parcel-mailbox"],
      })
    ).toEqual({
      total: 3,
      completed: 2,
    });
  });
});
