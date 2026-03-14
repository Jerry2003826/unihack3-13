import { NextResponse } from "next/server";
import { z } from "zod";
import { callGeminiJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";

const translateRequestSchema = z.object({
  locale: z.enum(["en", "zh", "es", "ja", "ko", "pt"]),
  texts: z.array(z.string().min(1).max(1200)).min(1).max(80),
});

const translateResponseSchema = z.object({
  translations: z.array(z.string()),
});

const localeNames: Record<z.infer<typeof translateRequestSchema>["locale"], string> = {
  en: "English",
  zh: "Simplified Chinese",
  es: "Spanish",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese (Brazil)",
};

export async function POST(request: Request) {
  let fallbackTexts: string[] = [];

  try {
    const json = await request.json();
    const parsed = translateRequestSchema.parse(json);
    fallbackTexts = parsed.texts;

    if (parsed.locale === "en") {
      return NextResponse.json({
        translations: parsed.texts,
      });
    }

    if (!appEnv.geminiApiKey) {
      return NextResponse.json({
        translations: parsed.texts,
        fallback: true,
      });
    }

    const prompt = [
      `Translate each text into ${localeNames[parsed.locale]}.`,
      "Keep the output natural for a rental inspection app UI and report.",
      "Preserve meaning, numbers, currencies, URLs, phone numbers, addresses, and proper nouns.",
      "Do not add commentary.",
      "Return one translation per input in the same order.",
      JSON.stringify({ texts: parsed.texts }, null, 2),
    ].join("\n");

    const response = await callGeminiJson({
      model: appEnv.geminiReasoningModel,
      prompt,
      schema: translateResponseSchema,
      timeoutMs: 20_000,
    });

    if (response.translations.length !== parsed.texts.length) {
      return NextResponse.json({
        translations: parsed.texts,
        fallback: true,
      });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("translate route failed", error);
    return NextResponse.json(
      {
        translations: fallbackTexts,
        fallback: true,
        error: error instanceof Error ? error.message : "Translation failed.",
      },
      { status: fallbackTexts.length > 0 ? 200 : 500 }
    );
  }
}
