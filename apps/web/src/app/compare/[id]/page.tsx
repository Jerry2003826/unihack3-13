"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ComparisonReportSnapshot } from "@inspect-ai/contracts";
import { getComparisonReport } from "@/lib/history/historyStore";
import { useI18n } from "@/lib/i18n";
import { localizeComparisonReport } from "@/lib/runtimeTranslation";
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
  const { t, locale } = useI18n();
  const [report, setReport] = useState<ComparisonReportSnapshot | null>(null);
  const [localizedReport, setLocalizedReport] = useState<ComparisonReportSnapshot | null>(null);
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

  useEffect(() => {
    if (!report || locale === "en") {
      return;
    }

    let cancelled = false;

    localizeComparisonReport(report, locale)
      .then((localized) => {
        if (!cancelled) {
          setLocalizedReport(localized);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("Runtime translation failed for comparison, using original text", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [report, locale]);

  // Only use localized report for non-English locales; otherwise use original
  const displayReport = locale !== "en" && localizedReport ? localizedReport : report;

  if (!displayReport) {
    return (
      <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Card className="border-border/70 bg-card/85">
            <CardContent className="p-6">
              <AsyncStatusBadge label={t("Comparison report")} status={status} />
              {status === "error" ? (
                <div className="mt-4 text-sm text-muted-foreground">
                  {t("Comparison report not found in this browser. Generate it again from Saved Reports / Compare.")}
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
            <div className="text-xs uppercase tracking-[0.2em] text-accent/80">{t("Comparison Report")}</div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("Weighted property recommendation")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("Generated {timestamp} · {count} saved reports compared", { timestamp: formatTimestamp(displayReport.createdAt), count: displayReport.rankedCandidates.length })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/compare")}>
              {t("Back to Compare")}
            </Button>
            <Button variant="ghost" onClick={() => router.push("/history")}>
              {t("Search History")}
            </Button>
          </div>
        </div>

        <Card className="border-accent/30 bg-card/90">
          <CardHeader>
            <CardDescription>{t("Top recommendation")}</CardDescription>
            <CardTitle>{displayReport.topRecommendation.address}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>{displayReport.topRecommendation.summary}</div>
            <div className="grid gap-2">
              {displayReport.whyThisWins.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push(`/report/${displayReport.topRecommendation.reportId}`)}>
                {t("Open winning report")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>{t("Trade-offs")}</CardDescription>
              <CardTitle>{t("Why this one wins")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {displayReport.tradeoffSummary.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>{t("Runner-up gaps")}</CardDescription>
              <CardTitle>{t("Why others lost")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {displayReport.whyOthersLost.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/85">
          <CardHeader>
            <CardDescription>{t("Ranked candidates")}</CardDescription>
            <CardTitle>{t("Weighted score breakdown")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {displayReport.rankedCandidates.map((candidate, index) => (
              <div key={candidate.reportId} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.16em] text-accent/80">{t("Rank {rank}", { rank: index + 1 })}</div>
                    <div className="text-lg font-medium text-foreground">{candidate.address}</div>
                    <div className="text-sm text-muted-foreground">{candidate.fitLabel}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-semibold text-accent">{candidate.totalScore}</div>
                    <div className="text-xs text-muted-foreground">{t("weighted score")}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>{t("Budget")}: {candidate.breakdown.budget ?? t("n/a")}</div>
                  <div>{t("Commute")}: {candidate.breakdown.commute ?? t("n/a")}</div>
                  <div>{t("Noise")}: {candidate.breakdown.noise ?? t("n/a")}</div>
                  <div>{t("Lighting")}: {candidate.breakdown.lighting ?? t("n/a")}</div>
                  <div>{t("Condition")}: {candidate.breakdown.condition ?? t("n/a")}</div>
                  <div>{t("Agency")}: {candidate.breakdown.agency ?? t("n/a")}</div>
                  <div>{t("Community")}: {candidate.breakdown.community ?? t("n/a")}</div>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-muted-foreground lg:grid-cols-3">
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">{t("Strengths")}</div>
                    {candidate.strengths.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">{t("Trade-offs")}</div>
                    {candidate.tradeoffs.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">{t("Cautions")}</div>
                    {candidate.cautions.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push(`/report/${candidate.reportId}`)}>
                    {t("Open report")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>{t("Knowledge base guidance")}</CardDescription>
              <CardTitle>{t("Supporting renter guidance")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {displayReport.knowledgeMatches.map((match) => (
                <div key={match.sourceId} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="font-medium text-foreground">{match.title}</div>
                  <div className="mt-2">{match.snippet}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85">
            <CardHeader>
              <CardDescription>{t("People & Paperwork Checks")}</CardDescription>
              <CardTitle>{t("Due diligence before committing")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">{t("Checklist")}</div>
                {displayReport.paperworkChecks.checklist.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.16em] text-foreground">{t("Risk Flags")}</div>
                {displayReport.paperworkChecks.riskFlags.length > 0 ? (
                  displayReport.paperworkChecks.riskFlags.map((item) => <div key={item}>{item}</div>)
                ) : (
                  <div>{t("No extra paperwork red flags were generated.")}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
