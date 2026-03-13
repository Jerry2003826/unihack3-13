"use client";

import type { AsyncStatus } from "@inspect-ai/contracts";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

function getStatusTone(status: AsyncStatus) {
  switch (status) {
    case "success":
      return "text-emerald-300";
    case "fallback":
      return "text-yellow-200";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function AsyncStatusBadge({
  label,
  status,
}: {
  label: string;
  status: AsyncStatus;
}) {
  return (
    <div className="flex items-center gap-2">
      {status === "loading" ? <Loader2 className="size-4 animate-spin text-accent" /> : null}
      {status === "success" ? <CheckCircle2 className="size-4 text-emerald-300" /> : null}
      {status === "fallback" || status === "error" ? <AlertTriangle className="size-4 text-yellow-200" /> : null}
      <span className={getStatusTone(status)}>
        {label}: {status}
      </span>
    </div>
  );
}
