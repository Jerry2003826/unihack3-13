import {
  intelligenceRequestSchema,
  intelligenceResponseSchema,
  propertyIntelligenceSchema,
  sanitizePropertyIntelligence,
  type GeoAnalysis,
  type IntelligenceChannelSignal,
  type IntelligenceFusion,
} from "@inspect-ai/contracts";
import { analyzeGeoContext } from "@/lib/agents/geoAnalyzer";
import { summarizeMapsGroundedIntelligence } from "@/lib/agents/mapsGroundedIntelligence";
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
  const failureDetails: string[] = [];
  const fallbackReasons: string[] = [];

  function buildSignal(args: {
    topic: IntelligenceChannelSignal["topic"];
    title: string;
    summary?: string;
    highlights?: string[];
    confidence: IntelligenceChannelSignal["confidence"];
  }): IntelligenceChannelSignal | null {
    if (!args.summary?.trim()) {
      return null;
    }

    return {
      topic: args.topic,
      title: args.title,
      summary: args.summary.trim(),
      highlights: args.highlights?.filter(Boolean).slice(0, 4),
      confidence: args.confidence,
    };
  }

  function buildFusion(args: {
    geo: Awaited<ReturnType<typeof analyzeGeoContext>>;
    grounded?: Awaited<ReturnType<typeof summarizeMapsGroundedIntelligence>>;
    community: { communityInsight: NonNullable<ReturnType<typeof buildCommunityFallback>> | { summary: string; highlights?: string[]; sentiment: string; citations: { sourceId: string; title: string; url: string }[] } };
    agency: { agencyBackground: NonNullable<ReturnType<typeof buildAgencyFallback>> | { agencyName: string; summary?: string; highlights?: string[]; sentimentScore: number; commonComplaints: string[]; negotiationLeverage: string; citations: { sourceId: string; title: string; url: string }[] } };
  }): IntelligenceFusion {
    const geoMapSignals = args.geo.mapSignals ?? [];
    const geoWebSignals = args.geo.webSignals ?? [];

    const mapSignals = [
      buildSignal({
        topic: "geo",
        title: "Map access & amenities",
        summary:
          args.grounded?.geoSummary ??
          (geoMapSignals.length > 0
            ? geoMapSignals.join(". ")
            : args.geo.geoAnalysis.warning),
        highlights: args.grounded?.geoKeySignals ?? geoMapSignals,
        confidence: geoMapSignals.length >= 2 ? "high" : "medium",
      }),
      buildSignal({
        topic: "community",
        title: "Maps-grounded local context",
        summary: args.grounded?.communityInsight?.summary,
        highlights: args.grounded?.communityInsight?.highlights,
        confidence:
          (args.grounded?.communityInsight?.citations.length ?? 0) >= 2 ? "high" : "medium",
      }),
      buildSignal({
        topic: "agency",
        title: "Maps-grounded agency profile",
        summary: args.grounded?.agencyBackground?.summary ?? args.grounded?.agencyBackground?.negotiationLeverage,
        highlights: args.grounded?.agencyBackground?.highlights,
        confidence:
          (args.grounded?.agencyBackground?.citations.length ?? 0) >= 2 ? "high" : "medium",
      }),
    ].filter(Boolean) as IntelligenceChannelSignal[];

    const webSignals = [
      buildSignal({
        topic: "geo",
        title: "Web local risk signals",
        summary: args.geo.webSummary,
        highlights: geoWebSignals,
        confidence: geoWebSignals.length >= 2 ? "medium" : "low",
      }),
      buildSignal({
        topic: "community",
        title: "Web community signal",
        summary: args.community.communityInsight.summary,
        highlights: args.community.communityInsight.highlights,
        confidence: args.community.communityInsight.citations.length >= 2 ? "high" : "medium",
      }),
      buildSignal({
        topic: "agency",
        title: "Web agency signal",
        summary:
          args.agency.agencyBackground.summary ?? args.agency.agencyBackground.negotiationLeverage,
        highlights: args.agency.agencyBackground.highlights,
        confidence: args.agency.agencyBackground.citations.length >= 2 ? "high" : "medium",
      }),
    ].filter(Boolean) as IntelligenceChannelSignal[];

    const conflicts: string[] = [];

    if (
      args.geo.geoAnalysis.noiseRisk === "High" &&
      args.community.communityInsight.sentiment === "positive"
    ) {
      conflicts.push("Map convenience looks strong, but web evidence still flags meaningful noise or disruption.");
    }

    if (
      args.grounded?.communityInsight?.sentiment === "positive" &&
      ["mixed", "negative"].includes(args.community.communityInsight.sentiment)
    ) {
      conflicts.push("Maps-grounded local context is more positive than public web discussion. Verify the street in person.");
    }

    if (args.agency.agencyBackground.sentimentScore <= 2.5) {
      conflicts.push("Agency reputation is weaker than the location signal. Use written commitments, not verbal assurances.");
    }

    const confidence: IntelligenceFusion["confidence"] =
      mapSignals.length >= 2 && webSignals.length >= 2
        ? "high"
        : mapSignals.length >= 1 && webSignals.length >= 1
        ? "medium"
        : "low";

    return {
      mapSignals,
      webSignals,
      conflicts: [...new Set(conflicts)].slice(0, 4),
      confidence,
    };
  }

  function mergeGeoAnalysis(base: GeoAnalysis, grounded?: { geoSummary?: string; geoKeySignals?: string[] }) {
    return {
      ...base,
      warning: grounded?.geoSummary ?? base.warning,
      keySignals:
        grounded?.geoKeySignals && grounded.geoKeySignals.length > 0
          ? grounded.geoKeySignals
          : base.keySignals,
    };
  }

  const [geoResult, groundedResult, communityResult, agencyResult] = await Promise.allSettled([
    analyzeGeoContext({
      address: parsed.data.address,
      coordinates: parsed.data.coordinates,
      targetDestinations: parsed.data.targetDestinations,
      depth: parsed.data.depth,
    }),
    summarizeMapsGroundedIntelligence({
      address: parsed.data.address,
      coordinates: parsed.data.coordinates,
      agency: parsed.data.agency,
      propertyNotes: parsed.data.propertyNotes,
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

  const grounded = groundedResult.status === "fulfilled" ? groundedResult.value : undefined;

  const community =
    communityResult.status === "fulfilled" && communityResult.value.provider !== "fallback"
      ? communityResult.value
      : grounded?.communityInsight
      ? {
          communityInsight: grounded.communityInsight,
          provider: grounded.provider,
        }
      : communityResult.status === "fulfilled"
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
    agencyResult.status === "fulfilled" && agencyResult.value.provider !== "fallback"
      ? agencyResult.value
      : grounded?.agencyBackground
      ? {
          agencyBackground: grounded.agencyBackground,
          provider: grounded.provider,
        }
      : agencyResult.status === "fulfilled"
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
  if (groundedResult.status === "rejected") failedSubtasks.push("maps_grounding");
  if (communityResult.status === "rejected") failedSubtasks.push("community");
  if (agencyResult.status === "rejected") failedSubtasks.push("agency");

  if (geoResult.status === "rejected") {
    failureDetails.push(`geo: ${geoResult.reason instanceof Error ? geoResult.reason.message : String(geoResult.reason)}`);
  }
  if (groundedResult.status === "rejected") {
    failureDetails.push(
      `maps_grounding: ${groundedResult.reason instanceof Error ? groundedResult.reason.message : String(groundedResult.reason)}`
    );
  }
  if (communityResult.status === "rejected") {
    failureDetails.push(
      `community: ${communityResult.reason instanceof Error ? communityResult.reason.message : String(communityResult.reason)}`
    );
  }
  if (agencyResult.status === "rejected") {
    failureDetails.push(`agency: ${agencyResult.reason instanceof Error ? agencyResult.reason.message : String(agencyResult.reason)}`);
  }

  if (geo.fallbackReason) fallbackReasons.push(geo.fallbackReason);
  if (grounded?.fallbackReason) fallbackReasons.push(grounded.fallbackReason);
  if (groundedResult.status === "rejected") fallbackReasons.push("maps_grounding_failed");
  if (community.fallbackReason) fallbackReasons.push(community.fallbackReason);
  if (agency.fallbackReason) fallbackReasons.push(agency.fallbackReason);

  try {
    const intelligence = sanitizePropertyIntelligence(
      propertyIntelligenceSchema.parse({
        address:
          grounded?.resolvedAddress ??
          geo.resolvedAddress ??
          parsed.data.address ??
        (parsed.data.coordinates
          ? `${parsed.data.coordinates.lat.toFixed(4)}, ${parsed.data.coordinates.lng.toFixed(4)}`
          : undefined),
        geoAnalysis: mergeGeoAnalysis(geo.geoAnalysis, grounded),
        communityInsight: community.communityInsight,
        agencyBackground: agency.agencyBackground,
        fusion: buildFusion({ geo, grounded, community, agency }),
      })
    );

    if (failedSubtasks.length > 0 || fallbackReasons.length > 0) {
      logWarn({
        message: "Intelligence route completed with fallbacks",
        route: "/api/intelligence",
        requestId,
        inspectionId: request.headers.get("x-inspection-id") ?? undefined,
        provider: [geo.provider, grounded?.provider, community.provider, agency.provider].filter(Boolean).join(","),
        durationMs: Date.now() - startedAt,
        fallbackReason: fallbackReasons.join(","),
        failedSubtasks,
        details: failureDetails.join(" | ") || undefined,
      });
    } else {
      logInfo({
        message: "Intelligence route completed",
        route: "/api/intelligence",
        requestId,
        inspectionId: request.headers.get("x-inspection-id") ?? undefined,
        provider: [geo.provider, grounded?.provider, community.provider, agency.provider].filter(Boolean).join(","),
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
        intelligence: sanitizePropertyIntelligence({
          address: parsed.data.address,
          geoAnalysis: buildGeoFallback({ address: parsed.data.address }),
          communityInsight: buildCommunityFallback({ address: parsed.data.address }),
          agencyBackground: buildAgencyFallback({ agency: parsed.data.agency }),
        }),
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  }
}
