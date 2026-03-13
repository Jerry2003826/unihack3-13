"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeoPoint, Hazard, InspectionChecklist, PropertyIntelligence, ReportSnapshot } from "@inspect-ai/contracts";
import {
  analyzeResponseSchema,
  intelligenceResponseSchema,
  signedUploadResponseSchema,
} from "@inspect-ai/contracts";
import { publicAppConfig } from "@/lib/config/public";
import { saveSearchHistory } from "@/lib/history/historyStore";
import { prepareManualImages } from "@/lib/images/prepareManualImages";
import { requestCurrentLocation, reverseGeocodeCoordinates } from "@/lib/location";
import { normalizeReportSnapshot } from "@/lib/report/normalizeReportSnapshot";
import { saveReportSnapshot } from "@/lib/report-snapshot/reportSnapshotStore";
import { calculatePropertyRiskScore } from "@/lib/scoring";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { InspectionChecklistEditor } from "@/components/inspection/InspectionChecklistEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const MapPicker = dynamic(() => import("@/components/manual/ManualMapPicker").then((mod) => mod.ManualMapPicker), {
  ssr: false,
  loading: () => <div className="h-48 w-full animate-pulse rounded-md bg-muted" />,
});

const MAX_IMAGE_COUNT = 8;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getImageValidationError(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return `${file.name} is not a supported image type.`;
  }

  if (file.size === 0) {
    return `${file.name} is empty.`;
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `${file.name} exceeds the 10 MB upload limit.`;
  }

  return null;
}

function resolveApiUrl(path: string) {
  return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
}

function buildManualIntelligenceFallback(args: {
  address: string;
  agency: string;
  coordinates: GeoPoint | null;
}): PropertyIntelligence {
  return {
    address: args.address || (args.coordinates ? `${args.coordinates.lat.toFixed(4)}, ${args.coordinates.lng.toFixed(4)}` : undefined),
    geoAnalysis: {
      noiseRisk: "Medium",
      transitScore: 50,
      warning: "Manual intelligence request failed. Verify the neighborhood and transit in person.",
      nearbyTransit: [],
      destinationConvenience: [],
    },
    communityInsight: {
      summary: "Community research is unavailable right now. Check local renter forums manually before signing.",
      sentiment: "unknown",
      citations: [],
    },
    agencyBackground: {
      agencyName: args.agency || "Unknown agency",
      sentimentScore: 3,
      commonComplaints: [],
      negotiationLeverage: "Public agency research is unavailable. Ask for written commitments before signing.",
      citations: [],
    },
  };
}

export default function ManualPage() {
  const router = useRouter();
  const {
    inspectionMode,
    address: draftAddress,
    agency: draftAgency,
    coordinates: draftCoordinates,
    propertyNotes: draftPropertyNotes,
    inspectionChecklist: draftInspectionChecklist,
    askingRent: draftAskingRent,
    beginInspection,
    updateInspectionDraft,
    manualSubmissionContext,
    setManualSubmissionContext,
    setIntelligence,
    setReportId,
  } = useSessionStore();
  const { addHazard, resetForRescan } = useHazardStore();

  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [address, setAddress] = useState(draftAddress);
  const [agency, setAgency] = useState(draftAgency);
  const [coordinates, setCoordinates] = useState<GeoPoint | null>(draftCoordinates);
  const [propertyNotes, setPropertyNotes] = useState(draftPropertyNotes);
  const [inspectionChecklist, setInspectionChecklist] = useState<InspectionChecklist | null>(draftInspectionChecklist);
  const [askingRent, setAskingRent] = useState(typeof draftAskingRent === "number" ? String(draftAskingRent) : "");
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "success" | "fallback" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const lastResolvedCoordinates = useRef<string | null>(null);

  useEffect(() => {
    if (inspectionMode !== "manual") {
      router.replace("/");
    }
  }, [inspectionMode, router]);

  useEffect(() => {
    return () => previewUrls.forEach(URL.revokeObjectURL);
  }, [previewUrls]);

  async function resolveAddressFromCoordinates(nextCoordinates: GeoPoint, force = false) {
    const coordinateKey = `${nextCoordinates.lat.toFixed(5)},${nextCoordinates.lng.toFixed(5)}`;
    if (!force && lastResolvedCoordinates.current === coordinateKey) {
      return;
    }

    lastResolvedCoordinates.current = coordinateKey;
    setLocationStatus("loading");

    try {
      const geocoded = await reverseGeocodeCoordinates(nextCoordinates);
      setCoordinates(nextCoordinates);
      setAddress(geocoded.formattedAddress);
      updateInspectionDraft({
        coordinates: nextCoordinates,
        address: geocoded.formattedAddress,
      });
      setLocationStatus(geocoded.provider === "fallback" ? "fallback" : "success");
    } catch (error) {
      setLocationStatus("error");
      toast.error(error instanceof Error ? error.message : "Failed to resolve address.");
    }
  }

  async function handleUseCurrentLocation() {
    setLocationStatus("loading");

    try {
      const nextCoordinates = await requestCurrentLocation();
      await resolveAddressFromCoordinates(nextCoordinates, true);
      toast.success("Current location applied.");
    } catch (error) {
      setLocationStatus("error");
      toast.error(error instanceof Error ? error.message : "Unable to access current location.");
    }
  }

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) {
      return;
    }

    const files = Array.from(event.target.files);
    if (images.length + files.length > MAX_IMAGE_COUNT) {
      toast.error(`Maximum ${MAX_IMAGE_COUNT} images allowed`);
      event.target.value = "";
      return;
    }

    const firstInvalidFile = files.find((file) => getImageValidationError(file) !== null);
    if (firstInvalidFile) {
      toast.error(getImageValidationError(firstInvalidFile) || "Unsupported file");
      event.target.value = "";
      return;
    }

    setManualSubmissionContext(null);
    setImages((current) => [...current, ...files]);
    setPreviewUrls((current) => [...current, ...files.map((file) => URL.createObjectURL(file))]);
    event.target.value = "";
  };

  const removeImage = (index: number) => {
    setManualSubmissionContext(null);
    setImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
    URL.revokeObjectURL(previewUrls[index]);
    setPreviewUrls((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleGenerateReport = async () => {
    if (images.length === 0) {
      toast.error("Please select at least 1 image");
      return;
    }

    if (!address.trim() && !coordinates) {
      toast.error("Please provide either an address or tap a location on the map");
      return;
    }

    setIsSubmitting(true);
    setProgressMsg("Preparing inspection details...");

    let preparedImages: Awaited<ReturnType<typeof prepareManualImages>> = [];

    try {
      let activeInspectionId = manualSubmissionContext?.inspectionId ?? null;
      let objectKeys = manualSubmissionContext?.objectKeys ?? [];
      let effectiveCoordinates = coordinates;
      let effectiveAddress = address.trim();
      const parsedAskingRent = askingRent ? Number(askingRent) : null;

      if (!manualSubmissionContext) {
        beginInspection({
          mode: "manual",
          address: effectiveAddress,
          agency: agency.trim(),
          coordinates,
          propertyNotes: propertyNotes.trim(),
          inspectionChecklist,
          askingRent: parsedAskingRent,
        });

        activeInspectionId = useSessionStore.getState().inspectionId;
      } else {
        updateInspectionDraft({
          mode: "manual",
          address: effectiveAddress,
          agency: agency.trim(),
          coordinates,
          propertyNotes: propertyNotes.trim(),
          inspectionChecklist,
          askingRent: parsedAskingRent,
        });
      }

      if (!activeInspectionId) {
        throw new Error("Failed to create inspection context.");
      }

      if (!manualSubmissionContext) {
        preparedImages = await prepareManualImages(images);
        const extractedCoordinates = preparedImages.find((item) => item.metadata)?.metadata ?? null;

        if (!effectiveCoordinates && extractedCoordinates) {
          effectiveCoordinates = extractedCoordinates;
          setCoordinates(extractedCoordinates);
          updateInspectionDraft({ coordinates: extractedCoordinates });

          if (!effectiveAddress) {
            const geocoded = await reverseGeocodeCoordinates(extractedCoordinates).catch(() => null);
            if (geocoded?.formattedAddress) {
              effectiveAddress = geocoded.formattedAddress;
              setAddress(geocoded.formattedAddress);
              updateInspectionDraft({ address: geocoded.formattedAddress });
            }
          }
        }

        setProgressMsg("Uploading images to secure storage...");
        const signResponse = await fetch(resolveApiUrl("/api/upload/sign"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionId: activeInspectionId,
            files: preparedImages.map((item) => ({
              fileName: item.file.name,
              contentType: item.file.type,
            })),
          }),
        });

        if (!signResponse.ok) {
          throw new Error("Failed to sign upload URLs.");
        }

        const signedPayload = signedUploadResponseSchema.parse(await signResponse.json());

        await Promise.all(
          signedPayload.uploads.map(async (upload, index) => {
            const response = await fetch(upload.uploadUrl, {
              method: "PUT",
              headers: {
                "Content-Type": preparedImages[index]?.file.type || "image/jpeg",
              },
              body: preparedImages[index]?.file,
            });

            if (!response.ok) {
              throw new Error(`Upload failed for image ${index + 1}.`);
            }
          })
        );

        objectKeys = signedPayload.uploads.map((upload) => upload.objectKey);
        setManualSubmissionContext({
          inspectionId: activeInspectionId,
          objectKeys,
        });
      }

      setProgressMsg("Analyzing property...");

      const [analysisResult, intelligenceResult] = await Promise.allSettled([
        fetch(resolveApiUrl("/api/analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionId: activeInspectionId,
            source: "manual",
            objectKeys,
            roomType: "unknown",
            context: {
              coordinates: effectiveCoordinates || undefined,
              propertyNotes: propertyNotes.trim() || undefined,
              uploadedImageCount: images.length,
            },
          }),
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error("Analyze request failed.");
          }

          return analyzeResponseSchema.parse(await response.json());
        }),
        fetch(resolveApiUrl("/api/intelligence"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionMode: "manual",
            depth: "fast",
            address: effectiveAddress || undefined,
            agency: agency.trim() || undefined,
            coordinates: effectiveCoordinates || undefined,
            propertyNotes: propertyNotes.trim() || undefined,
          }),
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error("Intelligence request failed.");
          }

          return intelligenceResponseSchema.parse(await response.json());
        }),
      ]);

      resetForRescan();

      const hazards: Hazard[] =
        analysisResult.status === "fulfilled" ? analysisResult.value.hazards : [];

      const intelligence =
        intelligenceResult.status === "fulfilled"
          ? intelligenceResult.value.intelligence
          : buildManualIntelligenceFallback({
              address: effectiveAddress,
              agency: agency.trim(),
              coordinates: effectiveCoordinates,
            });

      hazards.forEach((hazard) => addHazard(hazard));
      setIntelligence(intelligence);

      setProgressMsg("Generating report...");

      const reportId = crypto.randomUUID();
      const nextSnapshot: ReportSnapshot = {
        reportId,
        inspectionId: activeInspectionId,
        createdAt: Date.now(),
        inputs: {
          mode: "manual",
          address: effectiveAddress || undefined,
          agency: agency.trim() || undefined,
          coordinates: effectiveCoordinates || undefined,
          propertyNotes: propertyNotes.trim() || undefined,
          inspectionChecklist: inspectionChecklist || undefined,
        },
        hazards,
        intelligence,
        propertyRiskScore: calculatePropertyRiskScore(hazards),
        askingRent: parsedAskingRent || undefined,
        lightingScoreAuto:
          analysisResult.status === "fulfilled" ? analysisResult.value.lightingScoreAuto : undefined,
        exportAssets:
          analysisResult.status === "fulfilled" ? analysisResult.value.exportAssets : undefined,
      };

      const normalizedSnapshot = normalizeReportSnapshot(nextSnapshot);
      await saveReportSnapshot(normalizedSnapshot);
      await saveSearchHistory({
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        type: "manual",
        label: `${normalizedSnapshot.inputs.address || "Manual report"} · ${normalizedSnapshot.inputs.agency || "Unknown agency"}`,
        payload: {
          address: normalizedSnapshot.inputs.address,
          agency: normalizedSnapshot.inputs.agency,
          coordinates: normalizedSnapshot.inputs.coordinates,
          propertyNotes: normalizedSnapshot.inputs.propertyNotes,
          inspectionChecklist: normalizedSnapshot.inputs.inspectionChecklist,
        },
      });
      setReportId(reportId);
      toast.success("Manual report is ready.");
      router.push(`/report/${reportId}`);
    } catch (error: unknown) {
      toast.error("Failed to generate report: " + getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
      preparedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-background p-4 pb-20">
      <div className="mb-6 flex items-center gap-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          &larr; Back
        </Button>
        <h1 className="text-xl font-bold tracking-tight">Manual Upload</h1>
      </div>

      <div className="space-y-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>1. Photos</CardTitle>
            <CardDescription>Upload 1 to 8 photos for hazard analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {previewUrls.map((url, idx) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                  <Image src={url} alt={`Preview ${idx}`} fill unoptimized className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-destructive group-hover:opacity-100"
                  >
                    &times;
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGE_COUNT ? (
                <label className="group relative flex aspect-square cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-border transition hover:border-accent/50 hover:bg-muted/50">
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={handleImageChange}
                  />
                  <span className="text-2xl text-muted-foreground group-hover:text-accent">+</span>
                </label>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>2. Location</CardTitle>
            <CardDescription>Required for neighborhood intelligence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Address</label>
              <Input
                placeholder="e.g. 15 Dandenong Rd, Clayton"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleUseCurrentLocation}>
                  {locationStatus === "loading" ? "Locating..." : "Use Current Location"}
                </Button>
                {locationStatus !== "idle" ? (
                  <span className="text-xs text-muted-foreground">Address lookup: {locationStatus}</span>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Or Pick on Map</label>
              <MapPicker
                onLocationSelect={(nextCoordinates) => {
                  void resolveAddressFromCoordinates(nextCoordinates, true);
                }}
                initialLocation={coordinates}
              />
              {coordinates ? (
                <p className="mt-1 text-xs text-accent text-muted-foreground">
                  Selected: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>3. Extra Details (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Real Estate Agency</label>
              <Input placeholder="e.g. Ray White Clayton" value={agency} onChange={(event) => setAgency(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Weekly Rent</label>
              <Input
                inputMode="numeric"
                placeholder="e.g. 620"
                value={askingRent}
                onChange={(event) => setAskingRent(event.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Property Notes</label>
              <textarea
                placeholder="e.g. Top-floor apartment, visible wall stain near the window."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={propertyNotes}
                onChange={(event) => setPropertyNotes(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Inspection Checklist & Entry Notes</label>
              <p className="text-xs text-muted-foreground">
                Record utilities, locks, noise, kitchen and bathroom tests, lease terms, building management, pests,
                and entry-condition evidence.
              </p>
              <InspectionChecklistEditor
                value={inspectionChecklist}
                onChange={(nextChecklist) => {
                  setInspectionChecklist(nextChecklist);
                  updateInspectionDraft({ inspectionChecklist: nextChecklist });
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent/90"
          disabled={isSubmitting}
          onClick={handleGenerateReport}
        >
          {isSubmitting ? progressMsg : "Generate Report"}
        </Button>
      </div>
    </div>
  );
}
