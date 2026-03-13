import type { CommunityInsight, IntelligenceDepth } from "@inspect-ai/contracts";
import { communityInsightSchema } from "@inspect-ai/contracts";
import { callGeminiJson, sanitizeCitations, type SourceCatalogItem } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { buildCommunityFallback, scoreSnippetSentiment } from "@/lib/fallbacks";
import { getTavilyClient } from "@/lib/providers/tavily";
import { withTimeout } from "@/lib/http";

function buildLocationLabel(address?: string, coordinates?: { lat: number; lng: number }) {
  if (address?.trim()) {
    return address.trim();
  }

  if (coordinates) {
    return `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`;
  }

  return "";
}

function buildCatalog(results: Array<{ title: string; url: string; content: string }>): SourceCatalogItem[] {
  return results.map((result, index) => ({
    sourceId: `community-${index + 1}`,
    title: result.title,
    url: result.url,
    snippet: result.content,
    provider: "tavily",
  }));
}

export async function researchCommunity(args: {
  address?: string;
  coordinates?: { lat: number; lng: number };
  propertyNotes?: string;
  depth: IntelligenceDepth;
}) {
  const locationLabel = buildLocationLabel(args.address, args.coordinates);
  if (!locationLabel) {
    return {
      communityInsight: buildCommunityFallback({ reason: "No address or coordinates were provided." }),
      fallbackReason: "community_missing_location",
      provider: "fallback",
    };
  }

  const tavily = getTavilyClient();
  if (!tavily) {
    return {
      communityInsight: buildCommunityFallback({
        address: args.address,
        reason: "Search provider not configured.",
      }),
      fallbackReason: "tavily_unconfigured",
      provider: "fallback",
    };
  }

  try {
    const search = await withTimeout(
      () =>
        tavily.search(
          `${locationLabel} renters forum review noise traffic safety construction public transport ${args.propertyNotes ?? ""}`.trim(),
          {
            topic: "general",
            searchDepth: args.depth === "full" ? "advanced" : "fast",
            maxResults: args.depth === "full" ? 8 : 5,
            includeRawContent: "markdown",
          }
        ),
      18_000
    );

    const catalog = buildCatalog(search.results);
    if (catalog.length === 0) {
      return {
        communityInsight: buildCommunityFallback({
          address: args.address,
          reason: "No public community results found.",
        }),
        fallbackReason: "community_results_empty",
        provider: "fallback",
      };
    }

    try {
      const structured = await callGeminiJson({
        model: appEnv.geminiIntelligenceModel,
        schema: communityInsightSchema,
        timeoutMs: 15_000,
        prompt: [
          `Summarize public rental-living signals for "${locationLabel}".`,
          "Differentiate between factual signals and subjective opinions.",
          "Return only JSON.",
          "You must cite only from the provided source catalog, using exact sourceId, title, and url values.",
          JSON.stringify({ sourceCatalog: catalog }, null, 2),
        ].join("\n"),
      });

      return {
        communityInsight: {
          ...structured,
          citations: sanitizeCitations(structured.citations, catalog),
        } satisfies CommunityInsight,
        provider: "gemini+tavily",
      };
    } catch {
      const snippets = catalog.map((item) => item.snippet ?? "");
      const sentimentScore = scoreSnippetSentiment(snippets);

      return {
        communityInsight: {
          summary: snippets
            .slice(0, 3)
            .filter(Boolean)
            .join(" ")
            .slice(0, 420) || buildCommunityFallback({ address: args.address }).summary,
          sentiment:
            sentimentScore <= -3
              ? "negative"
              : sentimentScore < 0
                ? "mixed"
                : sentimentScore === 0
                  ? "neutral"
                  : "positive",
          citations: sanitizeCitations(
            catalog.slice(0, 4).map(({ sourceId, title, url }) => ({ sourceId, title, url })),
            catalog
          ),
        },
        fallbackReason: "community_gemini_failed",
        provider: "tavily",
      };
    }
  } catch {
    return {
      communityInsight: buildCommunityFallback({
        address: args.address,
        reason: "Search request failed.",
      }),
      fallbackReason: "community_search_failed",
      provider: "fallback",
    };
  }
}
