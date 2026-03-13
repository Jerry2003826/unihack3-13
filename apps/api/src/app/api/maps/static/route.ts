import {
  staticMapRequestSchema,
  staticMapResponseSchema,
} from "@inspect-ai/contracts";
import { getStaticMapImage } from "@/lib/maps/staticMapService";
import {
  createErrorResponse,
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
  const parsed = staticMapRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Request body does not match the static map contract.",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/maps/static",
    config: { max: 18, windowMs: 60_000 },
    sessionKey:
      request.headers.get("x-inspection-id") ??
      parsed.data.address ??
      (parsed.data.coordinates ? `${parsed.data.coordinates.lat},${parsed.data.coordinates.lng}` : "anonymous"),
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many static map requests. Please wait and try again.",
      origin: cors.origin,
      requestId,
      status: 429,
      headers: {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    });
  }

  const startedAt = Date.now();

  try {
    const payload = await getStaticMapImage(parsed.data);

    if (payload.provider === "fallback") {
      logWarn({
        message: "Static map route returned fallback payload",
        route: "/api/maps/static",
        requestId,
        provider: payload.provider,
        durationMs: Date.now() - startedAt,
      });
    } else {
      logInfo({
        message: "Static map route completed",
        route: "/api/maps/static",
        requestId,
        provider: payload.provider,
        durationMs: Date.now() - startedAt,
      });
    }

    return createJsonResponse(staticMapResponseSchema.parse(payload), {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logError({
      message: "Static map route failed",
      route: "/api/maps/static",
      requestId,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      details: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse({
      code: "static_map_failed",
      message: "Failed to generate static map.",
      origin: cors.origin,
      requestId,
      status: 500,
      headers: createRateLimitHeaders(rateLimit),
    });
  }
}
