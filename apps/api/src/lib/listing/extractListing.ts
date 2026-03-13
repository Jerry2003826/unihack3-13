import { z } from "zod";
import {
  listingExtractResponseSchema,
  sanitizeDisplayList,
  sanitizeDisplayText,
  type InspectionChecklist,
  type ListingExtractResponse,
} from "@inspect-ai/contracts";
import { callGeminiJson } from "@/lib/ai";
import { appEnv } from "@/lib/env";
import { fetchText } from "@/lib/http";

const extractionSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  address: z.string().optional(),
  agencyName: z.string().optional(),
  rentText: z.string().optional(),
  propertyType: z.string().optional(),
  furnishing: z.string().optional(),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().int().optional(),
  parking: z.string().optional(),
  inspectionText: z.string().optional(),
  features: z.array(z.string()).optional(),
  inventoryHints: z.array(z.string()).optional(),
  checklistHints: z
    .object({
      utilities: z
        .object({
          heatingCooling: z.string().optional(),
          internetNbn: z.string().optional(),
        })
        .optional(),
      security: z
        .object({
          entryAccess: z.string().optional(),
          parcelRoom: z.string().optional(),
        })
        .optional(),
      livability: z
        .object({
          bedDeskFit: z.string().optional(),
          twoPersonFit: z.string().optional(),
        })
        .optional(),
      leaseCosts: z
        .object({
          furnitureMaintenance: z.string().optional(),
          utilityResponsibility: z.string().optional(),
          hiddenFees: z.string().optional(),
          petsPolicy: z.string().optional(),
          subletBreakLease: z.string().optional(),
          bondHandling: z.string().optional(),
        })
        .optional(),
      buildingManagement: z
        .object({
          facilityBooking: z.string().optional(),
          visitorParking: z.string().optional(),
          mailboxParcelRoom: z.string().optional(),
        })
        .optional(),
      entryCondition: z
        .object({
          inventoryItems: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

function isDisallowedHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function validateListingUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https listing URLs are supported.");
  }
  if (isDisallowedHost(url.hostname.toLowerCase())) {
    throw new Error("Private or local listing URLs are not allowed.");
  }
  return url;
}

function extractMeta(html: string, name: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonLdCandidates(html: string) {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const values: unknown[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      values.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }

  return values;
}

function pickJsonLdFacts(candidates: unknown[]) {
  const facts: Record<string, unknown> = {};

  function walk(node: unknown) {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;
    if (!facts.title && typeof record.name === "string") {
      facts.title = record.name;
    }
    if (!facts.summary && typeof record.description === "string") {
      facts.summary = record.description;
    }
    if (!facts.address && typeof record.streetAddress === "string") {
      facts.address = record.streetAddress;
    }
    if (!facts.address && typeof record.address === "object" && record.address !== null) {
      const addr = record.address as Record<string, unknown>;
      const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
        .filter((item) => typeof item === "string")
        .map((item) => String(item));
      if (parts.length) {
        facts.address = parts.join(", ");
      }
    }
    if (!facts.rentText && typeof record.price === "number") {
      facts.rentText = `$${record.price}`;
    }
    if (!facts.bedrooms && typeof record.numberOfBedroomsTotal === "number") {
      facts.bedrooms = record.numberOfBedroomsTotal;
    }
    if (!facts.bathrooms && typeof record.numberOfBathroomsTotal === "number") {
      facts.bathrooms = record.numberOfBathroomsTotal;
    }
    if (!facts.propertyType && typeof record["@type"] === "string") {
      facts.propertyType = record["@type"];
    }

    Object.values(record).forEach(walk);
  }

  candidates.forEach(walk);
  return facts;
}

function buildFallbackChecklistHints(args: {
  title?: string;
  description?: string;
  text: string;
}) {
  const haystack = `${args.title ?? ""} ${args.description ?? ""} ${args.text}`.toLowerCase();
  let checklist: InspectionChecklist = {};

  const maybeSet = (path: string, value: string | string[] | undefined) => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return;
    }

    const [sectionKey, fieldKey] = path.split(".");
    const next = { ...checklist } as Record<string, unknown>;
    const section = { ...(((next[sectionKey] as Record<string, unknown> | undefined) ?? {})) };
    section[fieldKey] = value;
    next[sectionKey] = section;
    checklist = next as InspectionChecklist;
  };

  if (/furnished|fully furnished|partly furnished/i.test(haystack)) {
    maybeSet("leaseCosts.furnitureMaintenance", "Listing indicates furniture is included. Confirm who maintains included items.");
  }
  if (/washer|washing machine|dryer|microwave|fridge|dishwasher|desk|bed|mattress|wardrobe/i.test(haystack)) {
    const items = [...new Set((haystack.match(/washer|washing machine|dryer|microwave|fridge|dishwasher|desk|bed|mattress|wardrobe/g) ?? []).map((item) => item))];
    maybeSet("entryCondition.inventoryItems", items.map((item) => item.replace(/\b\w/g, (char) => char.toUpperCase())));
  }
  if (/air conditioning|air-conditioning|split system|heating|cooling/i.test(haystack)) {
    maybeSet("utilities.heatingCooling", "Listing mentions heating or cooling. Confirm that the system works in person.");
  }
  if (/intercom|secure entry|key fob|keycard|swipe access/i.test(haystack)) {
    maybeSet("security.entryAccess", "Listing suggests controlled building access. Confirm intercom, locks, and access cards during inspection.");
  }
  if (/parcel|mailbox|mail room|package room/i.test(haystack)) {
    maybeSet("security.parcelRoom", "Listing or building copy suggests parcel or mailbox facilities are available.");
  }
  if (/parking|car space|carpark|garage/i.test(haystack)) {
    maybeSet("buildingManagement.visitorParking", "Listing mentions parking. Confirm allocated and visitor parking rules directly.");
  }
  if (/gym|pool|sauna|bbq|terrace|library|study lounge|dining room|pet wash/i.test(haystack)) {
    maybeSet("buildingManagement.facilityBooking", "Listing mentions common facilities. Confirm access rules and booking requirements directly.");
  }
  if (/pets|pet friendly|pet-friendly|no pets/i.test(haystack)) {
    maybeSet("leaseCosts.petsPolicy", "Listing mentions a pets policy. Confirm the exact lease wording before signing.");
  }
  if (/internet included|wifi included|nbn/i.test(haystack)) {
    maybeSet("utilities.internetNbn", "Listing mentions internet or NBN. Confirm the connection type and activation process.");
  }
  if (/utilities included|water included|bills included|electricity included/i.test(haystack)) {
    maybeSet("leaseCosts.utilityResponsibility", "Listing mentions included utilities. Confirm exactly which bills are included in writing.");
  }

  return checklist;
}

export async function extractListingDetails(listingUrl: string): Promise<ListingExtractResponse> {
  const validated = validateListingUrl(listingUrl);
  const html = await fetchText(validated, {
    timeoutMs: 12_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = extractMeta(html, "description") ?? extractMeta(html, "og:description");
  const ogTitle = extractMeta(html, "og:title");
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]?.trim();
  const text = stripHtml(html).slice(0, 16_000);
  const jsonLdFacts = pickJsonLdFacts(extractJsonLdCandidates(html));
  const fallbackHints = buildFallbackChecklistHints({
    title: ogTitle ?? title,
    description,
    text,
  });

  try {
    const structured = await callGeminiJson({
      model: appEnv.geminiIntelligenceModel,
      schema: extractionSchema,
      timeoutMs: 8_000,
      prompt: [
        "Extract renter-relevant facts from this property listing page.",
        "Return only JSON.",
        "Prefer facts that appear directly in the listing text or metadata.",
        "Do not invent unit-condition checks like hot water stability, water pressure, smoke alarm test date, or pest status.",
        "checklistHints should only fill fields that can reasonably come from the listing page itself.",
        "features and inventoryHints should be short phrases.",
        JSON.stringify(
          {
            url: validated.toString(),
            canonical,
            title: ogTitle ?? title,
            description,
            jsonLdFacts,
            text,
          },
          null,
          2
        ),
      ].join("\n"),
    });

    return listingExtractResponseSchema.parse({
      listing: {
        url: validated.toString(),
        title: sanitizeDisplayText(structured.title ?? String(jsonLdFacts.title ?? ogTitle ?? title ?? ""), {
          maxLength: 120,
          maxSegments: 2,
          fallback: structured.title ?? String(jsonLdFacts.title ?? ogTitle ?? title ?? ""),
        }),
        summary: structured.summary
          ? sanitizeDisplayText(structured.summary, { maxLength: 180, maxSegments: 2, fallback: structured.summary })
          : description
            ? sanitizeDisplayText(description, { maxLength: 180, maxSegments: 2, fallback: description })
            : undefined,
        address: structured.address ?? (typeof jsonLdFacts.address === "string" ? jsonLdFacts.address : undefined),
        agencyName: structured.agencyName,
        rentText: structured.rentText ?? (typeof jsonLdFacts.rentText === "string" ? jsonLdFacts.rentText : undefined),
        propertyType:
          structured.propertyType ?? (typeof jsonLdFacts.propertyType === "string" ? jsonLdFacts.propertyType : undefined),
        furnishing: structured.furnishing,
        bedrooms: structured.bedrooms ?? (typeof jsonLdFacts.bedrooms === "number" ? jsonLdFacts.bedrooms : undefined),
        bathrooms: structured.bathrooms ?? (typeof jsonLdFacts.bathrooms === "number" ? jsonLdFacts.bathrooms : undefined),
        parking: structured.parking,
        inspectionText: structured.inspectionText,
        features: sanitizeDisplayList(structured.features ?? [], { maxItems: 12, itemMaxLength: 60 }),
        inventoryHints: sanitizeDisplayList(structured.inventoryHints ?? [], { maxItems: 10, itemMaxLength: 48 }),
        checklistHints: {
          ...fallbackHints,
          ...structured.checklistHints,
          entryCondition: {
            ...fallbackHints.entryCondition,
            ...structured.checklistHints?.entryCondition,
            inventoryItems:
              structured.checklistHints?.entryCondition?.inventoryItems?.length
                ? sanitizeDisplayList(structured.checklistHints.entryCondition.inventoryItems, {
                    maxItems: 12,
                    itemMaxLength: 40,
                  })
                : fallbackHints.entryCondition?.inventoryItems,
          },
        },
      },
      provider: "html+gemini",
    });
  } catch {
    return listingExtractResponseSchema.parse({
      listing: {
        url: validated.toString(),
        title: sanitizeDisplayText(String(jsonLdFacts.title ?? ogTitle ?? title ?? validated.toString()), {
          maxLength: 120,
          maxSegments: 2,
          fallback: String(jsonLdFacts.title ?? ogTitle ?? title ?? validated.toString()),
        }),
        summary: description
          ? sanitizeDisplayText(description, { maxLength: 180, maxSegments: 2, fallback: description })
          : undefined,
        address: typeof jsonLdFacts.address === "string" ? jsonLdFacts.address : undefined,
        rentText: typeof jsonLdFacts.rentText === "string" ? jsonLdFacts.rentText : undefined,
        propertyType: typeof jsonLdFacts.propertyType === "string" ? jsonLdFacts.propertyType : undefined,
        bedrooms: typeof jsonLdFacts.bedrooms === "number" ? jsonLdFacts.bedrooms : undefined,
        bathrooms: typeof jsonLdFacts.bathrooms === "number" ? jsonLdFacts.bathrooms : undefined,
        features: [],
        inventoryHints: fallbackHints.entryCondition?.inventoryItems ?? [],
        checklistHints: fallbackHints,
      },
      provider: "fallback",
    });
  }
}
