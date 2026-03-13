import { signedUploadRequestSchema, signedUploadResponseSchema } from "@inspect-ai/contracts";
import { appEnv, hasSpacesConfig } from "@/lib/env";
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
import { buildLocalObjectUrl } from "@/lib/localStorage";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildManualObjectKey, createSignedObjectUrl } from "@/lib/spaces";
import { logError, logInfo } from "@/lib/telemetry";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  const parsed = signedUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Request body does not match the upload signing contract.",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/upload/sign",
    config: { max: 10, windowMs: 60_000 },
    sessionKey: parsed.data.inspectionId,
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many upload signing requests. Please wait and try again.",
      origin: cors.origin,
      requestId,
      status: 429,
      headers: {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    });
  }

  if (parsed.data.files.length === 0 || parsed.data.files.length > 8) {
    return createErrorResponse({
      code: "invalid_file_count",
      message: "You must request between 1 and 8 upload targets.",
      origin: cors.origin,
      requestId,
      status: 400,
      headers: createRateLimitHeaders(rateLimit),
    });
  }

  const invalidFile = parsed.data.files.find((file) => !ALLOWED_CONTENT_TYPES.has(file.contentType));
  if (invalidFile) {
    return createErrorResponse({
      code: "unsupported_content_type",
      message: `Unsupported file type: ${invalidFile.contentType}.`,
      origin: cors.origin,
      requestId,
      status: 400,
      headers: createRateLimitHeaders(rateLimit),
    });
  }

  const startedAt = Date.now();

  try {
    const uploads = parsed.data.files.map((file, index) => {
      const objectKey = buildManualObjectKey(parsed.data.inspectionId, file.contentType);
      const provider = hasSpacesConfig() ? "digitalocean-spaces" : "local-storage";
      logInfo({
        message: "Generated signed upload target",
        route: "/api/upload/sign",
        requestId,
        inspectionId: parsed.data.inspectionId,
        provider,
        uploadIndex: index,
      });

      return {
        uploadUrl: hasSpacesConfig()
          ? createSignedObjectUrl({
              method: "PUT",
              objectKey,
              contentType: file.contentType,
              expiresInSeconds: 900,
            })
          : buildLocalObjectUrl({
              requestUrl: request.url,
              objectKey,
            }),
        objectKey,
      };
    });

    const responsePayload = signedUploadResponseSchema.parse({ uploads });

    logInfo({
      message: "Signed upload URLs created",
      route: "/api/upload/sign",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: hasSpacesConfig() ? `digitalocean-spaces:${appEnv.spacesBucket}` : "local-storage",
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(responsePayload, {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logError({
      message: "Failed to sign upload URLs",
      route: "/api/upload/sign",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: "digitalocean-spaces",
      durationMs: Date.now() - startedAt,
      details: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse({
      code: "signing_failed",
      message: "Failed to generate upload URLs.",
      origin: cors.origin,
      requestId,
      status: 500,
      headers: createRateLimitHeaders(rateLimit),
    });
  }
}
