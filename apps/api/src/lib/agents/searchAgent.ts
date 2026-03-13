import { z } from "zod";
import type { AgencyBackground, IntelligenceDepth } from "@inspect-ai/contracts";
import { agencyBackgroundSchema, sanitizeDisplayList, sanitizeDisplayText } from "@inspect-ai/contracts";
import { callGeminiJson, callGeminiSearchGroundedJson, sanitizeCitations, type SourceCatalogItem } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { buildAgencyFallback } from "@/lib/fallbacks";
import { type GroundedCatalogItem } from "@/lib/grounding";
import { filterGroundedWebCatalog } from "@/lib/search/relevance";

const searchPassSchema = z.object({
  summary: z.string().optional(),
  highlights: z.union([z.array(z.string()).max(4), z.string()]).optional(),
  sentimentScore: z.union([z.number().min(1).max(5), z.string()]).optional(),
  commonComplaints: z.union([z.array(z.string()).max(3), z.string()]).optional(),
  negotiationLeverage: z.string().optional(),
});

interface QueryFamilyPass {
  family: string;
  prompt: string;
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
        sourceId: `agency-${merged.length + 1}`,
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

function buildPasses(agency: string, depth: IntelligenceDepth): QueryFamilyPass[] {
  return [
    {
      family: "communication-and-professionalism",
      prompt: [
        `Search family: communication and professionalism for the real estate agency "${agency}" in Australia.`,
        "Focus on renter-facing review signals about communication quality, follow-up, professionalism, and general service handling.",
        "Prioritize tenant reviews, complaint threads, tribunal-style discussion, and detailed public review pages. Avoid official agency websites, map listings, agent profile pages, and business directories.",
        "Return only JSON.",
        "summary must be under 140 characters.",
        "highlights must be 2-4 short bullets under 80 characters each.",
        "sentimentScore must be a number from 1 to 5.",
        "commonComplaints must be 0-3 short phrases under 28 characters.",
        "negotiationLeverage must be under 140 characters.",
      ].join("\n"),
    },
    {
      family: "maintenance-and-repairs",
      prompt: [
        `Search family: maintenance and repairs for the real estate agency "${agency}" in Australia.`,
        "Focus on maintenance response, repairs, work orders, inspection follow-through, and tenant complaint themes related to property issues.",
        "Prioritize tenant reviews, complaint threads, tribunal-style discussion, and detailed public review pages. Avoid official agency websites, map listings, agent profile pages, and business directories.",
        "Return only JSON.",
        "summary must be under 140 characters.",
        "highlights must be 2-4 short bullets under 80 characters each.",
        "sentimentScore must be a number from 1 to 5.",
        "commonComplaints must be 0-3 short phrases under 28 characters.",
        "negotiationLeverage must be under 140 characters.",
      ].join("\n"),
    },
    {
      family: "bond-fees-and-paperwork",
      prompt: [
        `Search family: bond, fees, and paperwork for the real estate agency "${agency}" in Australia.`,
        "Focus on public renter complaints about bond handling, hidden fees, lease paperwork, documentation quality, and move-in or move-out disputes.",
        "Prioritize tenant reviews, complaint threads, tribunal-style discussion, and detailed public review pages. Avoid official agency websites, map listings, agent profile pages, and business directories.",
        "Return only JSON.",
        "summary must be under 140 characters.",
        "highlights must be 2-4 short bullets under 80 characters each.",
        "sentimentScore must be a number from 1 to 5.",
        "commonComplaints must be 0-3 short phrases under 28 characters.",
        "negotiationLeverage must be under 140 characters.",
      ].join("\n"),
    },
    ...(depth === "full"
      ? [
          {
            family: "inspection-disputes-and-escalations",
            prompt: [
              `Search family: inspections, disputes, and escalations for the real estate agency "${agency}" in Australia.`,
              "Focus on public warnings, dispute patterns, inspection conduct, condition report disputes, tribunal-style complaints, and repeated renter pain points.",
              "Prioritize tenant reviews, complaint threads, tribunal-style discussion, and detailed public review pages. Avoid official agency websites, map listings, agent profile pages, and business directories.",
              "Return only JSON.",
              "summary must be under 140 characters.",
              "highlights must be 2-4 short bullets under 80 characters each.",
              "sentimentScore must be a number from 1 to 5.",
              "commonComplaints must be 0-3 short phrases under 28 characters.",
              "negotiationLeverage must be under 140 characters.",
            ].join("\n"),
          },
        ]
      : []),
  ];
}

export async function analyzeAgencyBackground(args: {
  agency?: string;
  depth: IntelligenceDepth;
}) {
  const searchTimeoutMs = args.depth === "full" ? 12_000 : 8_000;
  const synthTimeoutMs = args.depth === "full" ? 7_500 : 5_500;
  const agency = args.agency?.trim();
  if (!agency) {
    return {
      agencyBackground: buildAgencyFallback({ reason: "Agency name not provided." }),
      fallbackReason: "agency_missing",
      provider: "fallback",
    };
  }

  try {
    const passResults = await Promise.allSettled(
      buildPasses(agency, args.depth).map(({ family, prompt }) =>
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
      channel: "agency",
      context: [agency, "maintenance repairs bond lease inspection dispute communication"],
      minScore: 4,
    });

    if (filteredCatalog.length === 0) {
      return {
        agencyBackground: buildAgencyFallback({
          agency,
          reason: "Google Search grounding returned no usable evidence.",
        }),
        fallbackReason: "agency_search_grounding_empty",
        provider: "fallback",
      };
    }

    const sourceCatalog = toSourceCatalog(filteredCatalog);
    const structured = await callGeminiJson({
      model: appEnv.geminiIntelligenceModel,
      schema: agencyBackgroundSchema,
      timeoutMs: synthTimeoutMs,
      prompt: [
        `Summarize public reputation signals for the real estate agency "${agency}" in Australia.`,
        "You are synthesizing evidence from multiple Google Search grounded passes.",
        "Prefer repeated or corroborated public themes over isolated comments.",
        "Return only JSON.",
        "agencyName must be the clean agency name.",
        "summary must be under 180 characters and only about the named agency.",
        "highlights must be 2-4 short bullets under 90 characters each.",
        "commonComplaints must be 0-3 short phrases under 32 characters.",
        "negotiationLeverage must be 1-2 short renter-facing sentences under 170 characters.",
        "sentimentScore must be a number from 1 to 5.",
        "Do not include opening hours, review widgets, or copied directory listings.",
        "You must cite only from the provided source catalog, using exact sourceId, title, and url values.",
        JSON.stringify({ sourceCatalog }, null, 2),
      ].join("\n"),
    });

    return {
      agencyBackground: agencyBackgroundSchema.parse({
        ...structured,
        agencyName: agency,
        summary: structured.summary
          ? sanitizeDisplayText(structured.summary, {
              maxLength: 180,
              maxSegments: 2,
              fallback: structured.summary,
            })
          : undefined,
        highlights: sanitizeDisplayList(normalizeStringList(structured.highlights), {
          maxItems: 4,
          itemMaxLength: 90,
        }),
        sentimentScore: normalizeSentimentScore(structured.sentimentScore),
        commonComplaints: sanitizeDisplayList(normalizeStringList(structured.commonComplaints), {
          maxItems: 3,
          itemMaxLength: 32,
        }),
        negotiationLeverage: sanitizeDisplayText(structured.negotiationLeverage, {
          maxLength: 170,
          maxSegments: 2,
          fallback: structured.negotiationLeverage,
        }),
        citations: sanitizeCitations(
          structured.citations,
          rankCatalog(filteredCatalog, [agency, "real estate", "property management", "reviews", "complaints"], 3)
        ),
      } satisfies AgencyBackground),
      provider: "gemini+google-search",
    };
  } catch {
    return {
      agencyBackground: buildAgencyFallback({ agency, reason: "Google Search grounding failed." }),
      fallbackReason: "agency_search_failed",
      provider: "fallback",
    };
  }
}
