import type { GeoPoint, ReverseGeocodeResponse } from "@inspect-ai/contracts";
import { reverseGeocodeResponseSchema } from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

export async function reverseGeocodeCoordinates(coordinates: GeoPoint): Promise<ReverseGeocodeResponse> {
  const response = await fetch(resolveApiUrl("/api/geocode/reverse"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ coordinates }),
  });

  if (!response.ok) {
    throw new Error(`Reverse geocode failed with ${response.status}`);
  }

  return reverseGeocodeResponseSchema.parse(await response.json());
}

export async function requestCurrentLocation(): Promise<GeoPoint> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocation is not available in this browser.");
  }

  return await new Promise<GeoPoint>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(error.message || "Unable to access current location."));
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 30_000,
      }
    );
  });
}
