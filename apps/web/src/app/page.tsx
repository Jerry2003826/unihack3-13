"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AsyncStatus, GeoPoint, InspectionChecklist } from "@inspect-ai/contracts";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Cpu,
  GitCompareArrows,
  History,
  Scan,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { FallbackTrigger } from "@/components/shared/FallbackTrigger";
import { InspectionChecklistEditor } from "@/components/inspection/InspectionChecklistEditor";
import { MacroScanBackground } from "@/components/home/MacroScanBackground";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChecklistPrefill } from "@/hooks/useChecklistPrefill";
import { useListingDiscovery } from "@/hooks/useListingDiscovery";
import { saveSearchHistory } from "@/lib/history/historyStore";
import { requestCurrentLocation, reverseGeocodeCoordinates } from "@/lib/location";
import { toOptionalUrl } from "@/lib/url";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { toast } from "sonner";

const SHAPE_TYPES = [
  { id: "SUBURBAN", name: "EXTERIOR: SUBURBAN RESIDENCE" },
  { id: "TOWER", name: "EXTERIOR: HIGH-RISE APARTMENT" },
  { id: "INTERIOR", name: "INTERIOR: LIVING ROOM TOPOLOGY" },
];

type IntakeMode = "live" | "manual" | null;

export default function HomePage() {
  const router = useRouter();
  const {
    address: draftAddress,
    agency: draftAgency,
    listingUrl: draftListingUrl,
    coordinates: draftCoordinates,
    inspectionChecklist: draftInspectionChecklist,
    askingRent: draftAskingRent,
    beginInspection,
    prepareManualMode,
    updateInspectionDraft,
  } = useSessionStore();
  const { resetForNewInspection } = useHazardStore();

  const [hazardCount, setHazardCount] = useState(0);
  const [systemState, setSystemState] = useState("SUBURBAN");
  const [activeMode, setActiveMode] = useState<IntakeMode>(null);

  const [address, setAddress] = useState(draftAddress);
  const [agency, setAgency] = useState(draftAgency);
  const [listingUrl, setListingUrl] = useState(draftListingUrl);
  const [coordinates, setCoordinates] = useState<GeoPoint | null>(draftCoordinates);
  const [inspectionChecklist, setInspectionChecklist] = useState<InspectionChecklist | null>(draftInspectionChecklist);
  const [askingRent, setAskingRent] = useState(typeof draftAskingRent === "number" ? String(draftAskingRent) : "");
  const [locationStatus, setLocationStatus] = useState<AsyncStatus>("idle");
  const [isManualAddressOpen, setIsManualAddressOpen] = useState(false);
  const [isListingUrlManual, setIsListingUrlManual] = useState(Boolean(draftListingUrl.trim()));

  const normalizedListingUrl = toOptionalUrl(listingUrl);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHazardCount((current) => (current > 25 ? 0 : current + Math.floor(Math.random() * 4)));
    }, 800);

    return () => window.clearInterval(interval);
  }, []);

  const listingDiscovery = useListingDiscovery({
    address,
    agency,
    listingUrl,
    enabled: true,
    autoDetect: !isListingUrlManual && !normalizedListingUrl,
    onAutoApply: (nextListingUrl) => {
      setListingUrl(nextListingUrl);
      updateInspectionDraft({ listingUrl: nextListingUrl });
      setIsListingUrlManual(false);
    },
  });

  const checklistPrefill = useChecklistPrefill({
    address,
    agency,
    listingUrl: normalizedListingUrl,
    coordinates,
    checklist: inspectionChecklist,
    enabled: true,
    onApply: (nextChecklist) => {
      setInspectionChecklist(nextChecklist);
      updateInspectionDraft({ inspectionChecklist: nextChecklist });
    },
  });

  const hasAddress = address.trim().length > 0;
  const locationBadge =
    locationStatus === "success"
      ? { label: "Resolved", variant: "default" as const }
      : locationStatus === "fallback"
        ? { label: "Fallback", variant: "secondary" as const }
        : locationStatus === "error"
          ? { label: "Error", variant: "destructive" as const }
          : null;

  const isBreaching = systemState === "BREACHING";
  const isInterior = systemState === "INTERIOR";
  const isExiting = systemState === "EXITING";
  const isWarning = isBreaching || isExiting;

  const getStatusText = () => {
    if (isBreaching) return "CRITICAL OVERRIDE: BREACHING EXTERIOR...";
    if (isInterior) return "INTERIOR TOPOLOGY: LIVING ROOM SECURED";
    if (isExiting) return "RE-ESTABLISHING MACRO VIEW...";
    return SHAPE_TYPES.find((shape) => shape.id === systemState)?.name || "EXTERNAL MACRO SCAN";
  };
  const statusText = getStatusText();

  const handleUseCurrentLocation = async () => {
    setLocationStatus("loading");
    try {
      const nextCoordinates = await requestCurrentLocation();
      const geocoded = await reverseGeocodeCoordinates(nextCoordinates);
      setCoordinates(nextCoordinates);
      setAddress(geocoded.formattedAddress);
      if (!isListingUrlManual && listingUrl) {
        setListingUrl("");
        updateInspectionDraft({ listingUrl: "" });
        listingDiscovery.retry();
      }
      setIsManualAddressOpen(false);
      setLocationStatus(geocoded.provider === "fallback" ? "fallback" : "success");
      toast.success("Address filled from current location.");
    } catch (error) {
      setIsManualAddressOpen(true);
      setLocationStatus("error");
      toast.error(error instanceof Error ? error.message : "Failed to resolve current location.");
    }
  };

  const handleStartLiveScan = async () => {
    if (!address.trim()) {
      toast.error("Address is required");
      return;
    }
    if (!agency.trim()) {
      toast.error("Agency name is required");
      return;
    }

    beginInspection({
      mode: "live",
      address: address.trim(),
      agency: agency.trim(),
      listingUrl: normalizedListingUrl,
      coordinates,
      inspectionChecklist,
      askingRent: askingRent ? Number(askingRent) : null,
    });
    resetForNewInspection();
    await saveSearchHistory({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      type: "live",
      label: `${address.trim()} · ${agency.trim()}`,
      payload: {
        address: address.trim(),
        agency: agency.trim(),
        listingUrl: normalizedListingUrl,
        coordinates: coordinates || undefined,
        inspectionChecklist: inspectionChecklist || undefined,
      },
    });
    router.push("/radar");
  };

  const handleManualUpload = () => {
    prepareManualMode();
    resetForNewInspection();
    updateInspectionDraft({
      address: address.trim(),
      agency: agency.trim(),
      listingUrl: normalizedListingUrl,
      coordinates,
      inspectionChecklist,
      askingRent: askingRent ? Number(askingRent) : null,
    });
    router.push("/manual");
  };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#090B12] text-[#E7ECF3] selection:bg-[#3DDCFF] selection:text-[#090B12]">
      <style jsx global>{`
        @keyframes scan-line {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(400%);
          }
        }

        @keyframes float-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .inspect-animate-scan {
          animation: scan-line 2s linear infinite;
        }

        .inspect-animate-fade-up {
          animation: float-up 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .inspect-crt-overlay {
          background:
            linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
            linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
          background-size: 100% 4px, 6px 100%;
          pointer-events: none;
        }
      `}</style>

      <FallbackTrigger />
      <MacroScanBackground onStateChange={setSystemState} />
      <div className="inspect-crt-overlay absolute inset-0 z-[5]" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_10%,#090B12_100%)] opacity-95">
        <div className="absolute inset-y-0 left-0 w-full lg:w-1/2 bg-gradient-to-r from-[#090B12]/95 via-[#090B12]/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#090B12]/95 to-transparent" />
      </div>

      <main className="relative z-20 flex min-h-[100dvh] flex-col px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <div className="flex flex-1 flex-col">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 bg-[#090B12]/60 px-3 text-white hover:bg-white/10"
              onClick={() => router.push("/compare")}
            >
              <GitCompareArrows className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 bg-[#090B12]/60 px-3 text-white hover:bg-white/10"
              onClick={() => router.push("/history")}
            >
              <History className="size-4" />
            </Button>
          </div>

          <section className="mt-8 max-w-[22rem] space-y-5">
            <div
              className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-500 ${
                isWarning
                  ? "border-[#FF2A3F]/80 bg-[#FF2A3F]/20 text-[#FF2A3F]"
                  : isInterior
                    ? "border-[#29D391]/80 bg-[#29D391]/10 text-[#29D391]"
                    : "border-[#3DDCFF]/40 bg-[#090B12]/60 text-[#3DDCFF]"
              }`}
            >
              {isWarning ? (
                <AlertTriangle className="size-4 animate-pulse" />
              ) : isInterior ? (
                <ShieldCheck className="size-4" />
              ) : (
                <Activity className="size-4 animate-pulse" />
              )}
              <span className="truncate">{isWarning ? "BREACH PROTOCOL INIT" : isInterior ? "MICRO-SCALE MAPPING" : "MACRO-SCALE MAPPING"}</span>
            </div>

            <h1
              className="text-[3.4rem] font-black leading-none tracking-tighter text-white drop-shadow-2xl"
              style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
            >
              Rent
              <span className="bg-gradient-to-r from-[#3DDCFF] to-[#29D391] bg-clip-text text-transparent">Radar</span>
            </h1>

            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-[#3DDCFF]">
              Scan Deeper. Rent Smarter.
            </div>

            <p className="max-w-[23rem] text-sm font-light leading-relaxed text-gray-300 drop-shadow-md">
              An AI-first rental inspection copilot built for faster screening, stronger evidence capture, and
              smarter lease decisions.
              <span className="font-medium text-white"> Move past surface impressions and inspect what actually matters.</span>
            </p>

            <div className="flex max-w-sm flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveMode("live")}
                className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#3DDCFF] px-5 py-4 text-base font-bold text-[#090B12] shadow-[0_0_30px_rgba(0,0,0,0.4)] transition-all duration-700 active:scale-95"
              >
                <span className="absolute inset-0 translate-y-full bg-white/30 transition-transform duration-300 group-hover:translate-y-0" />
                <Scan className="relative z-10 size-5" />
                <span className="relative z-10 tracking-wide">Enter Deep Scan</span>
                <ChevronRight className="relative z-10 size-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("manual")}
                className="group flex items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-4 font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10"
              >
                <Upload className="size-5 text-gray-400 transition-colors group-hover:text-white" />
                <span>Manual Override</span>
              </button>
            </div>
          </section>

          <div className="mt-auto space-y-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-8">
            <section className="rounded-[26px] border border-[#3DDCFF]/20 bg-[#090B12]/80 shadow-[0_15px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
              <div className="border-b border-[#3DDCFF]/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#3DDCFF]">TARGET LOCK</div>
                    <div className="max-w-[14rem] font-mono text-xs font-semibold tracking-wider text-white">
                      {statusText}
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded border border-[#3DDCFF]/40 bg-[#3DDCFF]/15 px-2.5 py-1 text-[10px] font-mono text-[#3DDCFF]">
                    <div className="size-1.5 animate-pulse rounded-full bg-[#3DDCFF]" />
                    {isInterior ? "MICRO-SCAN" : "MACRO-SCAN"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4">
                <div
                  className={`rounded-xl border p-3 transition-all duration-500 ${
                    hazardCount > 0 ? "border-[#FF2A3F]/40 bg-[#FF2A3F]/15" : "border-[#3DDCFF]/10 bg-[#3DDCFF]/5"
                  }`}
                >
                  <div className={`mb-1 text-[10px] font-mono uppercase tracking-wider ${hazardCount > 0 ? "text-[#FF2A3F]" : "text-[#3DDCFF]"}`}>
                    Detected Hazards
                  </div>
                  <div className={`flex items-center gap-2 font-mono text-2xl font-bold ${hazardCount > 0 ? "text-[#FF2A3F]" : "text-[#3DDCFF]"}`}>
                    {hazardCount.toString().padStart(2, "0")}
                    {hazardCount > 0 ? <span className="size-2 rounded-full bg-[#FF2A3F] animate-ping" /> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-[#3DDCFF]/20 bg-[#3DDCFF]/10 p-3">
                  <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-[#3DDCFF]">Data Integrity</div>
                  <div className="font-mono text-2xl font-bold text-[#3DDCFF]">{Math.max(0, 100 - hazardCount)}%</div>
                </div>
              </div>
            </section>

            <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
              LATENCY: 12MS // PROTOCOL: {isInterior ? "INDOOR_MAPPING" : "EXTERIOR_SYNC"}
            </div>
          </div>
        </div>
      </main>

      <div className="pointer-events-none absolute inset-0 z-20 hidden overflow-hidden lg:block">
        <div className="absolute left-4 right-4 top-4 flex justify-end gap-2 sm:left-auto sm:right-8 sm:top-8 lg:right-12 lg:top-10">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto border-white/15 bg-[#090B12]/60 px-3 text-white hover:bg-white/10"
            onClick={() => router.push("/compare")}
          >
            <GitCompareArrows className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Compare</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto border-white/15 bg-[#090B12]/60 px-3 text-white hover:bg-white/10"
            onClick={() => router.push("/history")}
          >
            <History className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">History</span>
          </Button>
        </div>

        <div
          className="inspect-animate-fade-up absolute left-4 right-4 top-20 max-w-[22rem] space-y-5 sm:left-10 sm:right-auto sm:top-12 sm:max-w-xl sm:space-y-6 lg:left-16 lg:top-16"
        >
          <div
            className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-500 sm:tracking-[0.2em] ${
              isWarning
                ? "border-[#FF2A3F]/80 bg-[#FF2A3F]/20 text-[#FF2A3F]"
                : isInterior
                  ? "border-[#29D391]/80 bg-[#29D391]/10 text-[#29D391]"
                  : "border-[#3DDCFF]/40 bg-[#090B12]/60 text-[#3DDCFF]"
            }`}
          >
            {isWarning ? (
              <AlertTriangle className="size-4 animate-pulse" />
            ) : isInterior ? (
              <ShieldCheck className="size-4" />
            ) : (
              <Activity className="size-4 animate-pulse" />
            )}
            <span className="truncate">{isWarning ? "BREACH PROTOCOL INIT" : isInterior ? "MICRO-SCALE MAPPING" : "MACRO-SCALE MAPPING"}</span>
          </div>

          <h1
            className="text-[3.8rem] font-black leading-none tracking-tighter text-white drop-shadow-2xl sm:text-7xl lg:text-8xl"
            style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            Rent
            <span className="bg-gradient-to-r from-[#3DDCFF] to-[#29D391] bg-clip-text text-transparent">Radar</span>
          </h1>

          <div className="text-sm font-semibold uppercase tracking-[0.22em] text-[#3DDCFF] sm:text-base">
            Scan Deeper. Rent Smarter.
          </div>

          <p className="max-w-[23rem] text-sm font-light leading-relaxed text-gray-300 drop-shadow-md sm:max-w-lg sm:text-base md:text-xl">
            An AI-first rental inspection copilot built for faster screening, stronger evidence capture, and smarter
            lease decisions.
            <span className="font-medium text-white"> Move past surface impressions and inspect what actually matters.</span>
          </p>

          <div className="flex max-w-sm flex-col gap-3 pt-2 sm:flex-row sm:gap-4 sm:pt-4">
            <button
              type="button"
              onClick={() => setActiveMode("live")}
              className="pointer-events-auto group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#3DDCFF] px-5 py-4 text-base font-bold text-[#090B12] shadow-[0_0_30px_rgba(0,0,0,0.4)] transition-all duration-700 hover:scale-[1.02] active:scale-95 sm:px-6"
            >
              <span className="absolute inset-0 translate-y-full bg-white/30 transition-transform duration-300 group-hover:translate-y-0" />
              <Scan className="relative z-10 size-5" />
              <span className="relative z-10 tracking-wide">Enter Deep Scan</span>
              <ChevronRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("manual")}
              className="pointer-events-auto group flex items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-4 font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10 sm:px-6"
            >
              <Upload className="size-5 text-gray-400 transition-colors group-hover:text-white" />
              <span>Manual Override</span>
            </button>
          </div>
        </div>

        <div
          className="inspect-animate-fade-up absolute inset-x-4 bottom-20 z-50 sm:inset-x-auto sm:bottom-24 sm:right-8 sm:w-72 md:w-80 lg:bottom-24 lg:right-12"
          style={{ animationDelay: "200ms" }}
        >
          <div className="relative w-full overflow-hidden rounded-[26px] border border-[#3DDCFF]/20 bg-[#090B12]/80 shadow-[0_15px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-500 hover:scale-[1.02]">
            <div className="pointer-events-none absolute inset-0">
              <div className="inspect-animate-scan h-0.5 w-full bg-[#3DDCFF] opacity-50 shadow-[0_0_15px_currentColor]" />
            </div>

            <div className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-6">
              <div className="flex items-start justify-between border-b border-[#3DDCFF]/20 pb-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#3DDCFF]">TARGET LOCK</div>
                  <div key={statusText} className="inspect-animate-fade-up max-w-[14rem] font-mono text-xs font-semibold tracking-wider text-white sm:max-w-none sm:text-sm">
                    {statusText}
                  </div>
                </div>
                <Cpu className="size-5 animate-spin text-[#3DDCFF]" style={{ animationDuration: "4s" }} />
              </div>

              <div className="mt-1 grid grid-cols-2 gap-3">
                <div
                  className={`rounded-xl border p-3 transition-all duration-500 ${
                    hazardCount > 0 ? "border-[#FF2A3F]/40 bg-[#FF2A3F]/15" : "border-[#3DDCFF]/10 bg-[#3DDCFF]/5"
                  }`}
                >
                  <div className={`mb-1 text-[10px] font-mono uppercase tracking-wider ${hazardCount > 0 ? "text-[#FF2A3F]" : "text-[#3DDCFF]"}`}>
                    Detected Hazards
                  </div>
                  <div className={`flex items-center gap-2 font-mono text-2xl font-bold ${hazardCount > 0 ? "text-[#FF2A3F]" : "text-[#3DDCFF]"}`}>
                    {hazardCount.toString().padStart(2, "0")}
                    {hazardCount > 0 ? <span className="size-2 rounded-full bg-[#FF2A3F] animate-ping" /> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-[#3DDCFF]/20 bg-[#3DDCFF]/10 p-3">
                  <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-[#3DDCFF]">Data Integrity</div>
                  <div className="font-mono text-2xl font-bold text-[#3DDCFF]">{Math.max(0, 100 - hazardCount)}%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute -top-3 right-3 hidden items-center gap-1.5 rounded border border-[#3DDCFF]/40 bg-[#3DDCFF]/15 px-3 py-1.5 text-[10px] font-mono text-[#3DDCFF] shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-md sm:flex">
            <div className="size-1.5 animate-pulse rounded-full bg-[#3DDCFF]" />
            {isInterior ? "MICRO-SCAN" : "MACRO-SCAN"}
          </div>
        </div>

        <div
          className="inspect-animate-fade-up absolute bottom-4 left-4 hidden text-[10px] font-mono uppercase tracking-widest text-gray-500 sm:bottom-10 sm:left-10 sm:block lg:bottom-12 lg:left-16"
          style={{ animationDelay: "400ms" }}
        >
          LATENCY: 12MS // PROTOCOL: {isInterior ? "INDOOR_MAPPING" : "EXTERIOR_SYNC"}
        </div>
      </div>

      {activeMode ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4 lg:items-end lg:justify-start lg:px-16 lg:pb-8">
          <div className="pointer-events-auto flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1220]/92 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:max-h-[calc(100dvh-2rem)] lg:max-h-[min(86dvh,880px)]">
            <div className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#3DDCFF]">
                  {activeMode === "live" ? "LIVE INTAKE" : "MANUAL INTAKE"}
                </div>
                <div className="text-xl font-semibold text-white">
                  {activeMode === "live" ? "Configure Deep Scan" : "Prepare Manual Override"}
                </div>
                <p className="text-sm text-slate-400">
                  Keep the cinematic shell, but continue using the full inspection intake below.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={() => setActiveMode(null)}
              >
                <X className="size-5" />
              </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white/90">Property Address</span>
                    {locationBadge ? <Badge variant={locationBadge.variant}>{locationBadge.label}</Badge> : null}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="space-y-3">
                      <Button
                        className="w-full bg-[#3DDCFF] text-[#090B12] hover:bg-[#3DDCFF]/90"
                        onClick={handleUseCurrentLocation}
                        type="button"
                        disabled={locationStatus === "loading"}
                      >
                        {locationStatus === "loading"
                          ? "Locating..."
                          : hasAddress
                            ? "Refresh Current Location"
                            : "Use Current Location"}
                      </Button>
                      {hasAddress ? (
                        <div className="rounded-xl border border-white/10 bg-[#090B12]/70 p-3">
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            {locationStatus === "success" || locationStatus === "fallback" ? "Resolved Address" : "Saved Address"}
                          </p>
                          <p className="mt-2 text-sm font-medium text-white">{address}</p>
                          {coordinates ? (
                            <p className="mt-2 text-xs text-slate-400">
                              {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          Tap once to use your current location and auto-fill the property address.
                        </p>
                      )}
                      {locationStatus === "error" ? (
                        <p className="text-xs text-[#FF7A85]">
                          We could not access your current location. Enter the address manually below.
                        </p>
                      ) : null}
                      <div className="space-y-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsManualAddressOpen((open) => !open)}
                          type="button"
                          className="h-auto justify-start px-0 text-sm text-[#3DDCFF] hover:bg-transparent hover:text-white"
                        >
                          {isManualAddressOpen
                            ? "Hide manual address entry"
                            : hasAddress
                              ? "Edit address manually"
                              : "Enter address manually"}
                        </Button>
                        {isManualAddressOpen ? (
                          <Input
                            id="address"
                            aria-label="Property Address"
                            placeholder="e.g. 15 Dandenong Rd, Clayton"
                            value={address}
                            onChange={(event) => {
                              setAddress(event.target.value);
                              if (!isListingUrlManual && listingUrl) {
                                setListingUrl("");
                                updateInspectionDraft({ listingUrl: "" });
                                listingDiscovery.retry();
                              }
                              if (locationStatus !== "loading") {
                                setLocationStatus("idle");
                              }
                            }}
                            className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 focus-visible:ring-[#3DDCFF]"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="agency" className="text-sm font-medium text-white/90">
                      Real Estate Agency
                    </label>
                    <Input
                      id="agency"
                      placeholder="e.g. Ray White Clayton"
                      value={agency}
                      onChange={(event) => setAgency(event.target.value)}
                      className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 focus-visible:ring-[#3DDCFF]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="asking-rent" className="text-sm font-medium text-white/90">
                      Weekly Rent (Optional)
                    </label>
                    <Input
                      id="asking-rent"
                      inputMode="numeric"
                      placeholder="e.g. 620"
                      value={askingRent}
                      onChange={(event) => setAskingRent(event.target.value.replace(/[^\d]/g, ""))}
                      className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 focus-visible:ring-[#3DDCFF]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="listing-url" className="text-sm font-medium text-white/90">
                      Property Listing Link (Optional)
                    </label>
                    <Input
                      id="listing-url"
                      placeholder="Paste the Realestate, Domain, or agent listing page URL"
                      value={listingUrl}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setListingUrl(nextValue);
                        setIsListingUrlManual(nextValue.trim().length > 0);
                        updateInspectionDraft({ listingUrl: nextValue });
                      }}
                      className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 focus-visible:ring-[#3DDCFF]"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <span>Leave this blank and we&apos;ll try to infer a listing page from the address.</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto px-0 text-xs text-[#3DDCFF] hover:bg-transparent hover:text-white"
                        onClick={() => {
                          setListingUrl("");
                          setIsListingUrlManual(false);
                          updateInspectionDraft({ listingUrl: "" });
                          listingDiscovery.retry();
                        }}
                      >
                        Auto-detect from address
                      </Button>
                    </div>
                    {listingDiscovery.status !== "idle" || normalizedListingUrl ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            Listing discovery
                          </div>
                          <Badge
                            variant={
                              listingDiscovery.status === "success"
                                ? "default"
                                : listingDiscovery.status === "loading"
                                  ? "secondary"
                                  : listingDiscovery.status === "error"
                                    ? "destructive"
                                    : "outline"
                            }
                          >
                            {normalizedListingUrl ? "linked" : listingDiscovery.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          {listingDiscovery.status === "loading"
                            ? "Searching for likely rental listing pages that match this address..."
                            : listingDiscovery.summary || "You can paste the exact listing page URL if you already have it."}
                        </p>
                        {normalizedListingUrl ? (
                          <a
                            href={normalizedListingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block break-all text-xs text-[#3DDCFF] underline-offset-4 hover:underline"
                          >
                            {normalizedListingUrl}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-white/90">Inspection Notes & Entry Condition (Optional)</div>
                <p className="text-xs text-slate-400">
                  Capture the practical items that affect move-in risk, lease clarity, utilities, and daily livability.
                </p>
                {checklistPrefill.status !== "idle" ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        Remote checklist assist
                      </div>
                      <Badge
                        variant={
                          checklistPrefill.status === "success"
                            ? "default"
                            : checklistPrefill.status === "loading"
                              ? "secondary"
                              : checklistPrefill.status === "error"
                                ? "destructive"
                                : "outline"
                        }
                      >
                        {checklistPrefill.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {checklistPrefill.status === "loading"
                        ? "Searching Google Maps and web sources to prefill the checklist..."
                        : checklistPrefill.summary}
                    </p>
                    {checklistPrefill.status === "fallback" || checklistPrefill.status === "error" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-auto px-0 text-xs text-[#3DDCFF] hover:bg-transparent hover:text-white"
                        onClick={checklistPrefill.retry}
                      >
                        Retry remote prefill
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <InspectionChecklistEditor
                  value={inspectionChecklist}
                  onChange={(nextChecklist) => {
                    setInspectionChecklist(nextChecklist);
                    updateInspectionDraft({ inspectionChecklist: nextChecklist });
                  }}
                  onFieldEdit={checklistPrefill.markFieldAsManual}
                  autoFilledFieldKeys={checklistPrefill.autoFilledFieldKeys}
                  compact
                />
              </div>
            </div>

            <div className="shrink-0 border-t border-white/10 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {activeMode === "live" ? "Ready for guided radar scan" : "Ready for manual photo upload"}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant={activeMode === "manual" ? "outline" : "secondary"}
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={handleManualUpload}
                >
                  <Upload className="mr-2 size-4" />
                  Continue to Manual Upload
                </Button>
                <Button className="bg-[#3DDCFF] text-[#090B12] hover:bg-[#3DDCFF]/90" onClick={() => void handleStartLiveScan()}>
                  <Scan className="mr-2 size-4" />
                  Start Live Scan
                </Button>
              </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
