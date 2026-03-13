import { reverseGeocodeRequestSchema, reverseGeocodeResponseSchema } from "@inspect-ai/contracts";
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
import { reverseGeocodeCoordinates } from "@/lib/providers/googleMapsGeocode";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo, logWarn } from "@/lib/telemetry";

export const runtime = "nodejs";

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
  const parsed = reverseGeocodeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Reverse geocode request does not match the contract.",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/geocode/reverse",
    config: { max: 20, windowMs: 60_000 },
    sessionKey: `${parsed.data.coordinates.lat.toFixed(4)},${parsed.data.coordinates.lng.toFixed(4)}`,
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many reverse geocode requests. Please try again shortly.",
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
    const response = await reverseGeocodeCoordinates(parsed.data.coordinates);

    if (response.provider === "fallback") {
      logWarn({
        message: "Reverse geocode completed with fallback",
        route: "/api/geocode/reverse",
        requestId,
        provider: response.provider,
        fallbackReason: "google_maps_key_missing_or_no_match",
        durationMs: Date.now() - startedAt,
      });
    } else {
      logInfo({
        message: "Reverse geocode completed",
        route: "/api/geocode/reverse",
        requestId,
        provider: response.provider,
        durationMs: Date.now() - startedAt,
      });
    }

    return createJsonResponse(reverseGeocodeResponseSchema.parse(response), {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logWarn({
      message: "Reverse geocode failed, returning coordinate fallback",
      route: "/api/geocode/reverse",
      requestId,
      provider: "fallback",
      fallbackReason: "reverse_geocode_failed",
      details: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(
      reverseGeocodeResponseSchema.parse({
        formattedAddress: `${parsed.data.coordinates.lat.toFixed(4)}, ${parsed.data.coordinates.lng.toFixed(4)}`,
        provider: "fallback",
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  }
}
