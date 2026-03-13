import type {
  DestinationPoint,
  GeoAnalysis,
  IntelligenceDepth,
} from "@inspect-ai/contracts";
import { geoAnalysisSchema } from "@inspect-ai/contracts";
import { appEnv } from "@/lib/env";
import { buildGeoFallback, scoreSnippetSentiment } from "@/lib/fallbacks";
import { fetchJson } from "@/lib/http";
import { getTavilyClient } from "@/lib/providers/tavily";

interface Coordinates {
  lat: number;
  lng: number;
}

interface GeocodingResponse {
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
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

async function geocodeAddress(address: string) {
  const apiKey = appEnv.googleMapsApiKey;
  if (!apiKey) {
    return null;
  }

  const query = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  query.searchParams.set("address", address);
  query.searchParams.set("key", apiKey);

  const response = await fetchJson<GeocodingResponse>(query, { timeoutMs: 8_000 });
  const match = response.results?.[0];
  const location = match?.geometry?.location;
  if (!location) {
    return null;
  }

  return {
    coordinates: {
      lat: location.lat,
      lng: location.lng,
    },
    formattedAddress: match?.formatted_address ?? address,
  };
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

  const [nearbyTransitResult, destinationResult, riskSnippets] = await Promise.allSettled([
    searchNearbyTransit(coordinates),
    computeDestinationConvenience(coordinates, args.targetDestinations),
    searchRiskSignals(resolvedAddress ?? `${coordinates.lat}, ${coordinates.lng}`),
  ]);

  const nearbyTransit = nearbyTransitResult.status === "fulfilled" ? nearbyTransitResult.value : [];
  const destinationConvenience = destinationResult.status === "fulfilled" ? destinationResult.value : [];
  const snippets = riskSnippets.status === "fulfilled" ? riskSnippets.value : [];

  const sentiment = scoreSnippetSentiment(snippets);
  const noiseRisk: GeoAnalysis["noiseRisk"] = sentiment <= -3 ? "High" : sentiment < 0 ? "Medium" : "Low";
  const warning =
    snippets.find((snippet) => /noise|traffic|construction|unsafe|crime/i.test(snippet)) ??
    (nearbyTransit.length === 0 ? "Transit options are unclear from available data." : undefined);

  return {
    geoAnalysis: geoAnalysisSchema.parse({
      noiseRisk,
      transitScore: buildTransitScore(nearbyTransit, destinationConvenience),
      warning,
      nearbyTransit,
      destinationConvenience,
    }),
    resolvedAddress,
    provider: appEnv.googleMapsApiKey ? "google-maps+tavily" : "tavily",
    fallbackReason:
      nearbyTransitResult.status === "rejected" ||
      destinationResult.status === "rejected" ||
      riskSnippets.status === "rejected"
        ? "geo_partial_failure"
        : undefined,
  };
}
