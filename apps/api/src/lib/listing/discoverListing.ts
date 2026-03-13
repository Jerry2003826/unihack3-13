import { sanitizeDisplayText, type ListingDiscoverResponse } from "@inspect-ai/contracts";
import { callGeminiSearchGroundedJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import type { GroundedCatalogItem } from "@/lib/grounding";
import { z } from "zod";

const discoverySchema = z.object({
  summary: z.string().optional(),
});

const LISTING_HOST_BONUSES = [
  "realestate.com.au",
  "domain.com.au",
  "rent.com.au",
  "flatmates.com.au",
  "student.com",
  "iglu.com.au",
  "scape.com.au",
  "journalstudentliving.com",
  "unilodge.com.au",
];

function tokenize(value?: string) {
  return [...new Set((value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3))];
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function scoreListingCandidate(item: GroundedCatalogItem, address: string, agency?: string) {
  const hostname = getHostname(item.url);
  const title = item.title.toLowerCase();
  const url = item.url.toLowerCase();
  const addressTokens = tokenize(address);
  const agencyTokens = tokenize(agency);
  const haystack = `${title} ${url} ${item.snippet ?? ""}`.toLowerCase();

  let score = 0;

  if (LISTING_HOST_BONUSES.some((host) => hostname.includes(host))) {
    score += 6;
  }
  if (/property|rental|rent|lease|apartment|unit|studio|townhouse|inspection/i.test(haystack)) {
    score += 4;
  }
  if (/\/property|\/rent|\/lease|\/listing|\/residential|\/rental/i.test(url)) {
    score += 4;
  }

  score += addressTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
  score += agencyTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);

  if (/maps\.google|cid=|\/place\//i.test(url)) {
    score -= 8;
  }
  if (/opening hours|get directions|official website|contact us/i.test(haystack)) {
    score -= 4;
  }

  return score;
}

function toConfidence(score: number): "low" | "medium" | "high" {
  if (score >= 12) return "high";
  if (score >= 7) return "medium";
  return "low";
}

function dedupeCatalog(catalog: GroundedCatalogItem[]) {
  const seen = new Set<string>();
  return catalog.filter((item) => {
    if (seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

export async function discoverListingFromAddress(args: {
  address: string;
  agency?: string;
}): Promise<ListingDiscoverResponse> {
  const passes = await Promise.allSettled([
    callGeminiSearchGroundedJson({
      model: appEnv.geminiGroundedModel,
      schema: discoverySchema,
      timeoutMs: 7_000,
      prompt: [
        `Find likely rental listing pages for the address "${args.address}" in Australia.`,
        args.agency ? `The agency may be "${args.agency}".` : "",
        "Prioritize actual rental listing pages from realestate portals, student housing operators, or agent property pages.",
        "Avoid map pages, directories, contact pages, and generic agency homepages.",
        "Return only JSON.",
      ]
        .filter(Boolean)
        .join("\n"),
    }),
    callGeminiSearchGroundedJson({
      model: appEnv.geminiGroundedModel,
      schema: discoverySchema,
      timeoutMs: 7_000,
      prompt: [
        `Search for rental listing pages that match "${args.address}".`,
        args.agency ? `Look for pages associated with "${args.agency}" when relevant.` : "",
        "Prefer realestate.com.au, domain.com.au, rent.com.au, student accommodation operators, and agent property pages.",
        "Avoid map pages, office profile pages, and business directories.",
        "Return only JSON.",
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  ]);

  const merged = dedupeCatalog(
    passes.flatMap((result) => (result.status === "fulfilled" ? result.value.catalog.filter((item) => item.sourceId.startsWith("web-")) : []))
  );

  const candidates = merged
    .map((item) => ({
      item,
      score: scoreListingCandidate(item, args.address, args.agency),
    }))
    .filter((entry) => entry.score >= 6)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ item, score }) => ({
      url: item.url,
      title: sanitizeDisplayText(item.title, { maxLength: 96, maxSegments: 2, fallback: item.title }),
      reason: sanitizeDisplayText(
        LISTING_HOST_BONUSES.some((host) => getHostname(item.url).includes(host))
          ? "Matches the address on a listing-style property page."
          : "Looks like a likely rental listing page for this address.",
        { maxLength: 120, maxSegments: 2 }
      ),
      confidence: toConfidence(score),
    }));

  const selectedUrl = candidates.find((candidate) => candidate.confidence === "high")?.url ?? candidates[0]?.url;

  return {
    selectedUrl,
    candidates,
    summary:
      candidates.length > 0
        ? `Found ${candidates.length} likely listing page${candidates.length > 1 ? "s" : ""} for this address.`
        : "No reliable listing page could be inferred from the address.",
    provider: candidates.length > 0 ? "gemini+google-search" : "fallback",
  };
}
