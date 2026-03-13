"use client";

import { useEffect, useState, ReactNode } from "react";

/**
 * Ensures Zustand persisted stores are rehydrated from sessionStorage
 * before the main app renders, avoiding hydration mismatches and
 * flashing empty state.
 */
export function StoreHydrationGate({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Wait for Next.js to mount, then hydration
    const hydrateStores = async () => {
      // In zustand persist, rehydration happens automatically on init.
      // But we just wait a tick to ensure client mount is done.
      setIsHydrated(true);
    };

    hydrateStores();
  }, []);

  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Initializing...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
