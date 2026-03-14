"use client";

import { useMemo, useState } from "react";
import type { RoomScene3D, RoomSceneFurniture, RoomSceneMarker, RoomSceneOpening, RoomSceneSurfaceId } from "@inspect-ai/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Point2D {
  x: number;
  y: number;
}

const VIEWBOX_WIDTH = 420;
const VIEWBOX_HEIGHT = 320;
const SURFACE_LABELS: Record<RoomSceneSurfaceId, string> = {
  "back-wall": "Back wall",
  "left-wall": "Left wall",
  "right-wall": "Right wall",
  floor: "Floor",
  ceiling: "Ceiling",
};

function getSeverityColor(severity?: RoomSceneMarker["severity"]) {
  switch (severity) {
    case "Critical":
      return "#ff5b76";
    case "High":
      return "#fb923c";
    case "Medium":
      return "#facc15";
    case "Low":
      return "#34d399";
    default:
      return "#7dd3fc";
  }
}

function projectPoint(point: Point3D, scene: RoomScene3D, yawDeg: number, pitchDeg: number): Point2D {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const { width, depth, height } = scene.dimensionsApprox;

  const centered = {
    x: point.x - width / 2,
    y: point.y - height / 2,
    z: point.z - depth / 2,
  };

  const x1 = centered.x * Math.cos(yaw) + centered.z * Math.sin(yaw);
  const z1 = -centered.x * Math.sin(yaw) + centered.z * Math.cos(yaw);
  const y1 = centered.y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = centered.y * Math.sin(pitch) + z1 * Math.cos(pitch);

  const scale = 56;
  const perspective = 1 + z2 / Math.max(width, depth, height) / 7;

  return {
    x: VIEWBOX_WIDTH / 2 + (x1 * scale) / perspective,
    y: VIEWBOX_HEIGHT / 2 - (y1 * scale) / perspective + 18,
  };
}

function toPolygon(points: Point2D[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function getSurfacePoints(scene: RoomScene3D, surfaceId: RoomSceneSurfaceId): Point3D[] {
  const { width, depth, height } = scene.dimensionsApprox;

  switch (surfaceId) {
    case "back-wall":
      return [
        { x: 0, y: 0, z: depth },
        { x: width, y: 0, z: depth },
        { x: width, y: height, z: depth },
        { x: 0, y: height, z: depth },
      ];
    case "left-wall":
      return [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: depth },
        { x: 0, y: height, z: depth },
        { x: 0, y: height, z: 0 },
      ];
    case "right-wall":
      return [
        { x: width, y: 0, z: depth },
        { x: width, y: 0, z: 0 },
        { x: width, y: height, z: 0 },
        { x: width, y: height, z: depth },
      ];
    case "floor":
      return [
        { x: 0, y: 0, z: 0 },
        { x: width, y: 0, z: 0 },
        { x: width, y: 0, z: depth },
        { x: 0, y: 0, z: depth },
      ];
    case "ceiling":
      return [
        { x: 0, y: height, z: depth },
        { x: width, y: height, z: depth },
        { x: width, y: height, z: 0 },
        { x: 0, y: height, z: 0 },
      ];
  }
}

function getMarkerPoint(scene: RoomScene3D, marker: RoomSceneMarker): Point3D {
  const { width, depth, height } = scene.dimensionsApprox;

  switch (marker.surfaceId) {
    case "back-wall":
      return { x: marker.x * width, y: height - marker.y * height, z: depth };
    case "left-wall":
      return { x: 0, y: height - marker.y * height, z: marker.x * depth };
    case "right-wall":
      return { x: width, y: height - marker.y * height, z: (1 - marker.x) * depth };
    case "floor":
      return { x: marker.x * width, y: 0, z: (1 - marker.y) * depth };
    case "ceiling":
      return { x: marker.x * width, y: height, z: marker.y * depth };
  }
}

function getOpeningPoints(scene: RoomScene3D, opening: RoomSceneOpening): Point3D[] {
  const { width, depth, height } = scene.dimensionsApprox;
  const x0 = opening.x;
  const y0 = opening.y;
  const x1 = opening.x + opening.width;
  const y1 = opening.y + opening.height;

  switch (opening.surfaceId) {
    case "back-wall":
      return [
        { x: x0 * width, y: height - y1 * height, z: depth },
        { x: x1 * width, y: height - y1 * height, z: depth },
        { x: x1 * width, y: height - y0 * height, z: depth },
        { x: x0 * width, y: height - y0 * height, z: depth },
      ];
    case "left-wall":
      return [
        { x: 0, y: height - y1 * height, z: x0 * depth },
        { x: 0, y: height - y1 * height, z: x1 * depth },
        { x: 0, y: height - y0 * height, z: x1 * depth },
        { x: 0, y: height - y0 * height, z: x0 * depth },
      ];
    case "right-wall":
      return [
        { x: width, y: height - y1 * height, z: (1 - x0) * depth },
        { x: width, y: height - y1 * height, z: (1 - x1) * depth },
        { x: width, y: height - y0 * height, z: (1 - x1) * depth },
        { x: width, y: height - y0 * height, z: (1 - x0) * depth },
      ];
    default:
      return [];
  }
}

function getFurniturePoints(scene: RoomScene3D, furniture: RoomSceneFurniture): Point3D[] {
  const { width, depth } = scene.dimensionsApprox;
  const x0 = furniture.x * width;
  const z0 = furniture.y * depth;
  const x1 = (furniture.x + furniture.width) * width;
  const z1 = (furniture.y + furniture.depth) * depth;

  return [
    { x: x0, y: 0, z: z0 },
    { x: x1, y: 0, z: z0 },
    { x: x1, y: 0, z: z1 },
    { x: x0, y: 0, z: z1 },
  ];
}

export function RoomSceneViewer({
  scene,
  className,
  editable = false,
  onSceneChange,
  onPromoteSuggestedMarker,
}: {
  scene: RoomScene3D;
  className?: string;
  editable?: boolean;
  onSceneChange?: (scene: RoomScene3D) => void;
  onPromoteSuggestedMarker?: (marker: RoomSceneMarker) => void;
}) {
  const [rotationY, setRotationY] = useState(scene.previewRotation?.y ?? -28);
  const [rotationX] = useState(scene.previewRotation?.x ?? 18);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(scene.markers[0]?.markerId ?? null);

  const selectedMarker = useMemo(
    () => scene.markers.find((marker) => marker.markerId === selectedMarkerId) ?? scene.markers[0] ?? null,
    [scene.markers, selectedMarkerId]
  );

  const sideOrder = rotationY <= 0 ? (["right-wall", "back-wall", "left-wall"] as const) : (["left-wall", "back-wall", "right-wall"] as const);
  const surfaceOrder = (["ceiling", ...sideOrder, "floor"] as const).filter(
    (surfaceId) => surfaceId === "ceiling" || surfaceId === "floor" || sideOrder.includes(surfaceId as typeof sideOrder[number])
  );

  function updateSelectedMarker(mutator: (marker: RoomSceneMarker) => RoomSceneMarker) {
    if (!selectedMarker || !onSceneChange) {
      return;
    }

    onSceneChange({
      ...scene,
      markers: scene.markers.map((marker) =>
        marker.markerId === selectedMarker.markerId ? mutator(marker) : marker
      ),
    });
  }

  function nudgeMarker(axis: "x" | "y", delta: number) {
    updateSelectedMarker((marker) => ({
      ...marker,
      [axis]: Math.max(0.04, Math.min(0.96, marker[axis] + delta)),
    }));
  }

  function cycleSurface(direction: 1 | -1) {
    if (!selectedMarker) {
      return;
    }

    const surfaces: RoomSceneSurfaceId[] = ["back-wall", "left-wall", "right-wall", "floor", "ceiling"];
    const currentIndex = surfaces.indexOf(selectedMarker.surfaceId);
    const nextIndex = (currentIndex + direction + surfaces.length) % surfaces.length;

    updateSelectedMarker((marker) => ({
      ...marker,
      surfaceId: surfaces[nextIndex] ?? marker.surfaceId,
      x: 0.5,
      y: 0.5,
    }));
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{scene.title}</div>
          <div className="text-xs text-muted-foreground">{scene.coverageSummary ?? "Approximate room scene generated from guided captures."}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setRotationY((value) => Math.max(-50, value - 10))}>
            Rotate Left
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRotationY(scene.previewRotation?.y ?? -28)}>
            Reset
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRotationY((value) => Math.min(50, value + 10))}>
            Rotate Right
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-[radial-gradient(circle_at_top,_rgba(95,197,255,0.12),_transparent_36%),linear-gradient(180deg,_rgba(12,18,28,0.96),_rgba(7,10,16,1))] p-4">
        <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-[320px] w-full">
          {surfaceOrder.map((surfaceId) => {
            const polygon = getSurfacePoints(scene, surfaceId).map((point) =>
              projectPoint(point, scene, rotationY, rotationX)
            );

            const fill =
              surfaceId === "floor"
                ? "rgba(80, 118, 158, 0.46)"
                : surfaceId === "ceiling"
                  ? "rgba(65, 96, 138, 0.26)"
                  : surfaceId === "back-wall"
                    ? "rgba(28, 50, 74, 0.92)"
                    : "rgba(22, 38, 56, 0.86)";

            return (
              <g key={surfaceId}>
                <polygon points={toPolygon(polygon)} fill={fill} stroke="rgba(132, 164, 196, 0.38)" strokeWidth={1.2} />
                <text x={polygon[0].x + 8} y={polygon[0].y + 18} fill="rgba(205, 223, 242, 0.64)" fontSize="10">
                  {SURFACE_LABELS[surfaceId]}
                </text>
              </g>
            );
          })}

          {scene.openings?.map((opening) => {
            const polygon = getOpeningPoints(scene, opening).map((point) =>
              projectPoint(point, scene, rotationY, rotationX)
            );

            return (
              <g key={opening.id}>
                <polygon points={toPolygon(polygon)} fill="rgba(143, 196, 255, 0.22)" stroke="rgba(143, 196, 255, 0.52)" strokeWidth={1} />
                {opening.label ? (
                  <text x={polygon[0].x + 6} y={polygon[0].y + 14} fill="rgba(191, 227, 255, 0.88)" fontSize="9">
                    {opening.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          {scene.furniture?.map((furniture) => {
            const polygon = getFurniturePoints(scene, furniture).map((point) =>
              projectPoint(point, scene, rotationY, rotationX)
            );

            return (
              <g key={furniture.id}>
                <polygon points={toPolygon(polygon)} fill="rgba(210, 174, 116, 0.18)" stroke="rgba(210, 174, 116, 0.42)" strokeWidth={1} />
                <text x={polygon[0].x + 6} y={polygon[0].y - 4} fill="rgba(255, 230, 192, 0.82)" fontSize="9">
                  {furniture.label}
                </text>
              </g>
            );
          })}

          {scene.markers.map((marker, index) => {
            const point = projectPoint(getMarkerPoint(scene, marker), scene, rotationY, rotationX);
            const color = getSeverityColor(marker.severity);

            return (
              <g
                key={marker.markerId}
                className="cursor-pointer"
                onClick={() => setSelectedMarkerId(marker.markerId)}
              >
                <circle cx={point.x} cy={point.y} r={selectedMarkerId === marker.markerId ? 10 : 7} fill={color} fillOpacity={0.9} stroke="white" strokeWidth={1.5} />
                <text x={point.x} y={point.y + 3} textAnchor="middle" fill="#08111b" fontSize="9" fontWeight={700}>
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {scene.captureStepsCompleted.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {scene.captureStepsCompleted.map((stepId) => (
            <Badge key={stepId} variant="outline" className="border-border/70 text-muted-foreground">
              {stepId}
            </Badge>
          ))}
        </div>
      ) : null}

      {selectedMarker ? (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-transparent bg-accent/15 text-accent">{selectedMarker.label}</Badge>
            {selectedMarker.severity ? (
              <Badge variant="outline" className="border-border/70 text-foreground">
                {selectedMarker.severity}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {SURFACE_LABELS[selectedMarker.surfaceId]}
            </Badge>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">{selectedMarker.summary}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {selectedMarker.confidence ? <span>Confidence: {selectedMarker.confidence}</span> : null}
            {selectedMarker.source ? <span>Source: {selectedMarker.source}</span> : null}
          </div>
          {selectedMarker.source === "suggested" && onPromoteSuggestedMarker ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onPromoteSuggestedMarker(selectedMarker)}>
                Add to report
              </Button>
              <div className="self-center text-xs text-muted-foreground">
                Promote this suggested hotspot into the formal hazard list.
              </div>
            </div>
          ) : null}
          {editable ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-border/70 bg-card/60 p-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Adjust Marker
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => cycleSurface(-1)}>
                  Previous surface
                </Button>
                <Button size="sm" variant="outline" onClick={() => cycleSurface(1)}>
                  Next surface
                </Button>
              </div>
              <div className="grid max-w-xs grid-cols-3 gap-2">
                <div />
                <Button size="sm" variant="outline" onClick={() => nudgeMarker("y", -0.06)}>
                  Up
                </Button>
                <div />
                <Button size="sm" variant="outline" onClick={() => nudgeMarker("x", -0.06)}>
                  Left
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  updateSelectedMarker((marker) => ({ ...marker, x: 0.5, y: 0.5 }));
                }}>
                  Center
                </Button>
                <Button size="sm" variant="outline" onClick={() => nudgeMarker("x", 0.06)}>
                  Right
                </Button>
                <div />
                <Button size="sm" variant="outline" onClick={() => nudgeMarker("y", 0.06)}>
                  Down
                </Button>
                <div />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
          No confirmed issues are mapped into this room scene yet.
        </div>
      )}
    </div>
  );
}
