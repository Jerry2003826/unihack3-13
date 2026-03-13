import type { MockHazardTimelineEvent, PropertyIntelligence } from "@inspect-ai/contracts";

export const DEFAULT_DEMO_TIMELINE: MockHazardTimelineEvent[] = [
  {
    eventId: "fallback-mock-001",
    atMs: 2000,
    hazard: {
      category: "Mould",
      severity: "High",
      description: "Fallback timeline: Visible dark mould near window seal.",
      boundingBox: {
        x_min: 0.1,
        y_min: 0.1,
        x_max: 0.3,
        y_max: 0.3,
      },
      estimatedCost: {
        amount: 200,
        currency: "AUD",
        reason: "Professional cleaning",
      },
    },
  },
  {
    eventId: "fallback-mock-002",
    atMs: 5000,
    hazard: {
      category: "Electrical",
      severity: "Critical",
      description: "Fallback timeline: Exposed wiring near light switch.",
      boundingBox: {
        x_min: 0.7,
        y_min: 0.4,
        x_max: 0.8,
        y_max: 0.6,
      },
    },
  },
];

export const DEFAULT_DEMO_INTELLIGENCE: PropertyIntelligence = {
  address: "Demo Address (Fallback)",
  geoAnalysis: {
    noiseRisk: "High",
    transitScore: 60,
    warning: "Loud environment, near construction site.",
    nearbyTransit: ["Demo Bus Route 1"],
    destinationConvenience: [],
  },
  communityInsight: {
    summary: "Built-in fallback intelligence because the file could not be loaded.",
    sentiment: "unknown",
    citations: [],
  },
  agencyBackground: {
    agencyName: "Demo Agency",
    sentimentScore: 3.0,
    commonComplaints: ["Late responses to maintenance"],
    negotiationLeverage: "N/A",
    citations: [],
  },
};

export function getRadarTimeoutFallback(address: string, agency: string): PropertyIntelligence {
  return {
    address,
    geoAnalysis: {
      noiseRisk: "Medium",
      transitScore: 50,
      warning: "Background checks timed out. Manual verification recommended.",
      nearbyTransit: [],
      destinationConvenience: [],
    },
    communityInsight: {
      summary: "Community research timed out. Check local forums manually before signing.",
      sentiment: "unknown",
      citations: [],
    },
    agencyBackground: {
      agencyName: agency,
      sentimentScore: 2.5,
      commonComplaints: [],
      negotiationLeverage: "Background check timed out. Ask the agent for written evidence before signing.",
      citations: [],
    },
  };
}
