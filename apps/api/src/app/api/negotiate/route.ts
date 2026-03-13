import { negotiateRequestSchema, negotiateResponseSchema } from "@inspect-ai/contracts";
import { callGeminiJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { buildNegotiationFallback } from "@/lib/fallbacks";
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
  const parsed = negotiateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonResponse(
      negotiateResponseSchema.parse(
        buildNegotiationFallback({
          hazards: [],
          intelligence: undefined,
          inspectionMode: "live",
        })
      ),
      {
        origin: cors.origin,
        requestId,
        status: 200,
      }
    );
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/negotiate",
    config: { max: 8, windowMs: 60_000 },
    sessionKey: request.headers.get("x-inspection-id") ?? parsed.data.inspectionMode,
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(
      negotiateResponseSchema.parse(
        buildNegotiationFallback({
          hazards: parsed.data.hazards,
          intelligence: parsed.data.intelligence,
          inspectionMode: parsed.data.inspectionMode,
        })
      ),
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

  const fallback = buildNegotiationFallback({
    hazards: parsed.data.hazards,
    intelligence: parsed.data.intelligence,
    inspectionMode: parsed.data.inspectionMode,
  });
  const startedAt = Date.now();

  try {
    const structured = await callGeminiJson({
      model: appEnv.geminiReasoningModel,
      schema: negotiateResponseSchema,
      timeoutMs: 25_000,
      prompt: [
        "You are a rental negotiation and pre-lease risk assistant.",
        "Return only JSON.",
        "This is not legal advice. Focus on practical renter guidance.",
        "Use the provided hazards and property intelligence to produce:",
        "- an email template",
        "- key negotiation points",
        "- a decision recommendation",
        "- a fit score",
        "- evidence summary",
        "- inspection coverage",
        "- a pre-lease action guide",
        JSON.stringify(parsed.data, null, 2),
      ].join("\n"),
    });

    const responsePayload = negotiateResponseSchema.parse({
      ...fallback,
      ...structured,
    });

    logInfo({
      message: "Negotiate route completed",
      route: "/api/negotiate",
      requestId,
      inspectionId: request.headers.get("x-inspection-id") ?? undefined,
      provider: "gemini",
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(responsePayload, {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logWarn({
      message: "Negotiate route returned fallback payload",
      route: "/api/negotiate",
      requestId,
      inspectionId: request.headers.get("x-inspection-id") ?? undefined,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      fallbackReason: "gemini_reasoning_failed",
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(negotiateResponseSchema.parse(fallback), {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  }
}
