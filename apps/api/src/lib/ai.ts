import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { toGeminiResponseSchema } from "@inspect-ai/contracts";
import { extractJsonText, withTimeout } from "./http";
import { buildCitationsFromGroundedCatalog, extractGroundedCatalog } from "./grounding";
import { getGeminiClient } from "./providers/gemini";

export interface SourceCatalogItem {
  sourceId: string;
  title: string;
  url: string;
  snippet?: string;
  provider?: string;
}

export function createGeminiSchema(schema: ZodTypeAny) {
  const jsonSchema = zodToJsonSchema(schema as never, {
    $refStrategy: "none",
  });
  return toGeminiResponseSchema(jsonSchema);
}

export async function callGeminiJson<TSchema extends ZodTypeAny>(args: {
  model: string;
  prompt: string;
  schema: TSchema;
  parts?: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }>;
  timeoutMs?: number;
}) {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini is not configured.");
  }

  const response = await withTimeout(
    () =>
      client.models.generateContent({
        model: args.model,
        contents: [
          {
            role: "user",
            parts: [{ text: args.prompt }, ...(args.parts ?? [])],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: createGeminiSchema(args.schema),
        },
      }),
    args.timeoutMs ?? 20_000
  );

  const rawText = response.text;
  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  return args.schema.parse(JSON.parse(extractJsonText(rawText)));
}

export async function callGeminiGroundedJson<TSchema extends ZodTypeAny>(args: {
  model: string;
  prompt: string;
  schema: TSchema;
  coordinates?: { lat: number; lng: number };
  languageCode?: string;
  timeoutMs?: number;
}) {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini is not configured.");
  }

  const response = await withTimeout(
    () =>
      client.models.generateContent({
        model: args.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  args.prompt,
                  "Return only a JSON object that matches this schema.",
                  JSON.stringify(createGeminiSchema(args.schema), null, 2),
                ].join("\n"),
              },
            ],
          },
        ],
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              languageCode: args.languageCode ?? "en-AU",
              latLng: args.coordinates
                ? {
                    latitude: args.coordinates.lat,
                    longitude: args.coordinates.lng,
                  }
                : undefined,
            },
          },
        },
      }),
    args.timeoutMs ?? 20_000
  );

  const rawText = response.text;
  if (!rawText) {
    throw new Error("Gemini returned an empty grounded response.");
  }

  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  const catalog = extractGroundedCatalog(groundingMetadata);

  return {
    data: args.schema.parse(JSON.parse(extractJsonText(rawText))),
    groundingMetadata,
    catalog,
    citations: buildCitationsFromGroundedCatalog(catalog),
  };
}

export function sanitizeCitations(
  citations: Array<{ sourceId: string; title: string; url: string }> | undefined,
  catalog: SourceCatalogItem[]
) {
  const index = new Map(catalog.map((item) => [item.sourceId, item]));

  return (citations ?? []).flatMap((citation) => {
    const matched = index.get(citation.sourceId);
    if (!matched) {
      return [];
    }

    if (matched.title !== citation.title || matched.url !== citation.url) {
      return [];
    }

    return [{ sourceId: matched.sourceId, title: matched.title, url: matched.url }];
  });
}
