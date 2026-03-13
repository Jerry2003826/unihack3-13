import type { AgencyBackground, IntelligenceDepth } from "@inspect-ai/contracts";
import { agencyBackgroundSchema } from "@inspect-ai/contracts";
import { callGeminiJson, sanitizeCitations, type SourceCatalogItem } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { buildAgencyFallback, deriveComplaints, scoreSnippetSentiment } from "@/lib/fallbacks";
import { getTavilyClient } from "@/lib/providers/tavily";
import { withTimeout } from "@/lib/http";

function buildCatalog(results: Array<{ title: string; url: string; content: string }>): SourceCatalogItem[] {
  return results.map((result, index) => ({
    sourceId: `agency-${index + 1}`,
    title: result.title,
    url: result.url,
    snippet: result.content,
    provider: "tavily",
  }));
}

export async function analyzeAgencyBackground(args: {
  agency?: string;
  depth: IntelligenceDepth;
}) {
  const agency = args.agency?.trim();
  if (!agency) {
    return {
      agencyBackground: buildAgencyFallback({ reason: "Agency name not provided." }),
      fallbackReason: "agency_missing",
      provider: "fallback",
    };
  }

  const tavily = getTavilyClient();
  if (!tavily) {
    return {
      agencyBackground: buildAgencyFallback({ agency, reason: "Search provider not configured." }),
      fallbackReason: "tavily_unconfigured",
      provider: "fallback",
    };
  }

  try {
    const search = await withTimeout(
      () =>
        tavily.search(`${agency} property manager reviews complaints maintenance Australia`, {
          topic: "general",
          searchDepth: args.depth === "full" ? "advanced" : "fast",
          maxResults: args.depth === "full" ? 6 : 4,
          includeRawContent: "markdown",
        }),
      15_000
    );

    const catalog = buildCatalog(search.results);
    if (catalog.length === 0) {
      return {
        agencyBackground: buildAgencyFallback({ agency, reason: "No public review results found." }),
        fallbackReason: "agency_results_empty",
        provider: "fallback",
      };
    }

    try {
      const structured = await callGeminiJson({
        model: appEnv.geminiIntelligenceModel,
        schema: agencyBackgroundSchema,
        timeoutMs: 15_000,
        prompt: [
          `Summarize public reputation signals for the agency "${agency}".`,
          "Return only JSON.",
          "You must cite only from the provided source catalog, using exact sourceId, title, and url values.",
          "Do not invent links.",
          JSON.stringify({ sourceCatalog: catalog }, null, 2),
        ].join("\n"),
      });

      return {
        agencyBackground: {
          ...structured,
          agencyName: agency,
          citations: sanitizeCitations(structured.citations, catalog),
        } satisfies AgencyBackground,
        provider: "gemini+tavily",
      };
    } catch {
      const snippets = catalog.map((item) => item.snippet ?? "");
      const sentimentScore = Math.max(1, Math.min(5, 3 + scoreSnippetSentiment(snippets) * 0.25));
      const commonComplaints = deriveComplaints(snippets);

      return {
        agencyBackground: {
          agencyName: agency,
          sentimentScore,
          commonComplaints,
          negotiationLeverage:
            commonComplaints.length > 0
              ? `Use recent review themes as leverage: ${commonComplaints.slice(0, 2).join(", ")}.`
              : "Public review data is limited. Ask for written repair and response-time commitments.",
          citations: sanitizeCitations(
            catalog.slice(0, 3).map(({ sourceId, title, url }) => ({ sourceId, title, url })),
            catalog
          ),
        },
        fallbackReason: "agency_gemini_failed",
        provider: "tavily",
      };
    }
  } catch {
    return {
      agencyBackground: buildAgencyFallback({ agency, reason: "Search request failed." }),
      fallbackReason: "agency_search_failed",
      provider: "fallback",
    };
  }
}
