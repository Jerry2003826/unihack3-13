"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AsyncStatus, FactorWeights, NoiseTolerance, PreferenceProfile, ReportSnapshot } from "@inspect-ai/contracts";
import {
  comparisonResponseSchema,
  normalizeFactorWeights,
  DEFAULT_FACTOR_WEIGHTS,
} from "@inspect-ai/contracts";
import { AsyncStatusBadge } from "@/components/shared/AsyncStatusBadge";
import { RadarLoader } from "@/components/shared/RadarLoader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveComparisonReport, saveSearchHistory } from "@/lib/history/historyStore";
import { publicAppConfig } from "@/lib/config/public";
import { normalizeReportSnapshot } from "@/lib/report/normalizeReportSnapshot";
import { listReportSnapshots } from "@/lib/report-snapshot/reportSnapshotStore";
import { useSessionStore } from "@/store/useSessionStore";
import { toast } from "sonner";

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function WeightInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}

export default function ComparePage() {
  const router = useRouter();
  const { preferenceProfile, updateInspectionDraft } = useSessionStore();
  const [reports, setReports] = useState<ReportSnapshot[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [weights, setWeights] = useState<FactorWeights>(
    normalizeFactorWeights(preferenceProfile?.factorWeights ?? DEFAULT_FACTOR_WEIGHTS)
  );
  const [budget, setBudget] = useState(preferenceProfile?.budget ? String(preferenceProfile.budget) : "");
  const [noiseTolerance, setNoiseTolerance] = useState<NoiseTolerance>(preferenceProfile?.noiseTolerance ?? "medium");
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<
    Record<string, { askingRent: string; lightingScoreManual: string; notes: string }>
  >({});

  useEffect(() => {
    async function loadReports() {
      try {
        const stored = await listReportSnapshots(20);
        const normalized = stored.map(normalizeReportSnapshot);
        setReports(normalized);
        setSelectedReportIds(normalized.slice(0, 2).map((report) => report.reportId));
        setStatus("success");
      } catch (loadError) {
        setStatus("error");
        setError(loadError instanceof Error ? loadError.message : "Failed to load saved reports.");
      }
    }

    void loadReports();
  }, []);

  const selectedReports = useMemo(
    () => reports.filter((report) => selectedReportIds.includes(report.reportId)),
    [reports, selectedReportIds]
  );

  const handleToggleSelection = (reportId: string) => {
    setSelectedReportIds((current) => {
      if (current.includes(reportId)) {
        return current.filter((value) => value !== reportId);
      }

      return [...current, reportId].slice(0, 5);
    });
  };

  const handleGenerateComparison = async () => {
    if (selectedReports.length < 2) {
      toast.error("Select at least two saved reports to compare.");
      return;
    }

    setStatus("loading");
    setError(null);

    const nextPreferenceProfile: PreferenceProfile = {
      ...preferenceProfile,
      budget: budget ? Number(budget) : undefined,
      noiseTolerance,
      factorWeights: weights,
    };

    try {
      const response = await fetch(resolveApiUrl("/api/compare"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidates: selectedReports.map((report) => ({
            candidateId: report.reportId,
            reportId: report.reportId,
            address: report.inputs.address,
            reportSnapshot: normalizeReportSnapshot(report),
            userOverrides: {
              askingRent: overrides[report.reportId]?.askingRent
                ? Number(overrides[report.reportId].askingRent)
                : report.askingRent,
              lightingScoreManual: overrides[report.reportId]?.lightingScoreManual
                ? Number(overrides[report.reportId].lightingScoreManual)
                : report.lightingScoreManual,
              notes: overrides[report.reportId]?.notes || undefined,
            },
          })),
          weights,
          preferenceProfile: nextPreferenceProfile,
        }),
      });

      if (!response.ok) {
        throw new Error(`Comparison failed with ${response.status}`);
      }

      const payload = comparisonResponseSchema.parse(await response.json());
      await saveComparisonReport(payload.report);
      await saveSearchHistory({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        type: "compare",
        label: `Compare ${selectedReports.length} properties`,
        payload: {
          comparisonId: payload.report.comparisonId,
          selectedReportIds,
          preferenceProfile: nextPreferenceProfile,
        },
      });
      updateInspectionDraft({
        preferenceProfile: nextPreferenceProfile,
      });
      router.push(`/compare/${payload.report.comparisonId}`);
    } catch (compareError) {
      setStatus("fallback");
      setError(compareError instanceof Error ? compareError.message : "Comparison report generation failed.");
      toast.error(compareError instanceof Error ? compareError.message : "Comparison report generation failed.");
    }
  };

  if (status === "loading" && reports.length === 0) {
    return (
      <RadarLoader
        title="Comparison Engine"
        statusText="Loading saved reports..."
        description="Preparing candidate cards and weight controls."
      />
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-accent/80">Saved Reports / Compare</div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Multi-property weighted recommendation</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Select up to five saved report snapshots, adjust the factor weights, and generate a ranked recommendation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push("/history")}>
              Search History
            </Button>
            <Button variant="ghost" className="w-full sm:w-auto" onClick={() => router.push("/")}>
              Back Home
            </Button>
          </div>
        </div>

        <Card className="border-border/70 bg-card/80">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <AsyncStatusBadge label="Comparison" status={status} />
            <div>{selectedReports.length} / 5 candidates selected</div>
          </CardContent>
        </Card>

        {error ? (
          <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/8 px-4 py-3 text-sm text-yellow-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>Saved property reports</CardDescription>
              <CardTitle>Select candidates to compare</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reports.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No saved reports were found in this browser. Generate at least two property reports first.
                </div>
              ) : (
                reports.map((report) => {
                  const selected = selectedReportIds.includes(report.reportId);
                  const candidateOverride = overrides[report.reportId] ?? {
                    askingRent: report.askingRent ? String(report.askingRent) : "",
                    lightingScoreManual: report.lightingScoreManual ? String(report.lightingScoreManual) : "",
                    notes: "",
                  };

                  return (
                    <div
                      key={report.reportId}
                      className={`rounded-2xl border p-4 transition ${
                        selected ? "border-accent/60 bg-accent/10" : "border-border/70 bg-muted/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-base font-medium text-foreground">
                            {report.inputs.address || "Untitled report"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTimestamp(report.createdAt)} · Risk {report.propertyRiskScore}/100 · Lighting{" "}
                            {report.lightingScoreManual ?? report.lightingScoreAuto ?? "n/a"}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleToggleSelection(report.reportId)}
                          />
                          Compare
                        </label>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Weekly Rent</label>
                          <Input
                            inputMode="numeric"
                            value={candidateOverride.askingRent}
                            onChange={(event) =>
                              setOverrides((current) => ({
                                ...current,
                                [report.reportId]: {
                                  ...candidateOverride,
                                  askingRent: event.target.value.replace(/[^\d]/g, ""),
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Manual Lighting Score</label>
                          <Input
                            inputMode="numeric"
                            value={candidateOverride.lightingScoreManual}
                            onChange={(event) =>
                              setOverrides((current) => ({
                                ...current,
                                [report.reportId]: {
                                  ...candidateOverride,
                                  lightingScoreManual: event.target.value.replace(/[^\d]/g, ""),
                                },
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Comparison Notes</label>
                        <textarea
                          className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={candidateOverride.notes}
                          onChange={(event) =>
                            setOverrides((current) => ({
                              ...current,
                              [report.reportId]: {
                                ...candidateOverride,
                                notes: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>User priorities</CardDescription>
              <CardTitle>Adjust factor weights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Budget Ceiling (weekly)</label>
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 650"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value.replace(/[^\d]/g, ""))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Noise tolerance</label>
                <select
                  value={noiseTolerance}
                  onChange={(event) => setNoiseTolerance(event.target.value as NoiseTolerance)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <WeightInput label="Budget" value={weights.budgetWeight} onChange={(value) => setWeights((current) => ({ ...current, budgetWeight: value }))} />
              <WeightInput label="Commute" value={weights.commuteWeight} onChange={(value) => setWeights((current) => ({ ...current, commuteWeight: value }))} />
              <WeightInput label="Noise" value={weights.noiseWeight} onChange={(value) => setWeights((current) => ({ ...current, noiseWeight: value }))} />
              <WeightInput label="Lighting" value={weights.lightingWeight} onChange={(value) => setWeights((current) => ({ ...current, lightingWeight: value }))} />
              <WeightInput label="Condition" value={weights.conditionWeight} onChange={(value) => setWeights((current) => ({ ...current, conditionWeight: value }))} />
              <WeightInput label="Agency" value={weights.agencyWeight} onChange={(value) => setWeights((current) => ({ ...current, agencyWeight: value }))} />
              <WeightInput label="Community" value={weights.communityWeight} onChange={(value) => setWeights((current) => ({ ...current, communityWeight: value }))} />

              <Button className="w-full" onClick={handleGenerateComparison} disabled={status === "loading" && reports.length > 0}>
                Generate Comparison Report
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
