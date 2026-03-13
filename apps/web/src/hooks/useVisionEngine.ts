import { useRef, useCallback, useEffect } from "react";
import { publicAppConfig } from "@/lib/config/public";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { useVoiceAlert } from "@/hooks/useVoiceAlert";
import type { RoomType, AnalyzeResponse, MockHazardTimelineEvent } from "@inspect-ai/contracts";
import { DEFAULT_DEMO_TIMELINE } from "@/lib/constants/fallback";
import { toast } from "sonner";

interface UseVisionEngineArgs {
  captureFrame: () => string | null;
  roomType: RoomType;
}

const FRAME_INTERVAL_MS = 1500; // Analysis every 1.5 seconds

export function useVisionEngine({ captureFrame, roomType }: UseVisionEngineArgs) {
  const { scanPhase, addHazard, setCurrentFrame, setIsAnalyzing } = useHazardStore();
  const { isDemoMode, inspectionMode } = useSessionStore();
  const { playAlert } = useVoiceAlert();
  
  const loopRef = useRef<number | null>(null);
  const isFetchingRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const mockTimelineRef = useRef<MockHazardTimelineEvent[] | null>(null);

  // Load demo mock timeline exactly once
  useEffect(() => {
    if (isDemoMode) {
      fetch("/mock/hazards-timeline.json")
        .then((r) => r.json())
        .then((data) => {
          mockTimelineRef.current = data;
        })
        .catch(() => {
          mockTimelineRef.current = DEFAULT_DEMO_TIMELINE;
        });
    }
  }, [isDemoMode]);

  const tick = useCallback(async () => {
    if (useHazardStore.getState().scanPhase !== "scanning") {
      if (loopRef.current) window.clearTimeout(loopRef.current);
      return;
    }

    if (!isFetchingRef.current) {
      const frameBase64 = isDemoMode ? null : captureFrame();
      
      if (frameBase64 || isDemoMode) {
        if (frameBase64) {
          setCurrentFrame(frameBase64); // Update UI thumbnail
        }

        try {
          isFetchingRef.current = true;
          setIsAnalyzing(true);
          
          if (isDemoMode && mockTimelineRef.current) {
            const elapsed = Date.now() - startTimeRef.current;
            
            // Check if any mock events fired in this window
            const passedEvents = mockTimelineRef.current.filter((ev) => ev.atMs <= elapsed);
            
            // Remove those from the timeline so they don't fire again
            mockTimelineRef.current = mockTimelineRef.current.filter((ev) => ev.atMs > elapsed);

            for (const ev of passedEvents) {
              const haz = {
                ...ev.hazard,
                id: crypto.randomUUID(),
                detectedAt: Date.now(),
                sourceEventId: "demo-event",
                roomType,
              };
              const added = addHazard({
                ...haz,
                // TS strictly expects boundingBox inside Hazard or undefined
                boundingBox: ev.hazard.boundingBox, 
              });
              if (added && (haz.severity === "Critical" || haz.severity === "High")) {
                playAlert(`Warning! ${haz.category} detected. ${haz.description}`);
              } else if (added) {
                toast.warning(`Detected: ${haz.category}`);
              }
            }
            
            // Artificial demo delay
            await new Promise((r) => setTimeout(r, 800));
            
          } else if (!isDemoMode && inspectionMode === "live") {
            // Real API Call
            // Strip data:image/jpeg;base64,
            const base64Data = frameBase64!.replace(/^data:image\/[a-z]+;base64,/, "");
            
            const baseUrl = publicAppConfig.apiBaseUrl;
            const res = await fetch(`${baseUrl}/api/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: "live",
                images: [base64Data],
                roomType,
              }),
            });
            
            if (res.ok) {
              const data = (await res.json()) as AnalyzeResponse;
              data.hazards.forEach((haz) => {
                const added = addHazard(haz);
                if (added && (haz.severity === "Critical" || haz.severity === "High")) {
                  playAlert(`Warning! ${haz.category} detected.`);
                }
              });
            }
          }
        } catch (e) {
          console.error("Frame analysis failed", e);
        } finally {
          setIsAnalyzing(false);
          isFetchingRef.current = false;
        }
      }
    }

    loopRef.current = window.setTimeout(tick, FRAME_INTERVAL_MS);
  }, [captureFrame, roomType, isDemoMode, addHazard, setCurrentFrame, setIsAnalyzing, playAlert, inspectionMode]);

  useEffect(() => {
    if (scanPhase === "scanning") {
      startTimeRef.current = Date.now();
      loopRef.current = window.setTimeout(tick, 0);
    } else {
      if (loopRef.current) window.clearTimeout(loopRef.current);
    }
    return () => {
      if (loopRef.current) window.clearTimeout(loopRef.current);
    };
  }, [scanPhase, tick]);
}
