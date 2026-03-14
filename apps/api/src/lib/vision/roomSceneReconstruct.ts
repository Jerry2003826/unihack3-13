import { z } from "zod";
import type {
  Hazard,
  InspectionChecklist,
  ReconstructRoom3DRequest,
  RoomScene3D,
  RoomSceneCapture,
  RoomSceneFurniture,
  RoomSceneMarker,
  RoomSceneOpening,
  RoomType,
} from "@inspect-ai/contracts";
import {
  reconstructRoom3DRequestSchema,
  roomScene3DSchema,
} from "@inspect-ai/contracts";
import { callGeminiJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";

const roomSceneOpeningDraftSchema = z.object({
  type: z.enum(["door", "window", "balcony", "utility"]),
  surfaceId: z.enum(["back-wall", "left-wall", "right-wall", "floor", "ceiling"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  label: z.string().optional(),
});

const roomSceneFurnitureDraftSchema = z.object({
  kind: z.string(),
  label: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  depth: z.number().min(0).max(1),
});

const roomSceneMarkerDraftSchema = z.object({
  label: z.string(),
  summary: z.string(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  surfaceId: z.enum(["back-wall", "left-wall", "right-wall", "floor", "ceiling"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

const captureAnalysisSchema = z.object({
  summary: z.string(),
  visibleSurfaces: z
    .array(z.enum(["back-wall", "left-wall", "right-wall", "floor", "ceiling"]))
    .max(4),
  openings: z.array(roomSceneOpeningDraftSchema).max(4).optional(),
  furniture: z.array(roomSceneFurnitureDraftSchema).max(5).optional(),
  markerSuggestions: z.array(roomSceneMarkerDraftSchema).max(4).optional(),
  coverageNote: z.string().optional(),
});

const sceneSynthesisSchema = z.object({
  title: z.string(),
  dimensionsApprox: z.object({
    width: z.number().min(1.4).max(8),
    depth: z.number().min(1.4).max(8),
    height: z.number().min(2.1).max(3.6),
  }),
  openings: z.array(roomSceneOpeningDraftSchema).max(8).optional(),
  furniture: z.array(roomSceneFurnitureDraftSchema).max(10).optional(),
  markerSuggestions: z.array(roomSceneMarkerDraftSchema).max(8).optional(),
  coverageSummary: z.string().optional(),
});

const DEFAULT_DIMENSIONS: Record<RoomType, { width: number; depth: number; height: number }> = {
  bathroom: { width: 2.2, depth: 2.8, height: 2.5 },
  bedroom: { width: 3.6, depth: 4.2, height: 2.6 },
  kitchen: { width: 3.0, depth: 3.4, height: 2.6 },
  "living-room": { width: 5.2, depth: 4.8, height: 2.7 },
  laundry: { width: 2.1, depth: 2.5, height: 2.5 },
  balcony: { width: 2.0, depth: 3.2, height: 2.6 },
  hallway: { width: 1.6, depth: 4.4, height: 2.6 },
  unknown: { width: 3.5, depth: 3.8, height: 2.6 },
};

function normalizeFrame(frameDataUrl: string) {
  return frameDataUrl.replace(/^data:image\/[a-z+]+;base64,/, "");
}

function getChecklistContext(checklist?: InspectionChecklist) {
  if (!checklist) {
    return [];
  }

  const lines: string[] = [];
  for (const [section, value] of Object.entries(checklist)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    for (const [field, fieldValue] of Object.entries(value)) {
      if (!fieldValue) {
        continue;
      }

      if (Array.isArray(fieldValue)) {
        if (fieldValue.length > 0) {
          lines.push(`${section}.${field}: ${fieldValue.join(", ")}`);
        }
        continue;
      }

      lines.push(`${section}.${field}: ${fieldValue}`);
    }
  }

  return lines.slice(0, 16);
}

function defaultOpenings(roomType: RoomType): RoomSceneOpening[] {
  switch (roomType) {
    case "bathroom":
      return [
        { id: "door", type: "door", surfaceId: "back-wall", x: 0.08, y: 0.22, width: 0.18, height: 0.62, label: "Door" },
        { id: "vent", type: "utility", surfaceId: "right-wall", x: 0.68, y: 0.16, width: 0.18, height: 0.16, label: "Vent" },
      ];
    case "bedroom":
      return [
        { id: "door", type: "door", surfaceId: "back-wall", x: 0.08, y: 0.22, width: 0.18, height: 0.62, label: "Door" },
        { id: "window", type: "window", surfaceId: "right-wall", x: 0.42, y: 0.2, width: 0.34, height: 0.28, label: "Window" },
      ];
    case "living-room":
      return [
        { id: "balcony", type: "balcony", surfaceId: "back-wall", x: 0.58, y: 0.14, width: 0.24, height: 0.66, label: "Balcony" },
        { id: "entry", type: "door", surfaceId: "left-wall", x: 0.12, y: 0.2, width: 0.14, height: 0.58, label: "Entry" },
      ];
    case "hallway":
      return [{ id: "entry", type: "door", surfaceId: "back-wall", x: 0.34, y: 0.16, width: 0.22, height: 0.66, label: "Entry" }];
    default:
      return [{ id: "door", type: "door", surfaceId: "back-wall", x: 0.1, y: 0.2, width: 0.18, height: 0.62, label: "Door" }];
  }
}

function defaultFurniture(roomType: RoomType): RoomSceneFurniture[] {
  switch (roomType) {
    case "bedroom":
      return [
        { id: "bed", kind: "bed", label: "Bed zone", x: 0.16, y: 0.46, width: 0.34, depth: 0.26 },
        { id: "desk", kind: "desk", label: "Desk", x: 0.64, y: 0.54, width: 0.18, depth: 0.12 },
      ];
    case "living-room":
      return [
        { id: "sofa", kind: "sofa", label: "Sofa", x: 0.18, y: 0.58, width: 0.28, depth: 0.14 },
        { id: "table", kind: "table", label: "Table", x: 0.56, y: 0.52, width: 0.16, depth: 0.12 },
      ];
    case "kitchen":
      return [{ id: "counter", kind: "counter", label: "Kitchen run", x: 0.08, y: 0.24, width: 0.26, depth: 0.54 }];
    case "bathroom":
      return [{ id: "vanity", kind: "vanity", label: "Vanity", x: 0.12, y: 0.28, width: 0.18, depth: 0.18 }];
    default:
      return [];
  }
}

function mapHazardToMarker(hazard: Hazard): RoomSceneMarker {
  const centerX = hazard.boundingBox ? (hazard.boundingBox.x_min + hazard.boundingBox.x_max) / 2 : 0.5;
  const centerY = hazard.boundingBox ? (hazard.boundingBox.y_min + hazard.boundingBox.y_max) / 2 : 0.5;

  let surfaceId: RoomSceneMarker["surfaceId"] = "back-wall";
  let x = centerX;
  let y = centerY;

  if (centerY < 0.18) {
    surfaceId = "ceiling";
    x = centerX;
    y = centerX;
  } else if (centerY > 0.78) {
    surfaceId = "floor";
    x = centerX;
    y = 1 - centerY;
  } else if (centerX < 0.28) {
    surfaceId = "left-wall";
    x = 1 - centerY;
    y = centerY;
  } else if (centerX > 0.72) {
    surfaceId = "right-wall";
    x = centerY;
    y = centerY;
  }

  return {
    markerId: hazard.id,
    hazardId: hazard.id,
    label: hazard.category,
    summary: hazard.description,
    severity: hazard.severity,
    source: "hazard",
    surfaceId,
    x: Math.max(0.08, Math.min(0.92, x)),
    y: Math.max(0.08, Math.min(0.92, y)),
    confidence: "medium",
  };
}

function mergeUniqueOpenings(roomType: RoomType, drafts: z.infer<typeof roomSceneOpeningDraftSchema>[] = []): RoomSceneOpening[] {
  const seen = new Set<string>();
  const source = [...defaultOpenings(roomType), ...drafts.map((item, index) => ({ id: `opening-${index + 1}`, ...item }))];

  return source.filter((item) => {
    const key = `${item.type}-${item.surfaceId}-${Math.round(item.x * 10)}-${Math.round(item.y * 10)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function mergeUniqueFurniture(roomType: RoomType, drafts: z.infer<typeof roomSceneFurnitureDraftSchema>[] = []): RoomSceneFurniture[] {
  const seen = new Set<string>();
  const source = [...defaultFurniture(roomType), ...drafts.map((item, index) => ({ id: `furniture-${index + 1}`, ...item }))];

  return source.filter((item) => {
    const key = `${item.kind}-${Math.round(item.x * 10)}-${Math.round(item.y * 10)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function isDuplicateSuggestedMarker(marker: z.infer<typeof roomSceneMarkerDraftSchema>, hazards: Hazard[]) {
  return hazards.some((hazard) => {
    const categoryHit = marker.label.toLowerCase().includes(hazard.category.toLowerCase());
    const descriptionHit = marker.summary.toLowerCase().includes(hazard.description.toLowerCase().slice(0, 20));
    return marker.surfaceId === mapHazardToMarker(hazard).surfaceId && (categoryHit || descriptionHit);
  });
}

function buildFallbackScene(request: ReconstructRoom3DRequest, warning?: string): RoomScene3D {
  const roomHazards = request.existingHazards.filter((hazard) => hazard.roomType === request.roomType);
  const markers = (roomHazards.length > 0 ? roomHazards : request.existingHazards.filter((hazard) => hazard.roomType === "unknown"))
    .map(mapHazardToMarker);

  return roomScene3DSchema.parse({
    sceneId: crypto.randomUUID(),
    roomType: request.roomType,
    title: `${request.roomType.replace("-", " ")} 3D view`,
    capturedAt: Date.now(),
    captureStepsCompleted: request.captures.map((capture) => capture.stepId),
    dimensionsApprox: DEFAULT_DIMENSIONS[request.roomType] ?? DEFAULT_DIMENSIONS.unknown,
    openings: defaultOpenings(request.roomType),
    furniture: defaultFurniture(request.roomType),
    markers,
    coverageSummary:
      warning ??
      `${request.captures.length} guided captures were turned into an approximate room scene.`,
    previewRotation: {
      x: 18,
      y: -28,
    },
  });
}

async function analyzeCapture(args: {
  capture: RoomSceneCapture;
  roomType: RoomType;
  checklistContext: string[];
}) {
  const frameBase64 = normalizeFrame(args.capture.frameDataUrl);
  if (!frameBase64) {
    throw new Error("Capture frame is empty.");
  }

  return await callGeminiJson({
    model: appEnv.geminiSceneExtractModel,
    schema: captureAnalysisSchema,
    timeoutMs: 8_000,
    prompt: [
      "You are extracting room-structure signals from one rental inspection capture.",
      "Return only visible, renter-relevant structure and issue cues.",
      "Do not invent hidden geometry or hidden defects.",
      `Room type: ${args.roomType}.`,
      `Capture step: ${args.capture.label} (${args.capture.stepId}).`,
      "visibleSurfaces must only include walls/floor/ceiling clearly shown in this single image.",
      "openings should only include obvious doors, windows, balcony openings, or vents.",
      "furniture should only include large obvious items that matter for layout.",
      "markerSuggestions should only include clearly visible issue locations, not guesses.",
      "Each summary and coverageNote must stay under 120 characters.",
      args.checklistContext.length > 0
        ? `Existing inspection context:\n${args.checklistContext.join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    parts: [
      {
        inlineData: {
          data: frameBase64,
          mimeType: "image/jpeg",
        },
      },
    ],
  });
}

export async function reconstructRoomScene(requestInput: unknown): Promise<RoomScene3D> {
  const request = reconstructRoom3DRequestSchema.parse(requestInput);

  if (request.captures.length < 3) {
    return buildFallbackScene(request, "Coverage limited: capture more room angles for a stronger 3D scene.");
  }

  const checklistContext = getChecklistContext(request.inspectionChecklist);

  if (!appEnv.geminiApiKey) {
    return buildFallbackScene(request, "Gemini is unavailable, so a simplified room scene was generated locally.");
  }

  try {
    const analysisResults = await Promise.allSettled(
      request.captures.slice(0, 8).map((capture) =>
        analyzeCapture({
          capture,
          roomType: request.roomType,
          checklistContext,
        })
      )
    );

    const analyses = analysisResults.flatMap((result, index) =>
      result.status === "fulfilled"
        ? [
            {
              captureStepId: request.captures[index]?.stepId ?? `capture-${index + 1}`,
              analysis: result.value,
            },
          ]
        : []
    );

    if (analyses.length < 3) {
      return buildFallbackScene(request, "Coverage limited: not enough captures could be interpreted reliably.");
    }

    const synthesis = await callGeminiJson({
      model: appEnv.geminiSceneSynthesisModel,
      schema: sceneSynthesisSchema,
      timeoutMs: 14_000,
      prompt: [
        "You are synthesizing an approximate single-room 3D scene for a renter inspection report.",
        "Use the capture analyses below to build a plausible room box, visible openings, major furniture blocks, and issue hotspot suggestions.",
        "This is an approximate room model, not a real mesh.",
        "Never invent precise measurements or unseen openings.",
        "If uncertain, simplify and lower confidence instead of adding detail.",
        "Keep coverageSummary under 140 characters.",
        `Room type: ${request.roomType}.`,
        `Existing confirmed hazards: ${request.existingHazards
          .map((hazard) => `${hazard.category} ${hazard.severity}: ${hazard.description}`)
          .join(" | ") || "none"}`,
        checklistContext.length > 0 ? `Inspection checklist context:\n${checklistContext.join("\n")}` : "",
        `Capture analyses:\n${JSON.stringify(
          analyses.map((item) => ({
            capture: item.captureStepId,
            ...item.analysis,
          })),
          null,
          2
        )}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const roomHazards = request.existingHazards.filter((hazard) => hazard.roomType === request.roomType);
    const fallbackHazards = roomHazards.length > 0 ? roomHazards : request.existingHazards.filter((hazard) => hazard.roomType === "unknown");
    const confirmedMarkers = fallbackHazards.map(mapHazardToMarker);
    const suggestedMarkers = (synthesis.markerSuggestions ?? [])
      .filter((marker) => !isDuplicateSuggestedMarker(marker, fallbackHazards))
      .map((marker, index) => ({
        markerId: `suggested-${index + 1}`,
        label: marker.label,
        summary: marker.summary,
        severity: marker.severity,
        source: "suggested" as const,
        surfaceId: marker.surfaceId,
        x: marker.x,
        y: marker.y,
        confidence: marker.confidence ?? "low",
      }));

    return roomScene3DSchema.parse({
      sceneId: crypto.randomUUID(),
      roomType: request.roomType,
      title: synthesis.title || `${request.roomType.replace("-", " ")} 3D view`,
      capturedAt: Date.now(),
      captureStepsCompleted: request.captures.map((capture) => capture.stepId),
      dimensionsApprox: synthesis.dimensionsApprox,
      openings: mergeUniqueOpenings(
        request.roomType,
        analyses.flatMap((item) => item.analysis.openings ?? []).concat(synthesis.openings ?? [])
      ),
      furniture: mergeUniqueFurniture(
        request.roomType,
        analyses.flatMap((item) => item.analysis.furniture ?? []).concat(synthesis.furniture ?? [])
      ),
      markers: [...confirmedMarkers, ...suggestedMarkers],
      coverageSummary:
        synthesis.coverageSummary ??
        `${request.captures.length} captures were fused into an approximate ${request.roomType.replace("-", " ")} scene.`,
      previewRotation: {
        x: 18,
        y: -28,
      },
    });
  } catch {
    return buildFallbackScene(request, "3D synthesis fell back to a simplified room scene.");
  }
}
