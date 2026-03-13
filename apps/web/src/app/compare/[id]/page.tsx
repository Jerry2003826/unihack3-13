"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ComparisonReportSnapshot } from "@inspect-ai/contracts";
import { getComparisonReport } from "@/lib/history/historyStore";
import { AsyncStatusBadge } from "@/components/shared/AsyncStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export default function ComparisonReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<ComparisonReportSnapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "fallback" | "error">("loading");

  useEffect(() => {
    async function loadReport() {
      const comparisonId = typeof params.id === "string" ? params.id : "";
      if (!comparisonId) {
        router.replace("/compare");
        return;
      }

      const stored = await getComparisonReport(comparisonId);
      if (!stored) {
        setStatus("error");
        return;
      }

      setReport(stored);
      setStatus("success");
    }

    void loadReport();
  }, [params.id, router]);

  if (!report) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Card className="border-border/70 bg-card/85">
            <CardContent className="p-6">
              <AsyncStatusBadge label="Comparison report" status={status} />
              {status === "error" ? (
                <div className="mt-4 text-sm text-muted-foreground">
                  Comparison report not found in this browser. Generate it again from Saved Reports / Compare.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-accent/80">Comparison Report</div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Weighted property recommendation</h1>
            <p className="text-sm text-muted-foreground">
              Generated {formatTimestamp(report.createdAt)} · {report.rankedCandidates.length} saved reports compared
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/compare")}>
              Back to Compare
            </Button>
            <Button variant="ghost" onClick={() => router.push("/history")}>
              Search History
            </Button>
          </div>
        </div>

        <Card className="border-accent/30 bg-card/90">
          <CardHeader>
            <CardDescription>Top recommendation</CardDescription>
            <CardTitle>{report.topRecommendation.address}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>{report.topRecommendation.summary}</div>
            <div className="grid gap-2">
              {report.whyThisWins.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push(`/report/${report.topRecommendation.reportId}`)}>
                Open winning report
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>Trade-offs</CardDescription>
              <CardTitle>Why this one wins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {report.tradeoffSummary.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>Runner-up gaps</CardDescription>
              <CardTitle>Why others lost</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {report.whyOthersLost.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/85">
          <CardHeader>
            <CardDescription>Ranked candidates</CardDescription>
            <CardTitle>Weighted score breakdown</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {report.rankedCandidates.map((candidate, index) => (
              <div key={candidate.reportId} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-accent/80">Rank {index + 1}</div>
                    <div className="text-lg font-medium text-foreground">{candidate.address}</div>
                    <div className="text-sm text-muted-foreground">{candidate.fitLabel}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-semibold text-accent">{candidate.totalScore}</div>
                    <div className="text-xs text-muted-foreground">weighted score</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>Budget: {candidate.breakdown.budget ?? "n/a"}</div>
                  <div>Commute: {candidate.breakdown.commute ?? "n/a"}</div>
                  <div>Noise: {candidate.breakdown.noise ?? "n/a"}</div>
                  <div>Lighting: {candidate.breakdown.lighting ?? "n/a"}</div>
                  <div>Condition: {candidate.breakdown.condition ?? "n/a"}</div>
                  <div>Agency: {candidate.breakdown.agency ?? "n/a"}</div>
                  <div>Community: {candidate.breakdown.community ?? "n/a"}</div>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-muted-foreground lg:grid-cols-3">
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">Strengths</div>
                    {candidate.strengths.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">Trade-offs</div>
                    {candidate.tradeoffs.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">Cautions</div>
                    {candidate.cautions.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push(`/report/${candidate.reportId}`)}>
                    Open report
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>Knowledge base guidance</CardDescription>
              <CardTitle>Supporting renter guidance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {report.knowledgeMatches.map((match) => (
                <div key={match.sourceId} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="font-medium text-foreground">{match.title}</div>
                  <div className="mt-2">{match.snippet}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>People & Paperwork Checks</CardDescription>
              <CardTitle>Due diligence before committing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">Checklist</div>
                {report.paperworkChecks.checklist.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">Risk Flags</div>
                {report.paperworkChecks.riskFlags.length > 0 ? (
                  report.paperworkChecks.riskFlags.map((item) => <div key={item}>{item}</div>)
                ) : (
                  <div>No extra paperwork red flags were generated.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
