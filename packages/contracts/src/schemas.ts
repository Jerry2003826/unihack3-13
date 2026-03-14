import { z } from "zod";

export const hazardCategorySchema = z.enum(["Mould", "Structural", "Plumbing", "Pest", "Electrical", "Safety", "Other"]);
export type HazardCategory = z.infer<typeof hazardCategorySchema>;

export const severityLevelSchema = z.enum(["Critical", "High", "Medium", "Low"]);
export type SeverityLevel = z.infer<typeof severityLevelSchema>;

export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

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

export const liveScanPhaseSchema = z.enum(["overview", "focus"]);
export type LiveScanPhase = z.infer<typeof liveScanPhaseSchema>;

export const liveAttentionLevelSchema = z.enum(["ignore", "watch", "move-closer", "confirm"]);
export type LiveAttentionLevel = z.infer<typeof liveAttentionLevelSchema>;

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
  detectionMode: z.enum(["live-guided"]).optional(),
  confirmedAt: z.number().optional(),
  sceneMarkerId: z.string().optional(),
  source: z.enum(["live-guided", "manual", "3d-suggested"]).optional(),
});
export type Hazard = z.infer<typeof hazardSchema>;
export const hazardsArraySchema = z.array(hazardSchema);

export const liveObservationSchema = z.object({
  observationId: z.string(),
  category: hazardCategorySchema,
  severity: severityLevelSchema,
  description: z.string(),
  boundingBox: boundingBoxSchema,
  confidence: confidenceLevelSchema,
  attentionLevel: liveAttentionLevelSchema,
  guidanceText: z.string(),
});
export type LiveObservation = z.infer<typeof liveObservationSchema>;

export const liveTargetSchema = z.object({
  observationId: z.string().optional(),
  category: hazardCategorySchema.optional(),
  boundingBox: boundingBoxSchema.optional(),
  phase: liveScanPhaseSchema,
});
export type LiveTarget = z.infer<typeof liveTargetSchema>;

export const destinationPointSchema = z.object({
  label: z.string(),
  coordinates: geoPointSchema,
  priority: z.enum(["low", "medium", "high"]),
});
export type DestinationPoint = z.infer<typeof destinationPointSchema>;

export const communityInsightSchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).optional(),
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
  summary: z.string().optional(),
  roomsSeen: z.array(roomTypeSchema),
  missingAreas: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  warning: z.string().optional(),
});
export type InspectionCoverage = z.infer<typeof inspectionCoverageSchema>;

export const preLeaseActionGuideSchema = z.object({
  summary: z.string().optional(),
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

const checklistTextFieldSchema = z.string().optional();

export const inspectionChecklistSchema = z.object({
  utilities: z
    .object({
      hotWater: checklistTextFieldSchema,
      waterPressure: checklistTextFieldSchema,
      drainage: checklistTextFieldSchema,
      powerPoints: checklistTextFieldSchema,
      heatingCooling: checklistTextFieldSchema,
      mobileSignal: checklistTextFieldSchema,
      internetNbn: checklistTextFieldSchema,
      nbnLocation: checklistTextFieldSchema,
    })
    .optional(),
  security: z
    .object({
      doorLocks: checklistTextFieldSchema,
      intercom: checklistTextFieldSchema,
      smokeAlarm: checklistTextFieldSchema,
      nightEntryRoute: checklistTextFieldSchema,
      parcelRoom: checklistTextFieldSchema,
      entryAccess: checklistTextFieldSchema,
      keycardInventory: checklistTextFieldSchema,
    })
    .optional(),
  noise: z
    .object({
      weekdayMorning: checklistTextFieldSchema,
      lateNight: checklistTextFieldSchema,
      weekend: checklistTextFieldSchema,
      bedroomClosedWindows: checklistTextFieldSchema,
      balconyNoise: checklistTextFieldSchema,
    })
    .optional(),
  kitchenBathroom: z
    .object({
      toiletFlush: checklistTextFieldSchema,
      hotColdTaps: checklistTextFieldSchema,
      washerDryer: checklistTextFieldSchema,
      kitchenExhaust: checklistTextFieldSchema,
      bathroomVentilation: checklistTextFieldSchema,
      dampness: checklistTextFieldSchema,
    })
    .optional(),
  livability: z
    .object({
      wardrobeStorage: checklistTextFieldSchema,
      kitchenStorage: checklistTextFieldSchema,
      fridgePlacement: checklistTextFieldSchema,
      bulkyItemsStorage: checklistTextFieldSchema,
      bedDeskFit: checklistTextFieldSchema,
      workFromHomeFit: checklistTextFieldSchema,
      twoPersonFit: checklistTextFieldSchema,
    })
    .optional(),
  leaseCosts: z
    .object({
      furnitureMaintenance: checklistTextFieldSchema,
      utilityResponsibility: checklistTextFieldSchema,
      hiddenFees: checklistTextFieldSchema,
      petsPolicy: checklistTextFieldSchema,
      subletBreakLease: checklistTextFieldSchema,
      rentIncreaseHistory: checklistTextFieldSchema,
      bondHandling: checklistTextFieldSchema,
    })
    .optional(),
  buildingManagement: z
    .object({
      managerResponse: checklistTextFieldSchema,
      repairTurnaround: checklistTextFieldSchema,
      facilityBooking: checklistTextFieldSchema,
      visitorParking: checklistTextFieldSchema,
      bulkyWaste: checklistTextFieldSchema,
      mailboxParcelRoom: checklistTextFieldSchema,
    })
    .optional(),
  pestsHiddenIssues: z
    .object({
      pests: checklistTextFieldSchema,
      cabinetUnderSink: checklistTextFieldSchema,
      windowSeals: checklistTextFieldSchema,
      bathroomSealant: checklistTextFieldSchema,
      skirtingFloorEdges: checklistTextFieldSchema,
    })
    .optional(),
  entryCondition: z
    .object({
      conditionPhotosTaken: checklistTextFieldSchema,
      electricalSafetyCheck: checklistTextFieldSchema,
      gasSafetyCheck: checklistTextFieldSchema,
      inventoryItems: z.array(z.string()).optional(),
      renterDisagreements: z.array(z.string()).optional(),
    })
    .optional(),
});
export type InspectionChecklist = z.infer<typeof inspectionChecklistSchema>;

export const inspectionChecklistSectionSchema = z.enum([
  "utilities",
  "security",
  "noise",
  "kitchenBathroom",
  "livability",
  "leaseCosts",
  "buildingManagement",
  "pestsHiddenIssues",
  "entryCondition",
]);
export type InspectionChecklistSection = z.infer<typeof inspectionChecklistSectionSchema>;

export const liveChecklistTargetSchema = z.object({
  section: inspectionChecklistSectionSchema,
  field: z.string(),
  label: z.string(),
  instructions: z.string(),
  coverageFocus: z.string().optional(),
  listMode: z.boolean().optional(),
});
export type LiveChecklistTarget = z.infer<typeof liveChecklistTargetSchema>;

export const liveChecklistCaptureSchema = z.object({
  section: inspectionChecklistSectionSchema,
  field: z.string(),
  value: z.string(),
  confidence: confidenceLevelSchema,
  summary: z.string().optional(),
});
export type LiveChecklistCapture = z.infer<typeof liveChecklistCaptureSchema>;

export const liveCheckpointCoverageStatusSchema = z.enum(["not-visible", "partial", "covered"]);
export type LiveCheckpointCoverageStatus = z.infer<typeof liveCheckpointCoverageStatusSchema>;

export const liveCheckpointCoverageSchema = z.object({
  status: liveCheckpointCoverageStatusSchema,
  note: z.string().optional(),
});
export type LiveCheckpointCoverage = z.infer<typeof liveCheckpointCoverageSchema>;

export const nearbyPlaceSchema = z.object({
  placeId: z.string().optional(),
  name: z.string(),
  category: z.string(),
  address: z.string().optional(),
  distanceMeters: z.number().optional(),
  businessStatus: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  openNowText: z.string().optional(),
  phoneNumber: z.string().optional(),
  googleMapsUri: z.string().optional(),
  accessibilityHighlights: z.array(z.string()).optional(),
  parkingHighlights: z.array(z.string()).optional(),
  editorialSummary: z.string().optional(),
});
export type NearbyPlace = z.infer<typeof nearbyPlaceSchema>;

export const intelligenceSignalTopicSchema = z.enum(["geo", "community", "agency"]);
export type IntelligenceSignalTopic = z.infer<typeof intelligenceSignalTopicSchema>;

export const intelligenceChannelSignalSchema = z.object({
  topic: intelligenceSignalTopicSchema,
  title: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()).optional(),
  confidence: z.enum(["low", "medium", "high"]),
});
export type IntelligenceChannelSignal = z.infer<typeof intelligenceChannelSignalSchema>;

export const intelligenceFusionSchema = z.object({
  mapSignals: z.array(intelligenceChannelSignalSchema),
  webSignals: z.array(intelligenceChannelSignalSchema),
  conflicts: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});
export type IntelligenceFusion = z.infer<typeof intelligenceFusionSchema>;

export const geoAnalysisSchema = z.object({
  noiseRisk: noiseRiskSchema,
  transitScore: z.number(),
  warning: z.string().optional(),
  keySignals: z.array(z.string()).optional(),
  nearbyTransit: z.array(z.string()),
  destinationConvenience: z.array(z.string()),
  nearbyEssentials: z.array(nearbyPlaceSchema).optional(),
});
export type GeoAnalysis = z.infer<typeof geoAnalysisSchema>;

export const agencyBackgroundSchema = z.object({
  agencyName: z.string(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
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
  fusion: intelligenceFusionSchema.optional(),
});
export type PropertyIntelligence = z.infer<typeof propertyIntelligenceSchema>;

export const knowledgeMatchSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  snippet: z.string(),
  tags: z.array(z.string()),
});
export type KnowledgeMatch = z.infer<typeof knowledgeMatchSchema>;

export const roomSceneSurfaceIdSchema = z.enum([
  "back-wall",
  "left-wall",
  "right-wall",
  "floor",
  "ceiling",
]);
export type RoomSceneSurfaceId = z.infer<typeof roomSceneSurfaceIdSchema>;

export const roomSceneOpeningSchema = z.object({
  id: z.string(),
  type: z.enum(["door", "window", "balcony", "utility"]),
  surfaceId: roomSceneSurfaceIdSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  label: z.string().optional(),
});
export type RoomSceneOpening = z.infer<typeof roomSceneOpeningSchema>;

export const roomSceneFurnitureSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  depth: z.number().min(0).max(1),
});
export type RoomSceneFurniture = z.infer<typeof roomSceneFurnitureSchema>;

export const roomSceneMarkerSchema = z.object({
  markerId: z.string(),
  hazardId: z.string().optional(),
  label: z.string(),
  summary: z.string(),
  severity: severityLevelSchema.optional(),
  source: z.enum(["hazard", "suggested"]).optional(),
  surfaceId: roomSceneSurfaceIdSchema,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  confidence: confidenceLevelSchema.optional(),
  thumbnailBase64: z.string().optional(),
});
export type RoomSceneMarker = z.infer<typeof roomSceneMarkerSchema>;

export const roomScene3DSchema = z.object({
  sceneId: z.string(),
  roomType: roomTypeSchema,
  title: z.string(),
  capturedAt: z.number(),
  captureStepsCompleted: z.array(z.string()),
  dimensionsApprox: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive(),
  }),
  openings: z.array(roomSceneOpeningSchema).optional(),
  furniture: z.array(roomSceneFurnitureSchema).optional(),
  markers: z.array(roomSceneMarkerSchema),
  coverageSummary: z.string().optional(),
  previewRotation: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});
export type RoomScene3D = z.infer<typeof roomScene3DSchema>;

export const roomSceneCaptureSchema = z.object({
  stepId: z.string(),
  label: z.string(),
  capturedAt: z.number(),
  frameDataUrl: z.string(),
});
export type RoomSceneCapture = z.infer<typeof roomSceneCaptureSchema>;

export const reportSnapshotSchema = z.object({
  reportId: z.string(),
  inspectionId: z.string(),
  createdAt: z.number(),
  inputs: z.object({
    mode: inspectionModeSchema,
    address: z.string().optional(),
    agency: z.string().optional(),
    listingUrl: z.string().url().optional(),
    coordinates: geoPointSchema.optional(),
    propertyNotes: z.string().optional(),
    inspectionChecklist: inspectionChecklistSchema.optional(),
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
  roomScenes3d: z.array(roomScene3DSchema).optional(),
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

export const liveAnalyzeRequestSchema = z.object({
  inspectionId: z.string(),
  frameBase64: z.string(),
  roomType: roomTypeSchema,
  activeTarget: liveTargetSchema.optional(),
  recentConfirmedIds: z.array(z.string()).optional(),
  guidedCheckpoint: liveChecklistTargetSchema.optional(),
});
export type LiveAnalyzeRequest = z.infer<typeof liveAnalyzeRequestSchema>;

export const liveAnalyzeResponseSchema = z.object({
  observations: z.array(liveObservationSchema),
  primaryTarget: liveTargetSchema.optional(),
  alertText: z.string().optional(),
  confirmedHazard: hazardSchema.optional(),
  checkpointCapture: liveChecklistCaptureSchema.optional(),
  checkpointCoverage: liveCheckpointCoverageSchema.optional(),
});
export type LiveAnalyzeResponse = z.infer<typeof liveAnalyzeResponseSchema>;

export const reconstructRoom3DRequestSchema = z.object({
  inspectionId: z.string(),
  roomType: roomTypeSchema,
  captures: z.array(roomSceneCaptureSchema),
  existingHazards: z.array(hazardSchema),
  inspectionChecklist: inspectionChecklistSchema.optional(),
});
export type ReconstructRoom3DRequest = z.infer<typeof reconstructRoom3DRequestSchema>;

export const reconstructRoom3DResponseSchema = z.object({
  scene: roomScene3DSchema,
});
export type ReconstructRoom3DResponse = z.infer<typeof reconstructRoom3DResponseSchema>;

export const intelligenceRequestSchema = z.object({
  inspectionMode: inspectionModeSchema,
  depth: intelligenceDepthSchema,
  address: z.string().optional(),
  agency: z.string().optional(),
  listingUrl: z.string().url().optional(),
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
  inspectionChecklist: inspectionChecklistSchema.optional(),
  preferenceProfile: preferenceProfileSchema.optional(),
  listingUrl: z.string().url().optional(),
  paperworkChecks: peoplePaperworkChecksSchema.optional(),
  askingRent: z.number().positive().optional(),
  lightingScoreAuto: z.number().min(0).max(100).optional(),
  lightingScoreManual: z.number().min(0).max(100).optional(),
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

export const ttsAlertRequestSchema = z.object({
  inspectionId: z.string(),
  text: z.string().min(1).max(240),
  severity: severityLevelSchema,
  alertKey: z.string().min(1).max(200),
  locale: z.literal("en-AU").default("en-AU"),
});
export type TtsAlertRequest = z.infer<typeof ttsAlertRequestSchema>;

export const ttsAlertResponseSchema = z.object({
  provider: z.enum(["minimax", "fallback"]),
  audioBase64: z.string().optional(),
  mimeType: z.string().optional(),
  cacheHit: z.boolean(),
});
export type TtsAlertResponse = z.infer<typeof ttsAlertResponseSchema>;

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

export const checklistPrefillRequestSchema = z.object({
  address: z.string().optional(),
  agency: z.string().optional(),
  listingUrl: z.string().url().optional(),
  coordinates: geoPointSchema.optional(),
  propertyNotes: z.string().optional(),
});
export type ChecklistPrefillRequest = z.infer<typeof checklistPrefillRequestSchema>;

export const checklistPrefillResponseSchema = z.object({
  checklist: inspectionChecklistSchema,
  autoFilledFieldKeys: z.array(z.string()),
  manualReviewFieldKeys: z.array(z.string()),
  summary: z.string(),
  provider: z.enum(["gemini+google", "fallback"]),
});
export type ChecklistPrefillResponse = z.infer<typeof checklistPrefillResponseSchema>;

export const listingDiscoveryCandidateSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  reason: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});
export type ListingDiscoveryCandidate = z.infer<typeof listingDiscoveryCandidateSchema>;

export const listingDiscoverRequestSchema = z.object({
  address: z.string().min(6),
  agency: z.string().optional(),
});
export type ListingDiscoverRequest = z.infer<typeof listingDiscoverRequestSchema>;

export const listingDiscoverResponseSchema = z.object({
  selectedUrl: z.string().url().optional(),
  candidates: z.array(listingDiscoveryCandidateSchema),
  summary: z.string(),
  provider: z.enum(["gemini+google-search", "fallback"]),
});
export type ListingDiscoverResponse = z.infer<typeof listingDiscoverResponseSchema>;

export const listingExtractRequestSchema = z.object({
  listingUrl: z.string().url(),
});
export type ListingExtractRequest = z.infer<typeof listingExtractRequestSchema>;

export const listingExtractResponseSchema = z.object({
  listing: z.object({
    url: z.string().url(),
    title: z.string().optional(),
    summary: z.string().optional(),
    address: z.string().optional(),
    agencyName: z.string().optional(),
    rentText: z.string().optional(),
    propertyType: z.string().optional(),
    furnishing: z.string().optional(),
    bedrooms: z.number().int().optional(),
    bathrooms: z.number().int().optional(),
    parking: z.string().optional(),
    inspectionText: z.string().optional(),
    features: z.array(z.string()),
    inventoryHints: z.array(z.string()),
    checklistHints: inspectionChecklistSchema.optional(),
  }),
  provider: z.enum(["html+gemini", "fallback"]),
});
export type ListingExtractResponse = z.infer<typeof listingExtractResponseSchema>;

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
    listingUrl: z.string().url().optional(),
    coordinates: geoPointSchema.optional(),
    propertyNotes: z.string().optional(),
    inspectionChecklist: inspectionChecklistSchema.optional(),
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
