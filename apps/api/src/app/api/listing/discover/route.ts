import { listingDiscoverRequestSchema, listingDiscoverResponseSchema } from "@inspect-ai/contracts";
import { discoverListingFromAddress } from "@/lib/listing/discoverListing";
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
import { logInfo, logWarn } from "@/lib/telemetry";

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
  const parsed = listingDiscoverRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonResponse(
      listingDiscoverResponseSchema.parse({
        candidates: [],
        summary: "Provide a valid property address to search for likely listing pages.",
        provider: "fallback",
      }),
      { origin: cors.origin, requestId }
    );
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/listing/discover",
    config: { max: 12, windowMs: 120_000 },
    sessionKey: parsed.data.address,
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(
      listingDiscoverResponseSchema.parse({
        candidates: [],
        summary: "Listing discovery is cooling down. Paste the listing link manually for now.",
        provider: "fallback",
      }),
      {
        origin: cors.origin,
        requestId,
        headers: {
          ...createRateLimitHeaders(rateLimit),
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const startedAt = Date.now();

  try {
    const response = await discoverListingFromAddress(parsed.data);

    logInfo({
      message: "Listing discovery completed",
      route: "/api/listing/discover",
      requestId,
      provider: response.provider,
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(response, {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logWarn({
      message: "Listing discovery failed",
      route: "/api/listing/discover",
      requestId,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      fallbackReason: "listing_discovery_failed",
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(
      listingDiscoverResponseSchema.parse({
        candidates: [],
        summary: "Could not infer a reliable listing page from the address. Paste the link manually if you have it.",
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
