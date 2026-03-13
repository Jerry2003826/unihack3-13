import {
  buildReportScoreBundle,
  negotiateRequestSchema,
  negotiateResponseSchema,
  sanitizeNegotiateResponse,
} from "@inspect-ai/contracts";
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
import { queryKnowledge } from "@/lib/knowledge/queryKnowledge";
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
      sanitizeNegotiateResponse(
        negotiateResponseSchema.parse(
          buildNegotiationFallback({
            hazards: [],
            intelligence: undefined,
            inspectionMode: "live",
          })
        )
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
      sanitizeNegotiateResponse(
        negotiateResponseSchema.parse(
          buildNegotiationFallback({
            hazards: parsed.data.hazards,
            intelligence: parsed.data.intelligence,
            inspectionMode: parsed.data.inspectionMode,
            inspectionChecklist: parsed.data.inspectionChecklist,
            paperworkChecks: parsed.data.paperworkChecks,
            askingRent: parsed.data.askingRent,
            lightingScoreAuto: parsed.data.lightingScoreAuto,
            lightingScoreManual: parsed.data.lightingScoreManual,
            preferenceProfile: parsed.data.preferenceProfile,
          })
        )
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

  const fallback = sanitizeNegotiateResponse(
    buildNegotiationFallback({
      hazards: parsed.data.hazards,
      intelligence: parsed.data.intelligence,
      inspectionMode: parsed.data.inspectionMode,
      inspectionChecklist: parsed.data.inspectionChecklist,
      paperworkChecks: parsed.data.paperworkChecks,
      askingRent: parsed.data.askingRent,
      lightingScoreAuto: parsed.data.lightingScoreAuto,
      lightingScoreManual: parsed.data.lightingScoreManual,
      preferenceProfile: parsed.data.preferenceProfile,
    })
  );
  const canonicalScore = buildReportScoreBundle({
    hazards: parsed.data.hazards,
    intelligence: parsed.data.intelligence,
    inspectionChecklist: parsed.data.inspectionChecklist,
    inspectionMode: parsed.data.inspectionMode,
    paperworkChecks: parsed.data.paperworkChecks,
    askingRent: parsed.data.askingRent,
    lightingScoreAuto: parsed.data.lightingScoreAuto,
    lightingScoreManual: parsed.data.lightingScoreManual,
    preferenceProfile: parsed.data.preferenceProfile,
  });
  const knowledgeMatches = queryKnowledge({
    query: [
      parsed.data.hazards.map((hazard) => `${hazard.category} ${hazard.description}`).join(" "),
      parsed.data.intelligence?.geoAnalysis?.warning,
      parsed.data.intelligence?.agencyBackground?.negotiationLeverage,
    ]
      .filter(Boolean)
      .join(" "),
    tags: ["negotiation", "repairs", "paperwork", "inspection"],
    topK: 3,
  });
  const startedAt = Date.now();

  try {
    const structured = await callGeminiJson({
      model: appEnv.geminiReasoningModel,
      schema: negotiateResponseSchema,
      timeoutMs: 8_000,
      prompt: [
        "You are a rental negotiation and pre-lease risk assistant.",
        "Return only JSON.",
        "This is not legal advice. Focus on practical renter guidance.",
        "The property intelligence payload has already been condensed by Gemini 2.5 grounded summaries. Synthesize it into a final renter recommendation.",
        "If an inspectionChecklist is provided, treat it as first-hand renter observations and prioritize it over generic assumptions.",
        "The fit score and decision outcome are already pre-scored locally. Keep your wording aligned with that score context.",
        "Use the provided hazards and property intelligence to produce:",
        "- an email template",
        "- key negotiation points",
        "- a decision recommendation",
        "- a fit score",
        "- evidence summary",
        "- inspection coverage",
        "- a pre-lease action guide",
        "Write for renters, not for engineers.",
        "decisionRecommendation.summary must be one sentence under 140 characters.",
        "decisionRecommendation.reasons must be 2-4 short lines under 120 characters each.",
        "fitScore.summary must be one sentence under 140 characters.",
        "fitScore.drivers must be short labels under 70 characters each.",
        "evidenceSummary entries must be concise and free of scraped webpage fragments.",
        "inspectionCoverage.summary must be one short sentence under 140 characters.",
        "inspectionCoverage.warning must be under 140 characters.",
        "preLeaseActionGuide.summary must be one short sentence under 140 characters.",
        "preLeaseActionGuide items must be short action lines under 100 characters.",
        "Do not include business directory fragments, review widgets, opening hours, or raw copied snippets.",
        "Use the knowledge snippets when they are relevant, but do not quote them verbatim.",
        JSON.stringify({ canonicalScore }, null, 2),
        JSON.stringify({ knowledgeMatches }, null, 2),
        JSON.stringify(parsed.data, null, 2),
      ].join("\n"),
    });

    const responsePayload = sanitizeNegotiateResponse(
      negotiateResponseSchema.parse({
        ...fallback,
        ...structured,
        decisionRecommendation: {
          ...structured.decisionRecommendation,
          outcome: canonicalScore.recommendation.outcome,
          summary: structured.decisionRecommendation.summary || canonicalScore.recommendation.summary,
          reasons: [
            ...structured.decisionRecommendation.reasons,
            ...canonicalScore.recommendation.reasons,
          ].filter(Boolean).slice(0, 4),
        },
        fitScore: {
          ...structured.fitScore,
          score: canonicalScore.fitScore.score,
          summary: structured.fitScore.summary || canonicalScore.fitScore.summary,
          drivers: [...canonicalScore.fitScore.drivers, ...structured.fitScore.drivers]
            .filter(Boolean)
            .slice(0, 4),
        },
      })
    );

    if (knowledgeMatches.length > 0) {
      const knowledgePoints = knowledgeMatches.map((match) => `${match.title}: ${match.snippet}`);
      responsePayload.keyPoints = [...responsePayload.keyPoints, ...knowledgePoints].slice(0, 6);
      responsePayload.preLeaseActionGuide = {
        ...responsePayload.preLeaseActionGuide,
        furtherInspectionItems: [
          ...responsePayload.preLeaseActionGuide.furtherInspectionItems,
          ...knowledgeMatches.map((match) => match.title),
        ].slice(0, 6),
      };
    }

    const sanitizedResponse = sanitizeNegotiateResponse(responsePayload);

    logInfo({
      message: "Negotiate route completed",
      route: "/api/negotiate",
      requestId,
      inspectionId: request.headers.get("x-inspection-id") ?? undefined,
      provider: "gemini",
      durationMs: Date.now() - startedAt,
    });

    return createJsonResponse(sanitizedResponse, {
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
