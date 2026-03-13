export interface TelemetryEvent {
  level?: "info" | "warn" | "error";
  message: string;
  route: string;
  requestId: string;
  inspectionId?: string;
  reportId?: string;
  provider?: string;
  durationMs?: number;
  fallbackReason?: string;
  failedSubtasks?: string[];
  uploadIndex?: number;
  details?: unknown;
}

function emit(event: TelemetryEvent) {
  const payload = {
    ts: new Date().toISOString(),
    level: event.level ?? "info",
    ...event,
  };

  const line = JSON.stringify(payload);
  if (payload.level === "error") {
    console.error(line);
    return;
  }

  if (payload.level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function logInfo(event: Omit<TelemetryEvent, "level">) {
  emit({ ...event, level: "info" });
}

export function logWarn(event: Omit<TelemetryEvent, "level">) {
  emit({ ...event, level: "warn" });
}

export function logError(event: Omit<TelemetryEvent, "level">) {
  emit({ ...event, level: "error" });
}
