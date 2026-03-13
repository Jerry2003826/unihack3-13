import { z } from "zod";
import {
  checklistPrefillRequestSchema,
  checklistPrefillResponseSchema,
  inspectionChecklistSchema,
  sanitizeDisplayText,
  type InspectionChecklist,
} from "@inspect-ai/contracts";
import { callGeminiJson } from "@/lib/ai";
import { researchCommunity } from "@/lib/agents/communityResearchAgent";
import { analyzeGeoContext } from "@/lib/agents/geoAnalyzer";
import { analyzeAgencyBackground } from "@/lib/agents/searchAgent";
import { appEnv } from "@/lib/env";
import {
  createFrontendDisabledResponse,
  createJsonResponse,
  createOptionsResponse,
  createRateLimitHeaders,
  ensureCrossOriginAllowed,
  getRequestId,
  readJsonBody,
} from "@/lib/http";
import { extractListingDetails } from "@/lib/listing/extractListing";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo, logWarn } from "@/lib/telemetry";

export const runtime = "nodejs";
export const maxDuration = 30;

const REMOTE_FRIENDLY_FIELD_PATHS = [
  "security.nightEntryRoute",
  "security.parcelRoom",
  "security.entryAccess",
  "security.keycardInventory",
  "noise.weekdayMorning",
  "noise.lateNight",
  "noise.weekend",
  "noise.bedroomClosedWindows",
  "noise.balconyNoise",
  "leaseCosts.hiddenFees",
  "leaseCosts.rentIncreaseHistory",
  "leaseCosts.bondHandling",
  "buildingManagement.managerResponse",
  "buildingManagement.repairTurnaround",
  "buildingManagement.facilityBooking",
  "buildingManagement.visitorParking",
  "buildingManagement.mailboxParcelRoom",
  "utilities.heatingCooling",
  "utilities.internetNbn",
  "livability.bedDeskFit",
  "livability.twoPersonFit",
  "leaseCosts.furnitureMaintenance",
  "leaseCosts.utilityResponsibility",
  "leaseCosts.petsPolicy",
  "leaseCosts.subletBreakLease",
  "entryCondition.electricalSafetyCheck",
  "entryCondition.gasSafetyCheck",
  "entryCondition.inventoryItems",
] as const;

const MANUAL_PRIORITY_FIELD_PATHS = [
  "utilities.hotWater",
  "utilities.waterPressure",
  "utilities.drainage",
  "utilities.powerPoints",
  "utilities.heatingCooling",
  "utilities.mobileSignal",
  "utilities.internetNbn",
  "utilities.nbnLocation",
  "security.doorLocks",
  "security.intercom",
  "security.smokeAlarm",
  "kitchenBathroom.toiletFlush",
  "kitchenBathroom.hotColdTaps",
  "kitchenBathroom.washerDryer",
  "kitchenBathroom.kitchenExhaust",
  "kitchenBathroom.bathroomVentilation",
  "kitchenBathroom.dampness",
  "livability.wardrobeStorage",
  "livability.kitchenStorage",
  "livability.fridgePlacement",
  "livability.bulkyItemsStorage",
  "livability.bedDeskFit",
  "livability.workFromHomeFit",
  "livability.twoPersonFit",
  "pestsHiddenIssues.pests",
  "pestsHiddenIssues.cabinetUnderSink",
  "pestsHiddenIssues.windowSeals",
  "pestsHiddenIssues.bathroomSealant",
  "pestsHiddenIssues.skirtingFloorEdges",
  "entryCondition.conditionPhotosTaken",
  "entryCondition.inventoryItems",
  "entryCondition.renterDisagreements",
] as const;

const internalPrefillSchema = z.object({
  summary: z.string(),
  checklist: inspectionChecklistSchema,
  autoFilledFieldKeys: z.array(z.string()),
  manualReviewFieldKeys: z.array(z.string()),
});

type FieldPath = (typeof REMOTE_FRIENDLY_FIELD_PATHS)[number] | (typeof MANUAL_PRIORITY_FIELD_PATHS)[number];

function isRemoteFriendlyFieldPath(path: string): path is (typeof REMOTE_FRIENDLY_FIELD_PATHS)[number] {
  return (REMOTE_FRIENDLY_FIELD_PATHS as readonly string[]).includes(path);
}

function isKnownFieldPath(path: string): path is FieldPath {
  return ([...REMOTE_FRIENDLY_FIELD_PATHS, ...MANUAL_PRIORITY_FIELD_PATHS] as readonly string[]).includes(path);
}

function setChecklistValue(
  checklist: InspectionChecklist,
  path: string,
  value: string | string[]
) {
  const [sectionKey, fieldKey] = path.split(".");
  if (!sectionKey || !fieldKey) {
    return checklist;
  }

  const next = { ...checklist } as Record<string, unknown>;
  const section = { ...(((next[sectionKey] as Record<string, unknown> | undefined) ?? {})) };
  section[fieldKey] = value;
  next[sectionKey] = section;
  return next as InspectionChecklist;
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function getFilledFieldPaths(checklist: InspectionChecklist | undefined) {
  if (!checklist) {
    return [] as string[];
  }

  return Object.entries(checklist).flatMap(([sectionKey, sectionValue]) => {
    if (!sectionValue || typeof sectionValue !== "object") {
      return [];
    }

    return Object.entries(sectionValue).flatMap(([fieldKey, rawValue]) => {
      if (Array.isArray(rawValue)) {
        return rawValue.length > 0 ? [`${sectionKey}.${fieldKey}`] : [];
      }

      return typeof rawValue === "string" && rawValue.trim() ? [`${sectionKey}.${fieldKey}`] : [];
    });
  });
}

function mergeChecklist(base: InspectionChecklist, patch?: InspectionChecklist) {
  let next = { ...base };

  if (!patch) {
    return next;
  }

  for (const path of getFilledFieldPaths(patch)) {
    const [sectionKey, fieldKey] = path.split(".");
    const section = patch?.[sectionKey as keyof InspectionChecklist] as Record<string, unknown> | undefined;
    const rawValue = section?.[fieldKey];
    if (!rawValue) {
      continue;
    }

    next = setChecklistValue(next, path, Array.isArray(rawValue) ? rawValue.map((item) => String(item)) : String(rawValue));
  }

  return next;
}

function buildHeuristicPrefill(args: {
  address?: string;
  agency?: string;
  geo: Awaited<ReturnType<typeof analyzeGeoContext>>["geoAnalysis"];
  community: Awaited<ReturnType<typeof researchCommunity>>["communityInsight"];
  agencyBackground?: Awaited<ReturnType<typeof analyzeAgencyBackground>>["agencyBackground"];
  listing?: {
    title?: string;
    summary?: string;
    rentText?: string;
    checklistHints?: InspectionChecklist;
  };
}) {
  let checklist: InspectionChecklist = {};
  const autoFilledFieldKeys: string[] = [];

  const noiseLine =
    args.geo.warning ||
    args.geo.keySignals?.[0] ||
    (args.geo.noiseRisk === "High"
      ? "Public web and map signals suggest noticeable traffic or street noise nearby."
      : args.geo.noiseRisk === "Medium"
        ? "Public signals suggest some day-to-day traffic or street noise nearby."
        : "No strong public noise warnings surfaced online, but peak times should still be checked in person.");
  checklist = setChecklistValue(checklist, "noise.weekdayMorning", noiseLine);
  autoFilledFieldKeys.push("noise.weekdayMorning");

  if (args.geo.noiseRisk === "High" || args.geo.noiseRisk === "Medium") {
    checklist = setChecklistValue(
      checklist,
      "noise.balconyNoise",
      args.geo.noiseRisk === "High"
        ? "Open-window and balcony comfort may be affected by nearby traffic or road activity."
        : "Expect some open-window street noise; verify balcony comfort during your visit."
    );
    autoFilledFieldKeys.push("noise.balconyNoise");
  }

  if (args.community.summary) {
    checklist = setChecklistValue(checklist, "security.nightEntryRoute", args.community.summary);
    autoFilledFieldKeys.push("security.nightEntryRoute");
  }

  if (args.geo.nearbyEssentials?.some((place) => place.parkingHighlights?.length)) {
    const parking = args.geo.nearbyEssentials
      .flatMap((place) => place.parkingHighlights ?? [])
      .slice(0, 2)
      .join(", ");
    checklist = setChecklistValue(checklist, "buildingManagement.visitorParking", `Nearby parking signals: ${parking}. Verify building visitor parking rules directly.`);
    autoFilledFieldKeys.push("buildingManagement.visitorParking");
  }

  if (args.agencyBackground?.negotiationLeverage) {
    checklist = setChecklistValue(checklist, "leaseCosts.hiddenFees", args.agencyBackground.negotiationLeverage);
    autoFilledFieldKeys.push("leaseCosts.hiddenFees");
  }

  if (args.agencyBackground?.commonComplaints.length) {
    checklist = setChecklistValue(
      checklist,
      "buildingManagement.repairTurnaround",
      `Public signals mention: ${args.agencyBackground.commonComplaints.slice(0, 2).join(", ")}. Confirm repair response times in writing.`
    );
    autoFilledFieldKeys.push("buildingManagement.repairTurnaround");
  }

  if (args.listing?.checklistHints) {
    checklist = mergeChecklist(checklist, args.listing.checklistHints);
    autoFilledFieldKeys.push(...getFilledFieldPaths(args.listing.checklistHints));
  }

  const manualReviewFieldKeys = dedupeStrings([
    ...MANUAL_PRIORITY_FIELD_PATHS,
    ...REMOTE_FRIENDLY_FIELD_PATHS.filter((path) => !autoFilledFieldKeys.includes(path)),
  ]);

  const summary = autoFilledFieldKeys.length
    ? `Auto-filled ${autoFilledFieldKeys.length} checklist item${autoFilledFieldKeys.length > 1 ? "s" : ""} from Google Maps, web signals, and listing details.`
    : "No reliable remote checklist fields were found. Continue with manual inspection notes.";

  return checklistPrefillResponseSchema.parse({
    checklist,
    autoFilledFieldKeys: dedupeStrings(autoFilledFieldKeys),
    manualReviewFieldKeys,
    summary,
    provider: "fallback",
  });
}

function normalizeChecklistValue(checklist: InspectionChecklist, path: string, value: string | string[] | undefined) {
  if (!value) {
    return checklist;
  }

  if (Array.isArray(value) && value.length === 0) {
    return checklist;
  }

  if (typeof value === "string" && !value.trim()) {
    return checklist;
  }

  return setChecklistValue(
    checklist,
    path,
    Array.isArray(value)
      ? value.map((item) => sanitizeDisplayText(String(item), { maxLength: 80, maxSegments: 1, fallback: String(item) }))
      : sanitizeDisplayText(value, { maxLength: 150, maxSegments: 2, fallback: value })
  );
}

function buildRouteSummary(autoFilledCount: number, manualReviewCount: number) {
  if (autoFilledCount === 0) {
    return "Remote search found little reliable checklist detail. Add the practical inspection notes manually.";
  }

  return `Auto-filled ${autoFilledCount} item${autoFilledCount > 1 ? "s" : ""} from web and map research. ${manualReviewCount} on-site check${manualReviewCount > 1 ? "s" : ""} still need manual confirmation.`;
}

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
  const parsed = checklistPrefillRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createJsonResponse(
      checklistPrefillResponseSchema.parse({
        checklist: {},
        autoFilledFieldKeys: [],
        manualReviewFieldKeys: [...MANUAL_PRIORITY_FIELD_PATHS],
        summary: "Add the practical inspection notes manually after you inspect the property.",
        provider: "fallback",
      }),
      {
        origin: cors.origin,
        requestId,
      }
    );
  }

  const rateLimit = checkRateLimit({
    request,
    route: "/api/checklist/prefill",
    config: { max: 12, windowMs: 120_000 },
    sessionKey:
      parsed.data.address?.trim() ||
      (parsed.data.coordinates ? `${parsed.data.coordinates.lat.toFixed(4)},${parsed.data.coordinates.lng.toFixed(4)}` : "unknown"),
  });

  if (!rateLimit.allowed) {
    return createJsonResponse(
      checklistPrefillResponseSchema.parse({
        checklist: {},
        autoFilledFieldKeys: [],
        manualReviewFieldKeys: [...MANUAL_PRIORITY_FIELD_PATHS],
        summary: "Remote checklist lookup is cooling down. Continue with manual notes for now.",
        provider: "fallback",
      }),
      {
        origin: cors.origin,
        requestId,
        headers: {
          ...createRateLimitHeaders(rateLimit),
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const startedAt = Date.now();

  try {
    const listingDetails = parsed.data.listingUrl
      ? await extractListingDetails(parsed.data.listingUrl).catch(() => null)
      : null;
    const [geoResult, communityResult, agencyResult] = await Promise.all([
      analyzeGeoContext({
        address: parsed.data.address,
        coordinates: parsed.data.coordinates,
        depth: "fast",
      }),
      researchCommunity({
        address: parsed.data.address,
        coordinates: parsed.data.coordinates,
        propertyNotes: parsed.data.propertyNotes,
        depth: "fast",
      }),
      parsed.data.agency?.trim()
        ? analyzeAgencyBackground({
            agency: parsed.data.agency,
            depth: "fast",
          })
        : Promise.resolve(null),
    ]);

    const fallbackPrefill = buildHeuristicPrefill({
      address: geoResult.resolvedAddress ?? parsed.data.address,
      agency: parsed.data.agency,
      geo: geoResult.geoAnalysis,
      community: communityResult.communityInsight,
      agencyBackground: agencyResult?.agencyBackground,
      listing: listingDetails?.listing,
    });

    try {
      const structured = await callGeminiJson({
        model: appEnv.geminiIntelligenceModel,
        schema: internalPrefillSchema,
        timeoutMs: 8_000,
        prompt: [
          "You are preparing a renter inspection checklist draft from remote evidence only.",
          "Return only JSON.",
          "Only fill fields that can be reasonably inferred from web search, Google Maps, public listings, or public review signals.",
          "Do not invent inside-unit facts such as hot water stability, tap function, power point count, smoke alarm test dates, or pest presence.",
          "If a field cannot be supported remotely, leave it blank and put its field path in manualReviewFieldKeys.",
          "Prefer concise renter-facing notes under 140 characters per field.",
          "Avoid raw copied snippets, opening hours, directory fragments, or review widgets.",
          "Allowed field paths to auto-fill when evidence exists:",
          JSON.stringify(REMOTE_FRIENDLY_FIELD_PATHS, null, 2),
          "Fields that almost always need manual or lease-pack confirmation:",
          JSON.stringify(MANUAL_PRIORITY_FIELD_PATHS, null, 2),
          JSON.stringify(
            {
              address: geoResult.resolvedAddress ?? parsed.data.address,
              agency: parsed.data.agency,
              propertyNotes: parsed.data.propertyNotes,
              listingUrl: parsed.data.listingUrl,
              listingDetails: listingDetails?.listing,
              geoAnalysis: geoResult.geoAnalysis,
              communityInsight: communityResult.communityInsight,
              agencyBackground: agencyResult?.agencyBackground,
              fallbackPrefill,
            },
            null,
            2
          ),
        ].join("\n"),
      });

      let checklist: InspectionChecklist = {};
      for (const path of dedupeStrings(structured.autoFilledFieldKeys)) {
        const [sectionKey, fieldKey] = path.split(".");
        const section = (structured.checklist as Record<string, unknown>)[sectionKey] as Record<string, unknown> | undefined;
        const rawValue = section?.[fieldKey];
        checklist = normalizeChecklistValue(
          checklist,
          path,
          Array.isArray(rawValue) ? rawValue.map((item) => String(item)) : typeof rawValue === "string" ? rawValue : undefined
        );
      }

      const autoFilledFieldKeys = dedupeStrings(
        structured.autoFilledFieldKeys.filter((path) => isRemoteFriendlyFieldPath(path))
      );
      const manualReviewFieldKeys = dedupeStrings([
        ...structured.manualReviewFieldKeys.filter((path) => isKnownFieldPath(path)),
        ...MANUAL_PRIORITY_FIELD_PATHS,
      ]);

      const payload = checklistPrefillResponseSchema.parse({
        checklist,
        autoFilledFieldKeys,
        manualReviewFieldKeys,
        summary: sanitizeDisplayText(
          structured.summary || buildRouteSummary(autoFilledFieldKeys.length, manualReviewFieldKeys.length),
          {
            maxLength: 180,
            maxSegments: 2,
            fallback: buildRouteSummary(autoFilledFieldKeys.length, manualReviewFieldKeys.length),
          }
        ),
        provider: "gemini+google",
      });

      logInfo({
        message: "Checklist prefill completed",
        route: "/api/checklist/prefill",
        requestId,
        provider: "gemini+google",
        durationMs: Date.now() - startedAt,
      });

      return createJsonResponse(payload, {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      });
    } catch (error) {
      logWarn({
        message: "Checklist prefill fell back to heuristic payload",
        route: "/api/checklist/prefill",
        requestId,
        provider: "fallback",
        durationMs: Date.now() - startedAt,
        fallbackReason: "gemini_prefill_failed",
        details: error instanceof Error ? error.message : String(error),
      });

      return createJsonResponse(fallbackPrefill, {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      });
    }
  } catch (error) {
    logWarn({
      message: "Checklist prefill failed",
      route: "/api/checklist/prefill",
      requestId,
      provider: "fallback",
      durationMs: Date.now() - startedAt,
      fallbackReason: "checklist_prefill_failed",
      details: error instanceof Error ? error.message : String(error),
    });

    return createJsonResponse(
      checklistPrefillResponseSchema.parse({
        checklist: {},
        autoFilledFieldKeys: [],
        manualReviewFieldKeys: [...MANUAL_PRIORITY_FIELD_PATHS],
        summary: "Remote checklist lookup failed. Continue with manual inspection notes.",
        provider: "fallback",
      }),
      {
        origin: cors.origin,
        requestId,
        headers: createRateLimitHeaders(rateLimit),
      }
    );
  }
}
