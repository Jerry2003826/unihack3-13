import { z } from "zod";
import type { BoundingBox, LiveAnalyzeRequest, LiveAnalyzeResponse, LiveObservation, SeverityLevel } from "@inspect-ai/contracts";
import {
  liveAnalyzeResponseSchema,
  liveObservationSchema,
  liveTargetSchema,
} from "@inspect-ai/contracts";
import { callGeminiJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";

const liveFrameSchema = z.object({
  observations: z
    .array(
      z.object({
        category: liveObservationSchema.shape.category,
        severity: liveObservationSchema.shape.severity,
        description: z.string(),
        boundingBox: liveObservationSchema.shape.boundingBox,
        confidence: liveObservationSchema.shape.confidence,
        attentionLevel: liveObservationSchema.shape.attentionLevel,
        guidanceText: z.string().optional(),
      })
    )
    .max(4),
  checkpointCapture: z
    .object({
      value: z.string(),
      confidence: liveObservationSchema.shape.confidence,
      summary: z.string().optional(),
    })
    .optional(),
  checkpointCoverage: z
    .object({
      status: z.enum(["not-visible", "partial", "covered"]),
      note: z.string().optional(),
    })
    .optional(),
});

const severityPriority: Record<SeverityLevel, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const attentionPriority: Record<LiveObservation["attentionLevel"], number> = {
  confirm: 4,
  "move-closer": 3,
  watch: 2,
  ignore: 1,
};

function normalizeFrame(frameBase64: string) {
  return frameBase64.replace(/^data:image\/[a-z]+;base64,/, "");
}

function clampBox(value: BoundingBox) {
  return {
    x_min: Math.max(0, Math.min(1, value.x_min)),
    y_min: Math.max(0, Math.min(1, value.y_min)),
    x_max: Math.max(0, Math.min(1, value.x_max)),
    y_max: Math.max(0, Math.min(1, value.y_max)),
  };
}

function buildObservationId(args: {
  category: string;
  severity: string;
  boundingBox: BoundingBox;
}) {
  const box = args.boundingBox;
  return [
    args.category.toLowerCase(),
    args.severity.toLowerCase(),
    Math.round(box.x_min * 20),
    Math.round(box.y_min * 20),
    Math.round(box.x_max * 20),
    Math.round(box.y_max * 20),
  ].join("-");
}

function getBoxPositionLabel(box: BoundingBox) {
  const centerX = (box.x_min + box.x_max) / 2;
  const centerY = (box.y_min + box.y_max) / 2;
  const horizontal = centerX < 0.33 ? "left" : centerX > 0.66 ? "right" : "center";
  const vertical = centerY < 0.33 ? "top" : centerY > 0.66 ? "bottom" : "middle";

  if (horizontal === "center" && vertical === "middle") {
    return "center";
  }

  if (horizontal === "center") {
    return vertical;
  }

  if (vertical === "middle") {
    return horizontal;
  }

  return `${vertical}-${horizontal}`;
}

function fallbackGuidanceText(
  observation: Omit<LiveObservation, "observationId" | "guidanceText">,
  activeTarget?: LiveAnalyzeRequest["activeTarget"]
) {
  const position = getBoxPositionLabel(observation.boundingBox);
  if (observation.attentionLevel === "confirm") {
    return `${observation.category} looks serious at the ${position}. Hold steady for confirmation.`;
  }
  if (observation.attentionLevel === "move-closer") {
    return `Possible ${observation.category.toLowerCase()} at the ${position}. Move closer.`;
  }
  if (activeTarget?.phase === "focus") {
    return `Keep the ${observation.category.toLowerCase()} area in frame.`;
  }
  return `Possible ${observation.category.toLowerCase()} detected at the ${position}.`;
}

function sanitizeObservations(args: {
  observations: z.infer<typeof liveFrameSchema>["observations"];
  request: LiveAnalyzeRequest;
}) {
  return args.observations
    .filter((item) => item.description.trim().length > 0)
    .map((item) => {
      const boundingBox = clampBox(item.boundingBox);
      const baseObservation = {
        category: item.category,
        severity: item.severity,
        description: item.description.trim().slice(0, 120),
        boundingBox,
        confidence: item.confidence,
        attentionLevel: item.attentionLevel,
      } satisfies Omit<LiveObservation, "observationId" | "guidanceText">;

      return liveObservationSchema.parse({
        ...baseObservation,
        observationId: buildObservationId({
          category: item.category,
          severity: item.severity,
          boundingBox,
        }),
        guidanceText:
          item.guidanceText?.trim().slice(0, 120) ||
          fallbackGuidanceText(baseObservation, args.request.activeTarget),
      });
    })
    .filter((item) => !args.request.recentConfirmedIds?.includes(item.observationId))
    .sort((left, right) => {
      const severityDiff = severityPriority[right.severity] - severityPriority[left.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }

      const attentionDiff = attentionPriority[right.attentionLevel] - attentionPriority[left.attentionLevel];
      if (attentionDiff !== 0) {
        return attentionDiff;
      }

      return right.boundingBox.x_max - left.boundingBox.x_max;
    });
}

function selectPrimaryTarget(observations: LiveObservation[]) {
  return observations.find((observation) =>
    observation.severity === "Critical" ||
    observation.severity === "High"
  );
}

function buildAlertText(target: LiveObservation | undefined) {
  if (!target) {
    return undefined;
  }

  return target.guidanceText;
}

export async function analyzeLiveFrame(request: LiveAnalyzeRequest): Promise<LiveAnalyzeResponse> {
  const frameBase64 = normalizeFrame(request.frameBase64);
  if (!frameBase64) {
    return liveAnalyzeResponseSchema.parse({
      observations: [],
    });
  }

  try {
    const response = await callGeminiJson({
      model: appEnv.geminiLiveModel,
      schema: liveFrameSchema,
      timeoutMs: 8_000,
      prompt: [
        "You are triaging a live rental inspection camera frame.",
        "Return only JSON with visible renter-relevant issues.",
        "Do not infer hidden problems.",
        "Allowed categories: Mould, Structural, Plumbing, Pest, Electrical, Safety, Other.",
        "Allowed severities: Critical, High, Medium, Low.",
        "confidence must be low, medium, or high.",
        "attentionLevel rules:",
        '- use "ignore" for weak or irrelevant signals',
        '- use "watch" for minor visible issues',
        '- use "move-closer" when the issue could be serious but needs a closer frame',
        '- use "confirm" only when the visible evidence is already strong',
        "Descriptions must be renter-facing, one sentence, under 90 characters.",
        "guidanceText must be one short English action sentence under 90 characters.",
        "Every observation must include a normalized boundingBox in 0..1 coordinates.",
        request.guidedCheckpoint
          ? [
              `Current guided checklist target: ${request.guidedCheckpoint.label}.`,
              `Checklist instructions: ${request.guidedCheckpoint.instructions}`,
              'Always assess guided target visibility with checkpointCoverage.status = "not-visible" | "partial" | "covered".',
              'Use "covered" only when the requested target area is clearly framed and detailed enough for inspection.',
              'Use "partial" when the target area is somewhat visible but not yet well covered.',
              'Use "not-visible" when the requested target area is missing or too unclear.',
              "If the target is clearly visible, return checkpointCapture with a short factual note under 120 characters.",
              "If the target is not clearly visible, omit checkpointCapture entirely.",
              request.guidedCheckpoint.listMode
                ? "For checkpointCapture.value, return one item per line."
                : "For checkpointCapture.value, return a single concise sentence.",
            ].join("\n")
          : "",
        request.activeTarget
          ? `Current phase is ${request.activeTarget.phase}. Prioritize the same issue if it is still visible.`
          : "Current phase is overview.",
        request.activeTarget?.category ? `Active target category: ${request.activeTarget.category}.` : "",
        request.activeTarget?.boundingBox ? `Active target bbox: ${JSON.stringify(request.activeTarget.boundingBox)}.` : "",
        `Room type context: ${request.roomType}.`,
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

    const observations = sanitizeObservations({
      observations: response.observations,
      request,
    });
    const primaryTarget = selectPrimaryTarget(observations);
    const confirmedHazard =
      primaryTarget && primaryTarget.attentionLevel === "confirm"
        ? {
            id: crypto.randomUUID(),
            category: primaryTarget.category,
            severity: primaryTarget.severity,
            description: primaryTarget.description,
            boundingBox: primaryTarget.boundingBox,
            detectedAt: Date.now(),
            confirmedAt: Date.now(),
            roomType: request.roomType,
            sourceEventId: request.inspectionId,
            detectionMode: "live-guided" as const,
          }
        : undefined;

    return liveAnalyzeResponseSchema.parse({
      observations,
      primaryTarget: primaryTarget
        ? liveTargetSchema.parse({
            observationId: primaryTarget.observationId,
            category: primaryTarget.category,
            boundingBox: primaryTarget.boundingBox,
            phase:
              primaryTarget.attentionLevel === "move-closer" || request.activeTarget?.phase === "focus"
                ? "focus"
                : "overview",
          })
        : undefined,
      alertText: buildAlertText(primaryTarget),
      confirmedHazard,
      checkpointCapture: response.checkpointCapture && request.guidedCheckpoint
        ? {
            section: request.guidedCheckpoint.section,
            field: request.guidedCheckpoint.field,
            value: response.checkpointCapture.value.trim().slice(0, request.guidedCheckpoint.listMode ? 240 : 140),
            confidence: response.checkpointCapture.confidence,
            summary: response.checkpointCapture.summary?.trim().slice(0, 140),
          }
        : undefined,
      checkpointCoverage: response.checkpointCoverage
        ? {
            status: response.checkpointCoverage.status,
            note: response.checkpointCoverage.note?.trim().slice(0, 140),
          }
        : request.guidedCheckpoint
          ? {
              status: "not-visible",
            }
          : undefined,
    });
  } catch (error) {
    console.warn("Live frame analysis fallback", error);
    return liveAnalyzeResponseSchema.parse({
      observations: [],
    });
  }
}
