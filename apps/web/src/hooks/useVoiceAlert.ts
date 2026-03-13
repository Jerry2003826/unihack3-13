"use client";

import { useCallback, useRef } from "react";
import type { SeverityLevel, TtsAlertResponse } from "@inspect-ai/contracts";
import { ttsAlertResponseSchema } from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";
import { useHazardStore } from "@/store/useHazardStore";

const MIN_SPEECH_INTERVAL_MS = 6_000;
const SILENT_MP3_DATA_URI =
  "data:audio/mpeg;base64,SUQzAwAAAAAAF1RTU0UAAAAPAAADTGF2ZjU4LjQ1LjEwMAAAAAAAAAAAAAAA//uQZAAAAADTLU9UAAAAANIAAAAAExBTUUzLjk4LjIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

export function useVoiceAlert() {
  const lastSpeechAt = useHazardStore((state) => state.lastSpeechAt);
  const lastAlertKey = useHazardStore((state) => state.lastAlertKey);
  const setLastSpeechAt = useHazardStore((state) => state.setLastSpeechAt);
  const setLastAlertKey = useHazardStore((state) => state.setLastAlertKey);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isAudioPrimedRef = useRef(false);

  const primeSpeechSynthesis = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }

    if (isAudioPrimedRef.current) {
      return;
    }

    audioRef.current.src = SILENT_MP3_DATA_URI;
    audioRef.current.volume = 0;
    void audioRef.current
      .play()
      .then(() => {
        audioRef.current?.pause();
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.removeAttribute("src");
          audioRef.current.load();
          audioRef.current.volume = 1;
        }
        isAudioPrimedRef.current = true;
      })
      .catch(() => {
        if (audioRef.current) {
          audioRef.current.volume = 1;
        }
      });
  }, []);

  const cancelAlerts = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, []);

  const playAlert = useCallback(
    async (args: {
      inspectionId: string;
      alertKey: string;
      text: string;
      severity: SeverityLevel;
    }) => {
      if (typeof window === "undefined" || !args.text.trim()) {
        return;
      }

      const now = Date.now();
      if (args.alertKey === lastAlertKey || now - lastSpeechAt < MIN_SPEECH_INTERVAL_MS) {
        return;
      }

      setLastSpeechAt(now);
      setLastAlertKey(args.alertKey);

      try {
        const response = await fetch(resolveApiUrl("/api/tts/alert"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inspectionId: args.inspectionId,
            text: args.text,
            severity: args.severity,
            alertKey: args.alertKey,
            locale: "en-AU",
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload: TtsAlertResponse = ttsAlertResponseSchema.parse(await response.json());
        if (!payload.audioBase64 || !payload.mimeType) {
          return;
        }

        const src = `data:${payload.mimeType};base64,${payload.audioBase64}`;
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }

        audioRef.current.volume = 1;
        audioRef.current.pause();
        audioRef.current.src = src;
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      } catch (error) {
        console.warn("TTS alert failed", error);
      }
    },
    [lastAlertKey, lastSpeechAt, setLastAlertKey, setLastSpeechAt]
  );

  return { playAlert, primeSpeechSynthesis, cancelAlerts };
}
