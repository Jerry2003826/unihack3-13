"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Hazard, PropertyIntelligence, ReportSnapshot } from "@inspect-ai/contracts";
import {
  analyzeResponseSchema,
  intelligenceResponseSchema,
  signedUploadResponseSchema,
} from "@inspect-ai/contracts";
import dynamic from "next/dynamic";
import { publicAppConfig } from "@/lib/config/public";
import { prepareManualImages } from "@/lib/images/prepareManualImages";
import { saveReportSnapshot } from "@/lib/report-snapshot/reportSnapshotStore";
import { calculatePropertyRiskScore } from "@/lib/scoring";
import { useHazardStore } from "@/store/useHazardStore";
import { useSessionStore } from "@/store/useSessionStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import type { GeoPoint } from "@inspect-ai/contracts";

const MapPicker = dynamic(() => import("@/components/manual/ManualMapPicker").then(mod => mod.ManualMapPicker), { ssr: false, loading: () => <div className="w-full h-48 bg-muted animate-pulse rounded-md" /> });
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
  
  const [address, setAddress] = useState("");
  const [agency, setAgency] = useState("");
  const [coordinates, setCoordinates] = useState<GeoPoint | null>(null);
  const [propertyNotes, setPropertyNotes] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");

  useEffect(() => {
    if (inspectionMode !== "manual") {
      router.replace("/");
    }
  }, [inspectionMode, router]);

  useEffect(() => {
    return () => previewUrls.forEach(URL.revokeObjectURL);
  }, [previewUrls]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (images.length + files.length > MAX_IMAGE_COUNT) {
      toast.error(`Maximum ${MAX_IMAGE_COUNT} images allowed`);
      e.target.value = "";
      return;
    }

    const firstInvalidFile = files.find((file) => getImageValidationError(file) !== null);
    if (firstInvalidFile) {
      toast.error(getImageValidationError(firstInvalidFile) || "Unsupported file");
      e.target.value = "";
      return;
    }
    
    setManualSubmissionContext(null);
    setImages(prev => [...prev, ...files]);
    const newUrls = files.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => [...prev, ...newUrls]);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setManualSubmissionContext(null);
    setImages(prev => prev.filter((_, i) => i !== index));
    URL.revokeObjectURL(previewUrls[index]);
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
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

      if (!manualSubmissionContext) {
        beginInspection({
          mode: "manual",
          address: address.trim(),
          agency: agency.trim(),
          coordinates,
          propertyNotes: propertyNotes.trim(),
        });

        const sessionAfterBegin = useSessionStore.getState();
        activeInspectionId = sessionAfterBegin.inspectionId;
      } else {
        updateInspectionDraft({
          mode: "manual",
          address: address.trim(),
          agency: agency.trim(),
          coordinates,
          propertyNotes: propertyNotes.trim(),
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
            address: address.trim() || undefined,
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
              address: address.trim(),
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
          address: address.trim() || undefined,
          agency: agency.trim() || undefined,
          coordinates: effectiveCoordinates || undefined,
          propertyNotes: propertyNotes.trim() || undefined,
        },
        hazards,
        intelligence,
        propertyRiskScore: calculatePropertyRiskScore(hazards),
        exportAssets:
          analysisResult.status === "fulfilled" ? analysisResult.value.exportAssets : undefined,
      };

      await saveReportSnapshot(nextSnapshot);
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
    <div className="min-h-screen bg-background p-4 pb-20 max-w-2xl mx-auto">
       <div className="flex items-center gap-4 mb-6 pt-4">
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
             <div className="grid grid-cols-4 gap-2 mb-4">
               {previewUrls.map((url, idx) => (
                 <div key={url} className="relative aspect-square rounded-md overflow-hidden bg-muted group border border-border">
                   <Image src={url} alt={`Preview ${idx}`} fill unoptimized className="object-cover" />
                   <button
                     type="button"
                     onClick={() => removeImage(idx)}
                     className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
                   >
                     &times;
                   </button>
                 </div>
               ))}
               {images.length < 8 && (
                 <label className="aspect-square rounded-md border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50 hover:border-accent/50 transition relative group">
                   <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageChange} />
                   <span className="text-muted-foreground text-2xl group-hover:text-accent">+</span>
                 </label>
               )}
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
               <Input placeholder="e.g. 15 Dandenong Rd, Clayton" value={address} onChange={e => setAddress(e.target.value)} />
             </div>
             
             <div className="space-y-2">
               <label className="text-sm font-medium">Or Pick on Map</label>
               <MapPicker onLocationSelect={setCoordinates} initialLocation={coordinates} />
               {coordinates && (
                 <p className="text-xs text-muted-foreground mt-1 text-accent">
                   Selected: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                 </p>
               )}
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
               <Input placeholder="e.g. Ray White Clayton" value={agency} onChange={e => setAgency(e.target.value)} />
             </div>
             <div className="space-y-2">
               <label className="text-sm font-medium">Property Notes</label>
               <textarea 
                 placeholder="e.g. Top-floor apartment, visible wall stain near the window." 
                 className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                 value={propertyNotes} 
                 onChange={e => setPropertyNotes(e.target.value)} 
               />
             </div>
           </CardContent>
         </Card>
         
         <Button 
           size="lg" 
           className="w-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20" 
           disabled={isSubmitting} 
           onClick={handleGenerateReport}
         >
           {isSubmitting ? progressMsg : "Generate Report"}
         </Button>
       </div>
    </div>
  );
}
