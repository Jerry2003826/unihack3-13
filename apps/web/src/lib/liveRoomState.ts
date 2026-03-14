import type {
  Hazard,
  InspectionCoverage,
  LiveGuidanceCapture,
  LiveHazardEscalation,
  LiveManualOverride,
  LiveRoomScanState,
  ReportEvidenceBasis,
  RoomType,
  RoomVerdict,
} from "@inspect-ai/contracts";
import { formatRoomTypeLabel } from "@inspect-ai/contracts";
import {
  getGuidanceTargetById,
  getHazardEscalationTargets,
  getRoomGuidancePlan,
} from "@/lib/liveGuidance";

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getTargetLabel(roomType: RoomType, targetId: string) {
  return getGuidanceTargetById({ roomType, targetId })?.label ?? targetId;
}

function getRequiredTargetIds(roomType: RoomType) {
  return getRoomGuidancePlan(roomType)
    .filter((target) => target.role === "required")
    .map((target) => target.id);
}

function getOptionalTargetIds(roomType: RoomType) {
  return getRoomGuidancePlan(roomType)
    .filter((target) => target.role === "optional")
    .map((target) => target.id);
}

function toBlockedReasons(roomType: RoomType, missingTargetIds: string[]) {
  return missingTargetIds.map((targetId) => `Still missing ${getTargetLabel(roomType, targetId)}.`);
}

function buildReasoningSummary(args: {
  roomType: RoomType;
  completedCount: number;
  totalCount: number;
  missingTargetIds: string[];
  forcedIncomplete?: boolean;
}) {
  if (args.totalCount === 0) {
    return `No structured capture targets are configured for ${formatRoomTypeLabel(args.roomType).toLowerCase()}.`;
  }

  if (args.missingTargetIds.length === 0) {
    return `AI has enough required evidence for ${formatRoomTypeLabel(args.roomType).toLowerCase()} based on ${args.completedCount}/${args.totalCount} completed target views.`;
  }

  if (args.forcedIncomplete) {
    return `Room was force-ended with ${args.completedCount}/${args.totalCount} required views completed. Missing evidence remains.`;
  }

  return `AI still needs ${args.missingTargetIds.length} required view${args.missingTargetIds.length > 1 ? "s" : ""} before ${formatRoomTypeLabel(args.roomType).toLowerCase()} coverage is complete.`;
}

export function createRoomScanState(roomType: RoomType, now = Date.now()): LiveRoomScanState {
  const requiredTargets = getRequiredTargetIds(roomType);
  return {
    roomType,
    visitedAt: undefined,
    lastUpdatedAt: undefined,
    status: "not-started",
    requiredTargets,
    optionalTargets: getOptionalTargetIds(roomType),
    escalationTargets: [],
    completedTargets: [],
    missingTargets: requiredTargets,
    skippedTargets: [],
    coverageStatus: "insufficient-evidence",
    endAllowed: false,
    endBlockedReasons: toBlockedReasons(roomType, requiredTargets),
    manualOverrides: [],
    hazardEscalations: [],
    reasoningSummary: buildReasoningSummary({
      roomType,
      completedCount: 0,
      totalCount: requiredTargets.length,
      missingTargetIds: requiredTargets,
    }),
  };
}

export function refreshRoomScanState(input: LiveRoomScanState, now = Date.now()): LiveRoomScanState {
  const requiredTargets = getRequiredTargetIds(input.roomType);
  const allowedTargetIds = new Set([
    ...getRoomGuidancePlan(input.roomType).map((target) => target.id),
    ...(input.escalationTargets ?? []),
  ]);
  const escalationTargets = unique(
    [
      ...input.escalationTargets,
      ...input.hazardEscalations.flatMap((escalation) => escalation.targetIds),
    ].filter((targetId) => allowedTargetIds.has(targetId))
  );
  const completedTargets = unique(input.completedTargets.filter((targetId) => allowedTargetIds.has(targetId)));
  const skippedTargets = unique((input.skippedTargets ?? []).filter((targetId) => allowedTargetIds.has(targetId)));
  const requiredForCoverage = unique([...requiredTargets, ...escalationTargets]);
  const missingTargets = requiredForCoverage.filter((targetId) => !completedTargets.includes(targetId));
  const endAllowed = missingTargets.length === 0;
  const forcedIncomplete = Boolean(input.endedAt) && !endAllowed;
  const hasActivity = Boolean(
    input.visitedAt ||
      input.currentTargetId ||
      completedTargets.length ||
      skippedTargets.length ||
      input.manualOverrides.length ||
      input.hazardEscalations.length ||
      input.endedAt
  );
  const visitedAt = input.visitedAt ?? (hasActivity ? now : undefined);

  return {
    ...input,
    visitedAt,
    lastUpdatedAt: hasActivity ? now : input.lastUpdatedAt,
    status: !hasActivity ? "not-started" : endAllowed ? "complete" : forcedIncomplete ? "forced-incomplete" : "in-progress",
    currentTargetId:
      input.currentTargetId && allowedTargetIds.has(input.currentTargetId) ? input.currentTargetId : undefined,
    requiredTargets,
    optionalTargets: getOptionalTargetIds(input.roomType),
    escalationTargets,
    completedTargets,
    missingTargets,
    skippedTargets,
    coverageStatus: endAllowed ? "complete" : "insufficient-evidence",
    endAllowed,
    endBlockedReasons: toBlockedReasons(input.roomType, missingTargets),
    reasoningSummary: buildReasoningSummary({
      roomType: input.roomType,
      completedCount: completedTargets.filter((targetId) => requiredForCoverage.includes(targetId)).length,
      totalCount: requiredForCoverage.length,
      missingTargetIds: missingTargets,
      forcedIncomplete,
    }),
  };
}

export function addManualOverride(
  state: LiveRoomScanState,
  override: Omit<LiveManualOverride, "overrideId" | "roomType" | "createdAt"> & { createdAt?: number }
) {
  return refreshRoomScanState(
    {
      ...state,
      manualOverrides: [
        ...state.manualOverrides,
        {
          overrideId: crypto.randomUUID(),
          roomType: state.roomType,
          createdAt: override.createdAt ?? Date.now(),
          ...override,
        },
      ],
    },
    override.createdAt
  );
}

export function markRoomTargetCompleted(state: LiveRoomScanState, targetId: string, now = Date.now()) {
  return refreshRoomScanState(
    {
      ...state,
      completedTargets: [...state.completedTargets, targetId],
      currentTargetId: state.currentTargetId === targetId ? undefined : state.currentTargetId,
    },
    now
  );
}

export function skipRoomTarget(state: LiveRoomScanState, targetId: string, now = Date.now()) {
  return refreshRoomScanState(
    {
      ...state,
      skippedTargets: [...(state.skippedTargets ?? []), targetId],
      currentTargetId: state.currentTargetId === targetId ? undefined : state.currentTargetId,
    },
    now
  );
}

export function activateHazardEscalation(state: LiveRoomScanState, category: Hazard["category"], now = Date.now()) {
  const targetIds = getHazardEscalationTargets({ roomType: state.roomType, category });
  if (targetIds.length === 0) {
    return refreshRoomScanState(state, now);
  }

  const existingKey = `${category}:${targetIds.join(",")}`;
  const alreadyTriggered = state.hazardEscalations.some(
    (entry) => `${entry.category}:${entry.targetIds.join(",")}` === existingKey
  );
  if (alreadyTriggered) {
    return refreshRoomScanState(state, now);
  }

  return refreshRoomScanState(
    {
      ...state,
      hazardEscalations: [
        ...state.hazardEscalations,
        {
          category,
          targetIds,
          triggeredAt: now,
          reason: `${category} signal needs follow-up views before the room can be trusted.`,
        },
      ],
      escalationTargets: [...state.escalationTargets, ...targetIds],
    },
    now
  );
}

export function forceEndRoom(state: LiveRoomScanState, now = Date.now()) {
  return refreshRoomScanState(
    {
      ...state,
      endedAt: now,
    },
    now
  );
}

export function setRoomCurrentTarget(state: LiveRoomScanState, targetId: string | undefined, now = Date.now()) {
  return refreshRoomScanState(
    {
      ...state,
      currentTargetId: targetId,
    },
    now
  );
}

export function buildRoomVerdict(args: { state: LiveRoomScanState; hazards: Hazard[] }): RoomVerdict {
  const roomName = formatRoomTypeLabel(args.state.roomType);
  const relevantHazards = args.hazards.filter((hazard) => hazard.roomType === args.state.roomType);

  if (!args.state.endAllowed) {
    return {
      roomType: args.state.roomType,
      status: "insufficient-evidence",
      summary: `${roomName} is not ready for a reliable verdict because required views are still missing.`,
      reasons: args.state.endBlockedReasons,
    };
  }

  if (relevantHazards.some((hazard) => hazard.severity === "Critical" || hazard.severity === "High")) {
    return {
      roomType: args.state.roomType,
      status: "fail",
      summary: `${roomName} has confirmed high-risk issues and should not be treated as inspection-ready.`,
      reasons: relevantHazards
        .filter((hazard) => hazard.severity === "Critical" || hazard.severity === "High")
        .slice(0, 4)
        .map((hazard) => `${hazard.severity} ${hazard.category}: ${hazard.description}`),
    };
  }

  if (relevantHazards.length > 0) {
    return {
      roomType: args.state.roomType,
      status: "caution",
      summary: `${roomName} has enough evidence, but visible issues still need follow-up or negotiation.`,
      reasons: relevantHazards.slice(0, 4).map((hazard) => `${hazard.severity} ${hazard.category}: ${hazard.description}`),
    };
  }

  return {
    roomType: args.state.roomType,
    status: "pass",
    summary: `${roomName} has enough evidence and no visible hazards were confirmed in the required views.`,
    reasons: ["Required room views were completed and no visible hazards were confirmed."],
  };
}

function inferHazardSource(hazard: Hazard): "model" | "manual" | "rule" {
  if (hazard.source === "manual") {
    return "manual";
  }
  return "model";
}

export function buildRoomEvidenceBasis(args: {
  state: LiveRoomScanState;
  hazards: Hazard[];
  captures: LiveGuidanceCapture[];
}): ReportEvidenceBasis {
  const verdict = buildRoomVerdict({ state: args.state, hazards: args.hazards });
  const relevantCaptures = args.captures.filter((capture) => capture.roomType === args.state.roomType);
  const relevantHazards = args.hazards.filter((hazard) => hazard.roomType === args.state.roomType);

  return {
    roomType: args.state.roomType,
    verdict,
    reasoningSummary: args.state.reasoningSummary ?? verdict.summary,
    requiredViewsCaptured: args.state.completedTargets
      .filter((targetId) => args.state.requiredTargets.includes(targetId) || args.state.escalationTargets.includes(targetId))
      .map((targetId) => getTargetLabel(args.state.roomType, targetId)),
    missingEvidence: args.state.missingTargets.map((targetId) => getTargetLabel(args.state.roomType, targetId)),
    confirmedHazards: relevantHazards.map((hazard) => ({
      hazardId: hazard.id,
      summary: `${hazard.severity} ${hazard.category}: ${hazard.description}`,
      source: inferHazardSource(hazard),
      targetIds: unique(
        relevantCaptures
          .filter((capture) => capture.capturedAt <= (hazard.confirmedAt ?? hazard.detectedAt))
          .slice(-2)
          .map((capture) => capture.targetId)
      ),
    })),
    manualOverrides: args.state.manualOverrides,
    unverifiedItems: unique([
      ...args.state.missingTargets.map((targetId) => `${formatRoomTypeLabel(args.state.roomType)}: ${getTargetLabel(args.state.roomType, targetId)}`),
      ...args.state.manualOverrides
        .filter((override) => override.action === "skip-target" || override.action === "force-end-room")
        .map((override) => override.note ?? "Room was manually ended with missing evidence."),
    ]),
  };
}

export function buildInspectionCoverageFromRoomStates(args: {
  roomStates: LiveRoomScanState[];
  roomVerdicts?: RoomVerdict[];
}): InspectionCoverage {
  const visitedRooms = args.roomStates.filter((state) => state.visitedAt);
  const roomsSeen = visitedRooms.map((state) => state.roomType);
  const missingAreas = unique(
    visitedRooms.flatMap((state) =>
      state.missingTargets.map((targetId) => `${formatRoomTypeLabel(state.roomType)}: ${getTargetLabel(state.roomType, targetId)}`)
    )
  );
  const completedRooms = visitedRooms.filter((state) => state.endAllowed).length;
  const forcedIncompleteRooms = visitedRooms.filter((state) => state.status === "forced-incomplete").length;
  const verdicts = args.roomVerdicts ?? [];
  const hasCoverageGap = missingAreas.length > 0;
  const confidence: InspectionCoverage["confidence"] =
    visitedRooms.length > 0 && completedRooms === visitedRooms.length && !hasCoverageGap
      ? "high"
      : completedRooms > 0
        ? "medium"
        : "low";

  return {
    summary:
      visitedRooms.length === 0
        ? "No room coverage was recorded in this inspection yet."
        : hasCoverageGap
          ? `Coverage is incomplete. ${missingAreas.length} required view${missingAreas.length > 1 ? "s are" : " is"} still missing.`
          : `Coverage is complete across ${completedRooms} room${completedRooms > 1 ? "s" : ""} with enough evidence to support room verdicts.`,
    roomsSeen,
    missingAreas,
    confidence,
    warning:
      forcedIncompleteRooms > 0
        ? `${forcedIncompleteRooms} room${forcedIncompleteRooms > 1 ? "s were" : " was"} force-ended before all required evidence was captured.`
        : hasCoverageGap
          ? "At least one room still lacks the views needed for a reliable verdict."
          : undefined,
    coverageStatus: hasCoverageGap ? (completedRooms > 0 ? "mixed" : "insufficient-evidence") : "complete",
    roomSummaries: visitedRooms.map((state) => ({
      roomType: state.roomType,
      verdict:
        verdicts.find((verdict) => verdict.roomType === state.roomType)?.status ??
        buildRoomVerdict({ state, hazards: [] }).status,
      coverageStatus: state.status,
    })),
  };
}
