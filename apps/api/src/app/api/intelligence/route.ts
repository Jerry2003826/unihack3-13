import {
  intelligenceRequestSchema,
  intelligenceResponseSchema,
  propertyIntelligenceSchema,
} from "@inspect-ai/contracts";
import { analyzeGeoContext } from "@/lib/agents/geoAnalyzer";
import { analyzeAgencyBackground } from "@/lib/agents/searchAgent";
import { researchCommunity } from "@/lib/agents/communityResearchAgent";
import {
  buildAgencyFallback,
  buildCommunityFallback,
  buildGeoFallback,
} from "@/lib/fallbacks";
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
import { logError, logInfo, logWarn } from "@/lib/telemetry";

export const runtime = "nodejs";
export const maxDuration = 45;

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
  const parsed = intelligenceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse({
      code: "invalid_request",
      message: "Request body does not match the intelligence contract.",
      details: parsed.error.flatten(),
      origin: cors.origin,
      requestId,
      status: 400,
    });
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/intelligence",
    config: { max: 12, windowMs: 60_000 },
    sessionKey:
      request.headers.get("x-inspection-id") ??
      parsed.data.address ??
      (parsed.data.coordinates ? `${parsed.data.coordinates.lat},${parsed.data.coordinates.lng}` : "anonymous"),
  });

  if (!rateLimit.allowed) {
    return createErrorResponse({
      code: "rate_limited",
      message: "Too many intelligence requests. Please wait and try again.",
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
  const failedSubtasks: string[] = [];
  const fallbackReasons: string[] = [];

  const [geoResult, communityResult, agencyResult] = await Promise.allSettled([
    analyzeGeoContext({
      address: parsed.data.address,
      coordinates: parsed.data.coordinates,
      targetDestinations: parsed.data.targetDestinations,
      depth: parsed.data.depth,
    }),
    researchCommunity({
      address: parsed.data.address,
      coordinates: parsed.data.coordinates,
      propertyNotes: parsed.data.propertyNotes,
      depth: parsed.data.depth,
    }),
    analyzeAgencyBackground({
      agency: parsed.data.agency,
      depth: parsed.data.depth,
    }),
  ]);

  const geo =
    geoResult.status === "fulfilled"
      ? geoResult.value
      : {
          geoAnalysis: buildGeoFallback({ address: parsed.data.address }),
          resolvedAddress: parsed.data.address,
          fallbackReason: "geo_failed",
          provider: "fallback",
        };

  const community =
    communityResult.status === "fulfilled"
      ? communityResult.value
      : {
          communityInsight: buildCommunityFallback({
            address: parsed.data.address,
            reason: "Community research failed.",
          }),
          fallbackReason: "community_failed",
          provider: "fallback",
        };

  const agency =
    agencyResult.status === "fulfilled"
      ? agencyResult.value
      : {
          agencyBackground: buildAgencyFallback({
            agency: parsed.data.agency,
            reason: "Agency research failed.",
          }),
          fallbackReason: "agency_failed",
          provider: "fallback",
        };

  if (geoResult.status === "rejected") failedSubtasks.push("geo");
  if (communityResult.status === "rejected") failedSubtasks.push("community");
  if (agencyResult.status === "rejected") failedSubtasks.push("agency");

  if (geo.fallbackReason) fallbackReasons.push(geo.fallbackReason);
  if (community.fallbackReason) fallbackReasons.push(community.fallbackReason);
  if (agency.fallbackReason) fallbackReasons.push(agency.fallbackReason);

  try {
    const intelligence = propertyIntelligenceSchema.parse({
      address:
        geo.resolvedAddress ??
        parsed.data.address ??
        (parsed.data.coordinates
          ? `${parsed.data.coordinates.lat.toFixed(4)}, ${parsed.data.coordinates.lng.toFixed(4)}`
          : undefined),
      geoAnalysis: geo.geoAnalysis,
      communityInsight: community.communityInsight,
      agencyBackground: agency.agencyBackground,
    });

    if (failedSubtasks.length > 0 || fallbackReasons.length > 0) {
      logWarn({
        message: "Intelligence route completed with fallbacks",
        route: "/api/intelligence",
        requestId,
        inspectionId: request.headers.get("x-inspection-id") ?? undefined,
        provider: [geo.provider, community.provider, agency.provider].join(","),
        durationMs: Date.now() - startedAt,
        fallbackReason: fallbackReasons.join(","),
        failedSubtasks,
      });
    } else {
      logInfo({
        message: "Intelligence route completed",
        route: "/api/intelligence",
        requestId,
        inspectionId: request.headers.get("x-inspection-id") ?? undefined,
        provider: [geo.provider, community.provider, agency.provider].join(","),
        durationMs: Date.now() - startedAt,
      });
    }

    return createJsonResponse(intelligenceResponseSchema.parse({ intelligence }), {
      origin: cors.origin,
      requestId,
      headers: createRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logError({
      message: "Intelligence route failed",
      route: "/api/intelligence",
      requestId,
      inspectionId: request.headers.get("x-inspection-id") ?? undefined,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      failedSubtasks,
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(
      intelligenceResponseSchema.parse({
        intelligence: {
          address: parsed.data.address,
          geoAnalysis: buildGeoFallback({ address: parsed.data.address }),
          communityInsight: buildCommunityFallback({ address: parsed.data.address }),
          agencyBackground: buildAgencyFallback({ agency: parsed.data.agency }),
        },
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  }
}
