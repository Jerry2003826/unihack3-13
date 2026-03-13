import { GoogleGenAI } from "@google/genai";
import { appEnv } from "@/lib/env";

let client: GoogleGenAI | null | undefined;

export function getGeminiClient(): GoogleGenAI | null {
  if (client !== undefined) {
    return client;
  }

  client = appEnv.geminiApiKey ? new GoogleGenAI({ apiKey: appEnv.geminiApiKey }) : null;
  return client;
}
