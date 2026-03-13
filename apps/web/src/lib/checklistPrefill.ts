import type { ChecklistPrefillResponse, GeoPoint, InspectionChecklist } from "@inspect-ai/contracts";
import { checklistPrefillResponseSchema } from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";
import {
  getInspectionChecklistFieldValue,
  parseInspectionChecklistFieldPath,
  setInspectionChecklistFieldValue,
  type InspectionChecklistFieldPath,
} from "@/lib/inspectionChecklist";

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

export async function fetchChecklistPrefill(args: {
  address?: string;
  agency?: string;
  listingUrl?: string;
  coordinates?: GeoPoint | null;
  propertyNotes?: string;
}): Promise<ChecklistPrefillResponse> {
  const response = await fetch(resolveApiUrl("/api/checklist/prefill"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: args.address?.trim() || undefined,
      agency: args.agency?.trim() || undefined,
      listingUrl: args.listingUrl?.trim() || undefined,
      coordinates: args.coordinates || undefined,
      propertyNotes: args.propertyNotes?.trim() || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Checklist prefill failed with ${response.status}`);
  }

  return checklistPrefillResponseSchema.parse(await response.json());
}

export function mergeChecklistPrefill(args: {
  current: InspectionChecklist | null | undefined;
  prefill: InspectionChecklist;
  responseFieldKeys: string[];
  managedFieldKeys: string[];
}) {
  let next = args.current ?? null;
  const appliedFieldKeys: InspectionChecklistFieldPath[] = [];

  for (const fieldPath of args.responseFieldKeys) {
    const parsed = parseInspectionChecklistFieldPath(fieldPath);
    if (!parsed) {
      continue;
    }

    const nextValue = getInspectionChecklistFieldValue(args.prefill, parsed.sectionKey, parsed.fieldKey);
    if (!nextValue.trim()) {
      continue;
    }

    const currentValue = getInspectionChecklistFieldValue(next, parsed.sectionKey, parsed.fieldKey);
    const canOverwrite = !currentValue.trim() || args.managedFieldKeys.includes(fieldPath);
    if (!canOverwrite) {
      continue;
    }

    const rawPrefillSection = args.prefill?.[parsed.sectionKey] as Record<string, unknown> | undefined;
    const rawValue = rawPrefillSection?.[parsed.fieldKey];
    next = setInspectionChecklistFieldValue(
      next,
      parsed.sectionKey,
      parsed.fieldKey,
      Array.isArray(rawValue) ? rawValue.map((item) => String(item)) : String(rawValue ?? "")
    );
    appliedFieldKeys.push(fieldPath as InspectionChecklistFieldPath);
  }

  return {
    checklist: next,
    appliedFieldKeys,
  };
}
