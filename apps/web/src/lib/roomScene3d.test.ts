import { describe, expect, it } from "vitest";
import type { Hazard } from "@inspect-ai/contracts";
import {
  buildRoomScene3D,
  canGenerateRoomScene,
  getRoomScene3DCapturePlan,
  type RoomSceneCapture,
} from "./roomScene3d";

function createHazard(partial?: Partial<Hazard>): Hazard {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    category: partial?.category ?? "Structural",
    severity: partial?.severity ?? "High",
    description: partial?.description ?? "Visible issue",
    detectedAt: partial?.detectedAt ?? Date.now(),
    roomType: partial?.roomType ?? "bedroom",
    boundingBox: partial?.boundingBox ?? {
      x_min: 0.1,
      y_min: 0.2,
      x_max: 0.28,
      y_max: 0.54,
    },
  };
}

function capture(stepId: string): RoomSceneCapture {
  return {
    stepId,
    label: stepId,
    capturedAt: Date.now(),
    frameDataUrl: "data:image/jpeg;base64,AAA",
  };
}

describe("roomScene3d", () => {
  it("requires all non-optional steps before generation", () => {
    const plan = getRoomScene3DCapturePlan("bedroom");
    const captures = Object.fromEntries(plan.slice(0, 2).map((step) => [step.id, capture(step.id)]));

    expect(canGenerateRoomScene(captures, "bedroom")).toBe(false);

    const requiredCaptures = Object.fromEntries(
      plan.filter((step) => !step.optional).map((step) => [step.id, capture(step.id)])
    );

    expect(canGenerateRoomScene(requiredCaptures, "bedroom")).toBe(true);
  });

  it("maps room hazards into scene markers", () => {
    const plan = getRoomScene3DCapturePlan("bedroom");
    const captures = Object.fromEntries(
      plan.filter((step) => !step.optional).map((step) => [step.id, capture(step.id)])
    );
    const hazard = createHazard({ id: "haz-1" });

    const scene = buildRoomScene3D({
      roomType: "bedroom",
      captures,
      hazards: [hazard],
      liveEvidenceFrames: {
        [hazard.id]: "data:image/jpeg;base64,BBB",
      },
    });

    expect(scene.roomType).toBe("bedroom");
    expect(scene.captureStepsCompleted.length).toBeGreaterThan(0);
    expect(scene.markers).toHaveLength(1);
    expect(scene.markers[0]?.surfaceId).toBe("left-wall");
  });

  it("falls back to unknown-room hazards when exact room hazards are absent", () => {
    const plan = getRoomScene3DCapturePlan("kitchen");
    const captures = Object.fromEntries(
      plan.filter((step) => !step.optional).map((step) => [step.id, capture(step.id)])
    );

    const scene = buildRoomScene3D({
      roomType: "kitchen",
      captures,
      hazards: [createHazard({ roomType: "unknown" })],
    });

    expect(scene.markers).toHaveLength(1);
  });
});
