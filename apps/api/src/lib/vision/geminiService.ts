import type { AnalyzeRequest, Hazard } from "@inspect-ai/contracts";
import {
  analyzeResponseSchema,
  hazardDraftsArraySchema,
  hazardSchema,
} from "@inspect-ai/contracts";
import { callGeminiJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { dedupeHazards } from "@/lib/fallbacks";
import { fetchObjectAsBase64 } from "@/lib/spaces";

function buildPrompt(request: AnalyzeRequest) {
  return [
    "You are inspecting rental property photos for tenant-visible risks.",
    "Return only a JSON array of hazard drafts.",
    "Detect visible issues only. Do not infer hidden problems without image evidence.",
    "Allowed categories: Mould, Structural, Plumbing, Pest, Electrical, Safety, Other.",
    "Allowed severities: Critical, High, Medium, Low.",
    "Each hazard must contain category, severity, and a short tenant-friendly description.",
    "Include estimatedCost only when there is a strong visual basis.",
    request.source === "manual"
      ? "You may receive multiple photos of the same property. Merge duplicate findings across images."
      : "You are analyzing a single live camera frame.",
    `Current room type context: ${request.roomType}.`,
    request.context?.propertyNotes ? `Property notes: ${request.context.propertyNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function getImageParts(request: AnalyzeRequest) {
  if (request.source === "manual" && request.objectKeys?.length) {
    const objects = await Promise.all(request.objectKeys.map((objectKey) => fetchObjectAsBase64(objectKey)));
    return objects.map((object) => ({
      inlineData: {
        data: object.base64,
        mimeType: object.mimeType,
      },
    }));
  }

  return (request.images ?? []).map((image) => ({
    inlineData: {
      data: image,
      mimeType: "image/jpeg",
    },
  }));
}

export async function analyzePropertyImages(request: AnalyzeRequest) {
  const imageParts = await getImageParts(request);
  if (imageParts.length === 0) {
    return {
      hazards: [] as Hazard[],
      fallbackReason: "no_images_provided",
      provider: "fallback",
    };
  }

  try {
    const drafts = await callGeminiJson({
      model: appEnv.geminiVisionModel,
      prompt: buildPrompt(request),
      parts: imageParts,
      schema: hazardDraftsArraySchema,
      timeoutMs: 25_000,
    });

    const hazards = drafts.map((draft) =>
      hazardSchema.parse({
        ...draft,
        id: crypto.randomUUID(),
        detectedAt: Date.now(),
        roomType: request.roomType,
      })
    );

    const deduped = request.source === "manual" ? dedupeHazards(hazards) : hazards;
    return {
      hazards: analyzeResponseSchema.parse({ hazards: deduped }).hazards,
      provider: "gemini",
    };
  } catch (error) {
    console.warn("Gemini analyze fallback", error);
    return {
      hazards: [],
      fallbackReason: "gemini_analyze_failed",
      provider: "fallback",
    };
  }
}
