import { z } from "zod";

export const hazardCategorySchema = z.enum(["Mould", "Structural", "Plumbing", "Pest", "Electrical", "Safety", "Other"]);
export type HazardCategory = z.infer<typeof hazardCategorySchema>;

export const severityLevelSchema = z.enum(["Critical", "High", "Medium", "Low"]);
export type SeverityLevel = z.infer<typeof severityLevelSchema>;

export const noiseRiskSchema = z.enum(["Low", "Medium", "High"]);
export type NoiseRisk = z.infer<typeof noiseRiskSchema>;

export const noiseToleranceSchema = z.enum(["low", "medium", "high"]);
export type NoiseTolerance = z.infer<typeof noiseToleranceSchema>;

export const commutePrioritySchema = z.enum(["low", "medium", "high"]);
export type CommutePriority = z.infer<typeof commutePrioritySchema>;

export const asyncStatusSchema = z.enum(["idle", "loading", "success", "fallback", "error"]);
export type AsyncStatus = z.infer<typeof asyncStatusSchema>;

export const roomTypeSchema = z.enum(["bathroom", "bedroom", "kitchen", "living-room", "laundry", "balcony", "hallway", "unknown"]);
export type RoomType = z.infer<typeof roomTypeSchema>;

export const inspectionModeSchema = z.enum(["live", "manual"]);
export type InspectionMode = z.infer<typeof inspectionModeSchema>;

export const intelligenceDepthSchema = z.enum(["fast", "full"]);
export type IntelligenceDepth = z.infer<typeof intelligenceDepthSchema>;

export const geoPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

export const manualInspectionContextSchema = z.object({
  coordinates: geoPointSchema.optional(),
  propertyNotes: z.string().optional(),
  uploadedImageCount: z.number(),
});
export type ManualInspectionContext = z.infer<typeof manualInspectionContextSchema>;

export const factorWeightsSchema = z.object({
  budgetWeight: z.number().min(0).max(100),
  commuteWeight: z.number().min(0).max(100),
  noiseWeight: z.number().min(0).max(100),
  lightingWeight: z.number().min(0).max(100),
  conditionWeight: z.number().min(0).max(100),
  agencyWeight: z.number().min(0).max(100),
  communityWeight: z.number().min(0).max(100),
});
export type FactorWeights = z.infer<typeof factorWeightsSchema>;

export const preferenceProfileSchema = z.object({
  budget: z.number().optional(),
  noiseTolerance: noiseToleranceSchema.optional(),
  commutePriority: commutePrioritySchema.optional(),
  mustHaves: z.array(z.string()).optional(),
  factorWeights: factorWeightsSchema.optional(),
});
export type PreferenceProfile = z.infer<typeof preferenceProfileSchema>;

export const scanPhaseSchema = z.enum(["idle", "starting", "scanning", "stopped", "error"]);
export type ScanPhase = z.infer<typeof scanPhaseSchema>;

export const boundingBoxSchema = z.object({
  x_min: z.number().min(0).max(1),
  y_min: z.number().min(0).max(1),
  x_max: z.number().min(0).max(1),
  y_max: z.number().min(0).max(1),
});
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const citationSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  url: z.string(),
});
export type Citation = z.infer<typeof citationSchema>;

export const hazardDraftSchema = z.object({
  category: hazardCategorySchema,
  severity: severityLevelSchema,
  description: z.string(),
  estimatedCost: z.object({
    amount: z.number(),
    currency: z.string(),
    reason: z.string(),
  }).optional(),
  boundingBox: boundingBoxSchema.optional(),
});
export type HazardDraft = z.infer<typeof hazardDraftSchema>;
export const hazardDraftsArraySchema = z.array(hazardDraftSchema);

export const hazardSchema = hazardDraftSchema.extend({
  id: z.string(),
  detectedAt: z.number(),
  sourceEventId: z.string().optional(),
  roomType: roomTypeSchema.optional(),
});
export type Hazard = z.infer<typeof hazardSchema>;
export const hazardsArraySchema = z.array(hazardSchema);

export const destinationPointSchema = z.object({
  label: z.string(),
  coordinates: geoPointSchema,
  priority: z.enum(["low", "medium", "high"]),
});
export type DestinationPoint = z.infer<typeof destinationPointSchema>;

export const communityInsightSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(["positive", "neutral", "mixed", "negative", "unknown"]),
  citations: z.array(citationSchema),
});
export type CommunityInsight = z.infer<typeof communityInsightSchema>;

export const decisionRecommendationSchema = z.object({
  outcome: z.enum(["Apply", "Negotiate", "Inspect Further", "Walk Away"]),
  summary: z.string(),
  reasons: z.array(z.string()),
});
export type DecisionRecommendation = z.infer<typeof decisionRecommendationSchema>;

export const fitScoreSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  drivers: z.array(z.string()),
});
export type FitScore = z.infer<typeof fitScoreSchema>;

export const evidenceItemSchema = z.object({
  type: z.enum(["hazard", "community", "geo", "agency"]),
  summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  source: z.string(),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const inspectionCoverageSchema = z.object({
  roomsSeen: z.array(roomTypeSchema),
  missingAreas: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  warning: z.string().optional(),
});
export type InspectionCoverage = z.infer<typeof inspectionCoverageSchema>;

export const preLeaseActionGuideSchema = z.object({
  negotiatePoints: z.array(z.string()),
  furtherInspectionItems: z.array(z.string()),
});
export type PreLeaseActionGuide = z.infer<typeof preLeaseActionGuideSchema>;

export const peoplePaperworkChecksSchema = z.object({
  checklist: z.array(z.string()),
  riskFlags: z.array(z.string()),
  requiredDocuments: z.array(z.string()),
  suggestedQuestions: z.array(z.string()),
});
export type PeoplePaperworkChecks = z.infer<typeof peoplePaperworkChecksSchema>;

export const geoAnalysisSchema = z.object({
  noiseRisk: noiseRiskSchema,
  transitScore: z.number(),
  warning: z.string().optional(),
  nearbyTransit: z.array(z.string()),
  destinationConvenience: z.array(z.string()),
});
export type GeoAnalysis = z.infer<typeof geoAnalysisSchema>;

export const agencyBackgroundSchema = z.object({
  agencyName: z.string(),
  sentimentScore: z.number(),
  commonComplaints: z.array(z.string()),
  negotiationLeverage: z.string(),
  citations: z.array(citationSchema),
});
export type AgencyBackground = z.infer<typeof agencyBackgroundSchema>;

export const propertyIntelligenceSchema = z.object({
  address: z.string().optional(),
  geoAnalysis: geoAnalysisSchema.optional(),
  communityInsight: communityInsightSchema.optional(),
  agencyBackground: agencyBackgroundSchema.optional(),
});
export type PropertyIntelligence = z.infer<typeof propertyIntelligenceSchema>;

export const knowledgeMatchSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  snippet: z.string(),
  tags: z.array(z.string()),
});
export type KnowledgeMatch = z.infer<typeof knowledgeMatchSchema>;

export const reportSnapshotSchema = z.object({
  reportId: z.string(),
  inspectionId: z.string(),
  createdAt: z.number(),
  inputs: z.object({
    mode: inspectionModeSchema,
    address: z.string().optional(),
    agency: z.string().optional(),
    coordinates: geoPointSchema.optional(),
    propertyNotes: z.string().optional(),
    targetDestinations: z.array(destinationPointSchema).optional(),
    preferenceProfile: preferenceProfileSchema.optional(),
  }),
  hazards: z.array(hazardSchema),
  intelligence: propertyIntelligenceSchema.optional(),
  propertyRiskScore: z.number(),
  lightingScoreAuto: z.number().min(0).max(100).optional(),
  lightingScoreManual: z.number().min(0).max(100).optional(),
  askingRent: z.number().positive().optional(),
  comparisonEligible: z.boolean().optional(),
  recommendation: decisionRecommendationSchema.optional(),
  fitScore: fitScoreSchema.optional(),
  inspectionCoverage: inspectionCoverageSchema.optional(),
  evidenceSummary: z.array(evidenceItemSchema).optional(),
  preLeaseActionGuide: preLeaseActionGuideSchema.optional(),
  knowledgeMatches: z.array(knowledgeMatchSchema).optional(),
  paperworkChecks: peoplePaperworkChecksSchema.optional(),
  exportAssets: z.object({
    staticMapImageBase64: z.string().optional(),
    hazardThumbnails: z.array(
      z.object({
        hazardId: z.string(),
        base64: z.string().optional(),
        derivedThumbnailObjectKey: z.string().optional(),
      })
    ).optional(),
  }).optional(),
});
export type ReportSnapshot = z.infer<typeof reportSnapshotSchema>;

export const analyzeRequestSchema = z.object({
  inspectionId: z.string().optional(),
  source: inspectionModeSchema,
  images: z.array(z.string()).optional(),
  objectKeys: z.array(z.string()).optional(),
  roomType: roomTypeSchema,
  context: manualInspectionContextSchema.optional(),
});
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export const analyzeResponseSchema = z.object({
  hazards: z.array(hazardSchema),
  lightingScoreAuto: z.number().min(0).max(100).optional(),
  exportAssets: reportSnapshotSchema.shape.exportAssets.optional(),
});
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

export const intelligenceRequestSchema = z.object({
  inspectionMode: inspectionModeSchema,
  depth: intelligenceDepthSchema,
  address: z.string().optional(),
  agency: z.string().optional(),
  coordinates: geoPointSchema.optional(),
  propertyNotes: z.string().optional(),
  preferenceProfile: preferenceProfileSchema.optional(),
  targetDestinations: z.array(destinationPointSchema).optional(),
});
export type IntelligenceRequest = z.infer<typeof intelligenceRequestSchema>;

export const intelligenceResponseSchema = z.object({
  intelligence: propertyIntelligenceSchema,
});
export type IntelligenceResponse = z.infer<typeof intelligenceResponseSchema>;

export const negotiateRequestSchema = z.object({
  inspectionMode: inspectionModeSchema,
  hazards: z.array(hazardSchema),
  intelligence: propertyIntelligenceSchema.optional(),
  preferenceProfile: preferenceProfileSchema.optional(),
});
export type NegotiateRequest = z.infer<typeof negotiateRequestSchema>;

export const negotiateResponseSchema = z.object({
  emailTemplate: z.string(),
  keyPoints: z.array(z.string()),
  decisionRecommendation: decisionRecommendationSchema,
  fitScore: fitScoreSchema,
  evidenceSummary: z.array(evidenceItemSchema),
  inspectionCoverage: inspectionCoverageSchema,
  preLeaseActionGuide: preLeaseActionGuideSchema,
});
export type NegotiateResponse = z.infer<typeof negotiateResponseSchema>;

export const signedUploadItemSchema = z.object({
  uploadUrl: z.string(),
  objectKey: z.string(),
});
export type SignedUploadItem = z.infer<typeof signedUploadItemSchema>;

export const signedUploadRequestSchema = z.object({
  inspectionId: z.string(),
  files: z.array(
    z.object({
      fileName: z.string(),
      contentType: z.string(),
    })
  ),
});
export type SignedUploadRequest = z.infer<typeof signedUploadRequestSchema>;

export const signedUploadResponseSchema = z.object({
  uploads: z.array(signedUploadItemSchema),
});
export type SignedUploadResponse = z.infer<typeof signedUploadResponseSchema>;

export const signedAssetGetRequestSchema = z.object({
  objectKeys: z.array(z.string()).min(1).max(16),
});
export type SignedAssetGetRequest = z.infer<typeof signedAssetGetRequestSchema>;

export const signedAssetGetItemSchema = z.object({
  objectKey: z.string(),
  downloadUrl: z.string(),
});
export type SignedAssetGetItem = z.infer<typeof signedAssetGetItemSchema>;

export const signedAssetGetResponseSchema = z.object({
  downloads: z.array(signedAssetGetItemSchema),
});
export type SignedAssetGetResponse = z.infer<typeof signedAssetGetResponseSchema>;

export const staticMapRequestSchema = z.object({
  address: z.string().optional(),
  coordinates: geoPointSchema.optional(),
  width: z.number().int().min(200).max(640).optional(),
  height: z.number().int().min(160).max(640).optional(),
  zoom: z.number().int().min(1).max(20).optional(),
});
export type StaticMapRequest = z.infer<typeof staticMapRequestSchema>;

export const staticMapResponseSchema = z.object({
  staticMapImageBase64: z.string(),
  provider: z.enum(["google-static-maps", "fallback"]),
});
export type StaticMapResponse = z.infer<typeof staticMapResponseSchema>;

export const reverseGeocodeRequestSchema = z.object({
  coordinates: geoPointSchema,
});
export type ReverseGeocodeRequest = z.infer<typeof reverseGeocodeRequestSchema>;

export const reverseGeocodeResponseSchema = z.object({
  formattedAddress: z.string(),
  components: z
    .object({
      locality: z.string().optional(),
      postalCode: z.string().optional(),
      administrativeAreaLevel1: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  provider: z.enum(["google-geocoding", "fallback"]),
});
export type ReverseGeocodeResponse = z.infer<typeof reverseGeocodeResponseSchema>;

export const knowledgeQueryRequestSchema = z.object({
  query: z.string().min(2),
  tags: z.array(z.string()).optional(),
  topK: z.number().int().min(1).max(8).optional(),
});
export type KnowledgeQueryRequest = z.infer<typeof knowledgeQueryRequestSchema>;

export const knowledgeQueryResponseSchema = z.object({
  matches: z.array(knowledgeMatchSchema),
});
export type KnowledgeQueryResponse = z.infer<typeof knowledgeQueryResponseSchema>;

export const comparisonCandidateOverrideSchema = z.object({
  lightingScoreManual: z.number().min(0).max(100).optional(),
  askingRent: z.number().positive().optional(),
  notes: z.string().optional(),
});
export type ComparisonCandidateOverride = z.infer<typeof comparisonCandidateOverrideSchema>;

export const comparisonCandidateSchema = z.object({
  candidateId: z.string(),
  reportId: z.string(),
  address: z.string().optional(),
  reportSnapshot: reportSnapshotSchema,
  userOverrides: comparisonCandidateOverrideSchema.optional(),
});
export type ComparisonCandidate = z.infer<typeof comparisonCandidateSchema>;

export const comparisonBreakdownSchema = z.object({
  budget: z.number().min(0).max(100).nullable(),
  commute: z.number().min(0).max(100).nullable(),
  noise: z.number().min(0).max(100).nullable(),
  lighting: z.number().min(0).max(100).nullable(),
  condition: z.number().min(0).max(100).nullable(),
  agency: z.number().min(0).max(100).nullable(),
  community: z.number().min(0).max(100).nullable(),
});
export type ComparisonBreakdown = z.infer<typeof comparisonBreakdownSchema>;

export const comparisonRankedCandidateSchema = z.object({
  candidateId: z.string(),
  reportId: z.string(),
  address: z.string(),
  totalScore: z.number().min(0).max(100),
  fitLabel: z.enum(["Strong Match", "Good Match", "Conditional Match", "Weak Match"]),
  lightingScoreUsed: z.number().min(0).max(100),
  askingRent: z.number().positive().optional(),
  breakdown: comparisonBreakdownSchema,
  strengths: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  cautions: z.array(z.string()),
  notes: z.string().optional(),
});
export type ComparisonRankedCandidate = z.infer<typeof comparisonRankedCandidateSchema>;

export const comparisonTopRecommendationSchema = z.object({
  candidateId: z.string(),
  reportId: z.string(),
  address: z.string(),
  summary: z.string(),
});
export type ComparisonTopRecommendation = z.infer<typeof comparisonTopRecommendationSchema>;

export const comparisonReportSnapshotSchema = z.object({
  comparisonId: z.string(),
  createdAt: z.number(),
  weights: factorWeightsSchema,
  preferenceProfile: preferenceProfileSchema.optional(),
  rankedCandidates: z.array(comparisonRankedCandidateSchema),
  topRecommendation: comparisonTopRecommendationSchema,
  tradeoffSummary: z.array(z.string()),
  whyThisWins: z.array(z.string()),
  whyOthersLost: z.array(z.string()),
  knowledgeMatches: z.array(knowledgeMatchSchema),
  paperworkChecks: peoplePaperworkChecksSchema,
});
export type ComparisonReportSnapshot = z.infer<typeof comparisonReportSnapshotSchema>;

export const comparisonRequestSchema = z.object({
  candidates: z.array(comparisonCandidateSchema).min(2).max(5),
  weights: factorWeightsSchema,
  preferenceProfile: preferenceProfileSchema.optional(),
});
export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;

export const comparisonResponseSchema = z.object({
  report: comparisonReportSnapshotSchema,
});
export type ComparisonResponse = z.infer<typeof comparisonResponseSchema>;

export const searchHistoryEntrySchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  type: z.enum(["live", "manual", "compare"]),
  label: z.string(),
  payload: z.object({
    address: z.string().optional(),
    agency: z.string().optional(),
    coordinates: geoPointSchema.optional(),
    propertyNotes: z.string().optional(),
    targetDestinations: z.array(destinationPointSchema).optional(),
    preferenceProfile: preferenceProfileSchema.optional(),
    comparisonId: z.string().optional(),
    selectedReportIds: z.array(z.string()).optional(),
  }),
});
export type SearchHistoryEntry = z.infer<typeof searchHistoryEntrySchema>;

export const comparisonHistoryEntrySchema = z.object({
  comparisonId: z.string(),
  createdAt: z.number(),
  report: comparisonReportSnapshotSchema,
});
export type ComparisonHistoryEntry = z.infer<typeof comparisonHistoryEntrySchema>;

export const mockHazardTimelineEventSchema = z.object({
  eventId: z.string(),
  atMs: z.number(),
  hazard: hazardDraftSchema,
});
export type MockHazardTimelineEvent = z.infer<typeof mockHazardTimelineEventSchema>;

export const mockHazardTimelineSchema = z.array(mockHazardTimelineEventSchema);
export type MockHazardTimeline = z.infer<typeof mockHazardTimelineSchema>;

// Utility to sanitize JSON schema for Gemini structured output
export function toGeminiResponseSchema(zodJsonSchema: any): any {
  if (!zodJsonSchema || typeof zodJsonSchema !== "object") {
    return zodJsonSchema;
  }

  const {
    $schema,
    additionalProperties,
    default: _default,
    minLength,
    maxLength,
    pattern,
    $ref,
    $defs,
    ...rest
  } = zodJsonSchema;

  const sanitized: any = {};
  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) {
      sanitized[key] = value.map(toGeminiResponseSchema);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = toGeminiResponseSchema(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
