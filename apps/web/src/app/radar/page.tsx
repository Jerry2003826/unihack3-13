"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RadarLoader } from "@/components/shared/RadarLoader";
import { publicAppConfig } from "@/lib/config/public";
import { useSessionStore } from "@/store/useSessionStore";
import { getRadarTimeoutFallback, DEFAULT_DEMO_INTELLIGENCE } from "@/lib/constants/fallback";
import { toast } from "sonner";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function RadarPage() {
  const router = useRouter();
  const { address, agency, coordinates, targetDestinations, preferenceProfile, isDemoMode, setIntelligence } = useSessionStore();
  
  const [statusText, setStatusText] = useState("Initializing scan...");
  const hasFetched = useRef(false);

  useEffect(() => {
    // Guards
    if (!address || !agency) {
      router.replace("/");
      return;
    }

    if (hasFetched.current) return;
    hasFetched.current = true;

    async function fetchIntelligence() {
      // Demo Mode
      if (isDemoMode) {
        setStatusText("Loading demo intelligence...");
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 2000));
        
        try {
          const res = await fetch("/mock/intelligence.json");
          if (res.ok) {
            const data = await res.json();
            setIntelligence(data.intelligence);
          } else {
            setIntelligence(DEFAULT_DEMO_INTELLIGENCE);
          }
        } catch {
          setIntelligence(DEFAULT_DEMO_INTELLIGENCE);
        }
        
        router.replace("/scan");
        return;
      }

      // Real Mode
      setStatusText("Gathering property intelligence...");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const baseUrl = publicAppConfig.apiBaseUrl;
        const res = await fetch(`${baseUrl}/api/intelligence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            inspectionMode: "live",
            depth: "fast",
            address,
            agency,
            coordinates: coordinates || undefined,
            preferenceProfile,
            targetDestinations,
          }),
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error("Failed to fetch intelligence");
        }

        const data = await res.json();
        setIntelligence(data.intelligence);
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        console.warn("Intelligence fetch failed or timed out:", getErrorMessage(err));
        // Fallback
        toast.warning("Background check timed out. Using fallback data.");
        setIntelligence(getRadarTimeoutFallback(address, agency));
      }

      router.replace("/scan");
    }

    fetchIntelligence();
  }, [address, agency, coordinates, isDemoMode, setIntelligence, targetDestinations, preferenceProfile, router]);

  return (
    <RadarLoader
      title="Property Radar"
      statusText={statusText}
      description="Checking local community feedback, transit, and agency background..."
    />
  );
}
