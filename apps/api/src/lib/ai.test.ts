import { describe, expect, it } from "vitest";
import { buildCitationsFromGroundedCatalog, extractGroundedCatalog } from "./grounding";

describe("grounded catalog helpers", () => {
  it("extracts and de-duplicates Google Maps grounding chunks", () => {
    const catalog = extractGroundedCatalog({
      groundingChunks: [
        {
          maps: {
            title: "Clayton Station",
            uri: "https://maps.google.com/?q=clayton-station",
            text: "Nearby station",
            placeId: "places/abc123",
          },
        },
        {
          maps: {
            title: "Clayton Station",
            uri: "https://maps.google.com/?q=clayton-station",
            text: "Duplicate chunk",
          },
        },
        {
          web: {
            title: "Oakleigh Local Guide",
            uri: "https://example.com/oakleigh",
          },
        },
      ],
    });

    expect(catalog).toHaveLength(2);
    expect(catalog[0]?.title).toBe("Clayton Station");
    expect(catalog[0]?.placeId).toBe("abc123");
    expect(catalog[1]?.title).toBe("Oakleigh Local Guide");
  });

  it("builds stable report citations from grounded catalog items", () => {
    const citations = buildCitationsFromGroundedCatalog(
      [
        {
          sourceId: "maps-1",
          title: "Clayton Station",
          url: "https://maps.google.com/?q=clayton-station",
          provider: "google-maps-grounding",
        },
      ],
      4
    );

    expect(citations).toEqual([
      {
        sourceId: "maps-1",
        title: "Clayton Station",
        url: "https://maps.google.com/?q=clayton-station",
      },
    ]);
  });
});
