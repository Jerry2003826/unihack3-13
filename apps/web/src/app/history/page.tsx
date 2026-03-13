"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComparisonHistoryEntry, SearchHistoryEntry } from "@inspect-ai/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listComparisonReports, listSearchHistory } from "@/lib/history/historyStore";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export default function HistoryPage() {
  const router = useRouter();
  const { beginInspection, prepareManualMode, updateInspectionDraft } = useSessionStore();
  const { resetForNewInspection } = useHazardStore();
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [comparisonHistory, setComparisonHistory] = useState<ComparisonHistoryEntry[]>([]);
  const comparisonFallbackEntries = searchHistory.filter(
    (entry) => entry.type === "compare" && entry.payload.comparisonId
  );

  useEffect(() => {
    async function loadHistory() {
      setSearchHistory(await listSearchHistory(20));
      setComparisonHistory(await listComparisonReports(20));
    }

    void loadHistory();
  }, []);

  const restoreSearch = (entry: SearchHistoryEntry) => {
    if (entry.type === "compare" && entry.payload.comparisonId) {
      router.push(`/compare/${entry.payload.comparisonId}`);
      return;
    }

    if (entry.type === "manual") {
      prepareManualMode();
      updateInspectionDraft({
        mode: "manual",
        address: entry.payload.address,
        agency: entry.payload.agency,
        coordinates: entry.payload.coordinates,
        propertyNotes: entry.payload.propertyNotes,
        preferenceProfile: entry.payload.preferenceProfile,
      });
      resetForNewInspection();
      router.push("/manual");
      return;
    }

    beginInspection({
      mode: "live",
      address: entry.payload.address,
      agency: entry.payload.agency,
      coordinates: entry.payload.coordinates ?? null,
      targetDestinations: entry.payload.targetDestinations,
      preferenceProfile: entry.payload.preferenceProfile ?? null,
    });
    resetForNewInspection();
    router.push("/radar");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-accent/80">Search History</div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Recent searches and comparisons</h1>
            <p className="text-sm text-muted-foreground">
              Restore a prior search draft or reopen a saved comparison report from this browser.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/compare")}>
              Saved Reports / Compare
            </Button>
            <Button variant="ghost" onClick={() => router.push("/")}>
              Back Home
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>Search inputs</CardDescription>
              <CardTitle>Recent live and manual drafts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {searchHistory.length > 0 ? (
                searchHistory.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm font-medium text-foreground">{entry.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatTimestamp(entry.createdAt)}</div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => restoreSearch(entry)}>
                        Restore
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No search history saved yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>Comparison outputs</CardDescription>
              <CardTitle>Recent comparison reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparisonHistory.length > 0 ? (
                comparisonHistory.map((entry) => (
                  <div key={entry.comparisonId} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm font-medium text-foreground">
                      {entry.report.topRecommendation.address}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatTimestamp(entry.createdAt)} · {entry.report.rankedCandidates.length} candidates
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => router.push(`/compare/${entry.comparisonId}`)}>
                        Open comparison
                      </Button>
                    </div>
                  </div>
                ))
              ) : comparisonFallbackEntries.length > 0 ? (
                comparisonFallbackEntries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm font-medium text-foreground">{entry.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatTimestamp(entry.createdAt)}</div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => router.push(`/compare/${entry.payload.comparisonId}`)}>
                        Open comparison
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No comparison reports saved yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
