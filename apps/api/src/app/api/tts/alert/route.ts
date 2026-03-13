import { createHash } from "node:crypto";
import { ttsAlertRequestSchema, ttsAlertResponseSchema } from "@inspect-ai/contracts";
import {
  createFrontendDisabledResponse,
  createJsonResponse,
  createOptionsResponse,
  createRateLimitHeaders,
  ensureCrossOriginAllowed,
  getRequestId,
  readJsonBody,
} from "@/lib/http";
import { synthesizeMinimaxAlert } from "@/lib/providers/minimax";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo, logWarn } from "@/lib/telemetry";

export const runtime = "nodejs";
export const maxDuration = 20;

const CACHE_TTL_MS = 10 * 60 * 1000;
const audioCache = new Map<string, { expiresAt: number; payload: { audioBase64: string; mimeType: string } }>();

function getCacheKey(args: {
  alertKey: string;
  text: string;
  locale: string;
}) {
  return createHash("sha256")
    .update(`${args.alertKey}:${args.text}:${args.locale}`)
    .digest("hex");
}

function readCache(cacheKey: string) {
  const cached = audioCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    audioCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

export async function OPTIONS(request: Request) {
  return createOptionsResponse(request);
}

export async function POST(request: Request) {
  const disabledResponse = createFrontendDisabledResponse(request);
  if (disabledResponse) {
    return disabledResponse;
  }

  const requestId = getRequestId(request);
  const cors = ensureCrossOriginAllowed(request, requestId);
  if (cors.response) {
    return cors.response;
  }

  const body = await readJsonBody(request);
  const parsed = ttsAlertRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonResponse(
      ttsAlertResponseSchema.parse({
        provider: "fallback",
        cacheHit: false,
      }),
      {
        origin: cors.origin,
        requestId,
        status: 200,
      }
    );
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/tts/alert",
    config: { max: 20, windowMs: 60_000 },
    sessionKey: parsed.data.inspectionId,
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(
      ttsAlertResponseSchema.parse({
        provider: "fallback",
        cacheHit: false,
      }),
      {
        origin: cors.origin,
        requestId,
        status: 200,
        headers: {
          ...createRateLimitHeaders(rateLimit),
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const startedAt = Date.now();
  const cacheKey = getCacheKey({
    alertKey: parsed.data.alertKey,
    text: parsed.data.text,
    locale: parsed.data.locale,
  });
  const cached = readCache(cacheKey);

  if (cached) {
    return createJsonResponse(
      ttsAlertResponseSchema.parse({
        provider: "minimax",
        audioBase64: cached.audioBase64,
        mimeType: cached.mimeType,
        cacheHit: true,
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  }

  try {
    const payload = await synthesizeMinimaxAlert({
      text: parsed.data.text,
      locale: parsed.data.locale,
    });

    audioCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    logInfo({
      message: "TTS alert completed",
      route: "/api/tts/alert",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: "minimax",
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(
      ttsAlertResponseSchema.parse({
        provider: "minimax",
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
        cacheHit: false,
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  } catch (error) {
    logWarn({
      message: "TTS alert fell back to text-only",
      route: "/api/tts/alert",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      fallbackReason: "minimax_tts_failed",
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(
      ttsAlertResponseSchema.parse({
        provider: "fallback",
        cacheHit: false,
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  }
}
