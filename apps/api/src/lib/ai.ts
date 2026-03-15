import type { ZodTypeAny } from "zod";
import { toGeminiResponseSchema } from "@inspect-ai/contracts";
import { extractJsonText, withTimeout } from "./http";
import { buildCitationsFromGroundedCatalog, extractGroundedCatalog } from "./grounding";
import { getGeminiClient } from "./providers/gemini";
import { appEnv } from "./env";
import { Type } from "@google/genai";

import { z } from "zod";

export interface SourceCatalogItem {
  sourceId: string;
  title: string;
  url: string;
  snippet?: string;
  provider?: string;
}

function clean(obj: any) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

export function createGeminiSchema(schema: ZodTypeAny): any {
  const def = (schema as any)._def;
  const typeName = schema?.constructor?.name || def?.typeName;
  if (!typeName) return { type: Type.STRING }; // Fallback

  switch (typeName) {
    case "ZodString":
      return clean({ type: Type.STRING, description: def.description });
    case "ZodNumber":
      return clean({ type: Type.NUMBER, description: def.description });
    case "ZodBoolean":
      return clean({ type: Type.BOOLEAN, description: def.description });
    case "ZodArray":
      return clean({ type: Type.ARRAY, items: createGeminiSchema(def.type), description: def.description });
    case "ZodObject": {
      const shape = typeof def.shape === "function" ? def.shape() : def.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape) as any) {
        properties[key] = createGeminiSchema(value);
        const valTypeName = value?.constructor?.name || value._def?.typeName;
        if (valTypeName !== "ZodOptional" && valTypeName !== "ZodDefault") {
          required.push(key);
        }
      }
      return clean({ type: Type.OBJECT, properties, required: required.length > 0 ? required : undefined, description: def.description });
    }
    case "ZodOptional":
    case "ZodNullable":
      return createGeminiSchema(def.innerType);
    case "ZodEnum":
      return clean({ type: Type.STRING, enum: def.values, description: def.description });
    case "ZodEffects":
      return createGeminiSchema(def.schema); // For .describe() wraps using effects sometimes, or refine
    default:
      return { type: Type.STRING }; 
  }
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

  const isFlash = args.model.includes("flash");
  const gatewaySchema = isFlash
    ? (args.schema as any).extend({
        _escalateToPro: z
          .boolean()
          .describe(
            "Set to true ONLY if the task is overwhelmingly complex, requires deep reasoning, or you cannot solve it directly. DO NOT set to true for simple facts or summaries. Otherwise omit this field."
          )
          .optional(),
      })
    : args.schema;

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
          responseJsonSchema: createGeminiSchema(gatewaySchema),
        },
      }),
    args.timeoutMs ?? 20_000
  );

  const rawText = extractJsonText(response.text ?? "");
  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  if (isFlash) {
    const rawFlash = extractJsonText(response.text ?? "");
    const parsedData = JSON.parse(rawFlash);
    if (parsedData._escalateToPro === true) {
      console.log(`[Smart Gateway] Escalating task from ${args.model} to ${appEnv.geminiReasoningModel}`);
      const proResponse = await withTimeout(
        () =>
          client.models.generateContent({
            model: appEnv.geminiReasoningModel,
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
        args.timeoutMs ? args.timeoutMs * 1.5 : 30_000
      );

      const proRawText = extractJsonText(proResponse.text ?? "");
      if (!proRawText) throw new Error("Gemini returned an empty response after escalation.");

      try {
        return args.schema.parse(JSON.parse(proRawText));
      } catch (e) {
        console.log("[Raw Pro Response]:", proRawText);
        throw e;
      }
    }
    
    // Fallthrough: Flash answered successfully without escalating
    console.log("[Smart Gateway Fallthrough Raw]:", rawText);
    return args.schema.parse(JSON.parse(rawText));
  }

  return args.schema.parse(JSON.parse(rawText));
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

  const isFlash = args.model.includes("flash");
  const gatewaySchema = isFlash
    ? (args.schema as any).extend({
        _escalateToPro: z
          .boolean()
          .describe(
            "Set to true ONLY if the task is overwhelmingly complex, requires deep reasoning, or you cannot solve it directly. DO NOT set to true for simple facts or summaries. Otherwise omit this field."
          )
          .optional(),
      })
    : args.schema;

  const contents: any[] = [
    {
      role: "user",
      parts: [
        {
          text: [
            args.prompt,
            "Return only a JSON object that matches this JSON schema.",
            JSON.stringify(createGeminiSchema(gatewaySchema), null, 2),
          ].join("\n"),
        },
      ],
    },
  ];

  const response = await withTimeout(
    () =>
      client.models.generateContent({
        model: args.model,
        contents,
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

  let finalResponse = response;

  if (isFlash) {
    const rawFlash = extractJsonText(response.text ?? "");
    const parsedData = JSON.parse(rawFlash);
    if (parsedData._escalateToPro === true) {
      console.log(`[Smart Gateway Grounded] Escalating task from ${args.model} to ${appEnv.geminiReasoningModel}`);
      finalResponse = await withTimeout(
        () =>
          client.models.generateContent({
            model: appEnv.geminiReasoningModel,
            contents,
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
        args.timeoutMs ? args.timeoutMs * 1.5 : 30_000
      );
    }
  }

  const rawFinalText = finalResponse.text;
  if (!rawFinalText) {
    throw new Error("Gemini returned an empty grounded response.");
  }

  const groundingMetadata = finalResponse.candidates?.[0]?.groundingMetadata;
  const catalog = extractGroundedCatalog(groundingMetadata);

  return {
    data: args.schema.parse(JSON.parse(extractJsonText(rawFinalText))),
    groundingMetadata,
    catalog,
    citations: buildCitationsFromGroundedCatalog(catalog),
  };
}

export async function callGeminiSearchGroundedJson<TSchema extends ZodTypeAny>(args: {
  model: string;
  prompt: string;
  schema: TSchema;
  timeoutMs?: number;
}) {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini is not configured.");
  }

  const isFlash = args.model.includes("flash");
  const gatewaySchema = isFlash
    ? (args.schema as any).extend({
        _escalateToPro: z
          .boolean()
          .describe(
            "Set to true ONLY if the task is overwhelmingly complex, requires deep reasoning, or you cannot solve it directly. DO NOT set to true for simple facts or summaries. Otherwise omit this field."
          )
          .optional(),
      })
    : args.schema;

  const contents: any[] = [
    {
      role: "user",
      parts: [
        {
          text: [
            args.prompt,
            "Use Google Search grounding when external evidence is needed.",
            "Return only a JSON object that matches this JSON schema.",
            JSON.stringify(createGeminiSchema(gatewaySchema), null, 2),
          ].join("\n"),
        },
      ],
    },
  ];

  const response = await withTimeout(
    () =>
      client.models.generateContent({
        model: args.model,
        contents,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
    args.timeoutMs ?? 20_000
  );

  let finalResponse = response;

  if (isFlash) {
    const rawFlash = extractJsonText(response.text ?? "");
    const parsedData = JSON.parse(rawFlash);
    if (parsedData._escalateToPro === true) {
      console.log(`[Smart Gateway Search] Escalating task from ${args.model} to ${appEnv.geminiReasoningModel}`);
      finalResponse = await withTimeout(
        () =>
          client.models.generateContent({
            model: appEnv.geminiReasoningModel,
            contents,
            config: {
              tools: [{ googleSearch: {} }],
            },
          }),
        args.timeoutMs ? args.timeoutMs * 1.5 : 30_000
      );
    }
  }

  const rawFinalText = finalResponse.text;
  if (!rawFinalText) {
    throw new Error("Gemini returned an empty Google Search grounded response.");
  }

  const groundingMetadata = finalResponse.candidates?.[0]?.groundingMetadata;
  const catalog = extractGroundedCatalog(groundingMetadata);

  return {
    data: args.schema.parse(JSON.parse(extractJsonText(rawFinalText))),
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
