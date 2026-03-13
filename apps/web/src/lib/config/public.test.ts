import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_ENABLE_DEMO_MODE",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
] as const;

const originalEnv = new Map<string, string | undefined>(
  PUBLIC_ENV_KEYS.map((key) => [key, process.env[key]])
);

beforeEach(() => {
  vi.resetModules();

  for (const key of PUBLIC_ENV_KEYS) {
    delete process.env[key];
  }
});

afterAll(() => {
  for (const key of PUBLIC_ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
});

describe("publicAppConfig", () => {
  it("reads public env values with Next.js compatible access patterns", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.inspect.ai///";
    process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE = "true";
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = " maps-key ";

    const { publicAppConfig } = await import("./public");

    expect(publicAppConfig).toEqual({
      apiBaseUrl: "https://api.inspect.ai",
      demoModeEnabled: true,
      googleMapsApiKey: "maps-key",
    });
  });

  it("falls back to safe defaults when public env values are missing", async () => {
    const { publicAppConfig } = await import("./public");

    expect(publicAppConfig).toEqual({
      apiBaseUrl: "",
      demoModeEnabled: false,
      googleMapsApiKey: "",
    });
  });
});
