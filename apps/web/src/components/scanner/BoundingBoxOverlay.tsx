"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useHazardStore } from "@/store/useHazardStore";
import type { CaptureGuidanceTarget } from "@/lib/liveGuidance";

interface BoundingBoxOverlayProps {
  guidanceTarget?: CaptureGuidanceTarget | null;
}

export function BoundingBoxOverlay({ guidanceTarget = null }: BoundingBoxOverlayProps) {
  const hazards = useHazardStore((state) => state.hazards);
  const liveCandidates = useHazardStore((state) => state.liveCandidates);
  const activeTargetId = useHazardStore((state) => state.activeTargetId);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());
    const timeout = window.setTimeout(refreshNow, 0);
    const interval = window.setInterval(refreshNow, 500);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  const confirmedHazards = hazards.filter((hazard) => hazard.boundingBox && now - (hazard.confirmedAt ?? hazard.detectedAt) < 5000);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {liveCandidates.map((observation) => {
          const bb = observation.boundingBox;
          const isActive = observation.observationId === activeTargetId;
          const top = `${bb.y_min * 100}%`;
          const left = `${bb.x_min * 100}%`;
          const width = `${(bb.x_max - bb.x_min) * 100}%`;
          const height = `${(bb.y_max - bb.y_min) * 100}%`;

          const colorClass = isActive
            ? observation.severity === "Critical"
              ? "border-destructive text-destructive bg-destructive/10"
              : "border-orange-500 text-orange-300 bg-orange-500/10"
            : observation.severity === "Medium" || observation.severity === "Low"
              ? "border-cyan-300/70 text-cyan-200 bg-cyan-500/5"
              : "border-yellow-400/80 text-yellow-200 bg-yellow-400/5";

          return (
            <motion.div
              key={`candidate-${observation.observationId}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{ top, left, width, height }}
              className={`absolute rounded border-[3px] ${colorClass} ${isActive ? "shadow-[0_0_18px_currentColor]" : ""}`}
            >
              {isActive ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: [-2, 4, -2] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                  className="absolute left-1/2 top-[-30px] -translate-x-1/2 rounded-full bg-background/90 px-2 py-1 text-base font-bold"
                >
                  ↓
                </motion.div>
              ) : null}
              <div className="m-1 inline-flex rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur">
                {observation.category}
              </div>
            </motion.div>
          );
        })}

        {!activeTargetId && guidanceTarget ? (
          <motion.div
            key={`guidance-${guidanceTarget.id}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{
              top: `${guidanceTarget.boundingBox.y_min * 100}%`,
              left: `${guidanceTarget.boundingBox.x_min * 100}%`,
              width: `${(guidanceTarget.boundingBox.x_max - guidanceTarget.boundingBox.x_min) * 100}%`,
              height: `${(guidanceTarget.boundingBox.y_max - guidanceTarget.boundingBox.y_min) * 100}%`,
            }}
            className="absolute rounded border-[3px] border-dashed border-cyan-300/90 bg-cyan-400/5 shadow-[0_0_16px_rgba(61,220,255,0.4)]"
          >
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: [-2, 4, -2] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              className="absolute left-1/2 top-[-34px] -translate-x-1/2 rounded-full bg-background/90 px-2 py-1 text-base font-bold text-cyan-300"
            >
              ↓
            </motion.div>
            <div className="m-1 inline-flex rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-200 backdrop-blur">
              {guidanceTarget.label}
            </div>
          </motion.div>
        ) : null}

        {confirmedHazards.map((hazard) => {
          const bb = hazard.boundingBox!;
          const top = `${bb.y_min * 100}%`;
          const left = `${bb.x_min * 100}%`;
          const width = `${(bb.x_max - bb.x_min) * 100}%`;
          const height = `${(bb.y_max - bb.y_min) * 100}%`;

          return (
            <motion.div
              key={`confirmed-${hazard.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ top, left, width, height }}
              className="absolute rounded border-[3px] border-emerald-400 bg-emerald-400/10 shadow-[0_0_18px_rgba(74,222,128,0.8)]"
            >
              <div className="m-1 inline-flex rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300 backdrop-blur">
                Added to report
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
