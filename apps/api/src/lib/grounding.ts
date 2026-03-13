import type { GroundingMetadata } from "@google/genai";
import { type Citation } from "@inspect-ai/contracts";

export interface GroundedCatalogItem {
  sourceId: string;
  title: string;
  url: string;
  snippet?: string;
  provider?: string;
  placeId?: string;
}

export function extractGroundedCatalog(metadata: GroundingMetadata | undefined): GroundedCatalogItem[] {
  const catalog: GroundedCatalogItem[] = [];
  const seen = new Set<string>();

  for (const chunk of metadata?.groundingChunks ?? []) {
    const mapsTitle = chunk.maps?.title?.trim();
    const mapsUrl = chunk.maps?.uri?.trim();
    const webTitle = chunk.web?.title?.trim();
    const webUrl = chunk.web?.uri?.trim();

    if (mapsTitle && mapsUrl) {
      const key = `${mapsTitle}::${mapsUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        catalog.push({
          sourceId: `maps-${catalog.length + 1}`,
          title: mapsTitle,
          url: mapsUrl,
          snippet: chunk.maps?.text?.trim(),
          provider: "google-maps-grounding",
          placeId: chunk.maps?.placeId?.replace(/^places\//, ""),
        });
      }
    }

    if (webTitle && webUrl) {
      const key = `${webTitle}::${webUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        catalog.push({
          sourceId: `web-${catalog.length + 1}`,
          title: webTitle,
          url: webUrl,
          provider: "google-maps-grounding",
        });
      }
    }
  }

  return catalog;
}

export function buildCitationsFromGroundedCatalog(catalog: GroundedCatalogItem[], limit = 4): Citation[] {
  return catalog.slice(0, limit).map(({ sourceId, title, url }) => ({
    sourceId,
    title,
    url,
  }));
}
