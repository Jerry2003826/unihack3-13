"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  InspectionCoverage,
  LiveAnalyzeResponse,
  LiveGuidanceCapture,
  LiveObservation,
  LiveRoomScanState,
  LiveTarget,
  MockHazardTimelineEvent,
  ReportEvidenceBasis,
  RoomType,
  RoomVerdict,
} from "@inspect-ai/contracts";
import { formatRoomTypeLabel, liveAnalyzeResponseSchema } from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";
import { DEFAULT_DEMO_TIMELINE } from "@/lib/constants/fallback";
import { applyLiveChecklistCapture, getInspectionChecklistFieldValue } from "@/lib/inspectionChecklist";
import {
  buildGuidanceAlertKey,
  getGuidanceProgress,
  getGuidanceTargetForElapsed,
  getNextGuidanceTarget,
  getVisibleGuidancePlan,
  type CaptureGuidanceTarget,
} from "@/lib/liveGuidance";
import {
  addManualOverride,
  activateHazardEscalation,
  buildInspectionCoverageFromRoomStates,
  buildRoomEvidenceBasis,
  buildRoomVerdict,
  createRoomScanState,
  forceEndRoom,
  markRoomTargetCompleted,
  refreshRoomScanState,
  setRoomCurrentTarget,
  skipRoomTarget,
} from "@/lib/liveRoomState";
import {
  buildLiveAlertKey,
  hasGuidanceCoverageConfirmation,
  hasFocusConfirmation,
  observationMatchesTarget,
  shouldAutoRecordLiveHazard,
  trimGuidanceCoverageHistory,
  trimFocusHistory,
  type FocusObservationSample,
  type GuidanceCoverageSample,
} from "@/lib/liveScan";
import { createLiveHazardThumbnail } from "@/lib/liveScanThumbnail";
import { useVoiceAlert } from "@/hooks/useVoiceAlert";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { toast } from "sonner";

interface UseVisionEngineArgs {
  captureFrame: () => string | null;
  roomType: RoomType;
}

interface ScanBannerState {
  tone: "guidance" | "success" | null;
  text: string | null;
}

const OVERVIEW_INTERVAL_MS = 1200;
const FOCUS_INTERVAL_MS = 800;
const GUIDANCE_TARGET_DWELL_MS = 3_500;
const GUIDANCE_TARGET_FALLBACK_SKIP_MS = 9_000;

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

function buildDemoResponse(args: {
  elapsedMs: number;
  roomType: RoomType;
  inspectionId: string;
  events: MockHazardTimelineEvent[];
}): LiveAnalyzeResponse {
  const activeEvent = args.events.find(
    (event) => args.elapsedMs >= event.atMs && args.elapsedMs <= event.atMs + 3600
  );

  if (!activeEvent || !activeEvent.hazard.boundingBox) {
    return {
      observations: [],
    };
  }

  const attentionLevel = args.elapsedMs < activeEvent.atMs + 1800 ? "move-closer" : "confirm";
  const observationId = `${activeEvent.eventId}-${args.roomType}`;
  const observation: LiveObservation = {
    observationId,
    category: activeEvent.hazard.category,
    severity: activeEvent.hazard.severity,
    description: activeEvent.hazard.description,
    boundingBox: activeEvent.hazard.boundingBox,
    confidence: attentionLevel === "confirm" ? "high" : "medium",
    attentionLevel,
    guidanceText:
      attentionLevel === "confirm"
        ? `${activeEvent.hazard.category} looks serious. Hold steady for confirmation.`
        : `Possible ${activeEvent.hazard.category.toLowerCase()} detected. Move closer.`,
  };

  return liveAnalyzeResponseSchema.parse({
    observations: [observation],
    primaryTarget: {
      observationId,
      category: observation.category,
      boundingBox: observation.boundingBox,
      phase: "focus",
    },
    alertText: observation.guidanceText,
    confirmedHazard:
      attentionLevel === "confirm"
        ? {
            id: crypto.randomUUID(),
            category: observation.category,
            severity: observation.severity,
            description: observation.description,
            boundingBox: observation.boundingBox,
            detectedAt: Date.now(),
            confirmedAt: Date.now(),
            roomType: args.roomType,
            sourceEventId: activeEvent.eventId,
            detectionMode: "live-guided",
          }
        : undefined,
  });
}

export function useVisionEngine({ captureFrame, roomType }: UseVisionEngineArgs) {
  const {
    scanPhase,
    hazards,
    addHazard,
    setCurrentFrame,
    setIsAnalyzing,
    setLiveCandidates,
    setActiveTargetId,
    setLastConfirmedAt,
    setLiveEvidenceFrame,
  } = useHazardStore();
  const { inspectionId, isDemoMode, inspectionMode, updateInspectionDraft } = useSessionStore();
  const { playAlert } = useVoiceAlert();

  const [banner, setBanner] = useState<ScanBannerState>({ tone: null, text: null });
  const [guidanceTarget, setGuidanceTarget] = useState<CaptureGuidanceTarget | null>(null);
  const [activeIssueObservation, setActiveIssueObservation] = useState<LiveObservation | null>(null);
  const [roomStates, setRoomStates] = useState<Partial<Record<RoomType, LiveRoomScanState>>>({});
  const [guidanceCaptures, setGuidanceCaptures] = useState<LiveGuidanceCapture[]>([]);

  const roomStatesRef = useRef(roomStates);
  const guidanceCapturesRef = useRef(guidanceCaptures);
  const loopRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const mockTimelineRef = useRef<MockHazardTimelineEvent[]>(DEFAULT_DEMO_TIMELINE);
  const activeTargetRef = useRef<LiveTarget | null>(null);
  const focusHistoryRef = useRef<FocusObservationSample[]>([]);
  const lostTargetAtRef = useRef<number | null>(null);
  const recentConfirmedIdsRef = useRef<string[]>([]);
  const confirmationKeysRef = useRef<string[]>([]);
  const guidanceTargetRef = useRef<CaptureGuidanceTarget | null>(null);
  const lastGuidanceTargetIdRef = useRef<string | null>(null);
  const checklistCaptureKeysRef = useRef<string[]>([]);
  const guidanceStartedAtRef = useRef<number>(0);
  const guidanceCoverageHistoryRef = useRef<
    Partial<Record<RoomType, Partial<Record<string, GuidanceCoverageSample[]>>>>
  >({});
  const dismissedIssueKeysRef = useRef<string[]>([]);
  const dismissedObservationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    roomStatesRef.current = roomStates;
  }, [roomStates]);

  useEffect(() => {
    guidanceCapturesRef.current = guidanceCaptures;
  }, [guidanceCaptures]);

  useEffect(() => {
    if (!isDemoMode) {
      return;
    }

    fetch("/mock/hazards-timeline.json")
      .then((response) => response.json())
      .then((data) => {
        mockTimelineRef.current = Array.isArray(data) ? data : DEFAULT_DEMO_TIMELINE;
      })
      .catch(() => {
        mockTimelineRef.current = DEFAULT_DEMO_TIMELINE;
      });
  }, [isDemoMode]);

  const getRoomState = useCallback((targetRoomType: RoomType) => {
    return roomStatesRef.current[targetRoomType] ?? createRoomScanState(targetRoomType);
  }, []);

  const commitRoomState = useCallback((targetRoomType: RoomType, nextState: LiveRoomScanState) => {
    const nextMap = {
      ...roomStatesRef.current,
      [targetRoomType]: nextState,
    };
    roomStatesRef.current = nextMap;
    setRoomStates(nextMap);
    return nextState;
  }, []);

  const setRoomReasoningSummary = useCallback(
    (targetRoomType: RoomType, reasoningSummary: string | undefined, now = Date.now()) => {
      const nextState = refreshRoomScanState(
        {
          ...getRoomState(targetRoomType),
          reasoningSummary,
        },
        now
      );
      return commitRoomState(targetRoomType, nextState);
    },
    [commitRoomState, getRoomState]
  );

  const recordGuidanceCapture = useCallback(
    (capture: LiveGuidanceCapture) => {
      setGuidanceCaptures((current) => {
        const next = [
          ...current.filter(
            (item) => !(item.roomType === capture.roomType && item.targetId === capture.targetId)
          ),
          capture,
        ].sort((left, right) => left.capturedAt - right.capturedAt);
        guidanceCapturesRef.current = next;
        return next;
      });
    },
    []
  );

  const completeGuidanceTarget = useCallback(
    (args: {
      targetRoomType: RoomType;
      target: CaptureGuidanceTarget;
      source: NonNullable<LiveGuidanceCapture["source"]>;
      capturedAt: number;
      thumbnailBase64?: string;
      note?: string;
    }) => {
      const baseState = getRoomState(args.targetRoomType);
      const withOverride =
        args.source === "manual-marked"
          ? addManualOverride(baseState, {
              action: "mark-complete",
              targetId: args.target.id,
              note: args.note ?? `Manually marked ${args.target.label} as covered.`,
              createdAt: args.capturedAt,
            })
          : baseState;
      const completed = setRoomCurrentTarget(
        markRoomTargetCompleted(withOverride, args.target.id, args.capturedAt),
        undefined,
        args.capturedAt
      );
      commitRoomState(args.targetRoomType, completed);
      recordGuidanceCapture({
        roomType: args.targetRoomType,
        targetId: args.target.id,
        label: args.target.label,
        capturedAt: args.capturedAt,
        thumbnailBase64: args.thumbnailBase64,
        source: args.source,
      });
      return completed;
    },
    [commitRoomState, getRoomState, recordGuidanceCapture]
  );

  const registerSkippedGuidanceTarget = useCallback(
    (targetRoomType: RoomType, target: CaptureGuidanceTarget, now = Date.now()) => {
      const skipped = setRoomCurrentTarget(
        skipRoomTarget(
          addManualOverride(getRoomState(targetRoomType), {
            action: "skip-target",
            targetId: target.id,
            note: `Skipped ${target.label}. Room remains incomplete until evidence is recovered or force-ended.`,
            createdAt: now,
          }),
          target.id,
          now
        ),
        undefined,
        now
      );
      return commitRoomState(targetRoomType, skipped);
    },
    [commitRoomState, getRoomState]
  );

  const registerHazardEscalation = useCallback(
    (targetRoomType: RoomType, category: LiveObservation["category"], now = Date.now()) => {
      const escalated = activateHazardEscalation(getRoomState(targetRoomType), category, now);
      return commitRoomState(targetRoomType, escalated);
    },
    [commitRoomState, getRoomState]
  );

  const getCompletedGuidanceIds = useCallback(
    (targetRoomType: RoomType) => getRoomState(targetRoomType).completedTargets,
    [getRoomState]
  );

  const getGuidanceCoverageHistory = useCallback((targetRoomType: RoomType, targetId: string) => {
    return guidanceCoverageHistoryRef.current[targetRoomType]?.[targetId] ?? [];
  }, []);

  const pushGuidanceCoverageSample = useCallback(
    (targetRoomType: RoomType, targetId: string, sample: GuidanceCoverageSample, now: number) => {
      const roomHistory = guidanceCoverageHistoryRef.current[targetRoomType] ?? {};
      const nextHistory = trimGuidanceCoverageHistory(
        [...(roomHistory[targetId] ?? []), sample],
        now
      );

      guidanceCoverageHistoryRef.current[targetRoomType] = {
        ...roomHistory,
        [targetId]: nextHistory,
      };

      return nextHistory;
    },
    []
  );

  const setGuidanceTargetState = useCallback((target: CaptureGuidanceTarget | null, now: number) => {
    guidanceTargetRef.current = target;
    guidanceStartedAtRef.current = now;
    setGuidanceTarget(target);
  }, []);

  const selectNextGuidanceTarget = useCallback(
    (
      targetRoomType: RoomType,
      now: number,
      options?: {
        currentTargetId?: string | null;
        skipTargetId?: string | null;
      }
    ) => {
      const roomState = getRoomState(targetRoomType);
      if (roomState.status === "forced-incomplete" || roomState.endAllowed) {
        const settledState = setRoomCurrentTarget(roomState, undefined, now);
        commitRoomState(targetRoomType, settledState);
        setGuidanceTargetState(null, now);
        return null;
      }

      const nextTarget = getNextGuidanceTarget({
        roomType: targetRoomType,
        completedIds: roomState.completedTargets,
        currentTargetId: options?.currentTargetId ?? roomState.currentTargetId ?? null,
        skipTargetId: options?.skipTargetId,
        activeEscalationTargetIds: roomState.escalationTargets,
        ignoredTargetIds: roomState.skippedTargets,
      });

      commitRoomState(targetRoomType, setRoomCurrentTarget(roomState, nextTarget?.id, now));
      setGuidanceTargetState(nextTarget, now);
      return nextTarget;
    },
    [commitRoomState, getRoomState, setGuidanceTargetState]
  );

  const getGuidanceBannerText = useCallback(
    (target: CaptureGuidanceTarget, targetRoomType: RoomType) => {
      const roomState = getRoomState(targetRoomType);
      const progress = getGuidanceProgress({
        roomType: targetRoomType,
        completedIds: roomState.completedTargets,
        activeEscalationTargetIds: roomState.escalationTargets,
      });
      return `${target.bannerText} (${Math.min(progress.completed + 1, progress.total)}/${progress.total})`;
    },
    [getRoomState]
  );

  const getRoomReadyMessage = useCallback(
    (targetRoomType: RoomType) => {
      const roomState = getRoomState(targetRoomType);
      return (
        roomState.reasoningSummary ??
        `AI has enough required evidence for ${formatRoomTypeLabel(targetRoomType).toLowerCase()}.`
      );
    },
    [getRoomState]
  );

  const resumeGuidanceFlow = useCallback(
    async (args?: { now?: number; prefix?: string }) => {
      const now = args?.now ?? Date.now();
      activeTargetRef.current = null;
      focusHistoryRef.current = [];
      lostTargetAtRef.current = null;
      setActiveTargetId(null);
      setActiveIssueObservation(null);

      const roomState = getRoomState(roomType);
      if (roomState.endAllowed || roomState.status === "forced-incomplete") {
        setGuidanceTargetState(null, now);
        const readyText = roomState.endAllowed
          ? getRoomReadyMessage(roomType)
          : `Room was force-ended with missing evidence. Missing: ${roomState.missingTargets.length}.`;
        setBanner({
          tone: roomState.endAllowed ? "success" : "guidance",
          text: args?.prefix ? `${args.prefix} ${readyText}` : readyText,
        });
        return;
      }

      const nextTarget = selectNextGuidanceTarget(roomType, now);
      const nextText = nextTarget ? getGuidanceBannerText(nextTarget, roomType) : "Continue scanning the room.";
      const bannerText = args?.prefix ? `${args.prefix} ${nextText}` : nextText;
      setBanner({
        tone: "guidance",
        text: bannerText,
      });

      if (nextTarget && lastGuidanceTargetIdRef.current !== nextTarget.id) {
        lastGuidanceTargetIdRef.current = nextTarget.id;
        await playAlert({
          inspectionId: inspectionId ?? "live-scan",
          alertKey: buildGuidanceAlertKey({
            roomType,
            targetId: nextTarget.id,
          }),
          text: nextTarget.voiceText,
          severity: "Low",
        });
      }
    },
    [
      getGuidanceBannerText,
      getRoomReadyMessage,
      getRoomState,
      inspectionId,
      playAlert,
      roomType,
      selectNextGuidanceTarget,
      setActiveTargetId,
      setGuidanceTargetState,
    ]
  );

  const handleGuidance = useCallback(
    async (args: {
      response: LiveAnalyzeResponse;
      frameDataUrl: string | null;
      requestedGuidanceTarget: CaptureGuidanceTarget | null;
    }) => {
      const now = Date.now();
      if (args.response.reasoningSummary) {
        setRoomReasoningSummary(roomType, args.response.reasoningSummary, now);
      }

      const observations = args.response.observations.filter(
        (observation) => !dismissedIssueKeysRef.current.includes(buildLiveAlertKey(observation))
      );
      const currentTarget = activeTargetRef.current;
      setLiveCandidates(observations);
      let roomState = getRoomState(roomType);
      let guidanceCompletedThisTick = false;

      if (args.response.hazardFollowUp?.targetIds.length) {
        roomState = registerHazardEscalation(roomType, args.response.hazardFollowUp.category, now);
      }

      if (args.response.checkpointCapture && args.requestedGuidanceTarget?.checkpoint) {
        const captureKey = [
          args.response.checkpointCapture.section,
          args.response.checkpointCapture.field,
          args.response.checkpointCapture.value.trim(),
        ].join(":");

        if (
          args.response.checkpointCapture.confidence !== "low" &&
          !checklistCaptureKeysRef.current.includes(captureKey)
        ) {
          checklistCaptureKeysRef.current = [...checklistCaptureKeysRef.current.slice(-20), captureKey];
          const nextChecklist = applyLiveChecklistCapture(
            useSessionStore.getState().inspectionChecklist,
            args.response.checkpointCapture,
            {
              listMode: args.requestedGuidanceTarget.checkpoint.listMode,
            }
          );
          updateInspectionDraft({
            inspectionChecklist: nextChecklist,
          });
        }
      }

      if (args.requestedGuidanceTarget && args.response.checkpointCoverage) {
        const coverageHistory = pushGuidanceCoverageSample(
          roomType,
          args.requestedGuidanceTarget.id,
          {
            status: args.response.checkpointCoverage.status,
            at: now,
          },
          now
        );

        const completionThreshold =
          args.requestedGuidanceTarget.completionRule.minCoverageConfirmations;
        const hasCoverageThreshold =
          args.response.checkpointCoverage.status === "covered" &&
          hasGuidanceCoverageConfirmation(coverageHistory, completionThreshold);

        if (
          hasCoverageThreshold &&
          !roomState.completedTargets.includes(args.requestedGuidanceTarget.id)
        ) {
          roomState = completeGuidanceTarget({
            targetRoomType: roomType,
            target: args.requestedGuidanceTarget,
            source:
              args.requestedGuidanceTarget.role === "escalation" ? "hazard-followup" : "ai-covered",
            capturedAt: now,
            thumbnailBase64: args.frameDataUrl ?? undefined,
          });
          guidanceCompletedThisTick = true;
          toast.success(`Captured: ${args.requestedGuidanceTarget.label}`);
        }
      }

      const matchingObservation =
        currentTarget &&
        observations.find((observation) =>
          observationMatchesTarget({
            observation,
            target: currentTarget,
            roomType,
            currentRoomType: roomType,
          })
        );

      if (!currentTarget) {
        const primaryObservation = args.response.primaryTarget?.observationId
          ? observations.find(
              (observation) =>
                observation.observationId === args.response.primaryTarget?.observationId
            )
          : undefined;

        if (
          primaryObservation &&
          shouldAutoRecordLiveHazard(primaryObservation) &&
          (primaryObservation.attentionLevel === "move-closer" ||
            primaryObservation.attentionLevel === "confirm")
        ) {
          setActiveIssueObservation(primaryObservation);
          activeTargetRef.current =
            args.response.primaryTarget ?? {
              observationId: primaryObservation.observationId,
              category: primaryObservation.category,
              boundingBox: primaryObservation.boundingBox,
              phase: "focus",
            };
          focusHistoryRef.current = trimFocusHistory(
            [
              {
                observation: primaryObservation,
                at: now,
              },
            ],
            now
          );
          setActiveTargetId(primaryObservation.observationId);
          setBanner({
            tone: "guidance",
            text:
              args.response.alertText ??
              args.response.guidanceDecision?.message ??
              primaryObservation.guidanceText,
          });
          setGuidanceTargetState(null, now);
          lastGuidanceTargetIdRef.current = null;
          await playAlert({
            inspectionId: inspectionId ?? "live-scan",
            alertKey: buildLiveAlertKey(primaryObservation),
            text:
              args.response.alertText ??
              args.response.guidanceDecision?.message ??
              primaryObservation.guidanceText,
            severity: primaryObservation.severity,
          });
          return;
        }

        const watchObservation = observations.find((observation) => observation.attentionLevel === "watch");
        setActiveIssueObservation(null);
        const currentGuidanceTarget = guidanceTargetRef.current;
        const currentGuidanceCoverage = currentGuidanceTarget
          ? getGuidanceCoverageHistory(roomType, currentGuidanceTarget.id)
          : [];
        const shouldAdvanceGuidance =
          guidanceCompletedThisTick ||
          !currentGuidanceTarget ||
          now - guidanceStartedAtRef.current >= GUIDANCE_TARGET_FALLBACK_SKIP_MS ||
          (!currentGuidanceTarget.checkpoint &&
            now - guidanceStartedAtRef.current >= GUIDANCE_TARGET_DWELL_MS);

        roomState = getRoomState(roomType);

        if (roomState.endAllowed && !watchObservation) {
          setGuidanceTargetState(null, now);
          lastGuidanceTargetIdRef.current = null;
          setActiveTargetId(null);
          setBanner({
            tone: "success",
            text: args.response.guidanceDecision?.message ?? getRoomReadyMessage(roomType),
          });
          return;
        }

        const nextGuidanceTarget = shouldAdvanceGuidance
          ? selectNextGuidanceTarget(roomType, now, {
              skipTargetId:
                guidanceCompletedThisTick || !currentGuidanceTarget ? undefined : currentGuidanceTarget.id,
            })
          : currentGuidanceTarget;
        const guidanceText =
          watchObservation?.guidanceText ??
          args.response.guidanceDecision?.message ??
          (nextGuidanceTarget ? getGuidanceBannerText(nextGuidanceTarget, roomType) : null);
        setActiveTargetId(null);
        setGuidanceTarget(nextGuidanceTarget);
        setBanner({
          tone: guidanceText ? "guidance" : null,
          text: guidanceText,
        });

        if (
          nextGuidanceTarget &&
          lastGuidanceTargetIdRef.current !== nextGuidanceTarget.id &&
          currentGuidanceCoverage.length === 0
        ) {
          lastGuidanceTargetIdRef.current = nextGuidanceTarget.id;
          await playAlert({
            inspectionId: inspectionId ?? "live-scan",
            alertKey: buildGuidanceAlertKey({
              roomType,
              targetId: nextGuidanceTarget.id,
            }),
            text: nextGuidanceTarget.voiceText,
            severity: "Low",
          });
        }
        return;
      }

      if (!matchingObservation) {
        if (!lostTargetAtRef.current) {
          lostTargetAtRef.current = now;
        }

        if (now - lostTargetAtRef.current >= 4_000) {
          activeTargetRef.current = null;
          focusHistoryRef.current = [];
          setActiveTargetId(null);
          setActiveIssueObservation(null);
          const nextGuidanceTarget = selectNextGuidanceTarget(roomType, now);
          setBanner({
            tone: "guidance",
            text: nextGuidanceTarget
              ? `Target lost. ${getGuidanceBannerText(nextGuidanceTarget, roomType)}`
              : getRoomReadyMessage(roomType),
          });
        }
        return;
      }

      lostTargetAtRef.current = null;
      activeTargetRef.current = {
        observationId: matchingObservation.observationId,
        category: matchingObservation.category,
        boundingBox: matchingObservation.boundingBox,
        phase: "focus",
      };
      setActiveTargetId(matchingObservation.observationId);
      setActiveIssueObservation(matchingObservation);
      setGuidanceTargetState(null, now);
      lastGuidanceTargetIdRef.current = null;
      focusHistoryRef.current = trimFocusHistory(
        [
          ...focusHistoryRef.current,
          {
            observation: matchingObservation,
            at: now,
          },
        ],
        now
      );

      if (
        matchingObservation.attentionLevel === "confirm" &&
        shouldAutoRecordLiveHazard(matchingObservation) &&
        hasFocusConfirmation(focusHistoryRef.current)
      ) {
        const confirmedHazard =
          args.response.confirmedHazard &&
          args.response.confirmedHazard.category === matchingObservation.category
            ? {
                ...args.response.confirmedHazard,
                confirmedAt: now,
                detectedAt: now,
                roomType,
                detectionMode: "live-guided" as const,
              }
            : {
                id: crypto.randomUUID(),
                category: matchingObservation.category,
                severity: matchingObservation.severity,
                description: matchingObservation.description,
                boundingBox: matchingObservation.boundingBox,
                detectedAt: now,
                confirmedAt: now,
                roomType,
                sourceEventId: inspectionId ?? "live-scan",
                detectionMode: "live-guided" as const,
              };
        const confirmationKey = `${matchingObservation.observationId}:${roomType}`;

        if (!confirmationKeysRef.current.includes(confirmationKey)) {
          const added = addHazard(confirmedHazard);
          confirmationKeysRef.current = [...confirmationKeysRef.current.slice(-8), confirmationKey];

          if (added) {
            setLastConfirmedAt(now);
            recentConfirmedIdsRef.current = [
              ...recentConfirmedIdsRef.current.slice(-5),
              matchingObservation.observationId,
            ];

            if (args.frameDataUrl) {
              const thumbnail = await createLiveHazardThumbnail({
                frameDataUrl: args.frameDataUrl,
                boundingBox: matchingObservation.boundingBox,
              });
              if (thumbnail) {
                setLiveEvidenceFrame(confirmedHazard.id, thumbnail);
              }
            }

            roomState = commitRoomState(
              roomType,
              addManualOverride(registerHazardEscalation(roomType, matchingObservation.category, now), {
                action: "record-issue",
                observationId: matchingObservation.observationId,
                note: `${matchingObservation.category} auto-confirmed by AI.`,
                createdAt: now,
              })
            );
          }
        }

        activeTargetRef.current = null;
        focusHistoryRef.current = [];
        setLiveCandidates([]);
        setActiveTargetId(null);
        setActiveIssueObservation(null);
        const nextGuidanceTarget = selectNextGuidanceTarget(roomType, now);
        setBanner({
          tone: "success",
          text: nextGuidanceTarget
            ? `${matchingObservation.category} added to report. ${getGuidanceBannerText(
                nextGuidanceTarget,
                roomType
              )}`
            : `${matchingObservation.category} added to report.`,
        });
        toast.success(`${matchingObservation.category} added to report.`);
        return;
      }

      setBanner({
        tone: "guidance",
        text:
          args.response.alertText ??
          args.response.guidanceDecision?.message ??
          matchingObservation.guidanceText,
      });
      await playAlert({
        inspectionId: inspectionId ?? "live-scan",
        alertKey: buildLiveAlertKey(matchingObservation),
        text:
          args.response.alertText ??
          args.response.guidanceDecision?.message ??
          matchingObservation.guidanceText,
        severity: matchingObservation.severity,
      });
    },
    [
      addHazard,
      commitRoomState,
      completeGuidanceTarget,
      getGuidanceBannerText,
      getGuidanceCoverageHistory,
      getRoomReadyMessage,
      getRoomState,
      inspectionId,
      playAlert,
      pushGuidanceCoverageSample,
      registerHazardEscalation,
      roomType,
      selectNextGuidanceTarget,
      setActiveTargetId,
      setGuidanceTargetState,
      setLastConfirmedAt,
      setLiveCandidates,
      setLiveEvidenceFrame,
      setRoomReasoningSummary,
      updateInspectionDraft,
    ]
  );

  const tick = useCallback(async () => {
    if (useHazardStore.getState().scanPhase !== "scanning") {
      if (loopRef.current) {
        window.clearTimeout(loopRef.current);
      }
      return;
    }

    if (isFetchingRef.current) {
      return;
    }

    const frameDataUrl = isDemoMode ? null : captureFrame();
    if (!isDemoMode && !frameDataUrl) {
      loopRef.current = window.setTimeout(
        tick,
        activeTargetRef.current?.phase === "focus" ? FOCUS_INTERVAL_MS : OVERVIEW_INTERVAL_MS
      );
      return;
    }

    if (frameDataUrl) {
      setCurrentFrame(frameDataUrl);
    }

    try {
      isFetchingRef.current = true;
      setIsAnalyzing(true);

      let response: LiveAnalyzeResponse;
      const now = Date.now();
      const currentRoomState = getRoomState(roomType);
      const currentGuidanceTarget =
        activeTargetRef.current || useHazardStore.getState().scanPhase !== "scanning"
          ? null
          : guidanceTargetRef.current ?? selectNextGuidanceTarget(roomType, now);

      if (isDemoMode) {
        response = buildDemoResponse({
          elapsedMs: Date.now() - startTimeRef.current,
          roomType,
          inspectionId: inspectionId ?? "demo-inspection",
          events: mockTimelineRef.current,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      } else if (inspectionMode === "live" && inspectionId) {
        const apiResponse = await fetch(resolveApiUrl("/api/analyze/live"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspectionId,
            frameBase64: frameDataUrl,
            roomType,
            activeTarget: activeTargetRef.current ?? { phase: "overview" },
            recentConfirmedIds: recentConfirmedIdsRef.current,
            guidedCheckpoint: currentGuidanceTarget?.checkpoint,
            roomScanState: currentRoomState,
            guidancePlan: getVisibleGuidancePlan({
              roomType,
              activeEscalationTargetIds: currentRoomState.escalationTargets,
              ignoredTargetIds: currentRoomState.skippedTargets,
            }),
            currentGuidanceTargetId: currentGuidanceTarget?.id,
            ignoredTargetIds: currentRoomState.skippedTargets,
            dismissedObservationIds: dismissedObservationIdsRef.current,
          }),
        });

        if (!apiResponse.ok) {
          throw new Error("Live analyze request failed.");
        }

        response = liveAnalyzeResponseSchema.parse(await apiResponse.json());
      } else {
        response = {
          observations: [],
        };
      }

      await handleGuidance({
        response,
        frameDataUrl,
        requestedGuidanceTarget: currentGuidanceTarget,
      });
    } catch (error) {
      console.error("Frame analysis failed", error);
      setBanner({
        tone: "guidance",
        text: "Live guidance is temporarily unavailable. Keep scanning the room.",
      });
    } finally {
      setIsAnalyzing(false);
      isFetchingRef.current = false;
      loopRef.current = window.setTimeout(
        tick,
        activeTargetRef.current?.phase === "focus" ? FOCUS_INTERVAL_MS : OVERVIEW_INTERVAL_MS
      );
    }
  }, [
    captureFrame,
    getRoomState,
    handleGuidance,
    inspectionId,
    inspectionMode,
    isDemoMode,
    roomType,
    selectNextGuidanceTarget,
    setCurrentFrame,
    setIsAnalyzing,
  ]);

  useEffect(() => {
    if (scanPhase === "scanning") {
      startTimeRef.current = Date.now();
      loopRef.current = window.setTimeout(tick, 0);
      return () => {
        if (loopRef.current) {
          window.clearTimeout(loopRef.current);
        }
      };
    }

    activeTargetRef.current = null;
    focusHistoryRef.current = [];
    lostTargetAtRef.current = null;
    recentConfirmedIdsRef.current = [];
    checklistCaptureKeysRef.current = [];
    guidanceCoverageHistoryRef.current = {};
    guidanceTargetRef.current = null;
    guidanceStartedAtRef.current = 0;
    lastGuidanceTargetIdRef.current = null;
    dismissedIssueKeysRef.current = [];
    dismissedObservationIdsRef.current = [];
    setLiveCandidates([]);
    setActiveTargetId(null);
    setGuidanceTarget(null);
    setBanner({ tone: null, text: null });

    if (scanPhase === "idle") {
      setRoomStates({});
      roomStatesRef.current = {};
      setGuidanceCaptures([]);
      guidanceCapturesRef.current = [];
    }

    if (loopRef.current) {
      window.clearTimeout(loopRef.current);
    }

    return () => {
      if (loopRef.current) {
        window.clearTimeout(loopRef.current);
      }
    };
  }, [scanPhase, setActiveTargetId, setLiveCandidates, tick]);

  useEffect(() => {
    if (scanPhase !== "scanning" || activeTargetRef.current) {
      return;
    }

    const currentRoomState = getRoomState(roomType);
    if (currentRoomState.endAllowed) {
      setGuidanceTargetState(null, Date.now());
      setBanner({
        tone: "success",
        text: getRoomReadyMessage(roomType),
      });
      return;
    }

    const nextGuidanceTarget = selectNextGuidanceTarget(roomType, Date.now());
    lastGuidanceTargetIdRef.current = null;
    setBanner({
      tone: "guidance",
      text: nextGuidanceTarget ? getGuidanceBannerText(nextGuidanceTarget, roomType) : null,
    });
  }, [
    getGuidanceBannerText,
    getRoomReadyMessage,
    getRoomState,
    roomType,
    scanPhase,
    selectNextGuidanceTarget,
    setGuidanceTargetState,
  ]);

  const markCurrentGuidanceChecked = useCallback(async () => {
    const target = guidanceTargetRef.current;
    if (!target) {
      return;
    }

    const now = Date.now();
    if (target.checkpoint) {
      const currentChecklist = useSessionStore.getState().inspectionChecklist;
      const existingValue = getInspectionChecklistFieldValue(
        currentChecklist,
        target.checkpoint.section,
        target.checkpoint.field
      );

      if (!existingValue.trim()) {
        const manualCaptureValue = target.checkpoint.listMode
          ? `Manually reviewed: ${target.label}`
          : `Manually reviewed during live scan: ${target.label}.`;
        const nextChecklist = applyLiveChecklistCapture(
          currentChecklist,
          {
            section: target.checkpoint.section,
            field: target.checkpoint.field,
            value: manualCaptureValue,
            confidence: "medium",
            summary: "Manual review",
          },
          {
            listMode: target.checkpoint.listMode,
          }
        );
        updateInspectionDraft({
          inspectionChecklist: nextChecklist,
        });
      }
    }

    completeGuidanceTarget({
      targetRoomType: roomType,
      target,
      source: "manual-marked",
      capturedAt: now,
      thumbnailBase64: captureFrame() ?? undefined,
      note: `${target.label} was manually marked as complete.`,
    });
    toast.success(`Marked checked: ${target.label}`);
    await resumeGuidanceFlow({
      now,
      prefix: `${target.label} marked checked.`,
    });
  }, [captureFrame, completeGuidanceTarget, resumeGuidanceFlow, roomType, updateInspectionDraft]);

  const skipCurrentGuidance = useCallback(async () => {
    const target = guidanceTargetRef.current;
    if (!target) {
      return;
    }

    const now = Date.now();
    registerSkippedGuidanceTarget(roomType, target, now);
    const nextTarget = selectNextGuidanceTarget(roomType, now, {
      skipTargetId: target.id,
    });
    setActiveIssueObservation(null);
    setBanner({
      tone: "guidance",
      text: nextTarget
        ? `Skipped ${target.label}. ${getGuidanceBannerText(nextTarget, roomType)}`
        : `Skipped ${target.label}. This room still has missing evidence.`,
    });
    lastGuidanceTargetIdRef.current = null;
    toast.info(`Skipped: ${target.label}`);
  }, [getGuidanceBannerText, registerSkippedGuidanceTarget, roomType, selectNextGuidanceTarget]);

  const dismissCurrentIssue = useCallback(async () => {
    const observation = activeIssueObservation;
    if (!observation) {
      return;
    }

    const suppressionKey = buildLiveAlertKey(observation);
    if (!dismissedIssueKeysRef.current.includes(suppressionKey)) {
      dismissedIssueKeysRef.current = [...dismissedIssueKeysRef.current.slice(-20), suppressionKey];
    }
    if (!dismissedObservationIdsRef.current.includes(observation.observationId)) {
      dismissedObservationIdsRef.current = [
        ...dismissedObservationIdsRef.current.slice(-20),
        observation.observationId,
      ];
    }

    commitRoomState(
      roomType,
      addManualOverride(getRoomState(roomType), {
        action: "dismiss-issue",
        observationId: observation.observationId,
        note: `${observation.category} was marked as not an issue.`,
        createdAt: Date.now(),
      })
    );

    setLiveCandidates(
      useHazardStore.getState().liveCandidates.filter(
        (candidate) => buildLiveAlertKey(candidate) !== suppressionKey
      )
    );
    toast.info(`Dismissed: ${observation.category}`);
    await resumeGuidanceFlow({
      prefix: "Marked as not an issue.",
    });
  }, [activeIssueObservation, commitRoomState, getRoomState, resumeGuidanceFlow, roomType, setLiveCandidates]);

  const recordCurrentIssueNow = useCallback(async () => {
    const observation = activeIssueObservation;
    if (!observation) {
      return;
    }

    const now = Date.now();
    const manualHazard = {
      id: crypto.randomUUID(),
      category: observation.category,
      severity: observation.severity,
      description: observation.description,
      boundingBox: observation.boundingBox,
      detectedAt: now,
      confirmedAt: now,
      roomType,
      sourceEventId: inspectionId ?? "live-scan-manual",
      detectionMode: "live-guided" as const,
      source: "manual" as const,
    };

    const added = addHazard(manualHazard);
    if (added) {
      recentConfirmedIdsRef.current = [...recentConfirmedIdsRef.current.slice(-5), observation.observationId];
      setLastConfirmedAt(now);
      const frameDataUrl = captureFrame();
      if (frameDataUrl) {
        const thumbnail = await createLiveHazardThumbnail({
          frameDataUrl,
          boundingBox: observation.boundingBox,
        });
        if (thumbnail) {
          setLiveEvidenceFrame(manualHazard.id, thumbnail);
        }
      }
      commitRoomState(
        roomType,
        addManualOverride(registerHazardEscalation(roomType, observation.category, now), {
          action: "record-issue",
          observationId: observation.observationId,
          note: `${observation.category} was manually added to the report.`,
          createdAt: now,
        })
      );
      toast.success(`${observation.category} added to report.`);
    }

    await resumeGuidanceFlow({
      now,
      prefix: `${observation.category} recorded manually.`,
    });
  }, [
    activeIssueObservation,
    addHazard,
    captureFrame,
    commitRoomState,
    inspectionId,
    registerHazardEscalation,
    resumeGuidanceFlow,
    roomType,
    setLastConfirmedAt,
    setLiveEvidenceFrame,
  ]);

  const forceEndCurrentRoom = useCallback(() => {
    const now = Date.now();
    const currentState = getRoomState(roomType);
    const nextState = forceEndRoom(
      addManualOverride(currentState, {
        action: "force-end-room",
        note: currentState.endAllowed
          ? "Room ended after evidence threshold was satisfied."
          : `Room force-ended with ${currentState.missingTargets.length} missing target(s).`,
        createdAt: now,
      }),
      now
    );
    commitRoomState(roomType, nextState);
    activeTargetRef.current = null;
    setActiveIssueObservation(null);
    setLiveCandidates([]);
    setActiveTargetId(null);
    setGuidanceTargetState(null, now);
    const message = nextState.endAllowed
      ? `${formatRoomTypeLabel(roomType)} ended. AI has enough evidence.`
      : `Force-ended ${formatRoomTypeLabel(roomType).toLowerCase()} with missing evidence: ${nextState.missingTargets.length}.`;
    setBanner({
      tone: nextState.endAllowed ? "success" : "guidance",
      text: message,
    });
    toast.info(message);
    return nextState;
  }, [commitRoomState, getRoomState, roomType, setActiveTargetId, setGuidanceTargetState, setLiveCandidates]);

  const roomScanStates = useMemo(
    () =>
      Object.values(roomStates)
        .filter((state): state is LiveRoomScanState => Boolean(state))
        .sort((left, right) => (left.visitedAt ?? 0) - (right.visitedAt ?? 0)),
    [roomStates]
  );

  const roomVerdicts = useMemo<RoomVerdict[]>(
    () => roomScanStates.filter((state) => state.visitedAt).map((state) => buildRoomVerdict({ state, hazards })),
    [hazards, roomScanStates]
  );

  const reportEvidenceBasis = useMemo<ReportEvidenceBasis[]>(
    () =>
      roomScanStates
        .filter((state) => state.visitedAt)
        .map((state) =>
          buildRoomEvidenceBasis({
            state,
            hazards,
            captures: guidanceCaptures,
          })
        ),
    [guidanceCaptures, hazards, roomScanStates]
  );

  const inspectionCoverage = useMemo<InspectionCoverage>(
    () =>
      buildInspectionCoverageFromRoomStates({
        roomStates: roomScanStates,
        roomVerdicts,
      }),
    [roomScanStates, roomVerdicts]
  );

  return {
    banner,
    guidanceTarget,
    activeIssueObservation,
    currentRoomState: getRoomState(roomType),
    roomScanStates,
    guidanceCaptures,
    roomVerdicts,
    reportEvidenceBasis,
    inspectionCoverage,
    markCurrentGuidanceChecked,
    skipCurrentGuidance,
    dismissCurrentIssue,
    recordCurrentIssueNow,
    forceEndCurrentRoom,
  };
}
