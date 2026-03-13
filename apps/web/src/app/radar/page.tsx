"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { publicAppConfig } from "@/lib/config/public";
import { useSessionStore } from "@/store/useSessionStore";
import { getRadarTimeoutFallback, DEFAULT_DEMO_INTELLIGENCE } from "@/lib/constants/fallback";
import { toast } from "sonner";
import { motion } from "framer-motion";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function RadarPage() {
  const router = useRouter();
  const { address, agency, targetDestinations, preferenceProfile, isDemoMode, setIntelligence } = useSessionStore();
  
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
  }, [address, agency, isDemoMode, setIntelligence, targetDestinations, preferenceProfile, router]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="relative flex items-center justify-center w-64 h-64 mb-8">
        <motion.div
           className="absolute w-full h-full rounded-full border-[1.5px] border-accent/20"
           initial={{ scale: 0.5, opacity: 1 }}
           animate={{ scale: 1.5, opacity: 0 }}
           transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
           className="absolute w-full h-full rounded-full border-[1.5px] border-accent/40"
           initial={{ scale: 0.5, opacity: 1 }}
           animate={{ scale: 1.5, opacity: 0 }}
           transition={{ duration: 2.5, delay: 0.8, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
           className="absolute w-full h-full rounded-full border-[1.5px] border-accent/60"
           initial={{ scale: 0.5, opacity: 1 }}
           animate={{ scale: 1.5, opacity: 0 }}
           transition={{ duration: 2.5, delay: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        <div className="z-10 bg-card w-20 h-20 rounded-full flex items-center justify-center border border-accent/50 shadow-[0_0_20px_rgba(61,220,255,0.3)]">
          <div className="w-5 h-5 rounded-full bg-accent animate-pulse" />
        </div>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{statusText}</h2>
      <p className="text-sm text-muted-foreground mt-3 text-center max-w-sm">
        Checking local community feedback, transit, and agency background...
      </p>
    </div>
  );
}
