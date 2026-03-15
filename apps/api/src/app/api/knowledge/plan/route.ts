import { z } from "zod";
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
import { planAndRetrieve } from "@/lib/knowledge/retrievalPlanner";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo } from "@/lib/telemetry";

export const runtime = "nodejs";

const planRequestSchema = z.object({
  query: z.string().min(2).max(500),
});

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
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Retrieval plan request must include a 'query' string (2-500 chars).",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/knowledge/plan",
    config: { max: 20, windowMs: 60_000 },
    sessionKey: request.headers.get("x-request-id") ?? "plan",
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many retrieval plan requests. Please try again shortly.",
      origin: cors.origin,
      requestId,
      status: 429,
      headers: {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
      },
    });
  }

  const result = await planAndRetrieve(parsed.data.query);

  logInfo({
    message: `Retrieval plan completed: ${result.subQuestions.length} sub-questions, ${result.totalMatchCount} matches`,
    route: "/api/knowledge/plan",
    requestId,
    provider: "retrieval-planner",
  });

  return createJsonResponse(result, {
    origin: cors.origin,
    requestId,
    headers: createRateLimitHeaders(rateLimit),
  });
}
