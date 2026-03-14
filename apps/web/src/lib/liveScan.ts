import type { BoundingBox, Hazard, LiveCheckpointCoverageStatus, LiveObservation } from "@inspect-ai/contracts";

export interface FocusObservationSample {
  observation: LiveObservation;
  at: number;
}

export interface GuidanceCoverageSample {
  status: LiveCheckpointCoverageStatus;
  at: number;
}

export function getBoundingBoxIou(left?: BoundingBox, right?: BoundingBox) {
  if (!left || !right) {
    return 0;
  }

  const xLeft = Math.max(left.x_min, right.x_min);
  const yTop = Math.max(left.y_min, right.y_min);
  const xRight = Math.min(left.x_max, right.x_max);
  const yBottom = Math.min(left.y_max, right.y_max);

  if (xRight <= xLeft || yBottom <= yTop) {
    return 0;
  }

  const intersection = (xRight - xLeft) * (yBottom - yTop);
  const leftArea = (left.x_max - left.x_min) * (left.y_max - left.y_min);
  const rightArea = (right.x_max - right.x_min) * (right.y_max - right.y_min);
  const union = leftArea + rightArea - intersection;

  return union > 0 ? intersection / union : 0;
}

export function observationMatchesTarget(args: {
  observation: LiveObservation;
  target: { category?: string; boundingBox?: BoundingBox } | null | undefined;
  roomType?: string;
  currentRoomType?: string;
}) {
  if (!args.target?.category || !args.target.boundingBox) {
    return false;
  }

  if (args.target.category !== args.observation.category) {
    return false;
  }

  if (args.roomType && args.currentRoomType && args.roomType !== args.currentRoomType) {
    return false;
  }

  return getBoundingBoxIou(args.observation.boundingBox, args.target.boundingBox) >= 0.35;
}

export function trimFocusHistory(history: FocusObservationSample[], now: number) {
  return history.filter((sample) => now - sample.at <= 8_000).slice(-3);
}

export function hasFocusConfirmation(history: FocusObservationSample[]) {
  const recent = history.slice(-3);
  return recent.length >= 2;
}

export function trimGuidanceCoverageHistory(history: GuidanceCoverageSample[], now: number) {
  return history.filter((sample) => now - sample.at <= 8_000).slice(-3);
}

export function hasGuidanceCoverageConfirmation(
  history: GuidanceCoverageSample[],
  minimumCoveredSamples = 2
) {
  const recent = history.slice(-3);
  const coveredCount = recent.filter((sample) => sample.status === "covered").length;
  return coveredCount >= minimumCoveredSamples;
}

export function buildLiveAlertKey(observation: LiveObservation) {
  const box = observation.boundingBox;
  return [
    observation.category,
    observation.attentionLevel,
    Math.round(box.x_min * 10),
    Math.round(box.y_min * 10),
    Math.round(box.x_max * 10),
    Math.round(box.y_max * 10),
  ].join(":");
}

export function shouldAutoRecordLiveHazard(observation: LiveObservation) {
  return observation.severity === "Critical" || observation.severity === "High";
}

export function getNewestConfirmedHazard(hazards: Hazard[]) {
  return [...hazards]
    .filter((hazard) => hazard.detectionMode === "live-guided")
    .sort((left, right) => (right.confirmedAt ?? right.detectedAt) - (left.confirmedAt ?? left.detectedAt))[0];
}
