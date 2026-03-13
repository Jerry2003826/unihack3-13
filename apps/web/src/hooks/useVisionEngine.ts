"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LiveAnalyzeResponse,
  LiveObservation,
  LiveTarget,
  MockHazardTimelineEvent,
  RoomType,
} from "@inspect-ai/contracts";
import { liveAnalyzeResponseSchema } from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";
import { DEFAULT_DEMO_TIMELINE } from "@/lib/constants/fallback";
import { applyLiveChecklistCapture } from "@/lib/inspectionChecklist";
import {
  buildGuidanceAlertKey,
  getGuidanceProgress,
  getGuidanceTargetForElapsed,
  getNextGuidanceTarget,
  type CaptureGuidanceTarget,
} from "@/lib/liveGuidance";
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
            estimatedCost: activeEvent.hazard.estimatedCost,
          }
        : undefined,
  });
}

export function useVisionEngine({ captureFrame, roomType }: UseVisionEngineArgs) {
  const {
    scanPhase,
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
  const completedGuidanceIdsRef = useRef<Partial<Record<RoomType, string[]>>>({});
  const guidanceStartedAtRef = useRef<number>(0);
  const guidanceCoverageHistoryRef = useRef<Partial<Record<RoomType, Partial<Record<string, GuidanceCoverageSample[]>>>>>({});

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

  const getCompletedGuidanceIds = useCallback((targetRoomType: RoomType) => {
    return completedGuidanceIdsRef.current[targetRoomType] ?? [];
  }, []);

  const markGuidanceCompleted = useCallback((targetRoomType: RoomType, targetId: string) => {
    const current = completedGuidanceIdsRef.current[targetRoomType] ?? [];
    if (current.includes(targetId)) {
      return;
    }

    completedGuidanceIdsRef.current[targetRoomType] = [...current, targetId];
  }, []);

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
    (targetRoomType: RoomType, now: number, currentTargetId?: string | null) => {
      const nextTarget = getNextGuidanceTarget({
        roomType: targetRoomType,
        completedIds: getCompletedGuidanceIds(targetRoomType),
        currentTargetId,
      });

      if (nextTarget) {
        setGuidanceTargetState(nextTarget, now);
        return nextTarget;
      }

      const fallbackTarget = getGuidanceTargetForElapsed({
        roomType: targetRoomType,
        elapsedMs: now - startTimeRef.current,
      });
      setGuidanceTargetState(fallbackTarget, now);
      return fallbackTarget;
    },
    [getCompletedGuidanceIds, setGuidanceTargetState]
  );

  const getGuidanceBannerText = useCallback(
    (target: CaptureGuidanceTarget, targetRoomType: RoomType) => {
      const progress = getGuidanceProgress({
        roomType: targetRoomType,
        completedIds: getCompletedGuidanceIds(targetRoomType),
      });
      return `${target.bannerText} (${Math.min(progress.completed + 1, progress.total)}/${progress.total})`;
    },
    [getCompletedGuidanceIds]
  );

  const handleGuidance = useCallback(
    async (args: {
      response: LiveAnalyzeResponse;
      frameDataUrl: string | null;
      requestedGuidanceTarget: CaptureGuidanceTarget | null;
    }) => {
      const now = Date.now();
      const observations = args.response.observations;
      const currentTarget = activeTargetRef.current;
      setLiveCandidates(observations);
      let guidanceCompletedThisTick = false;

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
          const nextChecklist = applyLiveChecklistCapture(useSessionStore.getState().inspectionChecklist, args.response.checkpointCapture, {
            listMode: args.requestedGuidanceTarget.checkpoint.listMode,
          });
          updateInspectionDraft({
            inspectionChecklist: nextChecklist,
          });
          markGuidanceCompleted(roomType, args.requestedGuidanceTarget.id);
          guidanceCompletedThisTick = true;
          toast.success(`Recorded: ${args.requestedGuidanceTarget.checkpoint.label}`);
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

        if (
          args.response.checkpointCoverage.status === "covered" &&
          hasGuidanceCoverageConfirmation(coverageHistory) &&
          !getCompletedGuidanceIds(roomType).includes(args.requestedGuidanceTarget.id)
        ) {
          markGuidanceCompleted(roomType, args.requestedGuidanceTarget.id);
          guidanceCompletedThisTick = true;
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
          ? observations.find((observation) => observation.observationId === args.response.primaryTarget?.observationId)
          : undefined;

        if (
          primaryObservation &&
          shouldAutoRecordLiveHazard(primaryObservation) &&
          (primaryObservation.attentionLevel === "move-closer" || primaryObservation.attentionLevel === "confirm")
        ) {
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
            text: args.response.alertText ?? primaryObservation.guidanceText,
          });
          setGuidanceTargetState(null, now);
          lastGuidanceTargetIdRef.current = null;
          await playAlert({
            inspectionId: inspectionId ?? "live-scan",
            alertKey: buildLiveAlertKey(primaryObservation),
            text: args.response.alertText ?? primaryObservation.guidanceText,
            severity: primaryObservation.severity,
          });
          return;
        }

        const watchObservation = observations.find((observation) => observation.attentionLevel === "watch");
        const currentGuidanceTarget = guidanceTargetRef.current;
        const currentGuidanceCoverage = currentGuidanceTarget
          ? getGuidanceCoverageHistory(roomType, currentGuidanceTarget.id)
          : [];
        const shouldAdvanceGuidance =
          guidanceCompletedThisTick ||
          !currentGuidanceTarget ||
          now - guidanceStartedAtRef.current >= GUIDANCE_TARGET_FALLBACK_SKIP_MS ||
          (!currentGuidanceTarget.checkpoint && now - guidanceStartedAtRef.current >= GUIDANCE_TARGET_DWELL_MS);
        const shouldMarkCurrentAsCompleted =
          guidanceCompletedThisTick ||
          currentGuidanceCoverage.some((sample) => sample.status === "covered");

        const nextGuidanceTarget = shouldAdvanceGuidance
          ? selectNextGuidanceTarget(
              roomType,
              now,
              shouldMarkCurrentAsCompleted ? undefined : currentGuidanceTarget?.id
            )
          : currentGuidanceTarget;
        const guidanceText =
          watchObservation?.guidanceText ??
          (nextGuidanceTarget ? getGuidanceBannerText(nextGuidanceTarget, roomType) : null);
        setActiveTargetId(null);
        setGuidanceTarget(nextGuidanceTarget);
        setBanner({
          tone: guidanceText ? "guidance" : null,
          text: guidanceText,
        });

        if (nextGuidanceTarget && lastGuidanceTargetIdRef.current !== nextGuidanceTarget.id) {
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
          const nextGuidanceTarget = selectNextGuidanceTarget(roomType, now);
          setBanner({
            tone: "guidance",
            text: nextGuidanceTarget
              ? `Target lost. ${getGuidanceBannerText(nextGuidanceTarget, roomType)}`
              : "Target lost. Resume the room scan and cover the highlighted area again.",
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
          args.response.confirmedHazard && args.response.confirmedHazard.category === matchingObservation.category
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
          }
        }

        activeTargetRef.current = null;
        focusHistoryRef.current = [];
        setLiveCandidates([]);
        setActiveTargetId(null);
        selectNextGuidanceTarget(roomType, now);
        setBanner({
          tone: "success",
          text: `${matchingObservation.category} added to report.`,
        });
        toast.success(`${matchingObservation.category} added to report.`);
        return;
      }

      setBanner({
        tone: "guidance",
        text: args.response.alertText ?? matchingObservation.guidanceText,
      });
      await playAlert({
        inspectionId: inspectionId ?? "live-scan",
        alertKey: buildLiveAlertKey(matchingObservation),
        text: args.response.alertText ?? matchingObservation.guidanceText,
        severity: matchingObservation.severity,
      });
    },
    [
      addHazard,
      getCompletedGuidanceIds,
      inspectionId,
      getGuidanceBannerText,
      getGuidanceCoverageHistory,
      markGuidanceCompleted,
      playAlert,
      pushGuidanceCoverageSample,
      roomType,
      selectNextGuidanceTarget,
      setActiveTargetId,
      setLastConfirmedAt,
      setLiveCandidates,
      setLiveEvidenceFrame,
      setGuidanceTargetState,
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
    completedGuidanceIdsRef.current = {};
    guidanceCoverageHistoryRef.current = {};
    guidanceTargetRef.current = null;
    guidanceStartedAtRef.current = 0;
    lastGuidanceTargetIdRef.current = null;
    setLiveCandidates([]);
    setActiveTargetId(null);
    setGuidanceTarget(null);
    setBanner({ tone: null, text: null });

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

    const nextGuidanceTarget = selectNextGuidanceTarget(roomType, Date.now());
    lastGuidanceTargetIdRef.current = null;
    setBanner({
      tone: "guidance",
      text: getGuidanceBannerText(nextGuidanceTarget, roomType),
    });
  }, [getGuidanceBannerText, roomType, scanPhase, selectNextGuidanceTarget]);

  return {
    banner,
    guidanceTarget,
  };
}
