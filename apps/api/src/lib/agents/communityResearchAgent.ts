import { z } from "zod";
import type { CommunityInsight, IntelligenceDepth } from "@inspect-ai/contracts";
import { communityInsightSchema, sanitizeDisplayList, sanitizeDisplayText } from "@inspect-ai/contracts";
import { callGeminiJson, callGeminiSearchGroundedJson, sanitizeCitations, type SourceCatalogItem } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { buildCommunityFallback } from "@/lib/fallbacks";
import { type GroundedCatalogItem } from "@/lib/grounding";
import { filterGroundedWebCatalog } from "@/lib/search/relevance";

const searchPassSchema = z.object({
  summary: z.string().optional(),
  highlights: z.union([z.array(z.string()).max(4), z.string()]).optional(),
  sentiment: z.string().optional(),
});

interface QueryFamilyPass {
  family: string;
  prompt: string;
}

function buildLocationLabel(address?: string, coordinates?: { lat: number; lng: number }) {
  if (address?.trim()) {
    return address.trim();
  }

  if (coordinates) {
    return `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`;
  }

  return "";
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
  if (normalized.includes("positive")) return "positive";
  if (normalized.includes("negative")) return "negative";
  if (normalized.includes("mixed")) return "mixed";
  if (normalized.includes("neutral")) return "neutral";
  return "unknown";
}

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

  return (ranked.length > 0 ? ranked.map((entry) => entry.item) : catalog).slice(0, limit);
}

function mergeCatalogs(catalogs: GroundedCatalogItem[][]) {
  const merged: GroundedCatalogItem[] = [];
  const seen = new Set<string>();

  for (const catalog of catalogs) {
    for (const item of catalog) {
      const key = `${item.title}::${item.url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push({
        ...item,
        sourceId: `community-${merged.length + 1}`,
      });
    }
  }

  return merged;
}

function toSourceCatalog(catalog: GroundedCatalogItem[]): SourceCatalogItem[] {
  return catalog.map((item) => ({
    sourceId: item.sourceId,
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    provider: item.provider,
  }));
}

function annotateCatalogWithFamily(catalog: GroundedCatalogItem[], family: string) {
  return catalog.map((item) => ({
    ...item,
    snippet: [`Family: ${family}`, item.snippet ?? item.title].filter(Boolean).join(" | "),
  }));
}

function buildPasses(
  locationLabel: string,
  propertyNotes: string | undefined,
  depth: IntelligenceDepth
): QueryFamilyPass[] {
  return [
    {
      family: "noise-and-traffic",
      prompt: [
        `Search family: noise and traffic for "${locationLabel}".`,
        "Look for renter-relevant signals about road noise, peak-hour congestion, tram or train noise, bus activity, and traffic spillover.",
        "Prioritize forum threads, community discussion, local news, and complaint-style pages. Avoid map listings, business directories, opening-hours pages, and transit stop cards.",
        propertyNotes ? `Property notes: ${propertyNotes}` : "",
        "Return only JSON.",
        "summary must be under 140 characters.",
        "highlights must be 2-4 short bullets under 80 characters each.",
        "sentiment must be one of: positive, neutral, mixed, negative, unknown.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      family: "construction-and-disruption",
      prompt: [
        `Search family: construction and disruption for "${locationLabel}".`,
        "Look for roadworks, nearby construction, industrial disturbance, access issues, dust, or recurring disruption relevant to renters.",
        "Prioritize local news, council notices, forum discussion, and complaint-style pages. Avoid map listings, business directories, opening-hours pages, and generic place cards.",
        propertyNotes ? `Property notes: ${propertyNotes}` : "",
        "Return only JSON.",
        "summary must be under 140 characters.",
        "highlights must be 2-4 short bullets under 80 characters each.",
        "sentiment must be one of: positive, neutral, mixed, negative, unknown.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      family: "safety-and-after-hours",
      prompt: [
        `Search family: safety and after-hours activity for "${locationLabel}".`,
        "Look for renter-relevant signals about late-night activity, street lighting, antisocial behaviour, and after-hours comfort returning home.",
        "Prioritize community discussion, local news, renter forums, and complaint-style pages. Avoid map listings, business directories, opening-hours pages, and transit stop cards.",
        propertyNotes ? `Property notes: ${propertyNotes}` : "",
        "Return only JSON.",
        "summary must be under 140 characters.",
        "highlights must be 2-4 short bullets under 80 characters each.",
        "sentiment must be one of: positive, neutral, mixed, negative, unknown.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...(depth === "full"
      ? [
          {
            family: "renter-forums-and-building-chat",
            prompt: [
              `Search family: renter forums and building chat for "${locationLabel}".`,
              "Look for forum-style renter discussion, apartment living feedback, building complaints, neighbour noise, and repeated tenant warnings.",
              "Prioritize forum threads, Reddit-style discussion, complaint pages, and resident conversations. Avoid map listings, business directories, opening-hours pages, and generic place cards.",
              propertyNotes ? `Property notes: ${propertyNotes}` : "",
              "Return only JSON.",
              "summary must be under 140 characters.",
              "highlights must be 2-4 short bullets under 80 characters each.",
              "sentiment must be one of: positive, neutral, mixed, negative, unknown.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
          {
            family: "street-liveability-and-parking",
            prompt: [
              `Search family: street liveability and parking for "${locationLabel}".`,
              "Look for renter-relevant comments about walkability, parking pressure, daily convenience, and whether the street feels easy or frustrating to live on.",
              "Prioritize community discussion, resident feedback, local news, and complaint-style pages. Avoid map listings, business directories, opening-hours pages, and generic place cards.",
              propertyNotes ? `Property notes: ${propertyNotes}` : "",
              "Return only JSON.",
              "summary must be under 140 characters.",
              "highlights must be 2-4 short bullets under 80 characters each.",
              "sentiment must be one of: positive, neutral, mixed, negative, unknown.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ]
      : []),
  ];
}

export async function researchCommunity(args: {
  address?: string;
  coordinates?: { lat: number; lng: number };
  propertyNotes?: string;
  depth: IntelligenceDepth;
}) {
  const searchTimeoutMs = args.depth === "full" ? 12_000 : 8_000;
  const synthTimeoutMs = args.depth === "full" ? 7_500 : 5_500;
  const locationLabel = buildLocationLabel(args.address, args.coordinates);
  if (!locationLabel) {
    return {
      communityInsight: buildCommunityFallback({ reason: "No address or coordinates were provided." }),
      fallbackReason: "community_missing_location",
      provider: "fallback",
    };
  }

  try {
    const passResults = await Promise.allSettled(
      buildPasses(locationLabel, args.propertyNotes, args.depth).map(({ family, prompt }) =>
        callGeminiSearchGroundedJson({
          model: appEnv.geminiGroundedModel,
          schema: searchPassSchema,
          timeoutMs: searchTimeoutMs,
          prompt,
        }).then((result) => ({
          ...result,
          catalog: annotateCatalogWithFamily(
            result.catalog.filter((item) => item.sourceId.startsWith("web-")),
            family
          ),
        }))
      )
    );

    const mergedCatalog = mergeCatalogs(
      passResults.flatMap((result) => (result.status === "fulfilled" ? [result.value.catalog] : []))
    );
    const filteredCatalog = filterGroundedWebCatalog(mergedCatalog, {
      channel: "community",
      context: [locationLabel, args.propertyNotes ?? "", "renters noise traffic safety construction parking"],
      minScore: 4,
    });

    if (filteredCatalog.length === 0) {
      return {
        communityInsight: buildCommunityFallback({
          address: args.address,
          reason: "Google Search grounding returned no usable evidence.",
        }),
        fallbackReason: "community_search_grounding_empty",
        provider: "fallback",
      };
    }

    const sourceCatalog = toSourceCatalog(filteredCatalog);
    const structured = await callGeminiJson({
      model: appEnv.geminiIntelligenceModel,
      schema: communityInsightSchema,
      timeoutMs: synthTimeoutMs,
      prompt: [
        `Summarize public renter-relevant community signals for "${locationLabel}".`,
        args.propertyNotes ? `Property notes: ${args.propertyNotes}` : "",
        "You are synthesizing evidence from multiple Google Search grounded passes.",
        "Prefer repeated or corroborated signals over one-off mentions.",
        "Return only JSON.",
        "summary must be renter-facing, concise, and readable in 1-2 short sentences.",
        "Keep summary under 220 characters.",
        "highlights must be 2-4 short bullets under 90 characters each.",
        "sentiment must be one of: positive, neutral, mixed, negative, unknown.",
        "Do not include opening hours, rating widgets, business directory fragments, or copied list pages.",
        "You must cite only from the provided source catalog, using exact sourceId, title, and url values.",
        JSON.stringify({ sourceCatalog }, null, 2),
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return {
      communityInsight: communityInsightSchema.parse({
        ...structured,
        summary: sanitizeDisplayText(structured.summary, {
          maxLength: 220,
          maxSegments: 2,
          fallback: structured.summary,
        }),
        highlights: sanitizeDisplayList(normalizeStringList(structured.highlights), {
          maxItems: 4,
          itemMaxLength: 90,
        }),
        sentiment: normalizeCommunitySentiment(structured.sentiment),
        citations: sanitizeCitations(
          structured.citations,
          rankCatalog(filteredCatalog, [locationLabel, "renters", "noise", "traffic", "safety"], 4)
        ),
      }),
      provider: "gemini+google-search",
    };
  } catch {
    return {
      communityInsight: buildCommunityFallback({
        address: args.address,
        reason: "Google Search grounding failed.",
      }),
      fallbackReason: "community_search_failed",
      provider: "fallback",
    };
  }
}
