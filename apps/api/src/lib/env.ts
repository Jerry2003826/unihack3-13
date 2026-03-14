function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function hasRealConfiguredValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return !/^(your_|changeme|example|placeholder)/i.test(value);
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
  geminiLiveModel: readEnv("GEMINI_LIVE_MODEL") ?? "gemini-2.5-flash",
  geminiSceneExtractModel: readEnv("GEMINI_SCENE_EXTRACT_MODEL") ?? "gemini-2.5-flash",
  geminiSceneSynthesisModel: readEnv("GEMINI_SCENE_SYNTHESIS_MODEL") ?? "gemini-2.5-pro",
  geminiGroundedModel: readEnv("GEMINI_GROUNDED_MODEL") ?? "gemini-2.5-flash",
  geminiIntelligenceModel: readEnv("GEMINI_INTELLIGENCE_MODEL") ?? "gemini-2.5-flash-lite",
  geminiReasoningModel: readEnv("GEMINI_REASONING_MODEL") ?? "gemini-2.5-pro",
  cohereApiKey: readEnv("COHERE_API_KEY"),
  cohereEmbedModel: readEnv("COHERE_EMBED_MODEL") ?? "embed-v4.0",
  cohereRerankModel: readEnv("COHERE_RERANK_MODEL") ?? "rerank-v4.0-pro",
  qdrantUrl: readEnv("QDRANT_URL") ?? "http://127.0.0.1:6333",
  qdrantCollection: readEnv("QDRANT_COLLECTION") ?? "rental_kb_v1",
  qdrantApiKey: readEnv("QDRANT_API_KEY"),
  tavilyApiKey: readEnv("TAVILY_API_KEY"),
  googleMapsApiKey: readEnv("GOOGLE_MAPS_API_KEY"),
  minimaxApiKey: readEnv("MINIMAX_API_KEY"),
  minimaxApiBase: readEnv("MINIMAX_API_BASE") ?? "https://api.minimax.io",
  minimaxTtsModel: readEnv("MINIMAX_TTS_MODEL") ?? "speech-2.8-hd",
  minimaxTtsVoiceId: readEnv("MINIMAX_TTS_VOICE_ID") ?? "English_expressive_narrator",
  minimaxTtsFormat: readEnv("MINIMAX_TTS_FORMAT") ?? "mp3",
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
    hasRealConfiguredValue(appEnv.spacesRegion) &&
      hasRealConfiguredValue(appEnv.spacesBucket) &&
      hasRealConfiguredValue(appEnv.spacesEndpoint) &&
      hasRealConfiguredValue(appEnv.spacesKey) &&
      hasRealConfiguredValue(appEnv.spacesSecret)
  );
}
