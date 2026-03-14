import { reconstructRoom3DRequestSchema, reconstructRoom3DResponseSchema } from "@inspect-ai/contracts";
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
import { logError, logInfo } from "@/lib/telemetry";
import { reconstructRoomScene } from "@/lib/vision/roomSceneReconstruct";

export const runtime = "nodejs";
export const maxDuration = 40;

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
  const parsed = reconstructRoom3DRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_reconstruct_request",
      message: "3D reconstruction payload is invalid.",
      requestId,
      origin: cors.origin,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/scan/3d/reconstruct",
    config: { max: 12, windowMs: 60_000 },
    sessionKey: parsed.data.inspectionId,
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many 3D reconstruction requests.",
      requestId,
      origin: cors.origin,
      status: 429,
      headers: {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    });
  }

  const startedAt = Date.now();

  try {
    const scene = await reconstructRoomScene(parsed.data);
    const response = reconstructRoom3DResponseSchema.parse({ scene });

    logInfo({
      message: "3D room scene reconstructed",
      route: "/api/scan/3d/reconstruct",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: "gemini",
      durationMs: Date.now() - startedAt,
      details: {
        roomType: parsed.data.roomType,
        captureCount: parsed.data.captures.length,
      },
    });

    return createJsonResponse(response, {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logError({
      message: "3D room scene reconstruction failed",
      route: "/api/scan/3d/reconstruct",
      requestId,
      inspectionId: parsed.data.inspectionId,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      details: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse({
      code: "reconstruct_failed",
      message: "Failed to reconstruct a 3D room scene.",
      requestId,
      origin: cors.origin,
      status: 500,
      headers: createRateLimitHeaders(rateLimit),
    });
  }
}
