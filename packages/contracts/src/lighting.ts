import type { Hazard, PropertyIntelligence, ReportSnapshot } from "./schemas";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scoreLightingTokens(text?: string) {
  if (!text) {
    return 0;
  }

  const positiveTokens = ["bright", "sunny", "natural light", "north-facing", "large window", "light-filled"];
  const negativeTokens = ["dark", "dim", "poor light", "blocked window", "small window", "mould near window"];
  const normalized = text.toLowerCase();

  let score = 0;
  for (const token of positiveTokens) {
    if (normalized.includes(token)) {
      score += 10;
    }
  }
  for (const token of negativeTokens) {
    if (normalized.includes(token)) {
      score -= 12;
    }
  }

  return score;
}

export function estimateLightingScore(args: {
  hazards: Hazard[];
  propertyNotes?: string;
  intelligence?: PropertyIntelligence;
}) {
  let score = 58;

  score += scoreLightingTokens(args.propertyNotes);
  score += scoreLightingTokens(args.intelligence?.communityInsight?.summary);

  for (const hazard of args.hazards) {
    if (hazard.category === "Mould" && /window|ceiling|corner/i.test(hazard.description)) {
      score -= 10;
    }
    if (hazard.category === "Safety" && /window|blind|curtain/i.test(hazard.description)) {
      score -= 6;
    }
  }

  if ((args.intelligence?.geoAnalysis?.noiseRisk ?? "Medium") === "Low") {
    score += 4;
  }

  return clamp(Math.round(score), 15, 95);
}

export function ensureLightingSnapshot(snapshot: ReportSnapshot): ReportSnapshot {
  if (typeof snapshot.lightingScoreAuto === "number") {
    return snapshot;
  }

  return {
    ...snapshot,
    lightingScoreAuto: estimateLightingScore({
      hazards: snapshot.hazards,
      propertyNotes: snapshot.inputs.propertyNotes,
      intelligence: snapshot.intelligence,
    }),
  };
}
