"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useVisionEngine } from "@/hooks/useVisionEngine";
import { useVoiceAlert } from "@/hooks/useVoiceAlert";
import { applyLiveChecklistCapture } from "@/lib/inspectionChecklist";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { saveReportSnapshot } from "@/lib/report-snapshot/reportSnapshotStore";
import { normalizeReportSnapshot } from "@/lib/report/normalizeReportSnapshot";
import { calculatePropertyRiskScore } from "@/lib/scoring";
import { BoundingBoxOverlay } from "@/components/scanner/BoundingBoxOverlay";
import { RoomScene3DDialog } from "@/components/scanner/RoomScene3DDialog";
import { Button } from "@/components/ui/button";
import { FallbackTrigger } from "@/components/shared/FallbackTrigger";
import type { RoomType, ReportSnapshot } from "@inspect-ai/contracts";
import { toast } from "sonner";

const ROOM_OPTIONS: RoomType[] = ["bathroom", "bedroom", "kitchen", "living-room", "laundry", "balcony", "hallway", "unknown"];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function ScanPage() {
  const router = useRouter();
  const sessionStore = useSessionStore();
  const hazardStore = useHazardStore();
  const { address, isDemoMode, roomScenes3d, setReportId, setIsDemoMode, upsertRoomScene3D } = sessionStore;
  const { scanPhase, hazards, liveEvidenceFrames, setScanPhase, isAnalyzing, addHazard, setLiveEvidenceFrame } = hazardStore;

  const [roomType, setRoomType] = useState<RoomType>("unknown");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [is3DStudioOpen, setIs3DStudioOpen] = useState(false);
  const { videoRef, canvasRef, startCamera, stopCamera, captureFrame, getCameraError, clearCameraError } =
    useCameraStream();

  const {
    banner,
    guidanceTarget,
    activeIssueObservation,
    currentRoomState,
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
  } = useVisionEngine({ captureFrame, roomType });
  const { primeSpeechSynthesis, cancelAlerts } = useVoiceAlert();

  useEffect(() => {
    if (!address && !isDemoMode) {
      router.replace("/");
      return;
    }

    return () => {
      stopCamera();
      cancelAlerts();
    };
  }, [address, isDemoMode, stopCamera, cancelAlerts, router]);

  const handleStartScan = async () => {
    setScanPhase("starting");
    clearCameraError();
    setCameraError(null);
    primeSpeechSynthesis();

    if (!isDemoMode) {
      try {
        await startCamera();
      } catch {
        const message = getCameraError();
        setCameraError(message);
        setScanPhase("error");
        toast.error(message ?? "Camera access failed.");
        return;
      }
    }

    setScanPhase("scanning");
    toast.info(isDemoMode ? "Demo scan started" : "Scan started");
  };

  const handlePauseScan = () => {
    setScanPhase("stopped");
    toast.info("Scan paused");
  };

  const handleEndScan = async () => {
    if (!currentRoomState.endAllowed && currentRoomState.status !== "forced-incomplete") {
      toast.error("End or force-end the current room before generating the report.");
      return;
    }

    handlePauseScan();
    stopCamera();
    cancelAlerts();
    
    const toastId = toast.loading("Finalizing inspection report...");

    try {
      const generatedReportId = crypto.randomUUID();
      const finalizedChecklist = applyLiveChecklistCapture(sessionStore.inspectionChecklist, {
        section: "entryCondition",
        field: "conditionPhotosTaken",
        value: "Guided scan captured dated evidence across key room zones.",
        confidence: "high",
      });
      
      const newSnapshot: ReportSnapshot = {
        reportId: generatedReportId,
        inspectionId: sessionStore.inspectionId || crypto.randomUUID(),
        createdAt: Date.now(),
        inputs: {
          mode: "live",
          address: sessionStore.address,
          agency: sessionStore.agency,
          listingUrl: sessionStore.listingUrl || undefined,
          coordinates: sessionStore.coordinates || undefined,
          propertyNotes: sessionStore.propertyNotes,
          inspectionChecklist: finalizedChecklist || undefined,
          targetDestinations: sessionStore.targetDestinations,
          preferenceProfile: sessionStore.preferenceProfile || undefined,
        },
        hazards: [...hazardStore.hazards],
        intelligence: sessionStore.intelligence || undefined,
        propertyRiskScore: calculatePropertyRiskScore(hazardStore.hazards, {
          inspectionChecklist: sessionStore.inspectionChecklist || undefined,
          inspectionMode: "live",
        }),
        askingRent: sessionStore.askingRent || undefined,
        inspectionCoverage,
        guidanceCaptures: guidanceCaptures.length > 0 ? guidanceCaptures : undefined,
        roomScanStates: roomScanStates.length > 0 ? roomScanStates : undefined,
        roomVerdicts: roomVerdicts.length > 0 ? roomVerdicts : undefined,
        reportEvidenceBasis: reportEvidenceBasis.length > 0 ? reportEvidenceBasis : undefined,
        roomScenes3d: sessionStore.roomScenes3d.length > 0 ? sessionStore.roomScenes3d : undefined,
        exportAssets:
          Object.keys(liveEvidenceFrames).length > 0
            ? {
                hazardThumbnails: Object.entries(liveEvidenceFrames).map(([hazardId, base64]) => ({
                  hazardId,
                  base64,
                })),
              }
            : undefined,
      };

      sessionStore.updateInspectionDraft({
        inspectionChecklist: finalizedChecklist,
      });
      await saveReportSnapshot(normalizeReportSnapshot(newSnapshot));
      setReportId(generatedReportId);
      toast.dismiss(toastId);
      router.replace(`/report/${generatedReportId}`);
    } catch (err: unknown) {
      toast.error("Failed to finalize report: " + getErrorMessage(err));
      toast.dismiss(toastId);
    }
  };

  const handleRetryCamera = () => {
    stopCamera();
    cancelAlerts();
    clearCameraError();
    setCameraError(null);
    setScanPhase("idle");
    toast.info("Ready to retry. Tap Start Scan to continue.");
  };

  const handleEnableDemoMode = () => {
    stopCamera();
    cancelAlerts();
    clearCameraError();
    setCameraError(null);
    setIsDemoMode(true);
    setScanPhase("idle");
    toast.info("Demo Mode enabled. Tap Start Scan to continue.");
  };

  const handle3DStudioOpenChange = (nextOpen: boolean) => {
    if (nextOpen && scanPhase === "scanning") {
      setScanPhase("stopped");
      cancelAlerts();
      toast.info("Live guidance paused while 3D Scan Studio is open.");
    }

    setIs3DStudioOpen(nextOpen);
  };

  const currentRoomScene = roomScenes3d.find((scene) => scene.roomType === roomType) ?? null;
  const showManualAssist = Boolean(activeIssueObservation || guidanceTarget);
  const showBanner = Boolean(banner.text && (!showManualAssist || banner.tone === "success"));

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col">
      <FallbackTrigger />
      {/* Hidden Canvas for extracting frames */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video Feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover z-0"
        playsInline
        muted
      />

      {isDemoMode ? (
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,_rgba(61,220,255,0.18),_transparent_32%),linear-gradient(180deg,_rgba(18,24,38,0.98),_rgba(9,11,18,1))]" />
      ) : null}

      <BoundingBoxOverlay guidanceTarget={guidanceTarget} />

      <div className="absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/85 via-black/45 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
        <div className="mx-auto flex max-h-[52vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-md">
            <select 
              className="w-full bg-background/50 backdrop-blur-md text-foreground border border-border/50 rounded-md px-3 py-2 text-sm focus:ring-accent"
              value={roomType}
              onChange={(e) => setRoomType(e.target.value as RoomType)}
            >
              {ROOM_OPTIONS.map((rt) => (
                <option key={rt} value={rt}>{rt.toUpperCase().replace("-", " ")}</option>
              ))}
            </select>
            
            <div className="mt-3 flex items-center justify-between text-xs text-white/80 font-medium">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isAnalyzing ? "bg-accent animate-pulse" : "bg-muted-foreground"}`} />
                {cameraError ? "Camera blocked" : isAnalyzing ? "AI Analyzing..." : isDemoMode ? "Demo ready" : "Ready"}
              </div>
              <div>Hazards: {hazards.length}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/35 p-3 text-xs text-white/85 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">
                {currentRoomState.status === "forced-incomplete"
                  ? "Room force-ended"
                  : currentRoomState.endAllowed
                    ? "Room ready to end"
                    : "Room coverage in progress"}
              </div>
              <div>
                {inspectionCoverage.coverageStatus === "complete"
                  ? "Coverage complete"
                  : inspectionCoverage.coverageStatus === "mixed"
                    ? "Coverage mixed"
                    : "Coverage still missing"}
              </div>
            </div>
            <div className="mt-2 text-white/70">
              Required views captured: {currentRoomState.completedTargets.length}/
              {currentRoomState.requiredTargets.length + currentRoomState.escalationTargets.length}
            </div>
            {currentRoomState.currentTargetId ? (
              <div className="mt-2 text-white/70">
                Current target: {guidanceTarget?.label ?? currentRoomState.currentTargetId}
              </div>
            ) : null}
            {currentRoomState.endBlockedReasons.length > 0 ? (
              <div className="mt-2 space-y-1 text-white/65">
                <div className="font-medium text-white/75">Still missing</div>
                {currentRoomState.endBlockedReasons.slice(0, 3).map((reason) => (
                  <div key={reason}>{reason}</div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-emerald-300">
                AI has enough evidence for this room. End the room or generate the report.
              </div>
            )}
          </div>

          {showBanner ? (
            <div className="rounded-2xl border border-border/70 bg-card/92 px-4 py-3 text-sm text-foreground shadow-2xl backdrop-blur">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${
                    banner.tone === "success" ? "bg-emerald-400" : "bg-cyan-400"
                  }`}
                />
                <span className="font-medium">
                  {banner.tone === "success" ? "Confirmed" : "AI guidance"}
                </span>
              </div>
              <p className="mt-2 text-muted-foreground">{banner.text}</p>
            </div>
          ) : null}

          {showManualAssist ? (
            <div className="rounded-2xl border border-border/70 bg-card/92 p-3 text-sm text-foreground shadow-2xl backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Manual Assist
              </div>
              {activeIssueObservation ? (
                <>
                  <p className="mt-2 text-sm text-foreground">
                    AI flagged <span className="font-semibold">{activeIssueObservation.category}</span>. You can override it.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={dismissCurrentIssue}>
                      Not an issue
                    </Button>
                    <Button size="sm" onClick={recordCurrentIssueNow}>
                      Add to report now
                    </Button>
                  </div>
                </>
              ) : guidanceTarget ? (
                <>
                  <p className="mt-2 text-sm text-foreground">
                    Reviewing <span className="font-semibold">{guidanceTarget.label}</span>. You can advance manually.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={markCurrentGuidanceChecked}>
                      Mark checked
                    </Button>
                    <Button size="sm" variant="outline" onClick={skipCurrentGuidance}>
                      Skip
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {cameraError ? (
            <div className="rounded-2xl border border-border/70 bg-card/95 p-4 text-sm text-foreground shadow-2xl backdrop-blur">
              <div className="font-medium">Camera access was denied.</div>
              <p className="mt-2 text-muted-foreground">
                {cameraError}
              </p>
              <div className="mt-4 flex gap-3">
                <Button variant="outline" onClick={handleRetryCamera}>
                  Retry
                </Button>
                <Button onClick={handleEnableDemoMode}>
                  Enable Demo Mode
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pb-safe sm:gap-4 sm:p-6">
        {scanPhase === "idle" || scanPhase === "stopped" ? (
          <Button 
            className="h-12 w-full max-w-xs rounded-full bg-accent text-base text-accent-foreground shadow-[0_0_20px_rgba(61,220,255,0.4)] sm:h-14 sm:text-lg"
            onClick={handleStartScan}
          >
            Start Scan
          </Button>
        ) : (
          <Button 
            variant="secondary"
            className="h-12 w-full max-w-xs rounded-full bg-white/20 text-base text-white backdrop-blur-md hover:bg-white/30 sm:h-14 sm:text-lg"
            onClick={handlePauseScan}
          >
            Pause
          </Button>
        )}

        <Button 
          variant="destructive"
          className="mt-1 h-11 w-full max-w-xs rounded-full font-semibold sm:mt-2 sm:h-12"
          onClick={handleEndScan}
        >
          Generate Report
        </Button>

        <Button
          variant={currentRoomState.endAllowed ? "default" : "outline"}
          className="h-11 w-full max-w-xs rounded-full font-semibold sm:h-12"
          onClick={forceEndCurrentRoom}
          disabled={currentRoomState.status === "not-started"}
        >
          {currentRoomState.endAllowed ? "End Current Room" : "Force End Current Room"}
        </Button>

        <Button
          variant="outline"
          className="h-11 w-full max-w-xs rounded-full border-white/25 bg-white/8 font-semibold text-white backdrop-blur-md hover:bg-white/14 sm:h-12"
          onClick={() => handle3DStudioOpenChange(true)}
          disabled={!isDemoMode && scanPhase === "idle"}
        >
          Open 3D Scan Studio
        </Button>
      </div>

      <RoomScene3DDialog
        key={roomType}
        open={is3DStudioOpen}
        onOpenChange={handle3DStudioOpenChange}
        inspectionId={sessionStore.inspectionId}
        roomType={roomType}
        isDemoMode={isDemoMode}
        captureFrame={captureFrame}
        hazards={hazards}
        liveEvidenceFrames={liveEvidenceFrames}
        existingScene={currentRoomScene}
        onSceneReady={upsertRoomScene3D}
        onPromoteSuggestedHazard={(hazard, thumbnailBase64) => {
          const added = addHazard(hazard);
          if (added && thumbnailBase64) {
            setLiveEvidenceFrame(hazard.id, thumbnailBase64);
          }
          return added;
        }}
      />
    </div>
  );
}
