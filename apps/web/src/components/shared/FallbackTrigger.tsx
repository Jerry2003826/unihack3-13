"use client";

import { useCallback } from "react";
import { publicAppConfig } from "@/lib/config/public";
import { useSessionStore } from "@/store/useSessionStore";
import { toast } from "sonner";

export function FallbackTrigger() {
  const isDemoMode = useSessionStore((state) => state.isDemoMode);
  const setIsDemoMode = useSessionStore((state) => state.setIsDemoMode);

  const handleToggle = useCallback(() => {
    const nextState = !isDemoMode;
    setIsDemoMode(nextState);
    toast(nextState ? "Demo mode enabled" : "Demo mode disabled");
  }, [isDemoMode, setIsDemoMode]);

  if (!publicAppConfig.demoModeEnabled) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={isDemoMode}
      className="fixed bottom-4 right-4 z-50 rounded-full border border-accent/40 bg-background/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg shadow-black/15 backdrop-blur"
    >
      {isDemoMode ? "Disable Demo Mode" : "Enable Demo Mode"}
    </button>
  );
}
