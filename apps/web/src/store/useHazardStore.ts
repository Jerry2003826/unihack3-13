import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Hazard, ScanPhase, BoundingBox, LiveObservation } from "@inspect-ai/contracts";

interface HazardState {
  hazards: Hazard[];
  scanPhase: ScanPhase;
  currentFrame: string | null;
  isAnalyzing: boolean;
  lastSpeechAt: number;
  liveCandidates: LiveObservation[];
  activeTargetId: string | null;
  lastAlertKey: string | null;
  lastConfirmedAt: number;
  liveEvidenceFrames: Record<string, string>;

  // Actions
  addHazard: (hazard: Hazard) => boolean;
  resetForNewInspection: () => void;
  resetForRescan: () => void;
  setScanPhase: (scanPhase: ScanPhase) => void;
  setCurrentFrame: (frame: string | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setLastSpeechAt: (time: number) => void;
  setLiveCandidates: (candidates: LiveObservation[]) => void;
  setActiveTargetId: (targetId: string | null) => void;
  setLastAlertKey: (alertKey: string | null) => void;
  setLastConfirmedAt: (time: number) => void;
  setLiveEvidenceFrame: (hazardId: string, frameDataUrl: string) => void;
}

function getBboxCenter(bbox?: BoundingBox) {
  if (!bbox) return null;
  return {
    x: (bbox.x_min + bbox.x_max) / 2,
    y: (bbox.y_min + bbox.y_max) / 2,
  };
}

function getDistance(c1: { x: number; y: number }, c2: { x: number; y: number }) {
  const dx = c1.x - c2.x;
  const dy = c1.y - c2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export const useHazardStore = create<HazardState>()(
  persist(
    (set, get) => ({
      hazards: [],
      scanPhase: "idle",
      currentFrame: null,
      isAnalyzing: false,
      lastSpeechAt: 0,
      liveCandidates: [],
      activeTargetId: null,
      lastAlertKey: null,
      lastConfirmedAt: 0,
      liveEvidenceFrames: {},

      addHazard: (newHazard) => {
        const { hazards } = get();

        // Deduplication logic
        // - same category
        // - same severity
        // - time diff < 30_000ms
        // - bounding box center distance < 0.08
        const isDuplicate = hazards.some((existing) => {
          if (existing.category !== newHazard.category) return false;
          if (existing.severity !== newHazard.severity) return false;
          
          const timeDiff = Math.abs(existing.detectedAt - newHazard.detectedAt);
          if (timeDiff >= 30000) return false;

          const center1 = getBboxCenter(existing.boundingBox);
          const center2 = getBboxCenter(newHazard.boundingBox);
          
          if (center1 && center2) {
            const dist = getDistance(center1, center2);
            if (dist < 0.08) return true;
          } else if (!center1 && !center2) {
             // If both have no bbox, and category+severity match within 30s, treat as duplicate
             return true;
          }

          return false;
        });

        if (isDuplicate) {
          return false;
        }

        set((state) => ({
          hazards: [...state.hazards, newHazard],
        }));
        return true;
      },

      resetForNewInspection: () =>
        set({
          hazards: [],
          scanPhase: "idle",
          currentFrame: null,
          isAnalyzing: false,
          lastSpeechAt: 0,
          liveCandidates: [],
          activeTargetId: null,
          lastAlertKey: null,
          lastConfirmedAt: 0,
          liveEvidenceFrames: {},
        }),

      resetForRescan: () =>
        set({
          hazards: [],
          scanPhase: "idle",
          currentFrame: null,
          isAnalyzing: false,
          lastSpeechAt: 0,
          liveCandidates: [],
          activeTargetId: null,
          lastAlertKey: null,
          lastConfirmedAt: 0,
          liveEvidenceFrames: {},
        }),

      setScanPhase: (scanPhase) => set({ scanPhase }),
      setCurrentFrame: (currentFrame) => set({ currentFrame }),
      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
      setLastSpeechAt: (lastSpeechAt) => set({ lastSpeechAt }),
      setLiveCandidates: (liveCandidates) => set({ liveCandidates }),
      setActiveTargetId: (activeTargetId) => set({ activeTargetId }),
      setLastAlertKey: (lastAlertKey) => set({ lastAlertKey }),
      setLastConfirmedAt: (lastConfirmedAt) => set({ lastConfirmedAt }),
      setLiveEvidenceFrame: (hazardId, frameDataUrl) =>
        set((state) => ({
          liveEvidenceFrames: {
            ...state.liveEvidenceFrames,
            [hazardId]: frameDataUrl,
          },
        })),
    }),
    {
      name: "inspect-hazard-storage",
      storage: createJSONStorage(() => sessionStorage),
      version: 2,
      partialize: () => ({}),
    }
  )
);
