function normalizePublicEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

function normalizeApiBaseUrl(value: string) {
  const trimmed = value.replace(/\/+$/, "");
  if (typeof window !== "undefined" && trimmed === "http://localhost:3001") {
    return "";
  }
  return trimmed;
}

export const publicAppConfig = {
  apiBaseUrl: normalizeApiBaseUrl(normalizePublicEnv(process.env.NEXT_PUBLIC_API_BASE_URL)),
  demoModeEnabled: normalizePublicEnv(process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE) === "true",
  googleMapsApiKey: normalizePublicEnv(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
} as const;
