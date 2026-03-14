import type {
  BoundingBox,
  HazardCategory,
  LiveChecklistTarget,
  LiveGuidanceTarget,
  RoomType,
} from "@inspect-ai/contracts";

export type CaptureGuidanceTarget = LiveGuidanceTarget;

const STEP_INTERVAL_MS = 8_000;

function createTarget(args: {
  id: string;
  label: string;
  bannerText: string;
  voiceText: string;
  boundingBox: BoundingBox;
  reason: string;
  captureHint: string;
  role?: CaptureGuidanceTarget["role"];
  checkpoint?: LiveChecklistTarget;
  minCoverageConfirmations?: number;
  requiresChecklistCapture?: boolean;
  followUpTargets?: string[];
}): CaptureGuidanceTarget {
  return {
    id: args.id,
    label: args.label,
    bannerText: args.bannerText,
    voiceText: args.voiceText,
    boundingBox: args.boundingBox,
    role: args.role ?? "required",
    reason: args.reason,
    captureHint: args.captureHint,
    checkpoint: args.checkpoint,
    completionRule: {
      minCoverageConfirmations: args.minCoverageConfirmations ?? 2,
      requiresChecklistCapture: args.requiresChecklistCapture,
    },
    followUpTargets: args.followUpTargets,
  };
}

const GENERIC_PLAN: CaptureGuidanceTarget[] = [
  createTarget({
    id: "entry-safety",
    label: "Entry and locks",
    bannerText: "Point the camera at the entry door, lockset, and intercom first.",
    voiceText: "Check the entry door, locks, and intercom first.",
    boundingBox: { x_min: 0.08, y_min: 0.18, x_max: 0.34, y_max: 0.72 },
    reason: "Entry hardware confirms access, lock integrity, and common-area security evidence.",
    captureHint: "Show the whole lockset, latch, handle, and any intercom in one stable view.",
    checkpoint: {
      section: "security",
      field: "entryAccess",
      label: "Building access",
      coverageFocus: "entry door, lockset, intercom panel, keycard reader, concierge desk, or lobby access point",
      instructions:
        "Describe only visible building access controls, such as keycard readers, fob access, lobby gates, or concierge desk. If the frame does not show entry access clearly, omit the capture.",
    },
    requiresChecklistCapture: true,
  }),
  createTarget({
    id: "ceiling-corners",
    label: "Ceiling corners",
    bannerText: "Sweep across ceiling corners and window edges for leaks or mould.",
    voiceText: "Now scan ceiling corners and window edges for leaks or mould.",
    boundingBox: { x_min: 0.56, y_min: 0.05, x_max: 0.92, y_max: 0.28 },
    reason: "Ceiling corners are where moisture staining, leaks, and mould often show first.",
    captureHint: "Keep the upper wall edge and corner seam fully visible for at least two stable frames.",
  }),
  createTarget({
    id: "power-and-floor",
    label: "Power points and floor edges",
    bannerText: "Finish with power points, skirting boards, and floor edges.",
    voiceText: "Finish with power points, skirting boards, and floor edges.",
    boundingBox: { x_min: 0.58, y_min: 0.72, x_max: 0.92, y_max: 0.94 },
    reason: "Outlet plates and floor edges reveal swelling, pests, and electrical fitting condition.",
    captureHint: "Show the outlet and the adjacent skirting or floor transition in the same shot.",
  }),
];

const ROOM_GUIDANCE_PLAN: Record<RoomType, CaptureGuidanceTarget[]> = {
  bathroom: [
    createTarget({
      id: "shower-seals",
      label: "Shower seals and corners",
      bannerText: "Start with shower screen seals and the ceiling corners above the wet area.",
      voiceText: "Start with shower seals and ceiling corners above the wet area.",
      boundingBox: { x_min: 0.58, y_min: 0.08, x_max: 0.94, y_max: 0.44 },
      reason: "Wet-area edges determine whether water ingress and mould risk can be judged reliably.",
      captureHint: "Include silicone edges, lower screen seal, and the top wet-area corner in one slow pan.",
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "bathroomSealant",
        label: "Bathroom sealant",
        coverageFocus: "shower screen seals, silicone edges, and nearby ceiling or wall corners",
        instructions:
          "Summarize only visible shower silicone, sealant discoloration, blackening, or clean condition. Omit if the seals are not visible.",
      },
      requiresChecklistCapture: true,
      followUpTargets: ["wet-area-junction-close-up", "mould-source-context"],
    }),
    createTarget({
      id: "vanity-base",
      label: "Vanity base and sink joins",
      bannerText: "Move closer to the vanity base, sink joins, and under-basin area.",
      voiceText: "Move closer to the vanity base and sink joins.",
      boundingBox: { x_min: 0.12, y_min: 0.48, x_max: 0.52, y_max: 0.88 },
      reason: "Vanity joins and under-basin areas reveal active leaks, swelling, and hidden dampness.",
      captureHint: "Show the sink edge, cabinet base, and pipe or join area without glare.",
      followUpTargets: ["leak-source-close-up"],
    }),
    createTarget({
      id: "exhaust-and-floor",
      label: "Exhaust fan and floor drain",
      bannerText: "Check the exhaust fan, floor drain, and silicone edges before moving on.",
      voiceText: "Check the exhaust fan, floor drain, and silicone edges before moving on.",
      boundingBox: { x_min: 0.58, y_min: 0.56, x_max: 0.88, y_max: 0.9 },
      reason: "Ventilation and drainage determine whether the bathroom can dry properly after use.",
      captureHint: "Keep the fan grille, drain point, and adjacent floor edge visible in stable frames.",
    }),
  ],
  bedroom: [
    createTarget({
      id: "window-corners",
      label: "Window corners",
      bannerText: "Start with bedroom window corners, frames, and curtain edges for mould or drafts.",
      voiceText: "Start with the bedroom window corners and frames.",
      boundingBox: { x_min: 0.58, y_min: 0.08, x_max: 0.94, y_max: 0.42 },
      reason: "Bedroom window edges are key for mould, condensation, and sealing quality.",
      captureHint: "Show both frame corners and any staining or condensation marks close to the seal.",
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "windowSeals",
        label: "Window seals",
        coverageFocus: "window frame corners, sealant edges, and nearby condensation or mould marks",
        instructions:
          "Describe only visible mould, staining, condensation marks, or clean condition around window seals and inner frame corners. Omit if the window edge is not visible.",
      },
      requiresChecklistCapture: true,
      followUpTargets: ["window-seal-close-up", "mould-source-context"],
    }),
    createTarget({
      id: "wardrobe-base",
      label: "Wardrobe and skirting",
      bannerText: "Then check the wardrobe base, skirting boards, and floor edges for swelling or pests.",
      voiceText: "Then check the wardrobe base and skirting boards.",
      boundingBox: { x_min: 0.08, y_min: 0.34, x_max: 0.34, y_max: 0.9 },
      reason: "Wardrobe bases and skirting boards reveal pests, swelling, and hidden moisture.",
      captureHint: "Show the base of the wardrobe and the floor edge together, close enough to inspect detail.",
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "skirtingFloorEdges",
        label: "Skirting and floor edges",
        coverageFocus: "wardrobe base, skirting boards, and floor edge transitions",
        instructions:
          "Describe only visible lifting, swelling, moisture marks, or clean condition on skirting boards and floor edges. Omit if the floor edge is not visible.",
      },
      requiresChecklistCapture: true,
      followUpTargets: ["skirting-pest-trail-close-up"],
    }),
    createTarget({
      id: "desk-and-outlets",
      label: "Desk area and outlets",
      bannerText: "Finish at the desk wall and power points to confirm work-from-home usability.",
      voiceText: "Finish at the desk wall and power points.",
      boundingBox: { x_min: 0.6, y_min: 0.62, x_max: 0.92, y_max: 0.92 },
      reason: "Desk-side power and wall condition decide whether the bedroom is practical and safe to use.",
      captureHint: "Show the outlet faceplate, nearby wall condition, and enough context to judge accessibility.",
      checkpoint: {
        section: "entryCondition",
        field: "inventoryItems",
        label: "Visible furniture",
        coverageFocus: "bed area, desk zone, wardrobe, shelving, or visible sleeping area furniture",
        instructions:
          "List the clearly visible furniture or fixtures in this sleeping area, one concise noun phrase per line, such as desk, chair, wardrobe, bed frame, or shelving. Omit if nothing identifiable is visible.",
        listMode: true,
      },
      requiresChecklistCapture: true,
      followUpTargets: ["electrical-fitting-close-up"],
    }),
  ],
  kitchen: [
    createTarget({
      id: "sink-joins",
      label: "Sink joins and under-sink",
      bannerText: "Start with the sink joins, cabinet base, and under-sink area for leaks.",
      voiceText: "Start with the sink joins and under-sink area.",
      boundingBox: { x_min: 0.08, y_min: 0.46, x_max: 0.44, y_max: 0.9 },
      reason: "Under-sink areas are the highest-value place to judge plumbing evidence in the kitchen.",
      captureHint: "Show the join, pipes, and cabinet base clearly enough to see stains or swelling.",
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "cabinetUnderSink",
        label: "Under-sink area",
        coverageFocus: "sink joins, under-sink cabinet base, pipes, and moisture-prone corners",
        instructions:
          "Describe only visible moisture, staining, swelling, or dry clean condition around sink joins and cabinet base. Omit if the under-sink or join area is not visible.",
      },
      requiresChecklistCapture: true,
      followUpTargets: ["leak-source-close-up", "wet-area-junction-close-up"],
    }),
    createTarget({
      id: "cooktop-rangehood",
      label: "Cooktop and rangehood",
      bannerText: "Move to the cooktop, splashback, and rangehood for heat or grease damage.",
      voiceText: "Move to the cooktop, splashback, and rangehood.",
      boundingBox: { x_min: 0.54, y_min: 0.18, x_max: 0.9, y_max: 0.62 },
      reason: "Cooktop and splashback condition show heat damage, grease build-up, and ventilation evidence.",
      captureHint: "Hold the cooktop, splashback, and rangehood in frame without strong reflections.",
      checkpoint: {
        section: "entryCondition",
        field: "inventoryItems",
        label: "Visible kitchen appliances",
        coverageFocus: "cooktop, rangehood, microwave, oven, dishwasher, or other kitchen appliances",
        instructions:
          "List the clearly visible kitchen appliances or fixtures, one concise item per line, such as microwave, induction cooktop, oven, dishwasher, or rangehood. Omit if not visible.",
        listMode: true,
      },
      requiresChecklistCapture: true,
    }),
    createTarget({
      id: "fridge-power",
      label: "Fridge space and outlets",
      bannerText: "Finish with the fridge space, outlet access, and nearby flooring.",
      voiceText: "Finish with the fridge space and nearby outlets.",
      boundingBox: { x_min: 0.6, y_min: 0.56, x_max: 0.92, y_max: 0.92 },
      reason: "Outlet access and flooring around the fridge space reveal safety and usability constraints.",
      captureHint: "Show the outlet, appliance cavity, and floor edge in the same stable shot.",
      followUpTargets: ["electrical-fitting-close-up"],
    }),
  ],
  "living-room": [
    createTarget({
      id: "main-window",
      label: "Main window and ceiling line",
      bannerText: "Start with the main window, balcony door, and ceiling line for leaks or drafts.",
      voiceText: "Start with the main window, balcony door, and ceiling line.",
      boundingBox: { x_min: 0.58, y_min: 0.08, x_max: 0.94, y_max: 0.44 },
      reason: "Major openings are where leak staining and poor seals usually show first in living areas.",
      captureHint: "Include the top frame edge and at least one corner where water marks would appear.",
      checkpoint: {
        section: "pestsHiddenIssues",
        field: "windowSeals",
        label: "Window and balcony seals",
        coverageFocus: "main window, balcony door, frame edges, and visible sealant lines",
        instructions:
          "Describe only visible mould, staining, condensation, or clean condition on the main window or balcony door seals. Omit if not visible.",
      },
      requiresChecklistCapture: true,
      followUpTargets: ["window-seal-close-up", "mould-source-context"],
    }),
    createTarget({
      id: "balcony-track",
      label: "Balcony track and seals",
      bannerText: "Move closer to balcony tracks, lower seals, and the threshold.",
      voiceText: "Move closer to the balcony track and lower seals.",
      boundingBox: { x_min: 0.54, y_min: 0.56, x_max: 0.94, y_max: 0.94 },
      reason: "Thresholds and sliding tracks show water ingress and poor drainage better than wide shots.",
      captureHint: "Keep the lower track, threshold edge, and any bubbling paint or swelling in frame.",
      followUpTargets: ["window-seal-close-up", "wet-area-junction-close-up"],
    }),
    createTarget({
      id: "outlets-and-floor",
      label: "Outlets and floor edges",
      bannerText: "Finish with power points, skirting boards, and floor edges around the room.",
      voiceText: "Finish with power points and floor edges around the room.",
      boundingBox: { x_min: 0.08, y_min: 0.64, x_max: 0.42, y_max: 0.94 },
      reason: "Floor edges and outlets show both electrical condition and evidence of swelling or pests.",
      captureHint: "Show the outlet plate with nearby skirting and floor transition in one view.",
      checkpoint: {
        section: "entryCondition",
        field: "inventoryItems",
        label: "Visible living room furniture",
        coverageFocus: "living room furniture such as sofa, dining table, desk, shelving, or TV unit",
        instructions:
          "List the clearly visible living area furniture or fixtures, one concise item per line, such as sofa, dining table, TV cabinet, desk, or shelving. Omit if not visible.",
        listMode: true,
      },
      requiresChecklistCapture: true,
      followUpTargets: ["electrical-fitting-close-up", "skirting-pest-trail-close-up"],
    }),
  ],
  laundry: [
    createTarget({
      id: "laundry-taps",
      label: "Laundry taps and drain",
      bannerText: "Start with laundry taps, drain connections, and under-machine flooring.",
      voiceText: "Start with laundry taps and drain connections.",
      boundingBox: { x_min: 0.1, y_min: 0.48, x_max: 0.52, y_max: 0.92 },
      reason: "Laundry connections are high-risk for leaks and damp flooring.",
      captureHint: "Show the tap, hose connection, drain, and floor immediately below them.",
      checkpoint: {
        section: "kitchenBathroom",
        field: "washerDryer",
        label: "Washer / dryer",
        coverageFocus: "washing machine, dryer, laundry taps, or appliance connections",
        instructions:
          "Describe only visible washer or dryer presence and any obvious condition notes. Omit if no laundry appliance is clearly visible.",
      },
      requiresChecklistCapture: true,
      followUpTargets: ["leak-source-close-up", "wet-area-junction-close-up"],
    }),
    createTarget({
      id: "dryer-vent",
      label: "Dryer vent and ceiling",
      bannerText: "Check the dryer vent, ceiling corners, and exhaust path for moisture build-up.",
      voiceText: "Check the dryer vent and ceiling corners.",
      boundingBox: { x_min: 0.56, y_min: 0.08, x_max: 0.9, y_max: 0.4 },
      reason: "Poor exhaust and damp ceiling corners make laundry mould risk hard to trust without this view.",
      captureHint: "Keep the vent outlet and the nearest upper corner in frame together if possible.",
      followUpTargets: ["mould-source-context"],
    }),
    createTarget({
      id: "cabinet-edges",
      label: "Cabinet edges and skirting",
      bannerText: "Finish with cabinet edges, skirting, and any hidden damp spots near the floor.",
      voiceText: "Finish with cabinet edges and hidden damp spots near the floor.",
      boundingBox: { x_min: 0.58, y_min: 0.58, x_max: 0.9, y_max: 0.92 },
      reason: "Lower cabinets and skirting help confirm whether dampness has spread beyond the taps.",
      captureHint: "Show bottom edges, swelling, and floor contact points close enough to inspect detail.",
      followUpTargets: ["skirting-pest-trail-close-up"],
    }),
  ],
  balcony: [
    createTarget({
      id: "threshold",
      label: "Threshold and door track",
      bannerText: "Start at the balcony threshold and door track for water ingress or warping.",
      voiceText: "Start at the balcony threshold and door track.",
      boundingBox: { x_min: 0.46, y_min: 0.62, x_max: 0.88, y_max: 0.94 },
      reason: "Thresholds are the clearest evidence for balcony water ingress and door usability.",
      captureHint: "Show the door track, threshold edge, and any pooling or swelling marks.",
      checkpoint: {
        section: "security",
        field: "doorLocks",
        label: "Balcony door lock",
        coverageFocus: "balcony or sliding door handle, latch, lock hardware, and nearby threshold",
        instructions:
          "Describe only visible balcony or sliding door lock hardware and whether it appears intact. Omit if the lock is not visible.",
      },
      requiresChecklistCapture: true,
      followUpTargets: ["entry-lock-close-up", "window-seal-close-up"],
    }),
    createTarget({
      id: "ceiling-and-wall",
      label: "Ceiling and exterior wall",
      bannerText: "Check the balcony ceiling, exterior wall joins, and paint bubbling.",
      voiceText: "Check the balcony ceiling and exterior wall joins.",
      boundingBox: { x_min: 0.54, y_min: 0.08, x_max: 0.94, y_max: 0.4 },
      reason: "Exterior joins and ceiling surfaces show ingress, cracking, and peeling paint early.",
      captureHint: "Hold the wall-to-ceiling join long enough to inspect stains, cracks, or bubbling paint.",
      followUpTargets: ["crack-context-wide", "mould-source-context"],
    }),
    createTarget({
      id: "drain-and-railing",
      label: "Drain and railing base",
      bannerText: "Finish with the drain point, railing base, and lower corners.",
      voiceText: "Finish with the drain point and railing base.",
      boundingBox: { x_min: 0.08, y_min: 0.58, x_max: 0.38, y_max: 0.94 },
      reason: "Drain points and railing bases reveal drainage blockage and corrosion risk.",
      captureHint: "Show the drain opening and railing foot in the same view if possible.",
    }),
  ],
  hallway: [
    GENERIC_PLAN[0],
    createTarget({
      id: "parcel-mailbox",
      label: "Mailbox and parcel room",
      bannerText: "Scan the mailbox bank, parcel room signage, or concierge collection area.",
      voiceText: "Scan the mailbox bank or parcel room area next.",
      boundingBox: { x_min: 0.56, y_min: 0.26, x_max: 0.92, y_max: 0.84 },
      reason: "Shared delivery and access areas help verify practical building operations.",
      captureHint: "Frame the mailbox bank or parcel collection signage square-on and clearly.",
      checkpoint: {
        section: "security",
        field: "parcelRoom",
        label: "Parcel room / mailbox",
        coverageFocus: "mailbox bank, parcel lockers, parcel room door, or concierge collection area",
        instructions:
          "Describe only visible mailbox banks, parcel room signage, collection lockers, or concierge parcel handling cues. Omit if not visible.",
      },
      requiresChecklistCapture: true,
    }),
    createTarget({
      id: "waste-signage",
      label: "Waste room / chute signage",
      bannerText: "Finish by scanning any rubbish chute, waste room, or bulky waste signage.",
      voiceText: "Finish by scanning rubbish chute or bulky waste signage.",
      boundingBox: { x_min: 0.58, y_min: 0.16, x_max: 0.92, y_max: 0.86 },
      reason: "Waste handling signage indicates whether building operations are visible and accessible.",
      captureHint: "Show the chute or room sign head-on so instructions remain legible.",
      checkpoint: {
        section: "buildingManagement",
        field: "bulkyWaste",
        label: "Bulky waste handling",
        coverageFocus: "waste chute signage, rubbish room signs, or bulky waste instructions",
        instructions:
          "Describe only visible waste chute labels, rubbish room signs, or bulky waste instructions. Omit if none are visible.",
      },
      requiresChecklistCapture: true,
    }),
  ],
  unknown: [
    GENERIC_PLAN[0],
    createTarget({
      id: "intercom-panel",
      label: "Intercom / access panel",
      bannerText: "If you are in a common area, scan the intercom panel or access keypad.",
      voiceText: "If you are in a common area, scan the intercom or access panel.",
      boundingBox: { x_min: 0.56, y_min: 0.18, x_max: 0.88, y_max: 0.7 },
      reason: "Access hardware helps anchor the scan when the room type is still unclear.",
      captureHint: "Show the full panel, keypad, and entry hardware without motion blur.",
      checkpoint: {
        section: "security",
        field: "intercom",
        label: "Intercom / panel",
        coverageFocus: "intercom, keypad, buzzer panel, or access control hardware",
        instructions:
          "Describe only visible intercom, keypad, or entry panel hardware. Omit if not visible.",
      },
      requiresChecklistCapture: true,
    }),
    GENERIC_PLAN[1],
  ],
};

const ESCALATION_TARGETS: Record<string, CaptureGuidanceTarget> = {
  "mould-source-context": createTarget({
    id: "mould-source-context",
    label: "Mould source context",
    bannerText: "Widen out and capture the mould area with the surrounding wall, corner, and moisture source.",
    voiceText: "Capture the mould with the surrounding wall and likely moisture source.",
    boundingBox: { x_min: 0.18, y_min: 0.12, x_max: 0.92, y_max: 0.88 },
    role: "escalation",
    reason: "AI needs context around mould to tell whether it is isolated staining or an active moisture pattern.",
    captureHint: "Show the full affected area, nearby edge, and likely source such as a window, ceiling, or wet join.",
    minCoverageConfirmations: 2,
  }),
  "window-seal-close-up": createTarget({
    id: "window-seal-close-up",
    label: "Window seal close-up",
    bannerText: "Move closer to the window or sliding-door seal for a tight evidence shot.",
    voiceText: "Move closer to the window or sliding-door seal.",
    boundingBox: { x_min: 0.52, y_min: 0.1, x_max: 0.94, y_max: 0.56 },
    role: "escalation",
    reason: "A close-up is needed to confirm whether staining sits on the seal itself or nearby paint.",
    captureHint: "Fill the frame with the seal, corner, and any visible damage or condensation trace.",
  }),
  "wet-area-junction-close-up": createTarget({
    id: "wet-area-junction-close-up",
    label: "Wet-area junction close-up",
    bannerText: "Capture a close-up of the wet-area junction where water could enter.",
    voiceText: "Capture a close-up of the wet-area junction.",
    boundingBox: { x_min: 0.34, y_min: 0.34, x_max: 0.86, y_max: 0.92 },
    role: "escalation",
    reason: "Tight wet-area evidence is required to judge seal failure and water ingress.",
    captureHint: "Show the exact silicone line, tile join, or threshold edge where water might be entering.",
  }),
  "leak-source-close-up": createTarget({
    id: "leak-source-close-up",
    label: "Leak source close-up",
    bannerText: "Move closer to the join, pipe, or stain that looks like the leak source.",
    voiceText: "Move closer to the suspected leak source.",
    boundingBox: { x_min: 0.22, y_min: 0.34, x_max: 0.82, y_max: 0.92 },
    role: "escalation",
    reason: "Close evidence of the join or stain is needed before a plumbing issue can be trusted.",
    captureHint: "Keep the suspected leak point centered and stable long enough to inspect detail.",
  }),
  "crack-close-up": createTarget({
    id: "crack-close-up",
    label: "Crack close-up",
    bannerText: "Take a close-up of the crack or split line.",
    voiceText: "Take a close-up of the crack.",
    boundingBox: { x_min: 0.22, y_min: 0.2, x_max: 0.82, y_max: 0.78 },
    role: "escalation",
    reason: "A close crack view is needed to distinguish cosmetic paint movement from structural risk.",
    captureHint: "Fill the frame with the crack and enough nearby surface to judge width and direction.",
  }),
  "crack-context-wide": createTarget({
    id: "crack-context-wide",
    label: "Crack context wide shot",
    bannerText: "Step back and show the crack with the surrounding wall or ceiling context.",
    voiceText: "Step back and show the crack with the surrounding wall.",
    boundingBox: { x_min: 0.08, y_min: 0.08, x_max: 0.92, y_max: 0.92 },
    role: "escalation",
    reason: "AI needs a wide shot to understand whether the crack crosses joins or spans a large area.",
    captureHint: "Show the crack start and end with nearby corners, windows, or ceiling lines for context.",
  }),
  "electrical-fitting-close-up": createTarget({
    id: "electrical-fitting-close-up",
    label: "Electrical fitting close-up",
    bannerText: "Move closer to the outlet, switch, or fitting that needs confirmation.",
    voiceText: "Move closer to the outlet or switch fitting.",
    boundingBox: { x_min: 0.26, y_min: 0.26, x_max: 0.78, y_max: 0.86 },
    role: "escalation",
    reason: "A close electrical shot is needed to confirm loose fittings, burn marks, or physical damage.",
    captureHint: "Frame the faceplate tightly, including cracks, burn marks, or exposed gaps if present.",
  }),
  "entry-lock-close-up": createTarget({
    id: "entry-lock-close-up",
    label: "Lock close-up",
    bannerText: "Take a close-up of the lock or latch hardware.",
    voiceText: "Take a close-up of the lock hardware.",
    boundingBox: { x_min: 0.2, y_min: 0.22, x_max: 0.78, y_max: 0.84 },
    role: "escalation",
    reason: "AI needs a tight lock shot before it can say the fitting is intact or damaged.",
    captureHint: "Show the latch, screw points, and handle hardware in one steady frame.",
  }),
  "access-panel-close-up": createTarget({
    id: "access-panel-close-up",
    label: "Access panel close-up",
    bannerText: "Move closer to the access panel, intercom, or service point.",
    voiceText: "Move closer to the access panel or service point.",
    boundingBox: { x_min: 0.26, y_min: 0.22, x_max: 0.82, y_max: 0.86 },
    role: "escalation",
    reason: "A close panel shot is needed to confirm damage, tampering, or missing covers.",
    captureHint: "Show the full panel face and surrounding wall edge without glare.",
  }),
  "skirting-pest-trail-close-up": createTarget({
    id: "skirting-pest-trail-close-up",
    label: "Skirting pest trail close-up",
    bannerText: "Move closer to the skirting, corner, or floor edge where pest evidence might sit.",
    voiceText: "Move closer to the skirting or floor edge.",
    boundingBox: { x_min: 0.12, y_min: 0.58, x_max: 0.74, y_max: 0.96 },
    role: "escalation",
    reason: "Pest traces need a close edge view before they can be separated from dust or scuffs.",
    captureHint: "Show the edge where floor meets skirting and keep any trace marks centered.",
  }),
};

const CATEGORY_ESCALATION_TARGET_IDS: Partial<Record<HazardCategory, string[]>> = {
  Mould: ["mould-source-context", "window-seal-close-up", "wet-area-junction-close-up"],
  Structural: ["crack-close-up", "crack-context-wide"],
  Plumbing: ["leak-source-close-up", "wet-area-junction-close-up"],
  Pest: ["skirting-pest-trail-close-up"],
  Electrical: ["electrical-fitting-close-up"],
  Safety: ["entry-lock-close-up", "access-panel-close-up"],
};

export function getRoomGuidancePlan(roomType: RoomType) {
  return ROOM_GUIDANCE_PLAN[roomType] ?? GENERIC_PLAN;
}

export function getGuidanceTargetById(args: { roomType: RoomType; targetId: string }) {
  return getRoomGuidancePlan(args.roomType).find((target) => target.id === args.targetId) ?? ESCALATION_TARGETS[args.targetId];
}

export function getHazardEscalationTargets(args: { roomType: RoomType; category: HazardCategory }) {
  const roomPlanIds = new Set(getRoomGuidancePlan(args.roomType).flatMap((target) => target.followUpTargets ?? []));
  const categoryIds = CATEGORY_ESCALATION_TARGET_IDS[args.category] ?? [];
  return [...new Set([...categoryIds, ...categoryIds.filter((targetId) => roomPlanIds.has(targetId))])];
}

export function getVisibleGuidancePlan(args: {
  roomType: RoomType;
  activeEscalationTargetIds?: string[];
  ignoredTargetIds?: string[];
}) {
  const ignored = new Set(args.ignoredTargetIds ?? []);
  const basePlan = getRoomGuidancePlan(args.roomType).filter((target) => !ignored.has(target.id));
  const escalationPlan = (args.activeEscalationTargetIds ?? [])
    .map((targetId) => ESCALATION_TARGETS[targetId])
    .filter((target): target is CaptureGuidanceTarget => Boolean(target))
    .filter((target) => !ignored.has(target.id));

  return [...basePlan, ...escalationPlan];
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
  activeEscalationTargetIds?: string[];
  ignoredTargetIds?: string[];
}) {
  const plan = getVisibleGuidancePlan({
    roomType: args.roomType,
    activeEscalationTargetIds: args.activeEscalationTargetIds,
    ignoredTargetIds: args.ignoredTargetIds,
  });
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
  activeEscalationTargetIds?: string[];
}) {
  const plan = getVisibleGuidancePlan({
    roomType: args.roomType,
    activeEscalationTargetIds: args.activeEscalationTargetIds,
  }).filter((target) => target.role !== "optional");
  const completed = new Set(args.completedIds ?? []);

  return {
    total: plan.length,
    completed: plan.filter((target) => completed.has(target.id)).length,
  };
}
