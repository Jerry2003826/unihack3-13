import { describe, expect, it } from "vitest";
import type { LiveObservation } from "@inspect-ai/contracts";
import {
  buildLiveAlertKey,
  getBoundingBoxIou,
  hasGuidanceCoverageConfirmation,
  hasFocusConfirmation,
  observationMatchesTarget,
  shouldAutoRecordLiveHazard,
  trimGuidanceCoverageHistory,
  trimFocusHistory,
} from "./liveScan";

function createObservation(partial?: Partial<LiveObservation>): LiveObservation {
  return {
    observationId: partial?.observationId ?? "obs-1",
    category: partial?.category ?? "Electrical",
    severity: partial?.severity ?? "High",
    description: partial?.description ?? "Possible exposed wiring near the switch.",
    boundingBox:
      partial?.boundingBox ?? {
        x_min: 0.2,
        y_min: 0.2,
        x_max: 0.42,
        y_max: 0.55,
      },
    confidence: partial?.confidence ?? "high",
    attentionLevel: partial?.attentionLevel ?? "confirm",
    guidanceText: partial?.guidanceText ?? "Possible electrical issue. Move closer.",
  };
}

describe("liveScan helpers", () => {
  it("matches an observation to the active target when category and IoU are high enough", () => {
    const observation = createObservation();

    expect(
      observationMatchesTarget({
        observation,
        target: {
          category: "Electrical",
          boundingBox: {
            x_min: 0.22,
            y_min: 0.2,
            x_max: 0.44,
            y_max: 0.54,
          },
        },
      })
    ).toBe(true);
  });

  it("rejects a target match when the overlap is too weak", () => {
    const observation = createObservation();

    expect(
      observationMatchesTarget({
        observation,
        target: {
          category: "Electrical",
          boundingBox: {
            x_min: 0.7,
            y_min: 0.7,
            x_max: 0.9,
            y_max: 0.9,
          },
        },
      })
    ).toBe(false);
  });

  it("confirms once the same target is seen in two recent focused frames", () => {
    const now = Date.now();
    const history = trimFocusHistory(
      [
        { observation: createObservation({ observationId: "a" }), at: now - 7000 },
        { observation: createObservation({ observationId: "a" }), at: now - 1000 },
      ],
      now
    );

    expect(hasFocusConfirmation(history)).toBe(true);
  });

  it("only auto-records critical or high severity live observations", () => {
    expect(shouldAutoRecordLiveHazard(createObservation({ severity: "Critical" }))).toBe(true);
    expect(shouldAutoRecordLiveHazard(createObservation({ severity: "High" }))).toBe(true);
    expect(shouldAutoRecordLiveHazard(createObservation({ severity: "Medium" }))).toBe(false);
  });

  it("builds a stable alert key from category, attention, and box position", () => {
    const first = createObservation();
    const second = createObservation({
      observationId: "obs-2",
    });

    expect(buildLiveAlertKey(first)).toBe(buildLiveAlertKey(second));
  });

  it("computes non-zero IoU for overlapping boxes", () => {
    expect(
      getBoundingBoxIou(
        { x_min: 0.2, y_min: 0.2, x_max: 0.4, y_max: 0.4 },
        { x_min: 0.3, y_min: 0.3, x_max: 0.5, y_max: 0.5 }
      )
    ).toBeGreaterThan(0);
  });

  it("confirms guidance coverage after two covered frames", () => {
    const now = Date.now();
    const history = trimGuidanceCoverageHistory(
      [
        { status: "partial", at: now - 6000 },
        { status: "covered", at: now - 2000 },
        { status: "covered", at: now - 500 },
      ],
      now
    );

    expect(hasGuidanceCoverageConfirmation(history)).toBe(true);
  });
});
