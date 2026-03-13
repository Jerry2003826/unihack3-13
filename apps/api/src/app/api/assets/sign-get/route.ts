import {
  signedAssetGetRequestSchema,
  signedAssetGetResponseSchema,
} from "@inspect-ai/contracts";
import { hasSpacesConfig } from "@/lib/env";
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
import { createSignedObjectUrl } from "@/lib/spaces";
import { logError, logInfo, logWarn } from "@/lib/telemetry";

const ALLOWED_PREFIXES = ["derived/"];

function isAllowedObjectKey(objectKey: string) {
  return ALLOWED_PREFIXES.some((prefix) => objectKey.startsWith(prefix));
}

export const runtime = "nodejs";
export const maxDuration = 15;

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
  const parsed = signedAssetGetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Request body does not match the signed asset contract.",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/assets/sign-get",
    config: { max: 20, windowMs: 60_000 },
    sessionKey: request.headers.get("x-inspection-id") ?? "anonymous",
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many asset signing requests. Please wait and try again.",
      origin: cors.origin,
      requestId,
      status: 429,
      headers: {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    });
  }

  if (!hasSpacesConfig()) {
    return createErrorResponse({
      code: "storage_unavailable",
      message: "DigitalOcean Spaces is not configured for this deployment.",
      origin: cors.origin,
      requestId,
      status: 503,
      headers: createRateLimitHeaders(rateLimit),
    });
  }

  const invalidKey = parsed.data.objectKeys.find((objectKey) => !isAllowedObjectKey(objectKey));
  if (invalidKey) {
    logWarn({
      message: "Rejected unsupported asset signing request",
      route: "/api/assets/sign-get",
      requestId,
      provider: "digitalocean-spaces",
      fallbackReason: "invalid_object_prefix",
      details: invalidKey,
    });

    return createErrorResponse({
      code: "invalid_object_key",
      message: "Only derived report assets can be signed for browser download.",
      origin: cors.origin,
      requestId,
      status: 400,
      headers: createRateLimitHeaders(rateLimit),
    });
  }

  const startedAt = Date.now();

  try {
    const downloads = parsed.data.objectKeys.map((objectKey) => ({
      objectKey,
      downloadUrl: createSignedObjectUrl({
        method: "GET",
        objectKey,
        expiresInSeconds: 300,
      }),
    }));

    const payload = signedAssetGetResponseSchema.parse({ downloads });

    logInfo({
      message: "Signed asset URLs created",
      route: "/api/assets/sign-get",
      requestId,
      provider: "digitalocean-spaces",
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(payload, {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logError({
      message: "Failed to sign asset URLs",
      route: "/api/assets/sign-get",
      requestId,
      provider: "digitalocean-spaces",
      durationMs: Date.now() - startedAt,
      details: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse({
      code: "asset_signing_failed",
      message: "Failed to generate asset download URLs.",
      origin: cors.origin,
      requestId,
      status: 500,
      headers: createRateLimitHeaders(rateLimit),
    });
  }
}
