function normalizePublicEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

export const publicAppConfig = {
  apiBaseUrl: normalizePublicEnv(process.env.NEXT_PUBLIC_API_BASE_URL).replace(/\/+$/, ""),
  demoModeEnabled: normalizePublicEnv(process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE) === "true",
  googleMapsApiKey: normalizePublicEnv(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
} as const;
