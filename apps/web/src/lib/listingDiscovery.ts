import type { ListingDiscoverResponse } from "@inspect-ai/contracts";
import { listingDiscoverResponseSchema } from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

export async function fetchListingDiscovery(args: {
  address: string;
  agency?: string;
}): Promise<ListingDiscoverResponse> {
  const response = await fetch(resolveApiUrl("/api/listing/discover"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: args.address.trim(),
      agency: args.agency?.trim() || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Listing discovery failed with ${response.status}`);
  }

  return listingDiscoverResponseSchema.parse(await response.json());
}
