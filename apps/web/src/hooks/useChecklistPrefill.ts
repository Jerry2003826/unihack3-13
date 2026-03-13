"use client";

import { useEffect, useRef, useState } from "react";
import type { AsyncStatus, GeoPoint, InspectionChecklist } from "@inspect-ai/contracts";
import { fetchChecklistPrefill, mergeChecklistPrefill } from "@/lib/checklistPrefill";

interface UseChecklistPrefillArgs {
  address: string;
  agency?: string;
  listingUrl?: string;
  coordinates?: GeoPoint | null;
  propertyNotes?: string;
  checklist: InspectionChecklist | null;
  enabled?: boolean;
  onApply: (nextChecklist: InspectionChecklist | null) => void;
}

export function useChecklistPrefill(args: UseChecklistPrefillArgs) {
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [summary, setSummary] = useState("");
  const [autoFilledFieldKeys, setAutoFilledFieldKeys] = useState<string[]>([]);
  const checklistRef = useRef<InspectionChecklist | null>(args.checklist);
  const onApplyRef = useRef(args.onApply);
  const managedFieldKeysRef = useRef<string[]>([]);
  const lastRequestKeyRef = useRef("");

  useEffect(() => {
    checklistRef.current = args.checklist;
  }, [args.checklist]);

  useEffect(() => {
    onApplyRef.current = args.onApply;
  }, [args.onApply]);

  useEffect(() => {
    if (!args.enabled) {
      const timeout = window.setTimeout(() => {
        setStatus("idle");
        setSummary("");
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const trimmedAddress = args.address.trim();
    const hasLookupAnchor = trimmedAddress.length >= 8 || !!args.coordinates;
    if (!hasLookupAnchor) {
      const timeout = window.setTimeout(() => {
        setStatus("idle");
        setSummary("");
        setAutoFilledFieldKeys([]);
        managedFieldKeysRef.current = [];
        lastRequestKeyRef.current = "";
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const requestKey = JSON.stringify({
      address: trimmedAddress.toLowerCase(),
      agency: args.agency?.trim().toLowerCase() ?? "",
      coordinates: args.coordinates
        ? {
            lat: Number(args.coordinates.lat.toFixed(4)),
            lng: Number(args.coordinates.lng.toFixed(4)),
          }
        : null,
      propertyNotes: args.propertyNotes?.trim().toLowerCase() ?? "",
      listingUrl: args.listingUrl?.trim().toLowerCase() ?? "",
    });

    if (lastRequestKeyRef.current === requestKey) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setStatus("loading");

      try {
        const payload = await fetchChecklistPrefill({
          address: trimmedAddress || undefined,
          agency: args.agency,
          listingUrl: args.listingUrl,
          coordinates: args.coordinates,
          propertyNotes: args.propertyNotes,
        });

        const merged = mergeChecklistPrefill({
          current: checklistRef.current,
          prefill: payload.checklist,
          responseFieldKeys: payload.autoFilledFieldKeys,
          managedFieldKeys: managedFieldKeysRef.current,
        });

        managedFieldKeysRef.current = merged.appliedFieldKeys;
        setAutoFilledFieldKeys(merged.appliedFieldKeys);
        setSummary(payload.summary);
        setStatus(payload.provider === "fallback" || merged.appliedFieldKeys.length === 0 ? "fallback" : "success");
        lastRequestKeyRef.current = requestKey;

        if (merged.checklist) {
          checklistRef.current = merged.checklist;
          onApplyRef.current(merged.checklist);
        }
      } catch (error) {
        setStatus("error");
        setSummary(error instanceof Error ? error.message : "Remote checklist lookup failed.");
      }
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [args.address, args.agency, args.coordinates, args.enabled, args.listingUrl, args.propertyNotes]);

  function markFieldAsManual(fieldPath: string) {
    managedFieldKeysRef.current = managedFieldKeysRef.current.filter((key) => key !== fieldPath);
    setAutoFilledFieldKeys((current) => current.filter((key) => key !== fieldPath));
  }

  function retry() {
    lastRequestKeyRef.current = "";
    setStatus("idle");
  }

  return {
    status,
    summary,
    autoFilledFieldKeys,
    markFieldAsManual,
    retry,
  };
}
