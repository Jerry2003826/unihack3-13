"use client";

import { useEffect, useRef, useState } from "react";
import type { AsyncStatus, ListingDiscoveryCandidate } from "@inspect-ai/contracts";
import { fetchListingDiscovery } from "@/lib/listingDiscovery";
import { toOptionalUrl } from "@/lib/url";

interface UseListingDiscoveryArgs {
  address: string;
  agency?: string;
  listingUrl: string;
  enabled?: boolean;
  autoDetect?: boolean;
  onAutoApply: (nextListingUrl: string) => void;
}

export function useListingDiscovery(args: UseListingDiscoveryArgs) {
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [summary, setSummary] = useState("");
  const [candidates, setCandidates] = useState<ListingDiscoveryCandidate[]>([]);
  const lastRequestKeyRef = useRef("");
  const onAutoApplyRef = useRef(args.onAutoApply);

  useEffect(() => {
    onAutoApplyRef.current = args.onAutoApply;
  }, [args.onAutoApply]);

  useEffect(() => {
    if (!args.enabled) {
      const timeout = window.setTimeout(() => {
        setStatus("idle");
        setSummary("");
        setCandidates([]);
        lastRequestKeyRef.current = "";
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const trimmedAddress = args.address.trim();
    if (trimmedAddress.length < 8) {
      const timeout = window.setTimeout(() => {
        setStatus("idle");
        setSummary("");
        setCandidates([]);
        lastRequestKeyRef.current = "";
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    if (!args.autoDetect && toOptionalUrl(args.listingUrl)) {
      const timeout = window.setTimeout(() => {
        setStatus("idle");
        setSummary("");
        setCandidates([]);
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    const requestKey = JSON.stringify({
      address: trimmedAddress.toLowerCase(),
      agency: args.agency?.trim().toLowerCase() ?? "",
    });

    if (lastRequestKeyRef.current === requestKey) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setStatus("loading");

      try {
        const payload = await fetchListingDiscovery({
          address: trimmedAddress,
          agency: args.agency,
        });

        setCandidates(payload.candidates);
        setSummary(payload.summary);
        setStatus(payload.provider === "fallback" || !payload.selectedUrl ? "fallback" : "success");
        lastRequestKeyRef.current = requestKey;

        if (payload.selectedUrl) {
          onAutoApplyRef.current(payload.selectedUrl);
        }
      } catch (error) {
        setStatus("error");
        setSummary(error instanceof Error ? error.message : "Listing discovery failed.");
      }
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [args.address, args.agency, args.enabled, args.listingUrl, args.autoDetect]);

  function retry() {
    lastRequestKeyRef.current = "";
    setStatus("idle");
  }

  return {
    status,
    summary,
    candidates,
    retry,
  };
}
