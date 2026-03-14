import type {
  Hazard,
  RoomScene3D,
  RoomSceneCapture,
  RoomSceneFurniture,
  RoomSceneMarker,
  RoomSceneOpening,
  RoomType,
} from "@inspect-ai/contracts";
import { formatRoomTypeLabel } from "@inspect-ai/contracts";

export interface RoomSceneCaptureStep {
  id: string;
  label: string;
  instructions: string;
  optional?: boolean;
}

const DEFAULT_ROTATION = { x: 18, y: -28 };

const ROOM_DIMENSIONS: Record<RoomType, { width: number; depth: number; height: number }> = {
  bathroom: { width: 2.2, depth: 2.8, height: 2.5 },
  bedroom: { width: 3.6, depth: 4.2, height: 2.6 },
  kitchen: { width: 3.0, depth: 3.4, height: 2.6 },
  "living-room": { width: 5.2, depth: 4.8, height: 2.7 },
  laundry: { width: 2.1, depth: 2.5, height: 2.5 },
  balcony: { width: 2.0, depth: 3.2, height: 2.6 },
  hallway: { width: 1.6, depth: 4.4, height: 2.6 },
  unknown: { width: 3.5, depth: 3.8, height: 2.6 },
};

const ROOM_CAPTURE_STEPS: Record<RoomType, RoomSceneCaptureStep[]> = {
  bathroom: [
    { id: "entry-view", label: "Entry view", instructions: "Capture the full bathroom from the doorway." },
    { id: "wet-zone", label: "Shower and seals", instructions: "Capture the shower screen, silicone edges, and nearby wall corners." },
    { id: "vanity", label: "Vanity and mirror", instructions: "Capture the vanity base, mirror, and sink joins." },
    { id: "ceiling-line", label: "Ceiling line", instructions: "Capture the ceiling corners and exhaust area." },
    { id: "floor-and-drain", label: "Floor and drain", instructions: "Capture the floor drain, lower tiles, and skirting." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible bathroom issue close-up.", optional: true },
  ],
  bedroom: [
    { id: "entry-view", label: "Entry view", instructions: "Capture the room from the doorway or widest corner." },
    { id: "window-wall", label: "Window wall", instructions: "Capture the window, seals, and curtain edges." },
    { id: "storage-wall", label: "Wardrobe and storage", instructions: "Capture wardrobe bases, shelving, and floor edges." },
    { id: "desk-zone", label: "Desk and outlets", instructions: "Capture the desk wall, power points, and usable workspace." },
    { id: "ceiling-line", label: "Ceiling line", instructions: "Capture upper corners and ceiling transitions." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible bedroom issue close-up.", optional: true },
  ],
  kitchen: [
    { id: "entry-view", label: "Entry view", instructions: "Capture the whole kitchen from the entry angle." },
    { id: "sink-joins", label: "Sink joins", instructions: "Capture sink joins, splashback, and the cabinet base." },
    { id: "cooktop-zone", label: "Cooktop and rangehood", instructions: "Capture the cooktop, rangehood, and heat-prone surfaces." },
    { id: "fridge-wall", label: "Fridge and outlet wall", instructions: "Capture fridge space, outlets, and nearby floor edges." },
    { id: "ceiling-line", label: "Ceiling line", instructions: "Capture upper cupboards and ceiling corners." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible kitchen issue close-up.", optional: true },
  ],
  "living-room": [
    { id: "entry-view", label: "Entry view", instructions: "Capture the room from the main entry angle." },
    { id: "window-or-balcony", label: "Window or balcony", instructions: "Capture the main window or balcony door and seals." },
    { id: "seating-zone", label: "Seating zone", instructions: "Capture the main living area and furniture layout." },
    { id: "floor-and-skirting", label: "Floor and skirting", instructions: "Capture floor edges, skirting, and thresholds." },
    { id: "ceiling-line", label: "Ceiling line", instructions: "Capture the ceiling corners and wall joins." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible living room issue close-up.", optional: true },
  ],
  laundry: [
    { id: "entry-view", label: "Entry view", instructions: "Capture the whole laundry from the doorway." },
    { id: "appliance-zone", label: "Appliance zone", instructions: "Capture washer, dryer, and their connections." },
    { id: "taps-and-drain", label: "Taps and drain", instructions: "Capture taps, drain, and lower floor area." },
    { id: "cabinet-edge", label: "Cabinet edges", instructions: "Capture cabinetry, skirting, and moisture-prone corners." },
    { id: "ceiling-line", label: "Ceiling line", instructions: "Capture the ceiling corners and upper vent path." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible laundry issue close-up.", optional: true },
  ],
  balcony: [
    { id: "entry-view", label: "Entry view", instructions: "Capture the balcony from the doorway." },
    { id: "threshold", label: "Threshold", instructions: "Capture the threshold, track, and lower seals." },
    { id: "outer-wall", label: "Outer wall", instructions: "Capture exterior wall joins and paint condition." },
    { id: "floor-drainage", label: "Floor drainage", instructions: "Capture the balcony floor and drainage path." },
    { id: "door-lock", label: "Door lock", instructions: "Capture the balcony/sliding door lock hardware." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible balcony issue close-up.", optional: true },
  ],
  hallway: [
    { id: "entry-view", label: "Entry view", instructions: "Capture the hallway from the entry direction." },
    { id: "entry-locks", label: "Door and locks", instructions: "Capture door hardware, lockset, and intercom." },
    { id: "mail-parcel", label: "Mail and parcel area", instructions: "Capture mailbox or parcel room evidence if visible." },
    { id: "floor-and-skirting", label: "Floor and skirting", instructions: "Capture lower wall edges and floor condition." },
    { id: "ceiling-line", label: "Ceiling line", instructions: "Capture upper corners and lighting path." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible hallway issue close-up.", optional: true },
  ],
  unknown: [
    { id: "entry-view", label: "Wide room view", instructions: "Capture the room from the widest visible angle." },
    { id: "left-wall", label: "Left wall", instructions: "Capture the left wall and lower edge." },
    { id: "right-wall", label: "Right wall", instructions: "Capture the right wall and lower edge." },
    { id: "window-or-door", label: "Window or door", instructions: "Capture the main opening and frame seals." },
    { id: "ceiling-line", label: "Ceiling line", instructions: "Capture upper wall joins and ceiling corners." },
    { id: "issue-closeup", label: "Issue close-up", instructions: "Capture any visible issue close-up.", optional: true },
  ],
};

export function getRoomScene3DCapturePlan(roomType: RoomType) {
  return ROOM_CAPTURE_STEPS[roomType] ?? ROOM_CAPTURE_STEPS.unknown;
}

export function canGenerateRoomScene(
  captures: Partial<Record<string, RoomSceneCapture>>,
  roomType: RoomType
) {
  const plan = getRoomScene3DCapturePlan(roomType);
  return plan
    .filter((step) => !step.optional)
    .every((step) => Boolean(captures[step.id]));
}

export function buildRoomSceneCapturePlaceholder(label: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#132033" />
          <stop offset="100%" stop-color="#0b1018" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" />
      <rect x="80" y="80" width="1120" height="560" rx="28" fill="rgba(73,188,255,0.08)" stroke="rgba(73,188,255,0.36)" stroke-width="6" stroke-dasharray="18 14" />
      <text x="96" y="140" fill="#7dd3fc" font-size="28" font-family="Arial, sans-serif">3D Scan Demo Capture</text>
      <text x="96" y="210" fill="#e5f2ff" font-size="56" font-family="Arial, sans-serif">${escapeXml(label)}</text>
      <text x="96" y="270" fill="#a5b7ce" font-size="26" font-family="Arial, sans-serif">No live camera frame was available, so this placeholder was captured for demo flow continuity.</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getDefaultOpenings(roomType: RoomType): RoomSceneOpening[] {
  switch (roomType) {
    case "bathroom":
      return [
        { id: "door", type: "door", surfaceId: "back-wall", x: 0.08, y: 0.22, width: 0.18, height: 0.62, label: "Door" },
        { id: "utility", type: "utility", surfaceId: "right-wall", x: 0.7, y: 0.16, width: 0.16, height: 0.18, label: "Vent" },
      ];
    case "bedroom":
      return [
        { id: "door", type: "door", surfaceId: "back-wall", x: 0.08, y: 0.22, width: 0.18, height: 0.62, label: "Door" },
        { id: "window", type: "window", surfaceId: "right-wall", x: 0.42, y: 0.2, width: 0.34, height: 0.28, label: "Window" },
      ];
    case "kitchen":
      return [
        { id: "door", type: "door", surfaceId: "back-wall", x: 0.08, y: 0.22, width: 0.18, height: 0.62, label: "Entry" },
        { id: "window", type: "window", surfaceId: "right-wall", x: 0.48, y: 0.18, width: 0.26, height: 0.24, label: "Window" },
      ];
    case "living-room":
      return [
        { id: "balcony", type: "balcony", surfaceId: "back-wall", x: 0.58, y: 0.14, width: 0.24, height: 0.66, label: "Balcony" },
        { id: "door", type: "door", surfaceId: "left-wall", x: 0.12, y: 0.2, width: 0.14, height: 0.58, label: "Entry" },
      ];
    case "laundry":
      return [
        { id: "door", type: "door", surfaceId: "back-wall", x: 0.1, y: 0.2, width: 0.18, height: 0.62, label: "Door" },
      ];
    case "balcony":
      return [
        { id: "balcony-door", type: "door", surfaceId: "back-wall", x: 0.28, y: 0.14, width: 0.22, height: 0.68, label: "Sliding door" },
      ];
    case "hallway":
      return [
        { id: "entry-door", type: "door", surfaceId: "back-wall", x: 0.34, y: 0.16, width: 0.22, height: 0.66, label: "Entry" },
      ];
    default:
      return [{ id: "door", type: "door", surfaceId: "back-wall", x: 0.1, y: 0.2, width: 0.18, height: 0.62, label: "Door" }];
  }
}

function getDefaultFurniture(roomType: RoomType): RoomSceneFurniture[] {
  switch (roomType) {
    case "bedroom":
      return [
        { id: "bed", kind: "bed", label: "Bed zone", x: 0.16, y: 0.46, width: 0.34, depth: 0.26 },
        { id: "desk", kind: "desk", label: "Desk", x: 0.64, y: 0.54, width: 0.18, depth: 0.12 },
      ];
    case "living-room":
      return [
        { id: "sofa", kind: "sofa", label: "Sofa", x: 0.18, y: 0.58, width: 0.28, depth: 0.14 },
        { id: "table", kind: "table", label: "Table", x: 0.56, y: 0.52, width: 0.16, depth: 0.12 },
      ];
    case "kitchen":
      return [{ id: "counter", kind: "counter", label: "Kitchen run", x: 0.08, y: 0.24, width: 0.26, depth: 0.54 }];
    case "bathroom":
      return [{ id: "vanity", kind: "vanity", label: "Vanity", x: 0.12, y: 0.28, width: 0.18, depth: 0.18 }];
    case "laundry":
      return [{ id: "laundry", kind: "laundry", label: "Appliance zone", x: 0.14, y: 0.3, width: 0.22, depth: 0.2 }];
    default:
      return [];
  }
}

function normalizeMarkerPosition(hazard: Hazard): Omit<RoomSceneMarker, "markerId" | "label" | "summary" | "source" | "severity" | "thumbnailBase64" | "hazardId"> {
  const centerX = hazard.boundingBox ? (hazard.boundingBox.x_min + hazard.boundingBox.x_max) / 2 : 0.5;
  const centerY = hazard.boundingBox ? (hazard.boundingBox.y_min + hazard.boundingBox.y_max) / 2 : 0.5;

  if (centerY < 0.18) {
    return { surfaceId: "ceiling", x: centerX, y: Math.min(0.92, Math.max(0.08, centerX)), confidence: "medium" };
  }

  if (centerY > 0.78) {
    return { surfaceId: "floor", x: centerX, y: Math.min(0.92, Math.max(0.08, 1 - centerY)), confidence: "medium" };
  }

  if (centerX < 0.28) {
    return { surfaceId: "left-wall", x: Math.min(0.92, Math.max(0.08, 1 - centerY)), y: centerY, confidence: "medium" };
  }

  if (centerX > 0.72) {
    return { surfaceId: "right-wall", x: Math.min(0.92, Math.max(0.08, centerY)), y: centerY, confidence: "medium" };
  }

  return { surfaceId: "back-wall", x: centerX, y: centerY, confidence: "high" };
}

export function buildRoomScene3D(args: {
  roomType: RoomType;
  captures: Partial<Record<string, RoomSceneCapture>>;
  hazards: Hazard[];
  liveEvidenceFrames?: Record<string, string>;
}): RoomScene3D {
  const relevantHazards = args.hazards.filter((hazard) => hazard.roomType === args.roomType);
  const fallbackHazards = relevantHazards.length > 0 ? relevantHazards : args.hazards.filter((hazard) => hazard.roomType === "unknown");
  const markers = fallbackHazards.map((hazard) => {
    const position = normalizeMarkerPosition(hazard);
    return {
      markerId: hazard.id,
      hazardId: hazard.id,
      label: hazard.category,
      summary: hazard.description,
      severity: hazard.severity,
      source: "hazard" as const,
      thumbnailBase64: args.liveEvidenceFrames?.[hazard.id],
      ...position,
    };
  });

  const completedSteps = Object.values(args.captures)
    .filter(Boolean)
    .sort((left, right) => (left?.capturedAt ?? 0) - (right?.capturedAt ?? 0))
    .map((capture) => capture!.stepId);

  return {
    sceneId: crypto.randomUUID(),
    roomType: args.roomType,
    title: `${formatRoomTypeLabel(args.roomType)} 3D View`,
    capturedAt: Date.now(),
    captureStepsCompleted: completedSteps,
    dimensionsApprox: ROOM_DIMENSIONS[args.roomType] ?? ROOM_DIMENSIONS.unknown,
    openings: getDefaultOpenings(args.roomType),
    furniture: getDefaultFurniture(args.roomType),
    markers,
    coverageSummary: `${completedSteps.length} guided captures mapped into an approximate ${formatRoomTypeLabel(args.roomType).toLowerCase()} scene.`,
    previewRotation: DEFAULT_ROTATION,
  };
}
