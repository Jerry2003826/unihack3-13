"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import type {
  Hazard,
  ReconstructRoom3DResponse,
  RoomSceneCapture,
  RoomScene3D,
  RoomType,
} from "@inspect-ai/contracts";
import {
  formatRoomTypeLabel,
  reconstructRoom3DResponseSchema,
} from "@inspect-ai/contracts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RoomSceneViewer } from "@/components/scanner/RoomSceneViewer";
import { promoteSuggestedMarkerToHazard, replaceSceneMarker } from "@/lib/roomSceneHazards";
import {
  buildRoomScene3D,
  buildRoomSceneCapturePlaceholder,
  canGenerateRoomScene,
  getRoomScene3DCapturePlan,
} from "@/lib/roomScene3d";
import { publicAppConfig } from "@/lib/config/public";
import { cn } from "@/lib/utils";
import { Camera, Sparkles } from "lucide-react";

interface RoomScene3DDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string | null;
  roomType: RoomType;
  isDemoMode: boolean;
  captureFrame: () => string | null;
  hazards: Hazard[];
  liveEvidenceFrames: Record<string, string>;
  existingScene?: RoomScene3D | null;
  onSceneReady: (scene: RoomScene3D) => void;
  onPromoteSuggestedHazard: (hazard: Hazard, thumbnailBase64?: string) => boolean;
}

function getHazardsForRoom(hazards: Hazard[], roomType: RoomType) {
  const exact = hazards.filter((hazard) => hazard.roomType === roomType);
  return exact.length > 0 ? exact : hazards.filter((hazard) => hazard.roomType === "unknown");
}

export function RoomScene3DDialog({
  open,
  onOpenChange,
  inspectionId,
  roomType,
  isDemoMode,
  captureFrame,
  hazards,
  liveEvidenceFrames,
  existingScene,
  onSceneReady,
  onPromoteSuggestedHazard,
}: RoomScene3DDialogProps) {
  const plan = useMemo(() => getRoomScene3DCapturePlan(roomType), [roomType]);
  const [captures, setCaptures] = useState<Partial<Record<string, RoomSceneCapture>>>({});
  const [selectedStepId, setSelectedStepId] = useState<string>(plan[0]?.id ?? "entry-view");
  const [generatedScene, setGeneratedScene] = useState<RoomScene3D | null>(existingScene ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const stepButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selectedStep = plan.find((step) => step.id === selectedStepId) ?? plan[0];
  const hasRequiredCaptures = canGenerateRoomScene(captures, roomType);
  const roomHazards = getHazardsForRoom(hazards, roomType);
  const selectedCapture = selectedStep ? captures[selectedStep.id] : undefined;
  const capturedCount = Object.keys(captures).length;
  const orderedCaptures = plan
    .map((step) => captures[step.id])
    .filter((capture): capture is RoomSceneCapture => Boolean(capture));
  const latestCapture = orderedCaptures[orderedCaptures.length - 1];
  const previewCapture = selectedCapture ?? latestCapture;
  const previewLabel = selectedCapture ? selectedStep?.label : latestCapture?.label;

  function resolveApiUrl(path: string) {
    return publicAppConfig.apiBaseUrl ? `${publicAppConfig.apiBaseUrl}${path}` : path;
  }

  function focusStep(stepId: string) {
    setSelectedStepId(stepId);
    requestAnimationFrame(() => {
      stepButtonRefs.current[stepId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  const handleCapture = () => {
    if (!selectedStep) {
      return;
    }

    const frame = captureFrame() || (isDemoMode ? buildRoomSceneCapturePlaceholder(selectedStep.label) : null);
    if (!frame) {
      toast.error("Start the camera first, or use demo mode for placeholder captures.");
      return;
    }

    setCaptures((current) => ({
      ...current,
      [selectedStep.id]: {
        stepId: selectedStep.id,
        label: selectedStep.label,
        frameDataUrl: frame,
        capturedAt: Date.now(),
      },
    }));
    setGeneratedScene(null);

    const nextStep = plan.find((step) => step.id !== selectedStep.id && !captures[step.id]);
    if (nextStep) {
      focusStep(nextStep.id);
    }

    toast.success(`${selectedStep.label} captured`);
  };

  const handleGenerate = async () => {
    if (!hasRequiredCaptures) {
      toast.error("Capture the required room views before generating the 3D scene.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch(resolveApiUrl("/api/scan/3d/reconstruct"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: inspectionId || crypto.randomUUID(),
          roomType,
          captures: Object.values(captures),
          existingHazards: hazards,
        }),
      });

      if (!response.ok) {
        throw new Error(`3D reconstruct request failed with ${response.status}`);
      }

      const payload: ReconstructRoom3DResponse = reconstructRoom3DResponseSchema.parse(await response.json());
      setGeneratedScene(payload.scene);
      onSceneReady(payload.scene);
      toast.success(`${formatRoomTypeLabel(roomType)} 3D scene added to this inspection`);
    } catch (error) {
      console.warn("3D reconstruct API fallback", error);
      const fallbackScene = buildRoomScene3D({
        roomType,
        captures,
        hazards,
        liveEvidenceFrames,
      });
      setGeneratedScene(fallbackScene);
      onSceneReady(fallbackScene);
      toast.info("Using a local 3D demo fallback while scene reconstruction is unavailable.");
    } finally {
      setIsGenerating(false);
    }
  };

  function getFallbackThumbnail() {
    return captures["issue-closeup"]?.frameDataUrl ?? captures[selectedStepId]?.frameDataUrl ?? Object.values(captures)[0]?.frameDataUrl;
  }

  function handlePromoteSuggestedMarker(marker: RoomScene3D["markers"][number]) {
    if (!generatedScene || marker.source !== "suggested") {
      return;
    }

    const promotion = promoteSuggestedMarkerToHazard({
      marker,
      roomType,
      fallbackThumbnailBase64: getFallbackThumbnail(),
    });
    const added = onPromoteSuggestedHazard(promotion.hazard, promotion.thumbnailBase64);

    if (!added) {
      toast.info("A very similar issue is already in the report.");
      return;
    }

    const nextScene = replaceSceneMarker(generatedScene, marker.markerId, promotion.nextMarker);
    setGeneratedScene(nextScene);
    onSceneReady(nextScene);
    toast.success("Suggested issue added to the report.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-[92vh] max-w-6xl overflow-hidden p-0 sm:max-w-6xl" showCloseButton>
        <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-r border-border/70 bg-card/70">
            <div className="shrink-0 p-5 pb-0">
            <DialogHeader>
              <DialogTitle>3D Scan Studio</DialogTitle>
              <DialogDescription>
                Capture a few guided room angles, then generate an approximate 3D room view for the report.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border/70 text-foreground">
                {formatRoomTypeLabel(roomType)}
              </Badge>
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                {capturedCount}/{plan.length} captures
              </Badge>
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                Hazards mapped: {roomHazards.length}
              </Badge>
            </div>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-5 pb-5 pr-4">
              <div className="space-y-3">
              {plan.map((step) => {
                const captured = Boolean(captures[step.id]);
                return (
                  <button
                    type="button"
                    key={step.id}
                    ref={(node) => {
                      stepButtonRefs.current[step.id] = node;
                    }}
                    onClick={() => focusStep(step.id)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                      selectedStepId === step.id
                        ? "border-accent/70 bg-accent/10"
                        : "border-border/70 bg-muted/20 hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{step.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{step.instructions}</div>
                      </div>
                      <Badge variant={captured ? "default" : "outline"} className={captured ? "bg-accent text-accent-foreground" : "border-border/70 text-muted-foreground"}>
                        {captured ? "Captured" : step.optional ? "Optional" : "Required"}
                      </Badge>
                    </div>
                  </button>
                );
              })}
              </div>

              <div className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Capture preview
                </div>
                <div className="mt-3 text-sm font-medium text-foreground">
                  {previewLabel ?? selectedStep?.label ?? "Capture step"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {previewCapture
                    ? "Showing the most recent captured room view."
                    : selectedStep?.instructions ?? "Select a capture step."}
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-black/40">
                  {previewCapture?.frameDataUrl ? (
                    <Image
                      src={previewCapture.frameDataUrl}
                      alt={`${previewLabel ?? "Captured view"} preview`}
                      width={640}
                      height={360}
                      unoptimized
                      className="h-44 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-44 items-center justify-center px-4 text-center text-xs text-muted-foreground">
                      No photo captured for this step yet. Frame the requested area, then use the button below.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-background">
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {generatedScene ? (
                <RoomSceneViewer
                  scene={generatedScene}
                  editable
                  onSceneChange={(nextScene) => {
                    setGeneratedScene(nextScene);
                    onSceneReady(nextScene);
                  }}
                  onPromoteSuggestedMarker={handlePromoteSuggestedMarker}
                />
              ) : previewCapture?.frameDataUrl ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-3xl border border-border/70 bg-muted/10">
                    <Image
                      src={previewCapture.frameDataUrl}
                      alt={`${previewLabel ?? "Captured room view"} large preview`}
                      width={1280}
                      height={720}
                      unoptimized
                      className="h-[52vh] w-full object-cover"
                    />
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-sm font-medium text-foreground">
                      Latest capture: {previewLabel ?? "Captured room view"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Keep capturing the remaining guided angles, then use Generate 3D Demo to build the room scene.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[60vh] flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/10 px-6 text-center">
                  <div className="text-lg font-medium text-foreground">3D preview will appear here</div>
                  <div className="mt-2 max-w-xl text-sm text-muted-foreground">
                    Capture the guided room views on the left. This demo uses your current inspection hazards and room type to build an approximate 3D room view with issue markers.
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border/70 bg-background/95 p-5 backdrop-blur">
              <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">
                      {selectedStep?.label ?? "Capture step"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedStep?.instructions ?? "Select a capture step."}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="sm:min-w-[180px]" onClick={handleCapture}>
                      <Camera className="mr-2 size-4" />
                      Take Photo
                    </Button>
                    <Button
                      className="sm:min-w-[180px]"
                      variant="outline"
                      onClick={() => void handleGenerate()}
                      disabled={!hasRequiredCaptures || isGenerating}
                    >
                      <Sparkles className="mr-2 size-4" />
                      {isGenerating ? "Generating..." : "Generate 3D Demo"}
                    </Button>
                  </div>
                </div>
                {!hasRequiredCaptures ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Capture all required views before generating the room scene.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
