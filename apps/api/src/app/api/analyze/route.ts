import { analyzeRequestSchema, analyzeResponseSchema } from "@inspect-ai/contracts";
import {
  createFrontendDisabledResponse,
  createJsonResponse,
  createOptionsResponse,
  createRateLimitHeaders,
  ensureCrossOriginAllowed,
  getRequestId,
  readJsonBody,
} from "@/lib/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError, logInfo, logWarn } from "@/lib/telemetry";
import { analyzePropertyImages } from "@/lib/vision/geminiService";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonResponse(
      analyzeResponseSchema.parse({ hazards: [] }),
      {
        origin: cors.origin,
        requestId,
        status: 200,
      }
    );
  }

  const inspectionKey = request.headers.get("x-inspection-id") ?? parsed.data.objectKeys?.[0] ?? parsed.data.source;
  const rateLimit = checkRateLimit({
    request,
    route: "/api/analyze",
    config: { max: 45, windowMs: 60_000 },
    sessionKey: inspectionKey,
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(analyzeResponseSchema.parse({ hazards: [] }), {
      origin: cors.origin,
      requestId,
      status: 200,
      headers: {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    });
  }

  const startedAt = Date.now();

  try {
    const result = await analyzePropertyImages(parsed.data);

    if (result.fallbackReason) {
      logWarn({
        message: "Analyze route returned fallback payload",
        route: "/api/analyze",
        requestId,
        inspectionId: request.headers.get("x-inspection-id") ?? undefined,
        provider: result.provider,
        fallbackReason: result.fallbackReason,
        durationMs: Date.now() - startedAt,
      });
    } else {
      logInfo({
        message: "Analyze route completed",
        route: "/api/analyze",
        requestId,
        inspectionId: request.headers.get("x-inspection-id") ?? undefined,
        provider: result.provider,
        durationMs: Date.now() - startedAt,
      });
    }

    return createJsonResponse(analyzeResponseSchema.parse({ hazards: result.hazards }), {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logError({
      message: "Analyze route failed",
      route: "/api/analyze",
      requestId,
      inspectionId: request.headers.get("x-inspection-id") ?? undefined,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(analyzeResponseSchema.parse({ hazards: [] }), {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  }
}
