import { useCallback } from "react";
import { useHazardStore } from "@/store/useHazardStore";

const MIN_SPEECH_INTERVAL_MS = 5000;

export function useVoiceAlert() {
  const lastSpeechAt = useHazardStore((state) => state.lastSpeechAt);
  const setLastSpeechAt = useHazardStore((state) => state.setLastSpeechAt);

  const primeSpeechSynthesis = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.cancel();
  }, []);

  const cancelAlerts = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  }, []);

  const playAlert = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      const now = Date.now();
      if (now - lastSpeechAt < MIN_SPEECH_INTERVAL_MS) {
        return; // Too soon
      }

      // Truncate to first 15 words to keep it snappy
      const words = text.split(/\s+/);
      const shortText = words.slice(0, 15).join(" ") + (words.length > 15 ? "..." : "");

      const utterance = new SpeechSynthesisUtterance(shortText);
      utterance.rate = 1.1; // Slightly faster for urgency
      utterance.pitch = 1.0;
      
      // Try to find a good English voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Siri")));
      if (preferred) {
        utterance.voice = preferred;
      }

      window.speechSynthesis.speak(utterance);
      setLastSpeechAt(now);
    },
    [lastSpeechAt, setLastSpeechAt]
  );

  return { playAlert, primeSpeechSynthesis, cancelAlerts };
}
