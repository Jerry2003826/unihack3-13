import type {
  EvidenceItem,
  InspectionChecklist,
  KnowledgeMatch,
  NegotiateResponse,
  PeoplePaperworkChecks,
  PropertyIntelligence,
  ReportSnapshot,
  RoomType,
} from "./schemas";

const DAY_HOUR_PATTERN =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[\s\S]{0,32}\b\d{1,2}:\d{2}\s*(?:am|pm)\b/gi;

const NOISY_SEGMENT_PATTERNS = [
  /^user name$/i,
  /^select your rating/i,
  /^\d(?:\.\d)?\/5$/,
  /^\d+ stars?$/i,
  /^(location|hours|reviews)$/i,
  /^chapter overview$/i,
  /^tenants?$/i,
  /^owners?$/i,
  /^executives?$/i,
  /^property information overview$/i,
  /^renter[s]?$/i,
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateAtWordBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const trimmed = value.slice(0, maxLength + 1);
  const boundary = trimmed.lastIndexOf(" ");
  const nextValue = boundary > 60 ? trimmed.slice(0, boundary) : trimmed.slice(0, maxLength);
  return `${nextValue.trim().replace(/[.,;:!?-]+$/g, "")}...`;
}

function stripArtifacts(value: string) {
  return normalizeWhitespace(
    value
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/\[[^\]]*]/g, " ")
      .replace(/#{1,6}\s*/g, " ")
      .replace(/\bUser Name\b/gi, " ")
      .replace(/\bSelect your rating\b/gi, " ")
      .replace(/\bStart your review(?: of [^.]+)?\b/gi, " ")
      .replace(/\b\d(?:\.\d)?\/5\b/gi, " ")
      .replace(/\b[1-5]\s+stars?\b/gi, " ")
      .replace(/\b(?:chapter overview|tenants?|owners?|executives?|property information overview)\b/gi, " ")
      .replace(DAY_HOUR_PATTERN, " ")
      .replace(
        /\b(?:price|design and architecture|security and safety|construction quality|amenities and facilities|living environment|location)\s*\d+(?:\.\d+)?\b/gi,
        " "
      )
      .replace(/\s*\|\s*/g, " ")
      .replace(/[•·]+/g, ". ")
  );
}

function isUsefulSegment(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length < 8) {
    return false;
  }
  if (!/[a-zA-Z]{3}/.test(normalized)) {
    return false;
  }
  if (NOISY_SEGMENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  if (/^(?:\d+\s*)+$/.test(normalized)) {
    return false;
  }
  return true;
}

function splitIntoSegments(value: string) {
  return stripArtifacts(value)
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .flatMap((segment) => segment.split(/\s+-\s+(?=[A-Z])/))
    .map((segment) => normalizeWhitespace(segment))
    .filter(isUsefulSegment);
}

export function sanitizeDisplayText(
  value: string | undefined,
  options?: { maxLength?: number; maxSegments?: number; fallback?: string }
) {
  if (!value) {
    return options?.fallback ?? "";
  }

  const maxLength = options?.maxLength ?? 180;
  const maxSegments = options?.maxSegments ?? 2;
  const segments = splitIntoSegments(value);
  const uniqueSegments: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueSegments.push(segment);
    if (uniqueSegments.length >= maxSegments) {
      break;
    }
  }

  const joined = uniqueSegments.join(" ");
  if (joined) {
    return truncateAtWordBoundary(joined, maxLength);
  }

  const stripped = stripArtifacts(value);
  return stripped ? truncateAtWordBoundary(stripped, maxLength) : options?.fallback ?? "";
}

export function sanitizeDisplayList(
  values: string[] | undefined,
  options?: { maxItems?: number; itemMaxLength?: number; emptyFallback?: string; preserveSingleWord?: boolean }
) {
  const maxItems = options?.maxItems ?? 4;
  const itemMaxLength = options?.itemMaxLength ?? 110;
  const preserveSingleWord = options?.preserveSingleWord ?? false;
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values ?? []) {
    const cleaned = sanitizeDisplayText(value, { maxLength: itemMaxLength, maxSegments: 1 });
    if (!cleaned) {
      continue;
    }
    if (!preserveSingleWord && cleaned.split(/\s+/).length === 1 && cleaned.length < 5) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(cleaned);
    if (output.length >= maxItems) {
      break;
    }
  }

  if (output.length === 0 && options?.emptyFallback) {
    return [options.emptyFallback];
  }

  return output;
}

export function formatRoomTypeLabel(roomType?: RoomType) {
  if (!roomType || roomType === "unknown") {
    return "general area";
  }

  return roomType.replace(/-/g, " ");
}

function sanitizeEvidenceItem(item: EvidenceItem): EvidenceItem {
  return {
    ...item,
    summary: sanitizeDisplayText(item.summary, { maxLength: 150, maxSegments: 2, fallback: item.summary }),
    source:
      item.source === "unknown"
        ? "general scan"
        : sanitizeDisplayText(item.source, { maxLength: 48, maxSegments: 1, fallback: "general scan" }),
  };
}

function sanitizeKnowledgeMatch(match: KnowledgeMatch): KnowledgeMatch {
  return {
    ...match,
    title: sanitizeDisplayText(match.title, { maxLength: 72, maxSegments: 1, fallback: match.title }),
    snippet: sanitizeDisplayText(match.snippet, { maxLength: 180, maxSegments: 2, fallback: match.snippet }),
    tags: sanitizeDisplayList(match.tags, {
      maxItems: 4,
      itemMaxLength: 18,
      preserveSingleWord: true,
    }),
  };
}

function sanitizePaperworkChecks(checks: PeoplePaperworkChecks): PeoplePaperworkChecks {
  return {
    ...checks,
    checklist: sanitizeDisplayList(checks.checklist, { maxItems: 6, itemMaxLength: 110 }),
    riskFlags: sanitizeDisplayList(checks.riskFlags, { maxItems: 5, itemMaxLength: 120 }),
    requiredDocuments: sanitizeDisplayList(checks.requiredDocuments, {
      maxItems: 6,
      itemMaxLength: 90,
      preserveSingleWord: true,
    }),
    suggestedQuestions: sanitizeDisplayList(checks.suggestedQuestions, { maxItems: 5, itemMaxLength: 120 }),
  };
}

function sanitizeInspectionChecklist(checklist: InspectionChecklist | undefined): InspectionChecklist | undefined {
  if (!checklist) {
    return undefined;
  }

  const sanitizeSection = <T extends Record<string, unknown>>(section: T | undefined): T | undefined => {
    if (!section) {
      return undefined;
    }

    const next = Object.fromEntries(
      Object.entries(section).map(([key, value]) => {
        if (Array.isArray(value)) {
          return [key, sanitizeDisplayList(value.filter((item): item is string => typeof item === "string"), {
            maxItems: 8,
            itemMaxLength: 110,
            preserveSingleWord: true,
          })];
        }

        if (typeof value === "string") {
          return [key, sanitizeDisplayText(value, { maxLength: 140, maxSegments: 2, fallback: value })];
        }

        return [key, value];
      })
    ) as T;

    return next;
  };

  return {
    utilities: sanitizeSection(checklist.utilities),
    security: sanitizeSection(checklist.security),
    noise: sanitizeSection(checklist.noise),
    kitchenBathroom: sanitizeSection(checklist.kitchenBathroom),
    livability: sanitizeSection(checklist.livability),
    leaseCosts: sanitizeSection(checklist.leaseCosts),
    buildingManagement: sanitizeSection(checklist.buildingManagement),
    pestsHiddenIssues: sanitizeSection(checklist.pestsHiddenIssues),
    entryCondition: sanitizeSection(checklist.entryCondition),
  };
}

export function sanitizePropertyIntelligence(intelligence: PropertyIntelligence): PropertyIntelligence {
  return {
    ...intelligence,
    address: sanitizeDisplayText(intelligence.address, { maxLength: 120, maxSegments: 1, fallback: intelligence.address }),
    geoAnalysis: intelligence.geoAnalysis
      ? {
          ...intelligence.geoAnalysis,
          warning: intelligence.geoAnalysis.warning
            ? sanitizeDisplayText(intelligence.geoAnalysis.warning, { maxLength: 170, maxSegments: 2 })
            : undefined,
          keySignals: sanitizeDisplayList(intelligence.geoAnalysis.keySignals, {
            maxItems: 4,
            itemMaxLength: 90,
          }),
          nearbyTransit: sanitizeDisplayList(intelligence.geoAnalysis.nearbyTransit, { maxItems: 3, itemMaxLength: 90 }),
          destinationConvenience: sanitizeDisplayList(intelligence.geoAnalysis.destinationConvenience, {
            maxItems: 3,
            itemMaxLength: 90,
          }),
          nearbyEssentials: intelligence.geoAnalysis.nearbyEssentials?.map((place) => ({
            ...place,
            name: sanitizeDisplayText(place.name, { maxLength: 56, maxSegments: 1, fallback: place.name }),
            category: sanitizeDisplayText(place.category, { maxLength: 40, maxSegments: 1, fallback: place.category }),
            address: place.address
              ? sanitizeDisplayText(place.address, { maxLength: 110, maxSegments: 1, fallback: place.address })
              : undefined,
            openNowText: place.openNowText
              ? sanitizeDisplayText(place.openNowText, { maxLength: 64, maxSegments: 1, fallback: place.openNowText })
              : undefined,
            phoneNumber: place.phoneNumber
              ? sanitizeDisplayText(place.phoneNumber, { maxLength: 40, maxSegments: 1, fallback: place.phoneNumber })
              : undefined,
            editorialSummary: place.editorialSummary
              ? sanitizeDisplayText(place.editorialSummary, { maxLength: 160, maxSegments: 2, fallback: place.editorialSummary })
              : undefined,
            accessibilityHighlights: sanitizeDisplayList(place.accessibilityHighlights, {
              maxItems: 3,
              itemMaxLength: 80,
            }),
            parkingHighlights: sanitizeDisplayList(place.parkingHighlights, {
              maxItems: 3,
              itemMaxLength: 80,
            }),
          })),
        }
      : undefined,
    communityInsight: intelligence.communityInsight
      ? {
          ...intelligence.communityInsight,
          summary: sanitizeDisplayText(intelligence.communityInsight.summary, {
            maxLength: 220,
            maxSegments: 2,
            fallback: intelligence.communityInsight.summary,
          }),
          highlights: sanitizeDisplayList(intelligence.communityInsight.highlights, {
            maxItems: 4,
            itemMaxLength: 100,
          }),
        }
      : undefined,
    agencyBackground: intelligence.agencyBackground
      ? {
          ...intelligence.agencyBackground,
          agencyName: sanitizeDisplayText(intelligence.agencyBackground.agencyName, {
            maxLength: 60,
            maxSegments: 1,
            fallback: intelligence.agencyBackground.agencyName,
          }),
          summary: intelligence.agencyBackground.summary
            ? sanitizeDisplayText(intelligence.agencyBackground.summary, {
                maxLength: 180,
                maxSegments: 2,
                fallback: intelligence.agencyBackground.summary,
              })
            : undefined,
          highlights: sanitizeDisplayList(intelligence.agencyBackground.highlights, {
            maxItems: 4,
            itemMaxLength: 100,
          }),
          commonComplaints: sanitizeDisplayList(intelligence.agencyBackground.commonComplaints, {
            maxItems: 3,
            itemMaxLength: 80,
          }),
          negotiationLeverage: sanitizeDisplayText(intelligence.agencyBackground.negotiationLeverage, {
            maxLength: 170,
            maxSegments: 2,
            fallback: intelligence.agencyBackground.negotiationLeverage,
          }),
        }
      : undefined,
  };
}

export function sanitizeNegotiateResponse(response: NegotiateResponse): NegotiateResponse {
  return {
    ...response,
    emailTemplate: response.emailTemplate,
    keyPoints: sanitizeDisplayList(response.keyPoints, { maxItems: 6, itemMaxLength: 110 }),
    decisionRecommendation: {
      ...response.decisionRecommendation,
      summary: sanitizeDisplayText(response.decisionRecommendation.summary, {
        maxLength: 160,
        maxSegments: 2,
        fallback: response.decisionRecommendation.summary,
      }),
      reasons: sanitizeDisplayList(response.decisionRecommendation.reasons, {
        maxItems: 4,
        itemMaxLength: 130,
      }),
    },
    fitScore: {
      ...response.fitScore,
      summary: sanitizeDisplayText(response.fitScore.summary, {
        maxLength: 150,
        maxSegments: 2,
        fallback: response.fitScore.summary,
      }),
      drivers: sanitizeDisplayList(response.fitScore.drivers, {
        maxItems: 4,
        itemMaxLength: 70,
      }),
    },
    evidenceSummary: response.evidenceSummary.map(sanitizeEvidenceItem).slice(0, 8),
    inspectionCoverage: {
      ...response.inspectionCoverage,
      summary: response.inspectionCoverage.summary
        ? sanitizeDisplayText(response.inspectionCoverage.summary, {
            maxLength: 150,
            maxSegments: 2,
            fallback: response.inspectionCoverage.summary,
          })
        : undefined,
      roomsSeen: response.inspectionCoverage.roomsSeen,
      missingAreas: sanitizeDisplayList(response.inspectionCoverage.missingAreas, {
        maxItems: 5,
        itemMaxLength: 72,
      }),
      warning: response.inspectionCoverage.warning
        ? sanitizeDisplayText(response.inspectionCoverage.warning, { maxLength: 150, maxSegments: 2 })
        : undefined,
    },
    preLeaseActionGuide: {
      summary: response.preLeaseActionGuide.summary
        ? sanitizeDisplayText(response.preLeaseActionGuide.summary, {
            maxLength: 150,
            maxSegments: 2,
            fallback: response.preLeaseActionGuide.summary,
          })
        : undefined,
      negotiatePoints: sanitizeDisplayList(response.preLeaseActionGuide.negotiatePoints, {
        maxItems: 5,
        itemMaxLength: 120,
      }),
      furtherInspectionItems: sanitizeDisplayList(response.preLeaseActionGuide.furtherInspectionItems, {
        maxItems: 6,
        itemMaxLength: 100,
      }),
    },
  };
}

export function sanitizeReportSnapshot(snapshot: ReportSnapshot): ReportSnapshot {
  return {
    ...snapshot,
    inputs: {
      ...snapshot.inputs,
      address: sanitizeDisplayText(snapshot.inputs.address, {
        maxLength: 120,
        maxSegments: 1,
        fallback: snapshot.inputs.address,
      }),
      agency: sanitizeDisplayText(snapshot.inputs.agency, {
        maxLength: 64,
        maxSegments: 1,
        fallback: snapshot.inputs.agency,
      }),
      propertyNotes: snapshot.inputs.propertyNotes
        ? sanitizeDisplayText(snapshot.inputs.propertyNotes, {
            maxLength: 180,
            maxSegments: 2,
            fallback: snapshot.inputs.propertyNotes,
          })
        : undefined,
      inspectionChecklist: sanitizeInspectionChecklist(snapshot.inputs.inspectionChecklist),
    },
    intelligence: snapshot.intelligence ? sanitizePropertyIntelligence(snapshot.intelligence) : undefined,
    recommendation: snapshot.recommendation
      ? sanitizeNegotiateResponse({
          emailTemplate: "",
          keyPoints: [],
          decisionRecommendation: snapshot.recommendation,
          fitScore: snapshot.fitScore ?? {
            score: 0,
            summary: "",
            drivers: [],
          },
          evidenceSummary: snapshot.evidenceSummary ?? [],
          inspectionCoverage: snapshot.inspectionCoverage ?? {
            summary: "",
            roomsSeen: [],
            missingAreas: [],
            confidence: "low",
          },
          preLeaseActionGuide: snapshot.preLeaseActionGuide ?? {
            summary: "",
            negotiatePoints: [],
            furtherInspectionItems: [],
          },
        }).decisionRecommendation
      : undefined,
    fitScore: snapshot.fitScore
      ? sanitizeNegotiateResponse({
          emailTemplate: "",
          keyPoints: [],
          decisionRecommendation: snapshot.recommendation ?? {
            outcome: "Apply",
            summary: "",
            reasons: [],
          },
          fitScore: snapshot.fitScore,
          evidenceSummary: snapshot.evidenceSummary ?? [],
          inspectionCoverage: snapshot.inspectionCoverage ?? {
            summary: "",
            roomsSeen: [],
            missingAreas: [],
            confidence: "low",
          },
          preLeaseActionGuide: snapshot.preLeaseActionGuide ?? {
            summary: "",
            negotiatePoints: [],
            furtherInspectionItems: [],
          },
        }).fitScore
      : undefined,
    evidenceSummary: snapshot.evidenceSummary?.map(sanitizeEvidenceItem).slice(0, 8),
    inspectionCoverage: snapshot.inspectionCoverage
      ? {
          ...snapshot.inspectionCoverage,
          summary: snapshot.inspectionCoverage.summary
            ? sanitizeDisplayText(snapshot.inspectionCoverage.summary, {
                maxLength: 150,
                maxSegments: 2,
                fallback: snapshot.inspectionCoverage.summary,
              })
            : undefined,
          missingAreas: sanitizeDisplayList(snapshot.inspectionCoverage.missingAreas, {
            maxItems: 5,
            itemMaxLength: 72,
          }),
          warning: snapshot.inspectionCoverage.warning
            ? sanitizeDisplayText(snapshot.inspectionCoverage.warning, { maxLength: 150, maxSegments: 2 })
            : undefined,
        }
      : undefined,
    preLeaseActionGuide: snapshot.preLeaseActionGuide
      ? {
          summary: snapshot.preLeaseActionGuide.summary
            ? sanitizeDisplayText(snapshot.preLeaseActionGuide.summary, {
                maxLength: 150,
                maxSegments: 2,
                fallback: snapshot.preLeaseActionGuide.summary,
              })
            : undefined,
          negotiatePoints: sanitizeDisplayList(snapshot.preLeaseActionGuide.negotiatePoints, {
            maxItems: 5,
            itemMaxLength: 120,
          }),
          furtherInspectionItems: sanitizeDisplayList(snapshot.preLeaseActionGuide.furtherInspectionItems, {
            maxItems: 6,
            itemMaxLength: 100,
          }),
        }
      : undefined,
    knowledgeMatches: snapshot.knowledgeMatches?.map(sanitizeKnowledgeMatch).slice(0, 4),
    paperworkChecks: snapshot.paperworkChecks ? sanitizePaperworkChecks(snapshot.paperworkChecks) : undefined,
  };
}
