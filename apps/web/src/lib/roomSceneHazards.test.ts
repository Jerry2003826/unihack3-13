import { describe, expect, it } from "vitest";
import type { RoomScene3D, RoomSceneMarker } from "@inspect-ai/contracts";
import { promoteSuggestedMarkerToHazard, replaceSceneMarker } from "./roomSceneHazards";

function createSuggestedMarker(partial?: Partial<RoomSceneMarker>): RoomSceneMarker {
  return {
    markerId: partial?.markerId ?? "suggested-1",
    label: partial?.label ?? "Window moisture",
    summary: partial?.summary ?? "Moisture staining around the window frame.",
    source: partial?.source ?? "suggested",
    surfaceId: partial?.surfaceId ?? "back-wall",
    x: partial?.x ?? 0.62,
    y: partial?.y ?? 0.34,
    confidence: partial?.confidence ?? "low",
    severity: partial?.severity,
  };
}

describe("roomSceneHazards", () => {
  it("promotes a suggested marker into a formal hazard", () => {
    const promotion = promoteSuggestedMarkerToHazard({
      marker: createSuggestedMarker(),
      roomType: "bedroom",
      fallbackThumbnailBase64: "data:image/jpeg;base64,AAA",
    });

    expect(promotion.hazard.source).toBe("3d-suggested");
    expect(promotion.hazard.roomType).toBe("bedroom");
    expect(promotion.nextMarker.source).toBe("hazard");
    expect(promotion.nextMarker.hazardId).toBe(promotion.hazard.id);
    expect(promotion.thumbnailBase64).toBe("data:image/jpeg;base64,AAA");
  });

  it("replaces a marker in a room scene without mutating others", () => {
    const scene: RoomScene3D = {
      sceneId: "scene-1",
      roomType: "bedroom",
      title: "Bedroom 3D View",
      capturedAt: Date.now(),
      captureStepsCompleted: ["entry-view"],
      dimensionsApprox: { width: 3.6, depth: 4.2, height: 2.6 },
      markers: [createSuggestedMarker(), createSuggestedMarker({ markerId: "suggested-2", x: 0.2 })],
    };

    const replacement = createSuggestedMarker({ markerId: "haz-1", source: "hazard" });
    const updated = replaceSceneMarker(scene, "suggested-1", replacement);

    expect(updated.markers[0]).toEqual(replacement);
    expect(updated.markers[1]?.markerId).toBe("suggested-2");
  });
});
