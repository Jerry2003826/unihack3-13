import { appEnv } from "@/lib/env";
import { withTimeout } from "@/lib/http";

interface MinimaxTtsArgs {
  text: string;
  locale: "en-AU";
}

export interface MinimaxTtsResult {
  audioBase64: string;
  mimeType: string;
}

function detectMimeType(format: string | undefined) {
  if (!format) {
    return "audio/mpeg";
  }

  switch (format.toLowerCase()) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/L16";
    default:
      return `audio/${format.toLowerCase()}`;
  }
}

function mapLocaleToLanguageBoost(locale: MinimaxTtsArgs["locale"]) {
  switch (locale) {
    case "en-AU":
      return "English";
    default:
      return "English";
  }
}

export async function synthesizeMinimaxAlert(args: MinimaxTtsArgs): Promise<MinimaxTtsResult> {
  if (!appEnv.minimaxApiKey || !appEnv.minimaxTtsVoiceId) {
    throw new Error("MiniMax TTS is not configured.");
  }

  const response = await withTimeout(
    () =>
      fetch(`${appEnv.minimaxApiBase.replace(/\/$/, "")}/v1/t2a_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${appEnv.minimaxApiKey}`,
        },
        body: JSON.stringify({
          model: appEnv.minimaxTtsModel,
          text: args.text,
          stream: false,
          output_format: "hex",
          language_boost: mapLocaleToLanguageBoost(args.locale),
          voice_setting: {
            voice_id: appEnv.minimaxTtsVoiceId,
            speed: 1,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            format: appEnv.minimaxTtsFormat,
            sample_rate: 32000,
            bitrate: 128000,
            channel: 1,
          },
        }),
      }),
    10_000
  );

  if (!response.ok) {
    throw new Error(`MiniMax TTS failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { audio?: string; extra_info?: { audio_format?: string } };
  };

  if (payload.base_resp?.status_code && payload.base_resp.status_code !== 0) {
    throw new Error(payload.base_resp.status_msg || "MiniMax TTS returned an error.");
  }

  const audioHex = payload.data?.audio?.trim();
  if (!audioHex) {
    throw new Error("MiniMax TTS returned no audio.");
  }

  return {
    audioBase64: Buffer.from(audioHex, "hex").toString("base64"),
    mimeType: detectMimeType(payload.data?.extra_info?.audio_format ?? appEnv.minimaxTtsFormat),
  };
}
