"use client";

import type { ComparisonReportSnapshot, ReportSnapshot } from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";
import type { AppLocale } from "@/lib/i18n";

const STORAGE_KEY = "inspect-ai-runtime-translation-cache-v1";
const memoryCache = new Map<string, string>();

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

function makeCacheKey(locale: AppLocale, text: string) {
  return `${locale}::${text}`;
}

function readPersistentCache() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writePersistentCache(cache: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota issues.
  }
}

function getCached(locale: AppLocale, text: string) {
  const key = makeCacheKey(locale, text);
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  const persistent = readPersistentCache();
  const value = persistent[key];
  if (value) {
    memoryCache.set(key, value);
    return value;
  }

  return undefined;
}

function setCached(locale: AppLocale, source: string, translated: string) {
  const key = makeCacheKey(locale, source);
  memoryCache.set(key, translated);
  const persistent = readPersistentCache();
  persistent[key] = translated;
  writePersistentCache(persistent);
}

function shouldTranslate(text: string | undefined) {
  if (!text) {
    return false;
  }

  const value = text.trim();
  if (!value) {
    return false;
  }

  if (/^(https?:\/\/|www\.|[\d\s.,:/+-]+)$/.test(value)) {
    return false;
  }

  return true;
}

export async function translateTextBatch(locale: AppLocale, texts: string[]) {
  if (locale === "en") {
    return texts;
  }

  const uniqueTexts = [...new Set(texts.filter(shouldTranslate))];
  const missing = uniqueTexts.filter((text) => !getCached(locale, text));

  for (let index = 0; index < missing.length; index += 60) {
    const chunk = missing.slice(index, index + 60);
    if (chunk.length === 0) {
      continue;
    }

    const response = await fetch(resolveApiUrl("/api/translate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale,
        texts: chunk,
      }),
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as { translations?: string[] };
    const translations = payload.translations ?? chunk;
    chunk.forEach((source, offset) => {
      setCached(locale, source, translations[offset] ?? source);
    });
  }

  return texts.map((text) => getCached(locale, text) ?? text);
}

type TextBinding = {
  source: string;
  apply: (translated: string) => void;
};

function addBinding(bindings: TextBinding[], source: string | undefined, apply: (translated: string) => void) {
  if (!shouldTranslate(source)) {
    return;
  }

  bindings.push({
    source: source!.trim(),
    apply,
  });
}

async function applyBindings(locale: AppLocale, bindings: TextBinding[]) {
  if (locale === "en" || bindings.length === 0) {
    return;
  }

  const translations = await translateTextBatch(
    locale,
    bindings.map((binding) => binding.source)
  );

  bindings.forEach((binding, index) => {
    binding.apply(translations[index] ?? binding.source);
  });
}

export async function localizeReportSnapshot(snapshot: ReportSnapshot, locale: AppLocale) {
  if (locale === "en") {
    return snapshot;
  }

  const next = structuredClone(snapshot);
  const bindings: TextBinding[] = [];

  next.hazards.forEach((hazard) => {
    addBinding(bindings, hazard.description, (value) => {
      hazard.description = value;
    });
    addBinding(bindings, hazard.estimatedCost?.reason, (value) => {
      if (hazard.estimatedCost) {
        hazard.estimatedCost.reason = value;
      }
    });
  });

  addBinding(bindings, next.intelligence?.geoAnalysis?.warning, (value) => {
    if (next.intelligence?.geoAnalysis) {
      next.intelligence.geoAnalysis.warning = value;
    }
  });
  next.intelligence?.geoAnalysis?.keySignals?.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.intelligence?.geoAnalysis?.nearbyTransit.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.intelligence?.geoAnalysis?.destinationConvenience.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.intelligence?.geoAnalysis?.nearbyEssentials?.forEach((place) => {
    addBinding(bindings, place.category, (value) => {
      place.category = value;
    });
    addBinding(bindings, place.businessStatus, (value) => {
      place.businessStatus = value;
    });
    addBinding(bindings, place.openNowText, (value) => {
      place.openNowText = value;
    });
    addBinding(bindings, place.editorialSummary, (value) => {
      place.editorialSummary = value;
    });
    place.accessibilityHighlights?.forEach((item, index, array) => {
      addBinding(bindings, item, (value) => {
        array[index] = value;
      });
    });
    place.parkingHighlights?.forEach((item, index, array) => {
      addBinding(bindings, item, (value) => {
        array[index] = value;
      });
    });
  });

  addBinding(bindings, next.intelligence?.communityInsight?.summary, (value) => {
    if (next.intelligence?.communityInsight) {
      next.intelligence.communityInsight.summary = value;
    }
  });
  next.intelligence?.communityInsight?.highlights?.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  addBinding(bindings, next.intelligence?.agencyBackground?.summary, (value) => {
    if (next.intelligence?.agencyBackground) {
      next.intelligence.agencyBackground.summary = value;
    }
  });
  addBinding(bindings, next.intelligence?.agencyBackground?.negotiationLeverage, (value) => {
    if (next.intelligence?.agencyBackground) {
      next.intelligence.agencyBackground.negotiationLeverage = value;
    }
  });
  next.intelligence?.agencyBackground?.highlights?.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.intelligence?.agencyBackground?.commonComplaints.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  next.intelligence?.fusion?.mapSignals.forEach((signal) => {
    addBinding(bindings, signal.title, (value) => {
      signal.title = value;
    });
    addBinding(bindings, signal.summary, (value) => {
      signal.summary = value;
    });
    signal.highlights?.forEach((item, index, array) => {
      addBinding(bindings, item, (value) => {
        array[index] = value;
      });
    });
  });
  next.intelligence?.fusion?.webSignals.forEach((signal) => {
    addBinding(bindings, signal.title, (value) => {
      signal.title = value;
    });
    addBinding(bindings, signal.summary, (value) => {
      signal.summary = value;
    });
    signal.highlights?.forEach((item, index, array) => {
      addBinding(bindings, item, (value) => {
        array[index] = value;
      });
    });
  });
  next.intelligence?.fusion?.conflicts.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  addBinding(bindings, next.recommendation?.summary, (value) => {
    if (next.recommendation) {
      next.recommendation.summary = value;
    }
  });
  next.recommendation?.reasons.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  addBinding(bindings, next.fitScore?.summary, (value) => {
    if (next.fitScore) {
      next.fitScore.summary = value;
    }
  });
  next.fitScore?.drivers.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  next.evidenceSummary?.forEach((item) => {
    addBinding(bindings, item.summary, (value) => {
      item.summary = value;
    });
    addBinding(bindings, item.source, (value) => {
      item.source = value;
    });
  });

  addBinding(bindings, next.inspectionCoverage?.summary, (value) => {
    if (next.inspectionCoverage) {
      next.inspectionCoverage.summary = value;
    }
  });
  addBinding(bindings, next.inspectionCoverage?.warning, (value) => {
    if (next.inspectionCoverage) {
      next.inspectionCoverage.warning = value;
    }
  });
  next.inspectionCoverage?.missingAreas.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  addBinding(bindings, next.preLeaseActionGuide?.summary, (value) => {
    if (next.preLeaseActionGuide) {
      next.preLeaseActionGuide.summary = value;
    }
  });
  next.preLeaseActionGuide?.negotiatePoints.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.preLeaseActionGuide?.furtherInspectionItems.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  next.knowledgeMatches?.forEach((match) => {
    addBinding(bindings, match.title, (value) => {
      match.title = value;
    });
    addBinding(bindings, match.snippet, (value) => {
      match.snippet = value;
    });
  });

  next.paperworkChecks?.checklist.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.paperworkChecks?.riskFlags.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.paperworkChecks?.requiredDocuments.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.paperworkChecks?.suggestedQuestions.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  next.roomScenes3d?.forEach((scene) => {
    addBinding(bindings, scene.title, (value) => {
      scene.title = value;
    });
    addBinding(bindings, scene.coverageSummary, (value) => {
      scene.coverageSummary = value;
    });
    scene.openings?.forEach((opening) => {
      addBinding(bindings, opening.label, (value) => {
        opening.label = value;
      });
    });
    scene.furniture?.forEach((item) => {
      addBinding(bindings, item.label, (value) => {
        item.label = value;
      });
      addBinding(bindings, item.kind, (value) => {
        item.kind = value;
      });
    });
    scene.markers.forEach((marker) => {
      addBinding(bindings, marker.label, (value) => {
        marker.label = value;
      });
      addBinding(bindings, marker.summary, (value) => {
        marker.summary = value;
      });
    });
  });

  await applyBindings(locale, bindings);
  return next;
}

export async function localizeComparisonReport(report: ComparisonReportSnapshot, locale: AppLocale) {
  if (locale === "en") {
    return report;
  }

  const next = structuredClone(report);
  const bindings: TextBinding[] = [];

  addBinding(bindings, next.topRecommendation.summary, (value) => {
    next.topRecommendation.summary = value;
  });

  next.tradeoffSummary.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.whyThisWins.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.whyOthersLost.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  next.rankedCandidates.forEach((candidate) => {
    addBinding(bindings, candidate.notes, (value) => {
      candidate.notes = value;
    });
    candidate.strengths.forEach((item, index, array) => {
      addBinding(bindings, item, (value) => {
        array[index] = value;
      });
    });
    candidate.tradeoffs.forEach((item, index, array) => {
      addBinding(bindings, item, (value) => {
        array[index] = value;
      });
    });
    candidate.cautions.forEach((item, index, array) => {
      addBinding(bindings, item, (value) => {
        array[index] = value;
      });
    });
  });

  next.knowledgeMatches.forEach((match) => {
    addBinding(bindings, match.title, (value) => {
      match.title = value;
    });
    addBinding(bindings, match.snippet, (value) => {
      match.snippet = value;
    });
  });

  next.paperworkChecks.checklist.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.paperworkChecks.riskFlags.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.paperworkChecks.requiredDocuments.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });
  next.paperworkChecks.suggestedQuestions.forEach((item, index, array) => {
    addBinding(bindings, item, (value) => {
      array[index] = value;
    });
  });

  await applyBindings(locale, bindings);
  return next;
}
