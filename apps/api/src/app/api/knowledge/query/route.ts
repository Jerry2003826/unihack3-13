import { knowledgeQueryRequestSchema, knowledgeQueryResponseSchema } from "@inspect-ai/contracts";
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
import { queryKnowledge } from "@/lib/knowledge/queryKnowledge";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo } from "@/lib/telemetry";

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
  const parsed = knowledgeQueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Knowledge query request does not match the contract.",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/knowledge/query",
    config: { max: 30, windowMs: 60_000 },
    sessionKey: request.headers.get("x-request-id") ?? "knowledge",
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many knowledge queries. Please try again shortly.",
      origin: cors.origin,
      requestId,
      status: 429,
      headers: {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    });
  }

  const matches = queryKnowledge(parsed.data);

  logInfo({
    message: "Knowledge query completed",
    route: "/api/knowledge/query",
    requestId,
    provider: "local-knowledge-base",
  });

  return createJsonResponse(knowledgeQueryResponseSchema.parse({ matches }), {
    origin: cors.origin,
    requestId,
    headers: createRateLimitHeaders(rateLimit),
  });
}
