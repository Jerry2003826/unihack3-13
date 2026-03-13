import { afterEach, describe, expect, it, vi } from "vitest";
import { reverseGeocodeCoordinates } from "./location";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reverseGeocodeCoordinates", () => {
  it("parses the reverse geocode payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          formattedAddress: "15 Dandenong Rd, Clayton VIC 3168",
          provider: "google-geocoding",
          components: {
            locality: "Clayton",
            postalCode: "3168",
          },
        }),
      })
    );

    await expect(reverseGeocodeCoordinates({ lat: -37.9156, lng: 145.1234 })).resolves.toEqual({
      formattedAddress: "15 Dandenong Rd, Clayton VIC 3168",
      provider: "google-geocoding",
      components: {
        locality: "Clayton",
        postalCode: "3168",
      },
    });
  });
});
