import type { PeoplePaperworkChecks, ReportSnapshot } from "./schemas";

function hasRepairPressure(snapshot: ReportSnapshot) {
  return snapshot.hazards.some((hazard) => hazard.severity === "Critical" || hazard.severity === "High");
}

export function buildPeoplePaperworkChecks(snapshot: ReportSnapshot): PeoplePaperworkChecks {
  const checklist = [
    "Confirm the landlord or managing agency name matches the lease and payment instructions.",
    "Request a full condition report before paying bond or first rent.",
    "Ask for written confirmation of any promised repairs, with dates.",
    "Verify who will hold the bond and how it will be lodged.",
    "Check the rent, inclusions, and move-in date match the listing and lease draft.",
  ];

  const requiredDocuments = [
    "Draft lease agreement",
    "Condition report / entry report",
    "Bond lodgement details",
    "Repair and maintenance history for major issues",
    "Written list of included appliances, parking, and utilities",
  ];

  const suggestedQuestions = [
    "Who is the legal landlord and who should notices be sent to?",
    "Can you confirm all promised repairs in writing before signing?",
    "When was the last inspection or maintenance visit completed?",
    "What is the process if a safety or water issue appears after move-in?",
  ];

  const riskFlags: string[] = [];

  if (!snapshot.inputs.agency && !snapshot.intelligence?.agencyBackground?.agencyName) {
    riskFlags.push("Agency or manager identity is missing from the current report.");
  }

  if (hasRepairPressure(snapshot)) {
    riskFlags.push("Visible high-severity issues mean repair promises should be documented before signing.");
  }

  if ((snapshot.intelligence?.agencyBackground?.sentimentScore ?? 3) < 3.2) {
    riskFlags.push("Public agency sentiment is weak; avoid relying on verbal commitments alone.");
  }

  if (!snapshot.intelligence?.communityInsight?.citations.length) {
    riskFlags.push("Community evidence is limited; verify local conditions with an in-person follow-up.");
  }

  if (!snapshot.inputs.address && !snapshot.inputs.coordinates) {
    riskFlags.push("Address evidence is incomplete; verify the exact property identity before transferring money.");
  }

  return {
    checklist,
    riskFlags,
    requiredDocuments,
    suggestedQuestions,
  };
}
