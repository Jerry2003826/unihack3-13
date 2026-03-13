import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { toGeminiResponseSchema } from "@inspect-ai/contracts";
import { extractJsonText, withTimeout } from "@/lib/http";
import { getGeminiClient } from "@/lib/providers/gemini";

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
