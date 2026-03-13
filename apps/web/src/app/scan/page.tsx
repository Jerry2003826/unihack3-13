"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useVisionEngine } from "@/hooks/useVisionEngine";
import { useVoiceAlert } from "@/hooks/useVoiceAlert";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { saveReportSnapshot } from "@/lib/report-snapshot/reportSnapshotStore";
import { normalizeReportSnapshot } from "@/lib/report/normalizeReportSnapshot";
import { calculatePropertyRiskScore } from "@/lib/scoring";
import { BoundingBoxOverlay } from "@/components/scanner/BoundingBoxOverlay";
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
  const { address, isDemoMode, setReportId, setIsDemoMode } = sessionStore;
  const { scanPhase, hazards, setScanPhase, isAnalyzing } = hazardStore;

  const [roomType, setRoomType] = useState<RoomType>("unknown");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { videoRef, canvasRef, startCamera, stopCamera, captureFrame, getCameraError, clearCameraError } =
    useCameraStream();

  // The engine hook will start capturing frames when scanPhase is "scanning"
  useVisionEngine({ captureFrame, roomType });
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
    handlePauseScan();
    stopCamera();
    cancelAlerts();
    
    const toastId = toast.loading("Finalizing inspection report...");

    try {
      const generatedReportId = crypto.randomUUID();
      
      const newSnapshot: ReportSnapshot = {
        reportId: generatedReportId,
        inspectionId: sessionStore.inspectionId || crypto.randomUUID(),
        createdAt: Date.now(),
        inputs: {
          mode: "live",
          address: sessionStore.address,
          agency: sessionStore.agency,
          coordinates: sessionStore.coordinates || undefined,
          propertyNotes: sessionStore.propertyNotes,
          targetDestinations: sessionStore.targetDestinations,
          preferenceProfile: sessionStore.preferenceProfile || undefined,
        },
        hazards: [...hazardStore.hazards],
        intelligence: sessionStore.intelligence || undefined,
        propertyRiskScore: calculatePropertyRiskScore(hazardStore.hazards),
        askingRent: sessionStore.askingRent || undefined,
      };

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

      <BoundingBoxOverlay />

      {cameraError ? (
        <div className="absolute inset-x-4 top-24 z-40 rounded-2xl border border-border/70 bg-card/95 p-4 text-sm text-foreground shadow-2xl backdrop-blur">
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

      {/* Top Header: Room Selection */}
      <div className="absolute top-0 inset-x-0 z-30 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <select 
          className="w-full bg-background/50 backdrop-blur-md text-foreground border border-border/50 rounded-md px-3 py-2 text-sm focus:ring-accent"
          value={roomType}
          onChange={(e) => setRoomType(e.target.value as RoomType)}
        >
          {ROOM_OPTIONS.map((rt) => (
            <option key={rt} value={rt}>{rt.toUpperCase().replace("-", " ")}</option>
          ))}
        </select>
        
        <div className="flex items-center justify-between mt-3 text-xs text-white/80 font-medium">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isAnalyzing ? "bg-accent animate-pulse" : "bg-muted-foreground"}`} />
            {cameraError ? "Camera blocked" : isAnalyzing ? "AI Analyzing..." : isDemoMode ? "Demo ready" : "Ready"}
          </div>
          <div>Hazards: {hazards.length}</div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 inset-x-0 z-30 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col items-center gap-4 pb-safe">
        {scanPhase === "idle" || scanPhase === "stopped" ? (
          <Button 
            className="w-full max-w-xs rounded-full h-14 bg-accent text-accent-foreground text-lg shadow-[0_0_20px_rgba(61,220,255,0.4)]"
            onClick={handleStartScan}
          >
            Start Scan
          </Button>
        ) : (
          <Button 
            variant="secondary"
            className="w-full max-w-xs rounded-full h-14 text-lg backdrop-blur-md bg-white/20 text-white hover:bg-white/30"
            onClick={handlePauseScan}
          >
            Pause
          </Button>
        )}

        <Button 
          variant="destructive"
          className="w-full max-w-xs rounded-full h-12 mt-2 font-semibold"
          onClick={handleEndScan}
        >
          End & Generate Report
        </Button>
      </div>
    </div>
  );
}
