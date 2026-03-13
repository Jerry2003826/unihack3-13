import { z } from "zod";
import type {
  AgencyBackground,
  CommunityInsight,
  GeoAnalysis,
  IntelligenceDepth,
} from "@inspect-ai/contracts";
import {
  agencyBackgroundSchema,
  communityInsightSchema,
  sanitizeDisplayList,
  sanitizeDisplayText,
} from "@inspect-ai/contracts";
import { callGeminiGroundedJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { buildCitationsFromGroundedCatalog, type GroundedCatalogItem } from "@/lib/grounding";
import { geocodeAddress } from "@/lib/providers/googleMapsGeocode";

const groundedLocalSummarySchema = z.object({
  geoSummary: z.string().optional(),
  geoKeySignals: z.union([z.array(z.string()).max(4), z.string()]).optional(),
  communitySummary: z.string().optional(),
  communityHighlights: z.union([z.array(z.string()).max(4), z.string()]).optional(),
  communitySentiment: z.string().optional(),
  agencySummary: z.string().optional(),
  agencyHighlights: z.union([z.array(z.string()).max(4), z.string()]).optional(),
  agencySentimentScore: z.union([z.number().min(1).max(5), z.string()]).optional(),
  agencyCommonComplaints: z.union([z.array(z.string()).max(3), z.string()]).optional(),
  agencyNegotiationLeverage: z.string().optional(),
});

function tokenize(value?: string) {
  return [...new Set((value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4))];
}

function rankCatalog(catalog: GroundedCatalogItem[], queries: string[], limit: number) {
  const tokens = queries.flatMap((query) => tokenize(query));
  if (tokens.length === 0) {
    return catalog.slice(0, limit);
  }

  const ranked = catalog
    .map((item) => {
      const haystack = `${item.title} ${item.url} ${item.snippet ?? ""}`.toLowerCase();
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) {
    return catalog.slice(0, limit);
  }

  return ranked.slice(0, limit).map((entry) => entry.item);
}

function normalizeStringList(value: string[] | string | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return value
    .split(/\n|•|;+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCommunitySentiment(value: string | undefined): CommunityInsight["sentiment"] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("positive")) {
    return "positive";
  }
  if (normalized.includes("negative")) {
    return "negative";
  }
  if (normalized.includes("mixed")) {
    return "mixed";
  }
  if (normalized.includes("neutral")) {
    return "neutral";
  }
  return "unknown";
}

function normalizeSentimentScore(value: number | string | undefined) {
  if (typeof value === "number") {
    return Math.max(1, Math.min(5, value));
  }

  const parsed = Number.parseFloat(value ?? "");
  if (Number.isFinite(parsed)) {
    return Math.max(1, Math.min(5, parsed));
  }

  return 3;
}

function sanitizeCommunity(
  summary: string | undefined,
  highlights: string[] | string | undefined,
  sentiment: string | undefined,
  catalog: GroundedCatalogItem[],
  address?: string
): CommunityInsight | undefined {
  const cleanSummary = sanitizeDisplayText(summary, { maxLength: 220, maxSegments: 2 });
  if (!cleanSummary) {
    return undefined;
  }

  return communityInsightSchema.parse({
    summary: cleanSummary,
    highlights: sanitizeDisplayList(normalizeStringList(highlights), { maxItems: 4, itemMaxLength: 90 }),
    sentiment: normalizeCommunitySentiment(sentiment),
    citations: buildCitationsFromGroundedCatalog(rankCatalog(catalog, [address ?? "", "community", "rent"], 4), 4),
  });
}

function sanitizeAgency(
  agency: string | undefined,
  summary: string | undefined,
  highlights: string[] | string | undefined,
  sentimentScore: number | string | undefined,
  commonComplaints: string[] | string | undefined,
  negotiationLeverage: string | undefined,
  catalog: GroundedCatalogItem[]
): AgencyBackground | undefined {
  const agencyName = agency?.trim();
  if (!agencyName) {
    return undefined;
  }

  const cleanLeverage = sanitizeDisplayText(negotiationLeverage, { maxLength: 170, maxSegments: 2 });
  const cleanSummary = sanitizeDisplayText(summary, { maxLength: 180, maxSegments: 2 });

  if (!cleanLeverage && !cleanSummary) {
    return undefined;
  }

  return agencyBackgroundSchema.parse({
    agencyName,
    summary: cleanSummary,
    highlights: sanitizeDisplayList(normalizeStringList(highlights), { maxItems: 4, itemMaxLength: 90 }),
    sentimentScore: normalizeSentimentScore(sentimentScore),
    commonComplaints: sanitizeDisplayList(normalizeStringList(commonComplaints), { maxItems: 3, itemMaxLength: 32 }),
    negotiationLeverage:
      cleanLeverage || "Public Maps-grounded evidence is limited. Ask for written repair and response commitments.",
    citations: buildCitationsFromGroundedCatalog(rankCatalog(catalog, [agencyName], 3), 3),
  });
}

export async function summarizeMapsGroundedIntelligence(args: {
  address?: string;
  coordinates?: { lat: number; lng: number };
  agency?: string;
  propertyNotes?: string;
  depth: IntelligenceDepth;
  baseGeoAnalysis?: GeoAnalysis;
}) {
  let coordinates = args.coordinates;
  let resolvedAddress = args.address?.trim();

  if (!coordinates && resolvedAddress) {
    try {
      const geocoded = await geocodeAddress(resolvedAddress);
      coordinates = geocoded?.coordinates;
      resolvedAddress = geocoded?.formattedAddress ?? resolvedAddress;
    } catch {
      // Continue without lat/lng. The grounded call can still use the textual address.
    }
  }

  if (!resolvedAddress && !coordinates) {
    return {
      fallbackReason: "maps_grounding_missing_location",
      provider: "fallback",
    } as const;
  }

  const groundedPrompt = [
    "You are a renter-facing local area and agency analyst.",
    "Use Google Maps grounding to summarize location, renter, and agency signals.",
    "Return only JSON.",
    "Stay concise and readable for a rental inspection report.",
    "geoSummary must be one short sentence under 170 characters.",
    "geoKeySignals must be 2-4 short lines under 80 characters each.",
    "communitySummary must be 1-2 short sentences under 220 characters total.",
    "communityHighlights must be 2-4 short bullets under 90 characters each.",
    "agencySummary must be under 180 characters and only about the named agency.",
    "agencyHighlights must be 2-4 short bullets under 90 characters each.",
    "agencyCommonComplaints must be 0-3 short phrases under 32 characters.",
    "agencyNegotiationLeverage must be 1-2 short sentences under 170 characters.",
    "If evidence is thin, keep the field cautious and short rather than guessing.",
    "Do not copy reviews, business directories, opening hours, or rating widgets.",
    "Only mention the provided agency if the grounded evidence clearly matches that agency.",
    JSON.stringify(
      {
        propertyAddress: resolvedAddress,
        coordinates,
        agency: args.agency,
        propertyNotes: args.propertyNotes,
        baseGeoAnalysis: args.baseGeoAnalysis,
      },
      null,
      2
    ),
  ].join("\n");

  const grounded = await callGeminiGroundedJson({
    model: appEnv.geminiGroundedModel,
    schema: groundedLocalSummarySchema,
    prompt: groundedPrompt,
    coordinates,
    languageCode: "en-AU",
    timeoutMs: args.depth === "full" ? 18_000 : 16_000,
  });

  return {
    resolvedAddress,
    geoSummary: sanitizeDisplayText(grounded.data.geoSummary, { maxLength: 170, maxSegments: 2 }),
    geoKeySignals: sanitizeDisplayList(normalizeStringList(grounded.data.geoKeySignals), {
      maxItems: 4,
      itemMaxLength: 80,
    }),
    communityInsight: sanitizeCommunity(
      grounded.data.communitySummary,
      grounded.data.communityHighlights,
      grounded.data.communitySentiment,
      grounded.catalog,
      resolvedAddress
    ),
    agencyBackground: sanitizeAgency(
      args.agency,
      grounded.data.agencySummary,
      grounded.data.agencyHighlights,
      grounded.data.agencySentimentScore,
      grounded.data.agencyCommonComplaints,
      grounded.data.agencyNegotiationLeverage,
      grounded.catalog
    ),
    provider: "gemini-2.5+google-maps-grounding",
    fallbackReason: undefined,
  } as const;
}
