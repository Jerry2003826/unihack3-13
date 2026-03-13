"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type {
  EvidenceItem,
  Hazard,
  IntelligenceResponse,
  NegotiateResponse,
  ReportSnapshot,
  SignedAssetGetResponse,
} from "@inspect-ai/contracts";
import {
  intelligenceResponseSchema,
  negotiateResponseSchema,
  reportSnapshotSchema,
  signedAssetGetResponseSchema,
} from "@inspect-ai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { publicAppConfig } from "@/lib/config/public";
import { exportReportPdf, exportReportPoster } from "@/lib/export/pdfGenerator";
import {
  getReportSnapshot,
  saveReportSnapshot,
  updateReportSnapshot,
} from "@/lib/report-snapshot/reportSnapshotStore";
import { calculatePropertyRiskScore, getRiskDrivers } from "@/lib/scoring";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { ArrowLeft, FileDown, FileImage, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type AsyncStatus = "idle" | "loading" | "success" | "error";

const RECOMMENDATION_FALLBACK =
  "Recommendation unavailable. Proceed with a standard inspection checklist before signing.";

function isValidReportId(value: string) {
  return /^[a-zA-Z0-9-]{8,128}$/.test(value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function getSeverityClasses(severity: Hazard["severity"]) {
  switch (severity) {
    case "Critical":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "High":
      return "border-orange-400/40 bg-orange-400/10 text-orange-200";
    case "Medium":
      return "border-yellow-400/40 bg-yellow-400/10 text-yellow-200";
    case "Low":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }
}

function getConfidenceClasses(confidence: EvidenceItem["confidence"]) {
  switch (confidence) {
    case "high":
      return "text-emerald-300";
    case "medium":
      return "text-yellow-300";
    case "low":
      return "text-muted-foreground";
  }
}

function getRiskTone(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-cyan-300";
  if (score >= 40) return "text-yellow-300";
  return "text-destructive";
}

function buildRecoverySnapshot(reportId: string): ReportSnapshot | null {
  const session = useSessionStore.getState();
  const hazards = useHazardStore.getState().hazards;

  if (session.reportId !== reportId || !session.intelligence) {
    return null;
  }

  return reportSnapshotSchema.parse({
    reportId,
    inspectionId: session.inspectionId ?? crypto.randomUUID(),
    createdAt: Date.now(),
    inputs: {
      mode: session.inspectionMode,
      address: session.address || undefined,
      agency: session.agency || undefined,
      coordinates: session.coordinates || undefined,
      propertyNotes: session.propertyNotes || undefined,
      targetDestinations: session.targetDestinations,
      preferenceProfile: session.preferenceProfile || undefined,
    },
    hazards,
    intelligence: session.intelligence || undefined,
    propertyRiskScore: calculatePropertyRiskScore(hazards),
  });
}

function hasRecommendationBundle(snapshot: ReportSnapshot) {
  return Boolean(
    snapshot.recommendation &&
      snapshot.fitScore &&
      snapshot.evidenceSummary &&
      snapshot.inspectionCoverage &&
      snapshot.preLeaseActionGuide
  );
}

async function fetchJsonWithTimeout<T>(args: {
  url: string;
  body: unknown;
  signal: AbortSignal;
  timeoutMs: number;
  parse: (value: unknown) => T;
}) {
  const timeoutController = new AbortController();
  const handleAbort = () => timeoutController.abort();
  args.signal.addEventListener("abort", handleAbort);
  const timeoutId = window.setTimeout(() => timeoutController.abort(), args.timeoutMs);

  try {
    const response = await fetch(args.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args.body),
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return args.parse(await response.json());
  } finally {
    window.clearTimeout(timeoutId);
    args.signal.removeEventListener("abort", handleAbort);
  }
}

function ThumbnailPreview({
  snapshot,
  hazard,
  signedThumbnailUrls,
}: {
  snapshot: ReportSnapshot;
  hazard: Hazard;
  signedThumbnailUrls: Record<string, string>;
}) {
  const thumbnail = snapshot.exportAssets?.hazardThumbnails?.find((item) => item.hazardId === hazard.id);
  const base64 = thumbnail?.base64;
  const signedUrl = thumbnail?.derivedThumbnailObjectKey
    ? signedThumbnailUrls[thumbnail.derivedThumbnailObjectKey]
    : undefined;

  if (base64) {
    const src = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
    return (
      <Image
        src={src}
        alt={`${hazard.category} evidence`}
        width={112}
        height={84}
        unoptimized
        className="h-full w-full object-cover"
      />
    );
  }

  if (signedUrl) {
    return (
      <Image
        src={signedUrl}
        alt={`${hazard.category} evidence`}
        width={112}
        height={84}
        unoptimized
        crossOrigin="anonymous"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-muted text-[11px] text-muted-foreground">
      Image unavailable
    </div>
  );
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const reportId = typeof params.id === "string" ? params.id : "";

  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [deepStatus, setDeepStatus] = useState<AsyncStatus>("idle");
  const [recommendationStatus, setRecommendationStatus] = useState<AsyncStatus>("idle");
  const [lazyError, setLazyError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<"pdf" | "poster" | null>(null);
  const [signedThumbnailUrls, setSignedThumbnailUrls] = useState<Record<string, string>>({});
  const enrichmentStartedRef = useRef<string | null>(null);
  const reportContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!reportId || !isValidReportId(reportId)) {
      router.replace("/");
      return;
    }

    let isActive = true;

    async function boot() {
      const stored = await getReportSnapshot(reportId);
      const parsedStored = stored ? reportSnapshotSchema.safeParse(stored) : null;

      if (!isActive) {
        return;
      }

      if (parsedStored?.success) {
        const normalized = {
          ...parsedStored.data,
          propertyRiskScore: calculatePropertyRiskScore(parsedStored.data.hazards),
        };
        setSnapshot(normalized);
        setDeepStatus(hasRecommendationBundle(normalized) ? "success" : "idle");
        setRecommendationStatus(hasRecommendationBundle(normalized) ? "success" : "idle");
        setIsBooting(false);

        if (normalized.propertyRiskScore !== parsedStored.data.propertyRiskScore) {
          updateReportSnapshot(reportId, { propertyRiskScore: normalized.propertyRiskScore }).catch(console.error);
        }
        return;
      }

      const recovered = buildRecoverySnapshot(reportId);
      if (recovered) {
        await saveReportSnapshot(recovered);
        if (!isActive) {
          return;
        }
        setSnapshot(recovered);
        setIsBooting(false);
        return;
      }

      router.replace("/");
    }

    boot().catch(() => {
      router.replace("/");
    });

    return () => {
      isActive = false;
    };
  }, [reportId, router]);

  useEffect(() => {
    if (!snapshot || isBooting || enrichmentStartedRef.current === snapshot.reportId || hasRecommendationBundle(snapshot)) {
      return;
    }

    enrichmentStartedRef.current = snapshot.reportId;
    const controller = new AbortController();
    const currentReportId = snapshot.reportId;
    const currentSnapshot = snapshot;

    async function applyPatch(patch: Partial<ReportSnapshot>) {
      setSnapshot((current) => {
        if (!current) {
          return current;
        }
        return reportSnapshotSchema.parse({
          ...current,
          ...patch,
          propertyRiskScore:
            patch.propertyRiskScore ?? calculatePropertyRiskScore(patch.hazards ?? current.hazards),
        });
      });
      await updateReportSnapshot(currentReportId, patch);
    }

    async function enrich() {
      let latestIntelligence = currentSnapshot.intelligence;

      if (currentSnapshot.inputs.address || currentSnapshot.inputs.coordinates) {
        setDeepStatus("loading");
        try {
          const intelligenceResponse = await fetchJsonWithTimeout<IntelligenceResponse>({
            url: resolveApiUrl("/api/intelligence"),
            signal: controller.signal,
            timeoutMs: 20_000,
            body: {
              inspectionMode: currentSnapshot.inputs.mode,
              depth: "full",
              address: currentSnapshot.inputs.address,
              agency: currentSnapshot.inputs.agency,
              coordinates: currentSnapshot.inputs.coordinates,
              propertyNotes: currentSnapshot.inputs.propertyNotes,
              targetDestinations: currentSnapshot.inputs.targetDestinations,
              preferenceProfile: currentSnapshot.inputs.preferenceProfile,
            },
            parse: (value) => intelligenceResponseSchema.parse(value),
          });

          latestIntelligence = intelligenceResponse.intelligence;
          await applyPatch({ intelligence: latestIntelligence });
          setDeepStatus("success");
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }
          setDeepStatus("error");
          setLazyError(`Deep intelligence failed: ${getErrorMessage(error)}`);
        }
      }

      setRecommendationStatus("loading");

      try {
        const recommendationResponse = await fetchJsonWithTimeout<NegotiateResponse>({
          url: resolveApiUrl("/api/negotiate"),
          signal: controller.signal,
          timeoutMs: 20_000,
          body: {
            inspectionMode: currentSnapshot.inputs.mode,
            hazards: currentSnapshot.hazards,
            intelligence: latestIntelligence ?? currentSnapshot.intelligence,
            preferenceProfile: currentSnapshot.inputs.preferenceProfile,
          },
          parse: (value) => negotiateResponseSchema.parse(value),
        });

        await applyPatch({
          intelligence: latestIntelligence ?? currentSnapshot.intelligence,
          recommendation: recommendationResponse.decisionRecommendation,
          fitScore: recommendationResponse.fitScore,
          evidenceSummary: recommendationResponse.evidenceSummary,
          inspectionCoverage: recommendationResponse.inspectionCoverage,
          preLeaseActionGuide: recommendationResponse.preLeaseActionGuide,
        });

        setRecommendationStatus("success");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setRecommendationStatus("error");
        setLazyError(RECOMMENDATION_FALLBACK);
        toast.warning(`Recommendation fallback in use: ${getErrorMessage(error)}`);
      }
    }

    enrich().catch((error) => {
      if (!controller.signal.aborted) {
        setRecommendationStatus("error");
        setLazyError(RECOMMENDATION_FALLBACK);
        console.error(error);
      }
    });

    return () => {
      controller.abort();
    };
  }, [isBooting, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const objectKeys = snapshot.exportAssets?.hazardThumbnails
      ?.map((item) => item.derivedThumbnailObjectKey)
      .filter((value): value is string => Boolean(value))
      .filter((value) => !(value in signedThumbnailUrls));

    if (!objectKeys?.length) {
      return;
    }

    const controller = new AbortController();

    async function loadSignedUrls() {
      try {
        const response = await fetch(resolveApiUrl("/api/assets/sign-get"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectKeys }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Signed asset request failed with ${response.status}`);
        }

        const payload: SignedAssetGetResponse = signedAssetGetResponseSchema.parse(await response.json());
        setSignedThumbnailUrls((current) => ({
          ...current,
          ...Object.fromEntries(payload.downloads.map((item) => [item.objectKey, item.downloadUrl])),
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Failed to recover signed thumbnail URLs", error);
        }
      }
    }

    loadSignedUrls();

    return () => {
      controller.abort();
    };
  }, [signedThumbnailUrls, snapshot]);

  const riskState = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    return getRiskDrivers(snapshot.hazards);
  }, [snapshot]);

  if (isBooting || !snapshot || !riskState) {
    return <ReportLoadingState />;
  }

  const severityBreakdown = riskState.breakdown;
  const isReportStable = deepStatus !== "loading" && recommendationStatus !== "loading" && !isBooting;

  async function handleExport(type: "pdf" | "poster") {
    if (!snapshot || !reportContentRef.current) {
      return;
    }

    if (!isReportStable) {
      toast.info("Wait for the report to finish stabilizing before exporting.");
      return;
    }

    try {
      setIsExporting(type);
      if (type === "pdf") {
        await exportReportPdf({ reportNode: reportContentRef.current, snapshot });
      } else {
        await exportReportPoster({ reportNode: reportContentRef.current, snapshot });
      }
      toast.success(type === "pdf" ? "PDF exported." : "Poster exported.");
    } catch (error) {
      toast.error(`Export failed: ${getErrorMessage(error)}`);
    } finally {
      setIsExporting(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-20 pt-6 sm:px-6">
      <div ref={reportContentRef} className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")} data-export-ignore="true">
              <ArrowLeft className="mr-1 size-4" />
              Back Home
            </Button>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-accent/15 text-accent">Report Snapshot</Badge>
                <Badge variant="outline" className="border-border/70 text-muted-foreground">
                  {snapshot.inputs.mode.toUpperCase()}
                </Badge>
                <Badge variant="outline" className="border-border/70 text-muted-foreground">
                  {formatTimestamp(snapshot.createdAt)}
                </Badge>
              </div>
              <h1 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {snapshot.inputs.address || "Inspection Report"}
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                AI-assisted report snapshot for the current browser only. Refresh-safe, but not a public share link.
              </p>
            </div>
          </div>

          <div
            data-export-ignore="true"
            className="flex flex-col items-start gap-2 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              {deepStatus === "loading" ? <Loader2 className="size-4 animate-spin text-accent" /> : null}
              Deep intelligence: {deepStatus}
            </div>
            <div className="flex items-center gap-2">
              {recommendationStatus === "loading" ? <Loader2 className="size-4 animate-spin text-accent" /> : null}
              Recommendation: {recommendationStatus}
            </div>
          </div>
        </div>

        {lazyError ? (
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/8 px-4 py-3 text-sm text-yellow-100">
            {lazyError}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>1. Property Risk Score</CardDescription>
              <CardTitle>Beta / Heuristic risk index</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-4">
                <div className={`text-5xl font-semibold ${getRiskTone(snapshot.propertyRiskScore)}`}>
                  {snapshot.propertyRiskScore}
                </div>
                <div className="pb-1 text-sm text-muted-foreground">out of 100</div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(severityBreakdown).map(([severity, count]) => (
                  <div key={severity} className="rounded-xl border border-border/70 bg-muted/30 p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{severity}</div>
                    <div className="mt-2 text-2xl font-semibold text-foreground">{count}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                {riskState.drivers.length > 0 ? (
                  riskState.drivers.map((driver) => <div key={driver}>{driver}</div>)
                ) : (
                  <div>No hazards detected. Coverage may still be incomplete.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>2. Fit Score</CardDescription>
              <CardTitle>Suitability against current signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {snapshot.fitScore ? (
                <>
                  <div className="flex items-end gap-4">
                    <div className="text-5xl font-semibold text-accent">{snapshot.fitScore.score}</div>
                    <div className="pb-1 text-sm text-muted-foreground">out of 100</div>
                  </div>
                  <p className="text-sm text-muted-foreground">{snapshot.fitScore.summary}</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {snapshot.fitScore.drivers.map((driver) => (
                      <div key={driver}>{driver}</div>
                    ))}
                  </div>
                </>
              ) : (
                <ReportSectionSkeleton copy="Loading fit score after recommendation completes..." />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 xl:col-span-2" data-export-ignore="true">
            <CardHeader>
              <CardDescription>3. Decision Recommendation</CardDescription>
              <CardTitle>Should you proceed with this property?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {snapshot.recommendation ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className="bg-accent/15 px-3 py-1 text-sm text-accent">
                      {snapshot.recommendation.outcome}
                    </Badge>
                    <div className="text-sm text-muted-foreground">{snapshot.recommendation.summary}</div>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    {snapshot.recommendation.reasons.map((reason) => (
                      <div key={reason}>{reason}</div>
                    ))}
                  </div>
                </>
              ) : recommendationStatus === "error" ? (
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  {RECOMMENDATION_FALLBACK}
                </div>
              ) : (
                <ReportSectionSkeleton copy="Generating decision guidance..." />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 xl:col-span-2">
            <CardHeader>
              <CardDescription>4. Hazard List</CardDescription>
              <CardTitle>{snapshot.hazards.length > 0 ? `${snapshot.hazards.length} detected hazards` : "No hazards detected"}</CardTitle>
            </CardHeader>
            <CardContent>
              {snapshot.hazards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No hazards detected in the current snapshot. Keep using a standard physical inspection checklist before signing.
                </div>
              ) : (
                <div className="grid gap-3">
                  {snapshot.hazards.map((hazard) => (
                    <div
                      key={hazard.id}
                      className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[112px_1fr]"
                    >
                      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border/70 bg-card">
                        <ThumbnailPreview
                          snapshot={snapshot}
                          hazard={hazard}
                          signedThumbnailUrls={signedThumbnailUrls}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={getSeverityClasses(hazard.severity)}>{hazard.severity}</Badge>
                          <Badge variant="outline" className="border-border/70 text-muted-foreground">
                            {hazard.category}
                          </Badge>
                          {hazard.roomType ? (
                            <Badge variant="outline" className="border-border/70 text-muted-foreground">
                              {hazard.roomType}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-sm text-foreground">{hazard.description}</div>
                        {hazard.estimatedCost ? (
                          <div className="text-xs text-muted-foreground">
                            Estimated cost: {hazard.estimatedCost.currency} {hazard.estimatedCost.amount} · {hazard.estimatedCost.reason}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>5. Area Intelligence</CardDescription>
              <CardTitle>Location and transit signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {snapshot.intelligence?.geoAnalysis ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-border/70 text-foreground">
                      Noise: {snapshot.intelligence.geoAnalysis.noiseRisk}
                    </Badge>
                    <Badge variant="outline" className="border-border/70 text-foreground">
                      Transit: {snapshot.intelligence.geoAnalysis.transitScore}
                    </Badge>
                  </div>
                  {snapshot.intelligence.geoAnalysis.warning ? (
                    <div>{snapshot.intelligence.geoAnalysis.warning}</div>
                  ) : null}
                  <div className="space-y-2">
                    {snapshot.intelligence.geoAnalysis.nearbyTransit.length > 0 ? (
                      snapshot.intelligence.geoAnalysis.nearbyTransit.map((item) => <div key={item}>{item}</div>)
                    ) : (
                      <div>Nearby transit details are limited.</div>
                    )}
                  </div>
                  {snapshot.intelligence.geoAnalysis.destinationConvenience.length > 0 ? (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      {snapshot.intelligence.geoAnalysis.destinationConvenience.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <ReportSectionSkeleton copy="Gathering area signals..." />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>6. Community Feedback</CardDescription>
              <CardTitle>Public renter sentiment and local discussion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {snapshot.intelligence?.communityInsight ? (
                <>
                  <Badge variant="outline" className="border-border/70 text-foreground">
                    Sentiment: {snapshot.intelligence.communityInsight.sentiment}
                  </Badge>
                  <div>{snapshot.intelligence.communityInsight.summary}</div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {snapshot.intelligence.communityInsight.citations.length > 0 ? (
                      snapshot.intelligence.communityInsight.citations.map((citation) => (
                        <a
                          key={citation.sourceId}
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block break-words text-accent underline-offset-4 hover:underline"
                        >
                          {citation.title}
                        </a>
                      ))
                    ) : (
                      <div>No public citations were retained for this summary.</div>
                    )}
                  </div>
                </>
              ) : (
                <ReportSectionSkeleton copy="Loading community research..." />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>7. Agency Background</CardDescription>
              <CardTitle>Public reputation and negotiation leverage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {snapshot.intelligence?.agencyBackground ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-border/70 text-foreground">
                      {snapshot.intelligence.agencyBackground.agencyName}
                    </Badge>
                    <Badge variant="outline" className="border-border/70 text-foreground">
                      Sentiment {snapshot.intelligence.agencyBackground.sentimentScore.toFixed(1)}/5
                    </Badge>
                  </div>
                  <div>{snapshot.intelligence.agencyBackground.negotiationLeverage}</div>
                  <div className="space-y-2">
                    {snapshot.intelligence.agencyBackground.commonComplaints.length > 0 ? (
                      snapshot.intelligence.agencyBackground.commonComplaints.map((complaint) => (
                        <div key={complaint}>{complaint}</div>
                      ))
                    ) : (
                      <div>No common public complaint themes were retained.</div>
                    )}
                  </div>
                </>
              ) : (
                <ReportSectionSkeleton copy="Loading agency background..." />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>8. Evidence & Confidence</CardDescription>
              <CardTitle>What currently supports the recommendation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {snapshot.evidenceSummary?.length ? (
                snapshot.evidenceSummary.map((item, index) => (
                  <div key={`${item.type}-${index}`} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline" className="border-border/70 text-foreground">
                        {item.type}
                      </Badge>
                      <span className={getConfidenceClasses(item.confidence)}>{item.confidence}</span>
                    </div>
                    <div className="mt-2 text-foreground">{item.summary}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.source}</div>
                  </div>
                ))
              ) : (
                <ReportSectionSkeleton copy="Building evidence summary..." />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>9. Inspection Coverage</CardDescription>
              <CardTitle>How complete is the current inspection?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {snapshot.inspectionCoverage ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-border/70 text-foreground">
                      Confidence: {snapshot.inspectionCoverage.confidence}
                    </Badge>
                    {snapshot.inspectionCoverage.roomsSeen.map((room) => (
                      <Badge key={room} variant="outline" className="border-border/70 text-foreground">
                        {room}
                      </Badge>
                    ))}
                  </div>
                  {snapshot.inspectionCoverage.warning ? <div>{snapshot.inspectionCoverage.warning}</div> : null}
                  <div className="space-y-2">
                    {snapshot.inspectionCoverage.missingAreas.length > 0 ? (
                      snapshot.inspectionCoverage.missingAreas.map((item) => <div key={item}>{item}</div>)
                    ) : (
                      <div>No major coverage gaps were flagged.</div>
                    )}
                  </div>
                </>
              ) : (
                <ReportSectionSkeleton copy="Assessing inspection coverage..." />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 xl:col-span-2">
            <CardHeader>
              <CardDescription>10. Pre-lease Action Guide</CardDescription>
              <CardTitle>What to negotiate or re-check next</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {snapshot.preLeaseActionGuide ? (
                <>
                  <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm font-medium text-foreground">Negotiation points</div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {snapshot.preLeaseActionGuide.negotiatePoints.length > 0 ? (
                        snapshot.preLeaseActionGuide.negotiatePoints.map((point) => <div key={point}>{point}</div>)
                      ) : (
                        <div>No specific negotiation points have been generated.</div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm font-medium text-foreground">Further inspection items</div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {snapshot.preLeaseActionGuide.furtherInspectionItems.length > 0 ? (
                        snapshot.preLeaseActionGuide.furtherInspectionItems.map((item) => <div key={item}>{item}</div>)
                      ) : (
                        <div>No further inspection items have been generated.</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <ReportSectionSkeleton copy="Preparing next-step checklist..." className="lg:col-span-2" />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 xl:col-span-2">
            <CardHeader>
              <CardDescription>11. Export Actions</CardDescription>
              <CardTitle>Export a stable PDF or share poster</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => handleExport("pdf")}
                disabled={!isReportStable || isExporting !== null}
              >
                {isExporting === "pdf" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
                Export PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport("poster")}
                disabled={!isReportStable || isExporting !== null}
              >
                {isExporting === "poster" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileImage className="mr-2 size-4" />}
                Export Poster
              </Button>
              <div className="min-w-full text-xs text-muted-foreground">
                {isReportStable
                  ? "Export uses the current stable report DOM and omits loading placeholders."
                  : "Export unlocks once deep intelligence and recommendation finish stabilizing."}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/65 px-4 py-4 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <ShieldAlert className="size-4 text-accent" />
            Disclaimer
          </div>
          Inspect.AI is an AI-assisted screening tool and does not replace a licensed building inspector. All
          findings and cost estimates are indicative only.
        </div>
      </div>
    </main>
  );
}

function ReportSectionSkeleton({ copy, className }: { copy: string; className?: string }) {
  return (
    <div className={className}>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40 bg-muted/60" />
        <Skeleton className="h-4 w-full bg-muted/50" />
        <Skeleton className="h-4 w-4/5 bg-muted/40" />
        <div className="pt-1 text-sm text-muted-foreground">{copy}</div>
      </div>
    </div>
  );
}

function ReportLoadingState() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <Skeleton className="h-8 w-28 bg-muted/60" />
        <Skeleton className="h-12 w-2/3 bg-muted/50" />
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="border-border/70 bg-card/85">
              <CardHeader>
                <Skeleton className="h-4 w-28 bg-muted/60" />
                <Skeleton className="h-6 w-48 bg-muted/50" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full bg-muted/40" />
                <Skeleton className="h-4 w-4/5 bg-muted/40" />
                <Skeleton className="h-24 w-full bg-muted/30" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
