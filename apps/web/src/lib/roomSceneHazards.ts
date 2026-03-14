import type { Hazard, HazardCategory, RoomScene3D, RoomSceneMarker, RoomType, SeverityLevel } from "@inspect-ai/contracts";

function inferHazardCategory(marker: RoomSceneMarker): HazardCategory {
  const text = `${marker.label} ${marker.summary}`.toLowerCase();

  if (/(mould|mold|condensation|sealant|window seal)/.test(text)) {
    return "Mould";
  }
  if (/(pipe|sink|drain|water|leak|damp|moisture|shower)/.test(text)) {
    return "Plumbing";
  }
  if (/(wire|power|outlet|switch|electrical|burn mark)/.test(text)) {
    return "Electrical";
  }
  if (/(pest|roach|ant|mouse|dropping|insect)/.test(text)) {
    return "Pest";
  }
  if (/(lock|door|window|trip|crack|unsafe|balcony|railing|fire|smoke)/.test(text)) {
    return "Safety";
  }
  if (/(frame|wall|ceiling|floor|skirting|structural|warp|swelling|damage)/.test(text)) {
    return "Structural";
  }

  return "Other";
}

function inferSeverity(marker: RoomSceneMarker): SeverityLevel {
  if (marker.severity) {
    return marker.severity;
  }

  const text = `${marker.label} ${marker.summary}`.toLowerCase();
  if (/(serious|major|danger|exposed|active leak|unsafe)/.test(text)) {
    return "High";
  }
  if (/(mould|moisture|damage|crack|loose|missing)/.test(text)) {
    return "Medium";
  }
  return "Low";
}

function buildBoundingBoxFromMarker(marker: RoomSceneMarker) {
  const width = marker.surfaceId === "floor" || marker.surfaceId === "ceiling" ? 0.12 : 0.16;
  const height = marker.surfaceId === "floor" || marker.surfaceId === "ceiling" ? 0.1 : 0.18;

  let centerX = marker.x;
  let centerY = marker.y;

  if (marker.surfaceId === "left-wall") {
    centerX = 0.14;
  } else if (marker.surfaceId === "right-wall") {
    centerX = 0.86;
  } else if (marker.surfaceId === "back-wall") {
    centerX = marker.x;
  } else if (marker.surfaceId === "floor") {
    centerY = 0.88;
  } else if (marker.surfaceId === "ceiling") {
    centerY = 0.12;
  }

  return {
    x_min: Math.max(0.02, centerX - width / 2),
    y_min: Math.max(0.02, centerY - height / 2),
    x_max: Math.min(0.98, centerX + width / 2),
    y_max: Math.min(0.98, centerY + height / 2),
  };
}

export function promoteSuggestedMarkerToHazard(args: {
  marker: RoomSceneMarker;
  roomType: RoomType;
  fallbackThumbnailBase64?: string;
}) {
  const hazardId = crypto.randomUUID();
  const hazard: Hazard = {
    id: hazardId,
    category: inferHazardCategory(args.marker),
    severity: inferSeverity(args.marker),
    description: args.marker.summary,
    detectedAt: Date.now(),
    confirmedAt: Date.now(),
    roomType: args.roomType,
    boundingBox: buildBoundingBoxFromMarker(args.marker),
    sceneMarkerId: args.marker.markerId,
    source: "3d-suggested",
  };

  const nextMarker: RoomSceneMarker = {
    ...args.marker,
    markerId: hazardId,
    hazardId,
    source: "hazard",
    severity: hazard.severity,
    confidence: args.marker.confidence ?? "medium",
    thumbnailBase64: args.marker.thumbnailBase64 ?? args.fallbackThumbnailBase64,
  };

  return {
    hazard,
    nextMarker,
    thumbnailBase64: nextMarker.thumbnailBase64,
  };
}

export function replaceSceneMarker(scene: RoomScene3D, markerId: string, nextMarker: RoomSceneMarker): RoomScene3D {
  return {
    ...scene,
    markers: scene.markers.map((marker) => (marker.markerId === markerId ? nextMarker : marker)),
  };
}
