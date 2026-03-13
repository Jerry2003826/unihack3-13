import {
  buildComparisonReport,
  buildPeoplePaperworkChecks,
  comparisonRequestSchema,
  comparisonResponseSchema,
  normalizeFactorWeights,
} from "@inspect-ai/contracts";
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
  const parsed = comparisonRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Comparison request does not match the contract.",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/compare",
    config: { max: 12, windowMs: 60_000 },
    sessionKey: parsed.data.candidates.map((candidate) => candidate.reportId).join(","),
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many comparison requests. Please try again shortly.",
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
    const weights = normalizeFactorWeights(parsed.data.weights);
    const baseReport = buildComparisonReport({
      comparisonId: crypto.randomUUID(),
      createdAt: Date.now(),
      candidates: parsed.data.candidates,
      weights,
      preferenceProfile: parsed.data.preferenceProfile,
    });

    const winner = parsed.data.candidates.find(
      (candidate) => candidate.reportId === baseReport.topRecommendation.reportId
    );

    const knowledgeMatches = queryKnowledge({
      query: [
        baseReport.topRecommendation.address,
        baseReport.whyThisWins.join(" "),
        baseReport.rankedCandidates[0]?.tradeoffs.join(" "),
        winner?.reportSnapshot.hazards.map((hazard) => hazard.category).join(" "),
      ]
        .filter(Boolean)
        .join(" "),
      tags: ["comparison", "inspection", "negotiation", "paperwork"],
      topK: 4,
    });

    const paperworkChecks = winner
      ? buildPeoplePaperworkChecks(winner.reportSnapshot)
      : buildPeoplePaperworkChecks(parsed.data.candidates[0].reportSnapshot);

    const responsePayload = comparisonResponseSchema.parse({
      report: {
        ...baseReport,
        knowledgeMatches,
        paperworkChecks,
      },
    });

    if (knowledgeMatches.length === 0) {
      logWarn({
        message: "Compare route completed without knowledge matches",
        route: "/api/compare",
        requestId,
        provider: "deterministic-comparison",
        fallbackReason: "knowledge_no_match",
        durationMs: Date.now() - startedAt,
      });
    } else {
      logInfo({
        message: "Compare route completed",
        route: "/api/compare",
        requestId,
        provider: "deterministic-comparison+knowledge",
        durationMs: Date.now() - startedAt,
      });
    }

    return createJsonResponse(responsePayload, {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    return createErrorResponse({
      code: "comparison_failed",
      message: "Comparison report generation failed.",
      details: error instanceof Error ? error.message : String(error),
      origin: cors.origin,
      requestId,
      status: 500,
      headers: createRateLimitHeaders(rateLimit),
    });
  }
}
