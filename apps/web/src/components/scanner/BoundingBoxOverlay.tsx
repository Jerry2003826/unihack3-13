"use client";

import { useEffect, useState } from "react";
import { useHazardStore } from "@/store/useHazardStore";
import { motion, AnimatePresence } from "framer-motion";

export function BoundingBoxOverlay() {
  const hazards = useHazardStore((state) => state.hazards);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const refreshNow = () => setNow(Date.now());
    const timeout = window.setTimeout(refreshNow, 0);
    const interval = window.setInterval(refreshNow, 1000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  const activeHazards = hazards.filter(
    (h) => h.boundingBox && now - h.detectedAt < 5000
  );

  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
      <AnimatePresence>
        {activeHazards.map((hazard) => {
          const bb = hazard.boundingBox!;
          const top = `${bb.y_min * 100}%`;
          const left = `${bb.x_min * 100}%`;
          const width = `${(bb.x_max - bb.x_min) * 100}%`;
          const height = `${(bb.y_max - bb.y_min) * 100}%`;

          // Color based on severity
          const colorClass =
            hazard.severity === "Critical"
              ? "border-destructive text-destructive bg-destructive/10"
              : hazard.severity === "High"
              ? "border-orange-500 text-orange-500 bg-orange-500/10"
              : "border-yellow-400 text-yellow-400 bg-yellow-400/10";

          return (
            <motion.div
              key={hazard.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{ top, left, width, height }}
              className={`absolute border-[3px] rounded ${colorClass} flex flex-col justify-start p-1 shadow-[0_0_15px_currentColor]`}
            >
              <div className="bg-background/90 backdrop-blur-sm w-fit px-1.5 py-0.5 text-xs font-bold rounded">
                {hazard.category}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
