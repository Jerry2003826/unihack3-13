"use client";

import type { InspectionChecklist } from "@inspect-ai/contracts";
import { INSPECTION_CHECKLIST_SECTIONS, getInspectionChecklistFieldValue, updateInspectionChecklistField } from "@/lib/inspectionChecklist";

interface InspectionChecklistEditorProps {
  value: InspectionChecklist | null;
  onChange: (value: InspectionChecklist) => void;
  compact?: boolean;
}

export function InspectionChecklistEditor({
  value,
  onChange,
  compact = false,
}: InspectionChecklistEditorProps) {
  return (
    <div className="space-y-3">
      {INSPECTION_CHECKLIST_SECTIONS.map((section) => (
        <details key={section.key} className="rounded-2xl border border-border/70 bg-muted/20 p-4" open={!compact}>
          <summary className="cursor-pointer list-none">
            <div className="text-sm font-medium text-foreground">{section.title}</div>
            <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
          </summary>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {section.fields.map((field) => {
              const fieldValue = getInspectionChecklistFieldValue(value, section.key, field.key);

              return (
                <label key={field.key} className={`space-y-2 ${field.multiline ? "md:col-span-2" : ""}`}>
                  <span className="text-sm font-medium text-foreground/90">{field.label}</span>
                  {field.multiline ? (
                    <textarea
                      className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder={field.placeholder}
                      value={fieldValue}
                      onChange={(event) =>
                        onChange(updateInspectionChecklistField(value, section.key, field.key, event.target.value))
                      }
                    />
                  ) : (
                    <input
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      placeholder={field.placeholder}
                      value={fieldValue}
                      onChange={(event) =>
                        onChange(updateInspectionChecklistField(value, section.key, field.key, event.target.value))
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
