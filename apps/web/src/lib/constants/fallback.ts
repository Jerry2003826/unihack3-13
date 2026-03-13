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
    keySignals: ["Construction nearby", "Street noise likely"],
    nearbyTransit: ["Demo Bus Route 1"],
    destinationConvenience: [],
  },
  communityInsight: {
    summary: "Built-in fallback intelligence because the file could not be loaded.",
    highlights: ["Treat as demo-only intelligence"],
    sentiment: "unknown",
    citations: [],
  },
  agencyBackground: {
    agencyName: "Demo Agency",
    summary: "Demo fallback only. Use written commitments in a real inspection.",
    highlights: ["Not based on live public research"],
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
      warning: "Quick local summary loaded. Verify transit and street noise during your visit.",
      keySignals: ["Rapid summary only", "Verify local conditions in person"],
      nearbyTransit: [],
      destinationConvenience: [],
    },
    communityInsight: {
      summary: "Community research is still limited. Use local forums and an in-person street check before signing.",
      highlights: ["Public discussion is still loading", "Manual street check recommended"],
      sentiment: "unknown",
      citations: [],
    },
    agencyBackground: {
      agencyName: agency,
      summary: "Agency background is using a conservative fallback summary for now.",
      highlights: ["Ask for written commitments", "Verify the lease draft carefully"],
      sentimentScore: 2.5,
      commonComplaints: [],
      negotiationLeverage: "Ask the agent for written repair records and lease details before signing.",
      citations: [],
    },
  };
}
