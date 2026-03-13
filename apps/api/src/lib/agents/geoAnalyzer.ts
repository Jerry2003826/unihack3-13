import { z } from "zod";
import type {
  DestinationPoint,
  GeoAnalysis,
  IntelligenceDepth,
} from "@inspect-ai/contracts";
import { geoAnalysisSchema, sanitizeDisplayList, sanitizeDisplayText } from "@inspect-ai/contracts";
import { callGeminiJson, callGeminiSearchGroundedJson, type SourceCatalogItem } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { buildGeoFallback, scoreSnippetSentiment } from "@/lib/fallbacks";
import { fetchJson } from "@/lib/http";
import { type GroundedCatalogItem } from "@/lib/grounding";
import { geocodeAddress } from "@/lib/providers/googleMapsGeocode";
import { fetchNearbyEssentials } from "@/lib/providers/googlePlaces";
import { filterGroundedWebCatalog } from "@/lib/search/relevance";

interface Coordinates {
  lat: number;
  lng: number;
}

interface PlacesSearchResponse {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
  }>;
}

interface RoutesResponse {
  routes?: Array<{
    duration?: string;
  }>;
}

const groundedGeoRiskSchema = z.object({
  summary: z.string().optional(),
  signals: z.union([z.array(z.string()).max(4), z.string()]).optional(),
  noiseRisk: z.string().optional(),
});

const synthesizedGeoRiskSchema = z.object({
  summary: z.string(),
  signals: z.array(z.string()).max(4),
  noiseRisk: z.string(),
});

interface QueryFamilyPass {
  family: string;
  prompt: string;
}

function parseDurationMinutes(duration?: string) {
  if (!duration) {
    return null;
  }

  const seconds = Number(duration.replace(/s$/, ""));
  if (!Number.isFinite(seconds)) {
    return null;
  }

  return Math.max(1, Math.round(seconds / 60));
}

async function searchNearbyTransit(coordinates: Coordinates) {
  const apiKey = appEnv.googleMapsApiKey;
  if (!apiKey) {
    return [];
  }

  const response = await fetchJson<PlacesSearchResponse>("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
      timeoutMs: 10_000,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
      },
    body: JSON.stringify({
      textQuery: `public transport station near ${coordinates.lat}, ${coordinates.lng}`,
      maxResultCount: 3,
      locationBias: {
        circle: {
          center: {
            latitude: coordinates.lat,
            longitude: coordinates.lng,
          },
          radius: 1200,
        },
      },
    }),
  });

  return (response.places ?? []).map((place) =>
    [place.displayName?.text, place.formattedAddress].filter(Boolean).join(" - ")
  );
}

async function computeDestinationConvenience(origin: Coordinates, destinations?: DestinationPoint[]) {
  const apiKey = appEnv.googleMapsApiKey;
  if (!apiKey || !destinations?.length) {
    return [];
  }

  const results = await Promise.all(
    destinations.slice(0, 3).map(async (destination) => {
      try {
        const response = await fetchJson<RoutesResponse>("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          timeoutMs: 10_000,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "routes.duration",
          },
          body: JSON.stringify({
            origin: {
              location: {
                latLng: {
                  latitude: origin.lat,
                  longitude: origin.lng,
                },
              },
            },
            destination: {
              location: {
                latLng: {
                  latitude: destination.coordinates.lat,
                  longitude: destination.coordinates.lng,
                },
              },
            },
            travelMode: "TRANSIT",
          }),
        });

        const minutes = parseDurationMinutes(response.routes?.[0]?.duration);
        return minutes ? `${destination.label} - ${minutes} min by public transport` : null;
      } catch {
        return `${destination.label} - commute check required`;
      }
    })
  );

  return results.filter(Boolean) as string[];
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
        sourceId: `geo-${merged.length + 1}`,
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

function normalizeNoiseRisk(value: string | undefined, snippets: string[]): GeoAnalysis["noiseRisk"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized?.includes("high")) {
    return "High";
  }
  if (normalized?.includes("medium")) {
    return "Medium";
  }
  if (normalized?.includes("low")) {
    return "Low";
  }

  const sentiment = scoreSnippetSentiment(snippets);
  return sentiment <= -3 ? "High" : sentiment < 0 ? "Medium" : "Low";
}

async function searchRiskSignals(label: string, depth: IntelligenceDepth) {
  try {
    const prompts: QueryFamilyPass[] = [
      {
        family: "noise-and-traffic",
        prompt: [
          `Search family: noise and traffic for "${label}".`,
          "Focus on renter-relevant road noise, congestion, bus or train noise, major-road exposure, and recurring traffic complaints.",
          "Prioritize local news, council notices, community discussion, and complaint-style pages. Avoid map listings, stop cards, business directories, and generic place pages.",
          "Return only JSON.",
          "summary must be under 140 characters.",
          "signals must be 2-4 short bullets under 75 characters each.",
          "noiseRisk must be one of: Low, Medium, High.",
        ].join("\n"),
      },
      {
        family: "construction-and-disruption",
        prompt: [
          `Search family: construction and disruption for "${label}".`,
          "Focus on roadworks, nearby construction, dust, access disruption, industrial disturbance, and recurring renter complaints about works.",
          "Prioritize local news, council notices, community discussion, and complaint-style pages. Avoid map listings, stop cards, business directories, and generic place pages.",
          "Return only JSON.",
          "summary must be under 140 characters.",
          "signals must be 2-4 short bullets under 75 characters each.",
          "noiseRisk must be one of: Low, Medium, High.",
        ].join("\n"),
      },
      {
        family: "safety-and-after-hours",
        prompt: [
          `Search family: safety and after-hours activity for "${label}".`,
          "Focus on street safety, late-night activity, practical after-hours concerns for renters, and whether the area feels comfortable returning home at night.",
          "Prioritize local news, community discussion, council notices, and complaint-style pages. Avoid map listings, stop cards, business directories, and generic place pages.",
          "Return only JSON.",
          "summary must be under 140 characters.",
          "signals must be 2-4 short bullets under 75 characters each.",
          "noiseRisk must be one of: Low, Medium, High.",
        ].join("\n"),
      },
      ...(depth === "full"
        ? [
            {
              family: "renter-complaints-and-building-warnings",
              prompt: [
                `Search family: renter complaints and building warnings for "${label}".`,
                "Focus on renter complaints about the building, nearby disruption, neighbour issues, and repeated local warnings that affect day-to-day living.",
                "Prioritize forum threads, resident discussion, local news, and complaint-style pages. Avoid map listings, stop cards, business directories, and generic place pages.",
                "Return only JSON.",
                "summary must be under 140 characters.",
                "signals must be 2-4 short bullets under 75 characters each.",
                "noiseRisk must be one of: Low, Medium, High.",
              ].join("\n"),
            },
          ]
        : []),
    ];

    const passResults = await Promise.allSettled(
      prompts.map(({ family, prompt }) =>
        callGeminiSearchGroundedJson({
          model: appEnv.geminiGroundedModel,
          schema: groundedGeoRiskSchema,
          timeoutMs: depth === "full" ? 10_000 : 7_000,
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
      channel: "geo",
      context: [label, "noise traffic construction safety late night parking renters"],
      minScore: 4,
    });
    const snippets = filteredCatalog.map((item) => item.snippet ?? item.title).filter(Boolean);

    if (filteredCatalog.length === 0) {
      return {
        snippets,
        summary: undefined,
        signals: [],
        noiseRisk: "Low" as const,
        provider: "fallback",
      };
    }

    const structured = await callGeminiJson({
      model: appEnv.geminiIntelligenceModel,
      schema: synthesizedGeoRiskSchema,
      timeoutMs: depth === "full" ? 7_000 : 5_000,
      prompt: [
        `Summarize renter-relevant public web signals for "${label}".`,
        "You are synthesizing evidence from multiple Google Search grounded passes.",
        "Prefer repeated or corroborated signals over isolated comments.",
        "Return only JSON.",
        "summary must be a short renter-facing sentence under 170 characters.",
        "signals must be 2-4 short bullets under 80 characters each.",
        "noiseRisk must be one of: Low, Medium, High.",
        "Do not include business directory fragments, review widgets, opening hours, or copied list pages.",
        JSON.stringify({ sourceCatalog: toSourceCatalog(filteredCatalog) }, null, 2),
      ].join("\n"),
    });

    return {
      snippets,
      summary: sanitizeDisplayText(structured.summary, { maxLength: 170, maxSegments: 2 }),
      signals: sanitizeDisplayList(normalizeStringList(structured.signals), {
        maxItems: 4,
        itemMaxLength: 80,
      }),
      noiseRisk: normalizeNoiseRisk(structured.noiseRisk, snippets),
      provider: "gemini+google-search",
    };
  } catch {
    return {
      snippets: [],
      summary: undefined,
      signals: [],
      noiseRisk: "Low" as const,
      provider: "fallback",
    };
  }
}

function buildTransitScore(nearbyTransit: string[], destinationConvenience: string[]) {
  let score = 35 + nearbyTransit.length * 12 + destinationConvenience.length * 8;

  for (const line of destinationConvenience) {
    const match = line.match(/(\d+)\s+min/);
    if (!match) {
      continue;
    }
    const minutes = Number(match[1]);
    if (minutes <= 30) score += 10;
    else if (minutes <= 45) score += 4;
    else score -= 6;
  }

  return Math.max(0, Math.min(100, score));
}

function buildGeoWarning(snippets: string[], hasTransitSignals: boolean) {
  const normalized = snippets.join(" ").toLowerCase();
  const signals: string[] = [];

  if (normalized.includes("traffic")) {
    signals.push("traffic");
  }
  if (normalized.includes("construction")) {
    signals.push("construction");
  }
  if (normalized.includes("noise")) {
    signals.push("road noise");
  }
  if (normalized.includes("unsafe") || normalized.includes("crime")) {
    signals.push("street safety");
  }

  const uniqueSignals = [...new Set(signals)];
  if (uniqueSignals.length > 0) {
    return `Public search signals mention ${uniqueSignals.join(", ")} nearby. Verify these conditions in person.`;
  }

  if (!hasTransitSignals) {
    return "Transit options are unclear from available data.";
  }

  return undefined;
}

function buildGeoKeySignals(
  snippets: string[],
  nearbyTransit: string[],
  destinationConvenience: string[],
  nearbyEssentials: GeoAnalysis["nearbyEssentials"]
) {
  const normalized = snippets.join(" ").toLowerCase();
  const signals: string[] = [];

  if (normalized.includes("traffic")) {
    signals.push("Traffic may affect peak-hour access");
  }
  if (normalized.includes("construction")) {
    signals.push("Construction activity may be nearby");
  }
  if (normalized.includes("noise")) {
    signals.push("Street noise should be checked at busy times");
  }
  if (nearbyTransit.length > 0) {
    signals.push("Nearby public transport options were found");
  }
  if (destinationConvenience.length > 0) {
    signals.push("Commute estimates are available for saved destinations");
  }
  if ((nearbyEssentials?.length ?? 0) > 0) {
    signals.push("Nearby essentials were verified with Google Places");
  }

  return [...new Set(signals)].slice(0, 4);
}

function buildMapSignals(
  nearbyTransit: string[],
  destinationConvenience: string[],
  nearbyEssentials: GeoAnalysis["nearbyEssentials"]
) {
  const essentials = nearbyEssentials ?? [];
  const signals: string[] = [];

  if (nearbyTransit.length > 0) {
    signals.push(...nearbyTransit.slice(0, 2));
  }
  if (destinationConvenience.length > 0) {
    signals.push(...destinationConvenience.slice(0, 2));
  }
  if (essentials.length > 0) {
    signals.push(
      ...essentials.slice(0, 2).map((place) => {
        const distance = place.distanceMeters ? `${Math.round(place.distanceMeters)}m` : "nearby";
        return `${place.name} (${place.category}) is ${distance} away`;
      })
    );
  }

  return [...new Set(signals)].slice(0, 4);
}

export async function analyzeGeoContext(args: {
  address?: string;
  coordinates?: Coordinates;
  targetDestinations?: DestinationPoint[];
  depth: IntelligenceDepth;
}) {
  let coordinates = args.coordinates;
  let resolvedAddress = args.address?.trim();

  if (!coordinates && resolvedAddress) {
    try {
      const geocoded = await geocodeAddress(resolvedAddress);
      coordinates = geocoded?.coordinates;
      resolvedAddress = geocoded?.formattedAddress ?? resolvedAddress;
    } catch {
      // Fall through to fallback.
    }
  }

  if (!coordinates) {
    return {
      geoAnalysis: buildGeoFallback({
        address: resolvedAddress,
        destinationConvenience: args.targetDestinations?.map(
          (destination) => `${destination.label} - commute check required`
        ),
      }),
      resolvedAddress,
      fallbackReason: "geo_missing_coordinates",
      provider: "fallback",
    };
  }

  const [nearbyTransitResult, destinationResult, riskSignalsResult, essentialsResult] = await Promise.allSettled([
    searchNearbyTransit(coordinates),
    computeDestinationConvenience(coordinates, args.targetDestinations),
    searchRiskSignals(resolvedAddress ?? `${coordinates.lat}, ${coordinates.lng}`, args.depth),
    fetchNearbyEssentials(coordinates),
  ]);

  const nearbyTransit = sanitizeDisplayList(
    nearbyTransitResult.status === "fulfilled" ? nearbyTransitResult.value : [],
    { maxItems: 3, itemMaxLength: 90 }
  );
  const destinationConvenience = sanitizeDisplayList(
    destinationResult.status === "fulfilled" ? destinationResult.value : [],
    { maxItems: 3, itemMaxLength: 90 }
  );
  const riskSignals =
    riskSignalsResult.status === "fulfilled"
      ? riskSignalsResult.value
      : {
          snippets: [],
          summary: undefined,
          signals: [],
          noiseRisk: "Low" as const,
          provider: "fallback",
        };
  const nearbyEssentials = essentialsResult.status === "fulfilled" ? essentialsResult.value : [];
  const snippets = riskSignals.snippets;
  const warning = riskSignals.summary ?? buildGeoWarning(snippets, nearbyTransit.length > 0);

  return {
    geoAnalysis: geoAnalysisSchema.parse({
      noiseRisk: riskSignals.noiseRisk,
      transitScore: buildTransitScore(nearbyTransit, destinationConvenience),
      warning,
      keySignals:
        riskSignals.signals.length > 0
          ? buildGeoKeySignals(
              riskSignals.signals,
              nearbyTransit,
              destinationConvenience,
              nearbyEssentials
            )
          : buildGeoKeySignals(snippets, nearbyTransit, destinationConvenience, nearbyEssentials),
      nearbyTransit,
      destinationConvenience,
      nearbyEssentials,
    }),
    mapSignals: buildMapSignals(nearbyTransit, destinationConvenience, nearbyEssentials),
    webSignals: riskSignals.signals,
    webSummary: warning,
    resolvedAddress,
    provider: appEnv.googleMapsApiKey ? "google-maps+google-search" : riskSignals.provider,
    fallbackReason:
      nearbyTransitResult.status === "rejected" ||
      destinationResult.status === "rejected" ||
      riskSignalsResult.status === "rejected" ||
      essentialsResult.status === "rejected"
        ? "geo_partial_failure"
        : undefined,
  };
}
