import type { GroundedCatalogItem } from "@/lib/grounding";

type Channel = "community" | "agency" | "geo";

const DOMAIN_BONUSES = [
  "reddit.com",
  "whirlpool.net.au",
  "productreview.com.au",
  "ratemyagent.com.au",
  "domain.com.au",
  "realestate.com.au",
  "theage.com.au",
  "abc.net.au",
  "heraldsun.com.au",
  "news.com.au",
  "council",
  "vic.gov.au",
  "gov.au",
  "police",
  "forum",
];

const HIGH_VALUE_PATH_PATTERNS = [
  /\/review/i,
  /\/reviews/i,
  /\/complaint/i,
  /\/complaints/i,
  /\/forum/i,
  /\/thread/i,
  /\/discussion/i,
  /\/news/i,
  /\/article/i,
  /\/stories/i,
  /\/tenant/i,
  /\/rent/i,
  /\/maintenance/i,
  /\/repair/i,
  /\/bond/i,
  /\/tribunal/i,
  /\/vcat/i,
];

const DIRECTORY_DOMAIN_PATTERNS = [
  "yellowpages",
  "australia247",
  "wordofmouth",
  "localsearch",
  "findglocal",
  "opendi",
  "hotfrog",
  "firmania",
  "yalwa",
  "cybo",
];

const OFFICIAL_SITE_PATTERNS = [
  /official website/i,
  /about us/i,
  /contact us/i,
  /our team/i,
  /property listings/i,
  /for sale/i,
  /book appraisal/i,
];

const TRANSIT_STOP_PATTERNS = [
  /\bstation\b/i,
  /\bdepot\b/i,
  /\btram stop\b/i,
  /\bbus stop\b/i,
  /\bplatform\b/i,
  /\broute\b/i,
];

const MAP_LISTING_PATTERNS = [
  /maps\.google\./i,
  /\bcid=/i,
  /google\.[^/]+\/maps/i,
  /\/place\//i,
];

const LOW_VALUE_PATTERNS = [
  /opening hours/i,
  /book now/i,
  /order online/i,
  /takeaway/i,
  /menu/i,
  /get directions/i,
  /call now/i,
  /phone number/i,
  /official website/i,
  /book an appointment/i,
  /business hours/i,
];

const LOW_VALUE_BUSINESS_TERMS = [
  "restaurant",
  "cafe",
  "clinic",
  "gym",
  "pharmacy",
  "dentist",
  "burger",
  "pizza",
  "florist",
  "pathology",
  "medical centre",
  "medical center",
  "shopping centre",
  "shopping center",
  "fast food",
];

const CHANNEL_KEYWORDS: Record<Channel, string[]> = {
  community: [
    "renter",
    "tenant",
    "apartment",
    "building",
    "suburb",
    "resident",
    "noise",
    "traffic",
    "construction",
    "safety",
    "crime",
    "parking",
    "street",
    "night",
    "forum",
    "complaint",
    "review",
  ],
  agency: [
    "agency",
    "real estate",
    "property manager",
    "tenant",
    "maintenance",
    "repair",
    "complaint",
    "review",
    "bond",
    "lease",
    "inspection",
    "tribunal",
    "communication",
    "responsive",
    "landlord",
  ],
  geo: [
    "noise",
    "traffic",
    "construction",
    "roadworks",
    "safety",
    "crime",
    "parking",
    "late night",
    "street",
    "tenant",
    "renter",
    "building",
    "complaint",
  ],
};

const STRONG_EVIDENCE_KEYWORDS: Record<Channel, string[]> = {
  community: [
    "renter",
    "tenant",
    "forum",
    "complaint",
    "discussion",
    "review",
    "noise",
    "traffic",
    "roadworks",
    "construction",
    "safety",
    "crime",
    "parking",
    "council",
    "news",
  ],
  agency: [
    "tenant",
    "review",
    "complaint",
    "maintenance",
    "repair",
    "bond",
    "lease",
    "tribunal",
    "vcat",
    "consumer affairs",
    "property manager",
    "communication",
    "dispute",
  ],
  geo: [
    "noise",
    "traffic",
    "construction",
    "roadworks",
    "incident",
    "parking",
    "safety",
    "crime",
    "council",
    "news",
    "community",
    "renter",
    "tenant",
  ],
};

const FAMILY_KEYWORDS: Record<string, string[]> = {
  "noise-and-traffic": ["noise", "traffic", "congestion", "road", "truck", "tram", "train", "bus", "arterial", "peak"],
  "construction-and-disruption": ["construction", "roadworks", "works", "dust", "crane", "development", "disruption", "closure"],
  "safety-and-after-hours": ["safety", "crime", "police", "night", "late", "lighting", "antisocial", "incident"],
  "renter-forums-and-building-chat": ["renter", "tenant", "forum", "apartment", "building", "strata", "body corporate", "neighbour"],
  "street-liveability-and-parking": ["parking", "walkability", "liveability", "street", "resident", "permit", "convenience"],
  "communication-and-professionalism": ["communication", "professional", "service", "responsive", "follow-up", "manager", "review"],
  "maintenance-and-repairs": ["maintenance", "repair", "mould", "leak", "fix", "urgent", "inspection", "work order"],
  "bond-fees-and-paperwork": ["bond", "deposit", "fee", "paperwork", "lease", "contract", "refund", "rtba"],
  "inspection-disputes-and-escalations": ["inspection", "dispute", "tribunal", "vcat", "complaint", "escalation", "breach"],
  "renter-complaints-and-building-warnings": ["renter", "tenant", "complaint", "warning", "building", "neighbour", "issue"],
};

function tokenize(value?: string) {
  return [...new Set((value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4))];
}

function parseFamily(item: GroundedCatalogItem) {
  const match = item.snippet?.match(/^Family:\s*([^|]+)\s*\|/i);
  return match?.[1]?.trim().toLowerCase();
}

function stripFamilyPrefix(value: string | undefined) {
  return (value ?? "").replace(/^Family:\s*[^|]+\s*\|\s*/i, "");
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getPathname(url: string) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function scoreKeywordHits(haystack: string, keywords: string[], weight: number, cap: number) {
  let score = 0;

  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += weight;
    }
    if (score >= cap) {
      return cap;
    }
  }

  return Math.min(score, cap);
}

function scoreGroundedWebItem(item: GroundedCatalogItem, channel: Channel, context: string[]) {
  const hostname = getHostname(item.url);
  const pathname = getPathname(item.url);
  const bodyText = stripFamilyPrefix(item.snippet);
  const haystack = `${item.title} ${item.url} ${bodyText}`.toLowerCase();
  const family = parseFamily(item);
  const contextTokens = context.flatMap((value) => tokenize(value));
  const hasDirectoryDomain = DIRECTORY_DOMAIN_PATTERNS.some((domain) => hostname.includes(domain));
  const hasHighValueDomain = DOMAIN_BONUSES.some((domain) => hostname.includes(domain));
  const hasHighValuePath = HIGH_VALUE_PATH_PATTERNS.some((pattern) => pattern.test(pathname));

  let score = 0;
  score += scoreKeywordHits(haystack, contextTokens, 1, 6);
  score += scoreKeywordHits(haystack, CHANNEL_KEYWORDS[channel], 2, 8);
  if (family && FAMILY_KEYWORDS[family]) {
    score += scoreKeywordHits(haystack, FAMILY_KEYWORDS[family], 2, 8);
  }

  if (hasHighValueDomain) {
    score += 2;
  }
  if (hasHighValuePath) {
    score += 2;
  }

  const hasTopicSignal =
    scoreKeywordHits(haystack, CHANNEL_KEYWORDS[channel], 1, 2) > 0 ||
    (family && scoreKeywordHits(haystack, FAMILY_KEYWORDS[family] ?? [], 1, 2) > 0);
  const hasStrongEvidenceSignal =
    scoreKeywordHits(haystack, STRONG_EVIDENCE_KEYWORDS[channel], 1, 3) > 0 || hasHighValueDomain || hasHighValuePath;

  if (MAP_LISTING_PATTERNS.some((pattern) => pattern.test(item.url)) || hostname.startsWith("maps.google.")) {
    score -= 8;
  }

  if (hasDirectoryDomain) {
    score -= 5;
  }

  if (!hasTopicSignal && LOW_VALUE_BUSINESS_TERMS.some((term) => haystack.includes(term))) {
    score -= 5;
  }

  if (OFFICIAL_SITE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    score -= 4;
  }

  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    score -= 4;
  }

  if (TRANSIT_STOP_PATTERNS.some((pattern) => pattern.test(item.title)) && !hasStrongEvidenceSignal) {
    score -= 5;
  }

  if (/^\d+\s+[a-z]/i.test(item.title.trim()) && !hasTopicSignal) {
    score -= 3;
  }

  if (!hasStrongEvidenceSignal && !hasTopicSignal) {
    score -= 3;
  }

  return score;
}

export function filterGroundedWebCatalog(
  catalog: GroundedCatalogItem[],
  args: {
    channel: Channel;
    context: string[];
    minScore?: number;
    fallbackCount?: number;
  }
) {
  const scored = catalog
    .map((item) => ({
      item,
      score: scoreGroundedWebItem(item, args.channel, args.context),
    }))
    .sort((left, right) => right.score - left.score);

  const filtered = scored
    .filter((entry) => entry.score >= (args.minScore ?? 3))
    .map((entry) => entry.item);

  if (filtered.length > 0) {
    return filtered;
  }

  const fallbackCount = args.fallbackCount ?? 0;
  return fallbackCount > 0 ? scored.slice(0, fallbackCount).map((entry) => entry.item) : [];
}
