import type { InspectionChecklist, LiveChecklistCapture } from "@inspect-ai/contracts";

type SectionValue = NonNullable<InspectionChecklist[keyof InspectionChecklist]>;
type SectionKey = keyof InspectionChecklist;
export type InspectionChecklistFieldPath = `${SectionKey}.${string}`;

export interface InspectionChecklistFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  list?: boolean;
}

export interface InspectionChecklistSectionConfig {
  key: SectionKey;
  title: string;
  description: string;
  fields: InspectionChecklistFieldConfig[];
}

export const INSPECTION_CHECKLIST_SECTIONS: InspectionChecklistSectionConfig[] = [
  {
    key: "utilities",
    title: "Utilities & Network",
    description: "Water, power, heating, mobile signal, and NBN readiness.",
    fields: [
      { key: "hotWater", label: "Hot water", placeholder: "e.g. Hot water arrived in 20 seconds and stayed stable." },
      { key: "waterPressure", label: "Water pressure", placeholder: "e.g. Bathroom tap pressure was strong and stable." },
      { key: "drainage", label: "Drainage / floor waste", placeholder: "e.g. Shower drained quickly, no floor waste smell." },
      { key: "powerPoints", label: "Power points", placeholder: "e.g. Enough outlets near bed and desk, all looked intact." },
      { key: "heatingCooling", label: "Heating / cooling", placeholder: "e.g. Split system present and cooling worked." },
      { key: "mobileSignal", label: "Mobile signal", placeholder: "e.g. Full 5G in bedroom and balcony." },
      { key: "internetNbn", label: "Internet / NBN", placeholder: "e.g. NBN connection available and router point visible." },
      { key: "nbnLocation", label: "NBN point location", placeholder: "e.g. Connection point inside study cupboard." },
    ],
  },
  {
    key: "security",
    title: "Doors, Windows & Safety",
    description: "Locks, intercom, smoke alarm, and safe night entry.",
    fields: [
      { key: "doorLocks", label: "Door / window locks", placeholder: "e.g. Front door, balcony door, and windows all locked properly." },
      { key: "intercom", label: "Intercom / doorbell", placeholder: "e.g. Video intercom worked and audio was clear." },
      { key: "smokeAlarm", label: "Smoke alarm", placeholder: "e.g. Alarm present and recent test date was shown." },
      { key: "nightEntryRoute", label: "Night entry route", placeholder: "e.g. Entry path was well lit and felt safe at night." },
      { key: "parcelRoom", label: "Parcel room / mailbox", placeholder: "e.g. Parcel room available and mailbox looked secure." },
      { key: "entryAccess", label: "Building access", placeholder: "e.g. Keycard required for lobby and lift access." },
      { key: "keycardInventory", label: "Keys / keycards", placeholder: "e.g. 1 keycard issued, card number 0211." },
    ],
  },
  {
    key: "noise",
    title: "Noise & Ventilation",
    description: "Time-based noise checks and open-window comfort.",
    fields: [
      { key: "weekdayMorning", label: "Weekday morning noise", placeholder: "e.g. Moderate road noise during peak hour." },
      { key: "lateNight", label: "After 10 pm noise", placeholder: "e.g. Quiet after 10 pm with occasional hallway noise." },
      { key: "weekend", label: "Weekend noise", placeholder: "e.g. Weekend traffic was lighter than weekday peak." },
      { key: "bedroomClosedWindows", label: "Bedroom noise with windows shut", placeholder: "e.g. Main road became faint with windows closed." },
      { key: "balconyNoise", label: "Balcony / window-open noise", placeholder: "e.g. Light car noise on balcony, no strong wind noise." },
    ],
  },
  {
    key: "kitchenBathroom",
    title: "Kitchen & Bathroom Checks",
    description: "Wet-area function, ventilation, and appliance testing.",
    fields: [
      { key: "toiletFlush", label: "Toilet flush", placeholder: "e.g. Toilet flushed strongly and refilled quickly." },
      { key: "hotColdTaps", label: "Hot / cold taps", placeholder: "e.g. All taps switched correctly between hot and cold." },
      { key: "washerDryer", label: "Washer / dryer", placeholder: "e.g. Washer and dryer were included but not test run." },
      { key: "kitchenExhaust", label: "Kitchen exhaust", placeholder: "e.g. Rangehood extracted well with low noise." },
      { key: "bathroomVentilation", label: "Bathroom ventilation", placeholder: "e.g. Exhaust fan cleared steam within a few minutes." },
      { key: "dampness", label: "Damp / mould / moisture", placeholder: "e.g. No damp smell, no fresh moisture around shower." },
    ],
  },
  {
    key: "livability",
    title: "Storage & Day-to-day Livability",
    description: "Wardrobe space, work-from-home fit, and real usable room.",
    fields: [
      { key: "wardrobeStorage", label: "Wardrobe storage", placeholder: "e.g. Wardrobe fits one person comfortably, limited shelf space." },
      { key: "kitchenStorage", label: "Kitchen storage", placeholder: "e.g. Enough cupboards for one person, limited pantry space." },
      { key: "fridgePlacement", label: "Fridge placement", placeholder: "e.g. Full-size fridge space available near power outlet." },
      { key: "bulkyItemsStorage", label: "Bulky item storage", placeholder: "e.g. No obvious space for bike or large luggage." },
      { key: "bedDeskFit", label: "Bed + desk fit", placeholder: "e.g. Double bed and desk fit, but walkway narrows to one person." },
      { key: "workFromHomeFit", label: "Work-from-home fit", placeholder: "e.g. Desk area is usable for daily laptop work." },
      { key: "twoPersonFit", label: "Two-person fit", placeholder: "e.g. Feels tight for two adults moving around together." },
    ],
  },
  {
    key: "leaseCosts",
    title: "Lease Terms & Costs",
    description: "Bond, utilities, hidden fees, pets, and lease flexibility.",
    fields: [
      { key: "furnitureMaintenance", label: "Furniture / appliance maintenance", placeholder: "e.g. Agent said included appliances are owner-maintained." },
      { key: "utilityResponsibility", label: "Utility responsibility", placeholder: "e.g. Tenant pays electricity and internet, water included." },
      { key: "hiddenFees", label: "Hidden fees", placeholder: "e.g. No extra amenity fee mentioned, ask to confirm in lease." },
      { key: "petsPolicy", label: "Pets policy", placeholder: "e.g. Pets allowed on approval." },
      { key: "subletBreakLease", label: "Sublet / break lease", placeholder: "e.g. Break lease allowed with reletting costs." },
      { key: "rentIncreaseHistory", label: "Rent increase pattern", placeholder: "e.g. Ask how often rent was raised in the last 2 years." },
      { key: "bondHandling", label: "Bond handling", placeholder: "e.g. Bond to be lodged with RTBA by the agency." },
    ],
  },
  {
    key: "buildingManagement",
    title: "Building Management",
    description: "Manager response, bookings, parking, waste, and common areas.",
    fields: [
      { key: "managerResponse", label: "Manager response speed", placeholder: "e.g. Current tenant said building manager is responsive." },
      { key: "repairTurnaround", label: "Repair turnaround", placeholder: "e.g. Minor repairs usually handled within a few days." },
      { key: "facilityBooking", label: "Facility booking rules", placeholder: "e.g. Gym free access, dining room requires booking." },
      { key: "visitorParking", label: "Visitor parking", placeholder: "e.g. No visitor parking confirmed yet." },
      { key: "bulkyWaste", label: "Bulky waste handling", placeholder: "e.g. Large rubbish must go to ground-floor waste room." },
      { key: "mailboxParcelRoom", label: "Mailbox / parcel room", placeholder: "e.g. Mailbox plus parcel room available in lobby." },
    ],
  },
  {
    key: "pestsHiddenIssues",
    title: "Pests & Hidden Defects",
    description: "Pests, under-sink moisture, window seals, and edge lifting.",
    fields: [
      { key: "pests", label: "Pest activity", placeholder: "e.g. No roaches, ants, or rodent signs seen." },
      { key: "cabinetUnderSink", label: "Cabinet / under-sink check", placeholder: "e.g. Under-sink cabinet was dry and clean." },
      { key: "windowSeals", label: "Window seals / frames", placeholder: "e.g. Seals looked clean, no mould in corners." },
      { key: "bathroomSealant", label: "Bathroom sealant", placeholder: "e.g. Shower silicone clean, not blackened." },
      { key: "skirtingFloorEdges", label: "Skirting / floor edges", placeholder: "e.g. No lifting at floor edges or skirting." },
    ],
  },
  {
    key: "entryCondition",
    title: "Entry Condition Record",
    description: "Photos, safety check dates, inventory, and renter disagreements.",
    fields: [
      { key: "conditionPhotosTaken", label: "Condition photos taken", placeholder: "e.g. Yes, 20 dated photos saved by room." },
      { key: "electricalSafetyCheck", label: "Electrical safety check", placeholder: "e.g. Latest electrical safety check date still to confirm." },
      { key: "gasSafetyCheck", label: "Gas safety check", placeholder: "e.g. No gas in unit / or ask for latest check record." },
      { key: "inventoryItems", label: "Included inventory items", placeholder: "One item per line, e.g. Washer\\nDryer\\nDesk chair", multiline: true, list: true },
      { key: "renterDisagreements", label: "Disagreements with condition record", placeholder: "One issue per line, e.g. Wall mark not recorded\\nWindow track dust", multiline: true, list: true },
    ],
  },
];

function parseList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function updateInspectionChecklistField(
  current: InspectionChecklist | null | undefined,
  sectionKey: SectionKey,
  fieldKey: string,
  rawValue: string
): InspectionChecklist {
  const next = { ...(current ?? {}) } as InspectionChecklist;
  const section = { ...((next[sectionKey] ?? {}) as SectionValue) } as Record<string, unknown>;
  const field = INSPECTION_CHECKLIST_SECTIONS.find((candidate) => candidate.key === sectionKey)?.fields.find(
    (candidate) => candidate.key === fieldKey
  );

  section[fieldKey] = field?.list ? parseList(rawValue) : rawValue;
  next[sectionKey] = section as InspectionChecklist[SectionKey];

  return next;
}

export function setInspectionChecklistFieldValue(
  current: InspectionChecklist | null | undefined,
  sectionKey: SectionKey,
  fieldKey: string,
  value: string | string[]
): InspectionChecklist {
  const next = { ...(current ?? {}) } as InspectionChecklist;
  const section = { ...((next[sectionKey] ?? {}) as SectionValue) } as Record<string, unknown>;
  const field = INSPECTION_CHECKLIST_SECTIONS.find((candidate) => candidate.key === sectionKey)?.fields.find(
    (candidate) => candidate.key === fieldKey
  );

  section[fieldKey] = field?.list ? (Array.isArray(value) ? value : parseList(value)) : Array.isArray(value) ? value.join("\n") : value;
  next[sectionKey] = section as InspectionChecklist[SectionKey];

  return next;
}

function stringifyValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join("\n");
  }

  return typeof value === "string" ? value : "";
}

export function getInspectionChecklistFieldValue(
  checklist: InspectionChecklist | null | undefined,
  sectionKey: SectionKey,
  fieldKey: string
) {
  const section = checklist?.[sectionKey] as Record<string, unknown> | undefined;
  return stringifyValue(section?.[fieldKey]);
}

export function parseInspectionChecklistFieldPath(path: string) {
  const [sectionKey, fieldKey] = path.split(".");
  if (!sectionKey || !fieldKey) {
    return null;
  }

  const section = INSPECTION_CHECKLIST_SECTIONS.find((candidate) => candidate.key === sectionKey);
  if (!section) {
    return null;
  }

  const field = section.fields.find((candidate) => candidate.key === fieldKey);
  if (!field) {
    return null;
  }

  return {
    sectionKey: section.key,
    fieldKey: field.key,
    field,
  };
}

export function listInspectionChecklistFieldPaths(): InspectionChecklistFieldPath[] {
  return INSPECTION_CHECKLIST_SECTIONS.flatMap((section) =>
    section.fields.map((field) => `${section.key}.${field.key}` as InspectionChecklistFieldPath)
  );
}

export function getFilledInspectionChecklistSections(checklist: InspectionChecklist | null | undefined) {
  if (!checklist) {
    return [];
  }

  return INSPECTION_CHECKLIST_SECTIONS.flatMap((section) => {
    const sectionValue = checklist[section.key] as Record<string, unknown> | undefined;
    if (!sectionValue) {
      return [];
    }

    const fields = section.fields
      .map((field) => {
        const rawValue = sectionValue[field.key];
        const value = stringifyValue(rawValue)
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
        return value.length > 0 ? { label: field.label, values: value } : null;
      })
      .filter(Boolean) as Array<{ label: string; values: string[] }>;

    return fields.length > 0 ? [{ title: section.title, description: section.description, fields }] : [];
  });
}

function splitChecklistListValue(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function applyLiveChecklistCapture(
  checklist: InspectionChecklist | null | undefined,
  capture: LiveChecklistCapture,
  options?: { listMode?: boolean }
) {
  const next = { ...(checklist ?? {}) } as InspectionChecklist;
  const section = { ...((next[capture.section] ?? {}) as SectionValue) } as Record<string, unknown>;
  const currentValue = section[capture.field];

  if (options?.listMode) {
    const merged = new Set<string>([
      ...splitChecklistListValue(Array.isArray(currentValue) ? currentValue.join("\n") : typeof currentValue === "string" ? currentValue : ""),
      ...splitChecklistListValue(capture.value),
    ]);
    section[capture.field] = Array.from(merged);
  } else {
    const existingText =
      Array.isArray(currentValue) ? currentValue.join("\n") : typeof currentValue === "string" ? currentValue.trim() : "";

    if (existingText.length > 0 && existingText === capture.value.trim()) {
      return next;
    }

    section[capture.field] = capture.value.trim();
  }

  next[capture.section] = section as InspectionChecklist[SectionKey];
  return next;
}
