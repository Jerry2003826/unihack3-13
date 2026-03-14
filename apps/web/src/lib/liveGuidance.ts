import type { BoundingBox, LiveChecklistTarget, RoomType } from "@inspect-ai/contracts";

export interface CaptureGuidanceTarget {
  id: string;
  label: string;
  bannerText: string;
  voiceText: string;
  boundingBox: BoundingBox;
  checkpoint?: LiveChecklistTarget;
}

const STEP_INTERVAL_MS = 8_000;

const GENERIC_PLAN: CaptureGuidanceTarget[] = [
  {
    id: "entry-safety",
    label: "Entry and locks",
    bannerText: "Point the camera at the entry door, lockset, and intercom first.",
    voiceText: "Check the entry door, locks, and intercom first.",
    boundingBox: { x_min: 0.08, y_min: 0.18, x_max: 0.34, y_max: 0.72 },
    checkpoint: {
      section: "security",
      field: "entryAccess",
      label: "Building access",
      coverageFocus: "entry door, lockset, intercom panel, keycard reader, concierge desk, or lobby access point",
      instructions:
        "Describe only visible building access controls, such as keycard readers, fob access, lobby gates, or concierge desk. If the frame does not show entry access clearly, omit the capture.",
    },
  },
  {
    id: "ceiling-corners",
    label: "Ceiling corners",
    bannerText: "Sweep across ceiling corners and window edges for leaks or mould.",
    voiceText: "Now scan ceiling corners and window edges for leaks or mould.",
    boundingBox: { x_min: 0.56, y_min: 0.05, x_max: 0.92, y_max: 0.28 },
  },
  {
    id: "power-and-floor",
    label: "Power points and floor edges",
    bannerText: "Finish with power points, skirting boards, and floor edges.",
    voiceText: "Finish with power points, skirting boards, and floor edges.",
    boundingBox: { x_min: 0.58, y_min: 0.72, x_max: 0.92, y_max: 0.94 },
  },
];

const ROOM_GUIDANCE_PLAN: Record<RoomType, CaptureGuidanceTarget[]> = {
  bathroom: [
    {
      id: "shower-seals",
      label: "Shower seals and corners",
      bannerText: "Start with shower screen seals and the ceiling corners above the wet area.",
      voiceText: "Start with shower seals and ceiling corners above the wet area.",
      boundingBox: { x_min: 0.58, y_min: 0.08, x_max: 0.94, y_max: 0.44 },
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "bathroomSealant",
        label: "Bathroom sealant",
        coverageFocus: "shower screen seals, silicone edges, and nearby ceiling or wall corners",
        instructions:
          "Summarize only visible shower silicone, sealant discoloration, blackening, or clean condition. Omit if the seals are not visible.",
      },
    },
    {
      id: "vanity-base",
      label: "Vanity base and sink joins",
      bannerText: "Move closer to the vanity base, sink joins, and under-basin area.",
      voiceText: "Move closer to the vanity base and sink joins.",
      boundingBox: { x_min: 0.12, y_min: 0.48, x_max: 0.52, y_max: 0.88 },
    },
    {
      id: "exhaust-and-floor",
      label: "Exhaust fan and floor drain",
      bannerText: "Check the exhaust fan, floor drain, and silicone edges before moving on.",
      voiceText: "Check the exhaust fan, floor drain, and silicone edges before moving on.",
      boundingBox: { x_min: 0.58, y_min: 0.56, x_max: 0.88, y_max: 0.9 },
    },
  ],
  bedroom: [
    {
      id: "window-corners",
      label: "Window corners",
      bannerText: "Start with bedroom window corners, frames, and curtain edges for mould or drafts.",
      voiceText: "Start with the bedroom window corners and frames.",
      boundingBox: { x_min: 0.58, y_min: 0.08, x_max: 0.94, y_max: 0.42 },
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "windowSeals",
        label: "Window seals",
        coverageFocus: "window frame corners, sealant edges, and nearby condensation or mould marks",
        instructions:
          "Describe only visible mould, staining, condensation marks, or clean condition around window seals and inner frame corners. Omit if the window edge is not visible.",
      },
    },
    {
      id: "wardrobe-base",
      label: "Wardrobe and skirting",
      bannerText: "Then check the wardrobe base, skirting boards, and floor edges for swelling or pests.",
      voiceText: "Then check the wardrobe base and skirting boards.",
      boundingBox: { x_min: 0.08, y_min: 0.34, x_max: 0.34, y_max: 0.9 },
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "skirtingFloorEdges",
        label: "Skirting and floor edges",
        coverageFocus: "wardrobe base, skirting boards, and floor edge transitions",
        instructions:
          "Describe only visible lifting, swelling, moisture marks, or clean condition on skirting boards and floor edges. Omit if the floor edge is not visible.",
      },
    },
    {
      id: "desk-and-outlets",
      label: "Desk area and outlets",
      bannerText: "Finish at the desk wall and power points to confirm work-from-home usability.",
      voiceText: "Finish at the desk wall and power points.",
      boundingBox: { x_min: 0.6, y_min: 0.62, x_max: 0.92, y_max: 0.92 },
      checkpoint: {
        section: "entryCondition",
        field: "inventoryItems",
        label: "Visible furniture",
        coverageFocus: "bed area, desk zone, wardrobe, shelving, or visible sleeping area furniture",
        instructions:
          "List the clearly visible furniture or fixtures in this sleeping area, one concise noun phrase per line, such as desk, chair, wardrobe, bed frame, or shelving. Omit if nothing identifiable is visible.",
        listMode: true,
      },
    },
  ],
  kitchen: [
    {
      id: "sink-joins",
      label: "Sink joins and under-sink",
      bannerText: "Start with the sink joins, cabinet base, and under-sink area for leaks.",
      voiceText: "Start with the sink joins and under-sink area.",
      boundingBox: { x_min: 0.08, y_min: 0.46, x_max: 0.44, y_max: 0.9 },
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "cabinetUnderSink",
        label: "Under-sink area",
        coverageFocus: "sink joins, under-sink cabinet base, pipes, and moisture-prone corners",
        instructions:
          "Describe only visible moisture, staining, swelling, or dry clean condition around sink joins and cabinet base. Omit if the under-sink or join area is not visible.",
      },
    },
    {
      id: "cooktop-rangehood",
      label: "Cooktop and rangehood",
      bannerText: "Move to the cooktop, splashback, and rangehood for heat or grease damage.",
      voiceText: "Move to the cooktop, splashback, and rangehood.",
      boundingBox: { x_min: 0.54, y_min: 0.18, x_max: 0.9, y_max: 0.62 },
      checkpoint: {
        section: "entryCondition",
        field: "inventoryItems",
        label: "Visible kitchen appliances",
        coverageFocus: "cooktop, rangehood, microwave, oven, dishwasher, or other kitchen appliances",
        instructions:
          "List the clearly visible kitchen appliances or fixtures, one concise item per line, such as microwave, induction cooktop, oven, dishwasher, or rangehood. Omit if not visible.",
        listMode: true,
      },
    },
    {
      id: "fridge-power",
      label: "Fridge space and outlets",
      bannerText: "Finish with the fridge space, outlet access, and nearby flooring.",
      voiceText: "Finish with the fridge space and nearby outlets.",
      boundingBox: { x_min: 0.6, y_min: 0.56, x_max: 0.92, y_max: 0.92 },
    },
  ],
  "living-room": [
    {
      id: "main-window",
      label: "Main window and ceiling line",
      bannerText: "Start with the main window, balcony door, and ceiling line for leaks or drafts.",
      voiceText: "Start with the main window, balcony door, and ceiling line.",
      boundingBox: { x_min: 0.58, y_min: 0.08, x_max: 0.94, y_max: 0.44 },
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "windowSeals",
        label: "Window and balcony seals",
        coverageFocus: "main window, balcony door, frame edges, and visible sealant lines",
        instructions:
          "Describe only visible mould, staining, condensation, or clean condition on the main window or balcony door seals. Omit if not visible.",
      },
    },
    {
      id: "balcony-track",
      label: "Balcony track and seals",
      bannerText: "Move closer to balcony tracks, lower seals, and the threshold.",
      voiceText: "Move closer to the balcony track and lower seals.",
      boundingBox: { x_min: 0.54, y_min: 0.56, x_max: 0.94, y_max: 0.94 },
    },
    {
      id: "outlets-and-floor",
      label: "Outlets and floor edges",
      bannerText: "Finish with power points, skirting boards, and floor edges around the room.",
      voiceText: "Finish with power points and floor edges around the room.",
      boundingBox: { x_min: 0.08, y_min: 0.64, x_max: 0.42, y_max: 0.94 },
      checkpoint: {
        section: "entryCondition",
        field: "inventoryItems",
        label: "Visible living room furniture",
        coverageFocus: "living room furniture such as sofa, dining table, desk, shelving, or TV unit",
        instructions:
          "List the clearly visible living area furniture or fixtures, one concise item per line, such as sofa, dining table, TV cabinet, desk, or shelving. Omit if not visible.",
        listMode: true,
      },
    },
  ],
  laundry: [
    {
      id: "laundry-taps",
      label: "Laundry taps and drain",
      bannerText: "Start with laundry taps, drain connections, and under-machine flooring.",
      voiceText: "Start with laundry taps and drain connections.",
      boundingBox: { x_min: 0.1, y_min: 0.48, x_max: 0.52, y_max: 0.92 },
      checkpoint: {
        section: "kitchenBathroom",
        field: "washerDryer",
        label: "Washer / dryer",
        coverageFocus: "washing machine, dryer, laundry taps, or appliance connections",
        instructions:
          "Describe only visible washer or dryer presence and any obvious condition notes. Omit if no laundry appliance is clearly visible.",
      },
    },
    {
      id: "dryer-vent",
      label: "Dryer vent and ceiling",
      bannerText: "Check the dryer vent, ceiling corners, and exhaust path for moisture build-up.",
      voiceText: "Check the dryer vent and ceiling corners.",
      boundingBox: { x_min: 0.56, y_min: 0.08, x_max: 0.9, y_max: 0.4 },
    },
    {
      id: "cabinet-edges",
      label: "Cabinet edges and skirting",
      bannerText: "Finish with cabinet edges, skirting, and any hidden damp spots near the floor.",
      voiceText: "Finish with cabinet edges and hidden damp spots near the floor.",
      boundingBox: { x_min: 0.58, y_min: 0.58, x_max: 0.9, y_max: 0.92 },
    },
  ],
  balcony: [
    {
      id: "threshold",
      label: "Threshold and door track",
      bannerText: "Start at the balcony threshold and door track for water ingress or warping.",
      voiceText: "Start at the balcony threshold and door track.",
      boundingBox: { x_min: 0.46, y_min: 0.62, x_max: 0.88, y_max: 0.94 },
      checkpoint: {
        section: "security",
        field: "doorLocks",
        label: "Balcony door lock",
        coverageFocus: "balcony or sliding door handle, latch, lock hardware, and nearby threshold",
        instructions:
          "Describe only visible balcony or sliding door lock hardware and whether it appears intact. Omit if the lock is not visible.",
      },
    },
    {
      id: "ceiling-and-wall",
      label: "Ceiling and exterior wall",
      bannerText: "Check the balcony ceiling, exterior wall joins, and paint bubbling.",
      voiceText: "Check the balcony ceiling and exterior wall joins.",
      boundingBox: { x_min: 0.54, y_min: 0.08, x_max: 0.94, y_max: 0.4 },
    },
    {
      id: "drain-and-railing",
      label: "Drain and railing base",
      bannerText: "Finish with the drain point, railing base, and lower corners.",
      voiceText: "Finish with the drain point and railing base.",
      boundingBox: { x_min: 0.08, y_min: 0.58, x_max: 0.38, y_max: 0.94 },
    },
  ],
  hallway: [
    GENERIC_PLAN[0],
    {
      id: "parcel-mailbox",
      label: "Mailbox and parcel room",
      bannerText: "Scan the mailbox bank, parcel room signage, or concierge collection area.",
      voiceText: "Scan the mailbox bank or parcel room area next.",
      boundingBox: { x_min: 0.56, y_min: 0.26, x_max: 0.92, y_max: 0.84 },
      checkpoint: {
        section: "security",
        field: "parcelRoom",
        label: "Parcel room / mailbox",
        coverageFocus: "mailbox bank, parcel lockers, parcel room door, or concierge collection area",
        instructions:
          "Describe only visible mailbox banks, parcel room signage, collection lockers, or concierge parcel handling cues. Omit if not visible.",
      },
    },
    {
      id: "waste-signage",
      label: "Waste room / chute signage",
      bannerText: "Finish by scanning any rubbish chute, waste room, or bulky waste signage.",
      voiceText: "Finish by scanning rubbish chute or bulky waste signage.",
      boundingBox: { x_min: 0.58, y_min: 0.16, x_max: 0.92, y_max: 0.86 },
      checkpoint: {
        section: "buildingManagement",
        field: "bulkyWaste",
        label: "Bulky waste handling",
        coverageFocus: "waste chute signage, rubbish room signs, or bulky waste instructions",
        instructions:
          "Describe only visible waste chute labels, rubbish room signs, or bulky waste instructions. Omit if none are visible.",
      },
    },
  ],
  unknown: [
    GENERIC_PLAN[0],
    {
      id: "intercom-panel",
      label: "Intercom / access panel",
      bannerText: "If you are in a common area, scan the intercom panel or access keypad.",
      voiceText: "If you are in a common area, scan the intercom or access panel.",
      boundingBox: { x_min: 0.56, y_min: 0.18, x_max: 0.88, y_max: 0.7 },
      checkpoint: {
        section: "security",
        field: "intercom",
        label: "Intercom / panel",
        coverageFocus: "intercom, keypad, buzzer panel, or access control hardware",
        instructions:
          "Describe only visible intercom, keypad, or entry panel hardware. Omit if not visible.",
      },
    },
    GENERIC_PLAN[1],
  ],
};

export function getRoomGuidancePlan(roomType: RoomType) {
  return ROOM_GUIDANCE_PLAN[roomType] ?? GENERIC_PLAN;
}

export function getGuidanceTargetForElapsed(args: { roomType: RoomType; elapsedMs: number }) {
  const plan = getRoomGuidancePlan(args.roomType);
  const index = Math.floor(Math.max(args.elapsedMs, 0) / STEP_INTERVAL_MS) % plan.length;
  return plan[index] ?? plan[0];
}

export function buildGuidanceAlertKey(args: { roomType: RoomType; targetId: string }) {
  return `guide:${args.roomType}:${args.targetId}`;
}

export function getNextGuidanceTarget(args: {
  roomType: RoomType;
  completedIds?: string[];
  currentTargetId?: string | null;
  skipTargetId?: string | null;
}) {
  const plan = getRoomGuidancePlan(args.roomType);
  const completed = new Set(args.completedIds ?? []);
  const remaining = plan.filter((target) => !completed.has(target.id) && target.id !== args.skipTargetId);

  if (remaining.length === 0) {
    return null;
  }

  if (!args.currentTargetId) {
    return remaining[0] ?? null;
  }

  const currentIndex = remaining.findIndex((target) => target.id === args.currentTargetId);
  if (currentIndex === -1) {
    return remaining[0] ?? null;
  }

  return remaining[currentIndex] ?? remaining[0] ?? null;
}

export function getGuidanceProgress(args: {
  roomType: RoomType;
  completedIds?: string[];
}) {
  const plan = getRoomGuidancePlan(args.roomType);
  const completed = new Set(args.completedIds ?? []);
  return {
    total: plan.length,
    completed: plan.filter((target) => completed.has(target.id)).length,
  };
}
