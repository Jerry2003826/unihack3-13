import { describe, expect, it } from "vitest";
import { addManualOverride, activateHazardEscalation, buildRoomVerdict, createRoomScanState, forceEndRoom, markRoomTargetCompleted, refreshRoomScanState } from "@/lib/liveRoomState";

describe("liveRoomState", () => {
  it("does not allow room end before required targets are completed", () => {
    const state = refreshRoomScanState(createRoomScanState("bathroom"), 1_000);

    expect(state.endAllowed).toBe(false);
    expect(state.coverageStatus).toBe("insufficient-evidence");
    expect(state.missingTargets).toContain("shower-seals");
  });

  it("adds escalation follow-up targets when a hazard category is triggered", () => {
    const state = activateHazardEscalation(refreshRoomScanState(createRoomScanState("bedroom"), 1_000), "Mould", 2_000);

    expect(state.escalationTargets).toContain("window-seal-close-up");
    expect(state.hazardEscalations).toHaveLength(1);
    expect(state.endAllowed).toBe(false);
  });

  it("keeps coverage and verdict separate when a room is force-ended", () => {
    const completeFirstTarget = markRoomTargetCompleted(refreshRoomScanState(createRoomScanState("kitchen"), 1_000), "sink-joins", 2_000);
    const forced = addManualOverride(forceEndRoom(completeFirstTarget, 3_000), {
      action: "force-end-room",
      note: "Stopped early.",
      createdAt: 3_000,
    });
    const verdict = buildRoomVerdict({ state: forced, hazards: [] });

    expect(forced.status).toBe("forced-incomplete");
    expect(forced.endAllowed).toBe(false);
    expect(verdict.status).toBe("insufficient-evidence");
  });
});
