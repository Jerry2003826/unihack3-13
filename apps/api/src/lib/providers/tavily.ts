import { tavily, type TavilyClient } from "@tavily/core";
import { appEnv } from "@/lib/env";

let client: TavilyClient | null | undefined;

export function getTavilyClient(): TavilyClient | null {
  if (client !== undefined) {
    return client;
  }

  client = appEnv.tavilyApiKey ? tavily({ apiKey: appEnv.tavilyApiKey }) : null;
  return client;
}
