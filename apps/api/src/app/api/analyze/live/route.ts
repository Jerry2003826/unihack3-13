import { liveAnalyzeRequestSchema, liveAnalyzeResponseSchema } from "@inspect-ai/contracts";
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
import { logError, logInfo } from "@/lib/telemetry";
import { analyzeLiveFrame } from "@/lib/vision/liveGuidedScan";

export const runtime = "nodejs";
export const maxDuration = 20;

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
  const parsed = liveAnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonResponse(
      liveAnalyzeResponseSchema.parse({
        observations: [],
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
    route: "/api/analyze/live",
    config: { max: 60, windowMs: 60_000 },
    sessionKey: parsed.data.inspectionId,
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(
      liveAnalyzeResponseSchema.parse({
        observations: [],
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

  try {
    const response = await analyzeLiveFrame(parsed.data);

    logInfo({
      message: "Live analyze completed",
      route: "/api/analyze/live",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: "gemini",
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(response, {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logError({
      message: "Live analyze failed",
      route: "/api/analyze/live",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(
      liveAnalyzeResponseSchema.parse({
        observations: [],
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  }
}
