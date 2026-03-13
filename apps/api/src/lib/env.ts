function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseAllowedOrigins(): Set<string> {
  const configured = (readEnv("CORS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return new Set(configured);
  }

  if (process.env.NODE_ENV === "development") {
    return new Set(["http://localhost:3000"]);
  }

  return new Set();
}

function parseDeployTarget(): "local" | "api" | "frontend" {
  const value = readEnv("DEPLOY_TARGET");
  if (value === "api" || value === "frontend") {
    return value;
  }
  return "local";
}

export const appEnv = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  deployTarget: parseDeployTarget(),
  corsAllowedOrigins: parseAllowedOrigins(),
  geminiApiKey: readEnv("GEMINI_API_KEY"),
  geminiVisionModel: readEnv("GEMINI_VISION_MODEL") ?? "gemini-2.5-flash",
  geminiIntelligenceModel: readEnv("GEMINI_INTELLIGENCE_MODEL") ?? "gemini-2.5-flash-lite",
  geminiReasoningModel: readEnv("GEMINI_REASONING_MODEL") ?? "gemini-2.5-pro",
  tavilyApiKey: readEnv("TAVILY_API_KEY"),
  googleMapsApiKey: readEnv("GOOGLE_MAPS_API_KEY"),
  spacesRegion: readEnv("DO_SPACES_REGION"),
  spacesBucket: readEnv("DO_SPACES_BUCKET"),
  spacesEndpoint: readEnv("DO_SPACES_ENDPOINT"),
  spacesKey: readEnv("DO_SPACES_KEY"),
  spacesSecret: readEnv("DO_SPACES_SECRET"),
} as const;

export function isFrontendOnlyDeploy(): boolean {
  return appEnv.deployTarget === "frontend";
}

export function hasSpacesConfig(): boolean {
  return Boolean(
    appEnv.spacesRegion &&
      appEnv.spacesBucket &&
      appEnv.spacesEndpoint &&
      appEnv.spacesKey &&
      appEnv.spacesSecret
  );
}
