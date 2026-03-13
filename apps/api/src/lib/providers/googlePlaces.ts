import type { NearbyPlace } from "@inspect-ai/contracts";
import { appEnv } from "@/lib/env";
import { fetchJson } from "@/lib/http";

interface Coordinates {
  lat: number;
  lng: number;
}

interface SearchNearbyResponse {
  places?: Array<{
    name?: string;
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    primaryTypeDisplayName?: { text?: string };
    distanceMeters?: number;
    googleMapsUri?: string;
  }>;
}

interface PlaceDetailsResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  editorialSummary?: { text?: string };
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  parkingOptions?: {
    freeParkingLot?: boolean;
    freeStreetParking?: boolean;
    paidParkingLot?: boolean;
    paidStreetParking?: boolean;
    valetParking?: boolean;
    parkingGarage?: boolean;
  };
}

const ESSENTIAL_QUERIES = [
  { label: "Pharmacy", includedTypes: ["pharmacy"] },
  { label: "Groceries", includedTypes: ["grocery_store", "supermarket"] },
  { label: "Medical clinic", includedTypes: ["doctor", "medical_lab"] },
  { label: "Gym", includedTypes: ["gym"] },
] as const;

function getTodayHoursLine(weekdayDescriptions?: string[]) {
  if (!weekdayDescriptions?.length) {
    return undefined;
  }

  const day = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    timeZone: "Australia/Melbourne",
  })
    .format(new Date())
    .toLowerCase();

  return weekdayDescriptions.find((line) => line.toLowerCase().startsWith(day));
}

function buildOpenNowText(hours?: PlaceDetailsResponse["regularOpeningHours"]) {
  if (!hours) {
    return undefined;
  }

  const todayHours = getTodayHoursLine(hours.weekdayDescriptions);
  if (hours.openNow === true) {
    return todayHours ? `Open now · ${todayHours}` : "Open now";
  }
  if (hours.openNow === false) {
    return todayHours ? `Closed now · ${todayHours}` : "Closed now";
  }

  return todayHours;
}

function buildAccessibilityHighlights(options?: PlaceDetailsResponse["accessibilityOptions"]) {
  const highlights: string[] = [];
  if (options?.wheelchairAccessibleEntrance) highlights.push("Wheelchair-accessible entrance");
  if (options?.wheelchairAccessibleParking) highlights.push("Wheelchair-accessible parking");
  if (options?.wheelchairAccessibleRestroom) highlights.push("Wheelchair-accessible restroom");
  if (options?.wheelchairAccessibleSeating) highlights.push("Wheelchair-accessible seating");
  return highlights;
}

function buildParkingHighlights(options?: PlaceDetailsResponse["parkingOptions"]) {
  const highlights: string[] = [];
  if (options?.freeStreetParking) highlights.push("Free street parking");
  if (options?.freeParkingLot) highlights.push("Free parking lot");
  if (options?.parkingGarage) highlights.push("Parking garage");
  if (options?.paidStreetParking) highlights.push("Paid street parking");
  if (options?.paidParkingLot) highlights.push("Paid parking lot");
  if (options?.valetParking) highlights.push("Valet parking");
  return highlights;
}

async function searchNearbyCategory(coordinates: Coordinates, label: string, includedTypes: readonly string[]) {
  const apiKey = appEnv.googleMapsApiKey;
  if (!apiKey) {
    return null;
  }

  const response = await fetchJson<SearchNearbyResponse>("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    timeoutMs: 10_000,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.name,places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.distanceMeters,places.googleMapsUri",
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 1,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: {
            latitude: coordinates.lat,
            longitude: coordinates.lng,
          },
          radius: 2500,
        },
      },
    }),
  });

  const candidate = response.places?.[0];
  if (!candidate?.name) {
    return null;
  }

  const details = await fetchJson<PlaceDetailsResponse>(`https://places.googleapis.com/v1/${candidate.name}`, {
    timeoutMs: 10_000,
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,businessStatus,rating,userRatingCount,nationalPhoneNumber,googleMapsUri,editorialSummary,regularOpeningHours,accessibilityOptions,parkingOptions",
    },
  });

  const result: NearbyPlace = {
    placeId: details.id ?? candidate.id,
    name: details.displayName?.text ?? candidate.displayName?.text ?? label,
    category: candidate.primaryTypeDisplayName?.text ?? label,
    address: details.formattedAddress ?? candidate.formattedAddress,
    distanceMeters: candidate.distanceMeters,
    businessStatus: details.businessStatus,
    rating: details.rating,
    userRatingCount: details.userRatingCount,
    openNowText: buildOpenNowText(details.regularOpeningHours),
    phoneNumber: details.nationalPhoneNumber,
    googleMapsUri: details.googleMapsUri ?? candidate.googleMapsUri,
    accessibilityHighlights: buildAccessibilityHighlights(details.accessibilityOptions),
    parkingHighlights: buildParkingHighlights(details.parkingOptions),
    editorialSummary: details.editorialSummary?.text,
  };

  return result;
}

export async function fetchNearbyEssentials(coordinates: Coordinates) {
  if (!appEnv.googleMapsApiKey) {
    return [];
  }

  const settled = await Promise.allSettled(
    ESSENTIAL_QUERIES.map((query) => searchNearbyCategory(coordinates, query.label, query.includedTypes))
  );

  return settled
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
    .slice(0, 4);
}
