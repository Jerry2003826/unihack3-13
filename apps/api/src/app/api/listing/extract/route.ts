import { listingExtractRequestSchema, listingExtractResponseSchema } from "@inspect-ai/contracts";
import { extractListingDetails } from "@/lib/listing/extractListing";
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
export const maxDuration = 25;

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
  const parsed = listingExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonResponse(
      listingExtractResponseSchema.parse({
        listing: {
          url: "https://example.invalid",
          features: [],
          inventoryHints: [],
        },
        provider: "fallback",
      }),
      {
        origin: cors.origin,
        requestId,
        status: 400,
      }
    );
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/listing/extract",
    config: { max: 10, windowMs: 120_000 },
    sessionKey: parsed.data.listingUrl,
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(
      listingExtractResponseSchema.parse({
        listing: {
          url: parsed.data.listingUrl,
          features: [],
          inventoryHints: [],
        },
        provider: "fallback",
      }),
      {
        origin: cors.origin,
        requestId,
        status: 429,
        headers: {
          ...createRateLimitHeaders(rateLimit),
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const startedAt = Date.now();

  try {
    const response = await extractListingDetails(parsed.data.listingUrl);

    logInfo({
      message: "Listing extraction completed",
      route: "/api/listing/extract",
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
      message: "Listing extraction failed",
      route: "/api/listing/extract",
      requestId,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      fallbackReason: "listing_extract_failed",
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(
      listingExtractResponseSchema.parse({
        listing: {
          url: parsed.data.listingUrl,
          features: [],
          inventoryHints: [],
        },
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
