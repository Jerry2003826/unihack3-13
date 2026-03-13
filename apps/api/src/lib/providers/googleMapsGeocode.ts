import type { GeoPoint } from "@inspect-ai/contracts";
import { appEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";

interface GeocodingResponse {
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
  }>;
}

function buildComponentMap(
  addressComponents?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>
) {
  const pick = (type: string) =>
    addressComponents?.find((component) => component.types?.includes(type));

  return {
    locality: pick("locality")?.long_name,
    postalCode: pick("postal_code")?.long_name,
    administrativeAreaLevel1: pick("administrative_area_level_1")?.short_name,
    country: pick("country")?.long_name,
  };
}

export async function geocodeAddress(address: string) {
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
    components: buildComponentMap(match?.address_components),
    provider: "google-geocoding" as const,
  };
}

export async function reverseGeocodeCoordinates(coordinates: GeoPoint) {
  const apiKey = appEnv.googleMapsApiKey;
  if (!apiKey) {
    return {
      formattedAddress: `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`,
      provider: "fallback" as const,
    };
  }

  const query = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  query.searchParams.set("latlng", `${coordinates.lat},${coordinates.lng}`);
  query.searchParams.set("key", apiKey);

  const response = await fetchJson<GeocodingResponse>(query, { timeoutMs: 8_000 });
  const match = response.results?.[0];

  if (!match?.formatted_address) {
    return {
      formattedAddress: `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`,
      provider: "fallback" as const,
    };
  }

  return {
    formattedAddress: match.formatted_address,
    components: buildComponentMap(match.address_components),
    provider: "google-geocoding" as const,
  };
}
