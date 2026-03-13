import { describe, expect, it } from "vitest";
import { filterGroundedWebCatalog } from "./relevance";

describe("filterGroundedWebCatalog", () => {
  it("prefers renter-relevant web evidence over unrelated local business pages", () => {
    const catalog = [
      {
        sourceId: "web-1",
        title: "Oakleigh East renters complain about traffic noise",
        url: "https://www.reddit.com/r/melbourne/comments/example",
        snippet: "Family: noise-and-traffic | Tenants mention heavy North Rd traffic at peak times.",
        provider: "google-search-grounding",
      },
      {
        sourceId: "web-2",
        title: "Just Italy - Oakleigh",
        url: "https://justitaly.example/menu",
        snippet: "Family: noise-and-traffic | Italian restaurant menu and opening hours.",
        provider: "google-search-grounding",
      },
    ];

    const filtered = filterGroundedWebCatalog(catalog, {
      channel: "community",
      context: ["1425 North Rd Oakleigh East", "noise traffic safety"],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toContain("renters complain");
  });

  it("keeps maintenance and bond dispute evidence for agency queries", () => {
    const catalog = [
      {
        sourceId: "web-1",
        title: "Woodards Oakleigh tenant review mentions slow repairs",
        url: "https://www.productreview.com.au/listings/woodards-oakleigh",
        snippet: "Family: maintenance-and-repairs | Tenant reports maintenance delays and poor follow-up.",
        provider: "google-search-grounding",
      },
      {
        sourceId: "web-2",
        title: "Woodards Real Estate Oakleigh",
        url: "https://woodards.example/about",
        snippet: "Family: communication-and-professionalism | Official website and office contact details.",
        provider: "google-search-grounding",
      },
    ];

    const filtered = filterGroundedWebCatalog(catalog, {
      channel: "agency",
      context: ["Woodards Real Estate Oakleigh", "maintenance repairs bond"],
    });

    expect(filtered[0]?.title).toContain("tenant review");
  });

  it("drops Google Maps listing pages from the web channel", () => {
    const catalog = [
      {
        sourceId: "web-1",
        title: "Oakleigh Station/Portman St",
        url: "https://maps.google.com/?cid=89040950028267978",
        snippet: "Family: noise-and-traffic | Station listing and map directions.",
        provider: "google-search-grounding",
      },
      {
        sourceId: "web-2",
        title: "North Road residents discuss overnight traffic noise",
        url: "https://www.reddit.com/r/melbourne/comments/oakleigh_noise_thread",
        snippet: "Family: noise-and-traffic | Residents mention peak-hour traffic and late-night road noise.",
        provider: "google-search-grounding",
      },
    ];

    const filtered = filterGroundedWebCatalog(catalog, {
      channel: "community",
      context: ["1425 North Rd Oakleigh East", "noise traffic night renters"],
      minScore: 4,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.url).toContain("reddit.com");
  });

  it("returns empty when only official or directory pages remain", () => {
    const catalog = [
      {
        sourceId: "web-1",
        title: "Woodards Real Estate Oakleigh",
        url: "https://www.woodards.com.au/about-us/oakleigh",
        snippet: "Family: communication-and-professionalism | Official website and contact us page.",
        provider: "google-search-grounding",
      },
      {
        sourceId: "web-2",
        title: "Woodards Real Estate Oakleigh - Yellow Pages",
        url: "https://www.yellowpages.com.au/woodards-oakleigh",
        snippet: "Family: communication-and-professionalism | Opening hours and phone number.",
        provider: "google-search-grounding",
      },
    ];

    const filtered = filterGroundedWebCatalog(catalog, {
      channel: "agency",
      context: ["Woodards Real Estate Oakleigh", "maintenance repairs bond"],
      minScore: 4,
    });

    expect(filtered).toHaveLength(0);
  });
});
