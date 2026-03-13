import type {
  DestinationPoint,
  GeoAnalysis,
  IntelligenceDepth,
} from "@inspect-ai/contracts";
import { geoAnalysisSchema, sanitizeDisplayList } from "@inspect-ai/contracts";
import { appEnv } from "@/lib/env";
import { buildGeoFallback, scoreSnippetSentiment } from "@/lib/fallbacks";
import { fetchJson } from "@/lib/http";
import { geocodeAddress } from "@/lib/providers/googleMapsGeocode";
import { fetchNearbyEssentials } from "@/lib/providers/googlePlaces";
import { getTavilyClient } from "@/lib/providers/tavily";

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

async function searchRiskSignals(label: string) {
  const tavily = getTavilyClient();
  if (!tavily) {
    return [];
  }

  try {
    const response = await tavily.search(`${label} noise traffic safety construction renters`, {
      topic: "general",
      searchDepth: "fast",
      maxResults: 4,
      includeRawContent: "markdown",
    });

    return response.results.map((result) => result.content).filter(Boolean);
  } catch {
    return [];
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

  const [nearbyTransitResult, destinationResult, riskSnippets, essentialsResult] = await Promise.allSettled([
    searchNearbyTransit(coordinates),
    computeDestinationConvenience(coordinates, args.targetDestinations),
    searchRiskSignals(resolvedAddress ?? `${coordinates.lat}, ${coordinates.lng}`),
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
  const snippets = riskSnippets.status === "fulfilled" ? riskSnippets.value : [];
  const nearbyEssentials = essentialsResult.status === "fulfilled" ? essentialsResult.value : [];

  const sentiment = scoreSnippetSentiment(snippets);
  const noiseRisk: GeoAnalysis["noiseRisk"] = sentiment <= -3 ? "High" : sentiment < 0 ? "Medium" : "Low";
  const warning = buildGeoWarning(snippets, nearbyTransit.length > 0);

  return {
    geoAnalysis: geoAnalysisSchema.parse({
      noiseRisk,
      transitScore: buildTransitScore(nearbyTransit, destinationConvenience),
      warning,
      keySignals: buildGeoKeySignals(snippets, nearbyTransit, destinationConvenience, nearbyEssentials),
      nearbyTransit,
      destinationConvenience,
      nearbyEssentials,
    }),
    resolvedAddress,
    provider: appEnv.googleMapsApiKey ? "google-maps+tavily" : "tavily",
    fallbackReason:
      nearbyTransitResult.status === "rejected" ||
      destinationResult.status === "rejected" ||
      riskSnippets.status === "rejected" ||
      essentialsResult.status === "rejected"
        ? "geo_partial_failure"
        : undefined,
  };
}
