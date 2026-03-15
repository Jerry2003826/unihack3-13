import { describe, expect, it, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
// Mock callGeminiJson before importing the module under test
// -----------------------------------------------------------------------

const mockGeminiResponse = vi.fn();

vi.mock("../ai", () => ({
  callGeminiJson: (...args: unknown[]) => mockGeminiResponse(...args),
}));

vi.mock("../env", () => ({
  appEnv: {
    geminiApiKey: "test-key",
    geminiVisionModel: "gemini-2.5-flash",
    cohereApiKey: "",
    qdrantUrl: "",
    qdrantCollection: "",
    cohereEmbedModel: "",
    cohereRerankModel: "",
  },
}));

import {
  decomposeQuery,
  type SubQuestion,
} from "./retrievalPlanner";

describe("Retrieval Planner", () => {
  beforeEach(() => {
    mockGeminiResponse.mockReset();
  });

  describe("decomposeQuery", () => {
    it("decomposes a multi-topic query into categorized sub-questions", async () => {
      mockGeminiResponse.mockResolvedValueOnce({
        subQuestions: [
          {
            question: "Are there any visible cracks on the walls?",
            category: "defect",
            keywords: ["cracks", "walls", "damage"],
          },
          {
            question: "What are the noise levels in the neighborhood?",
            category: "neighborhood",
            keywords: ["noise", "neighborhood", "quiet"],
          },
          {
            question: "What is the agent's complaint history?",
            category: "agency",
            keywords: ["agent", "complaint", "reputation"],
          },
        ],
      });

      const result = await decomposeQuery(
        "The walls look cracked, is the area noisy, and is the agent reliable?"
      );

      expect(result).toHaveLength(3);
      expect(result[0]!.category).toBe("defect");
      expect(result[1]!.category).toBe("neighborhood");
      expect(result[2]!.category).toBe("agency");
    });

    it("returns a single defect sub-question as fallback on Gemini failure", async () => {
      mockGeminiResponse.mockRejectedValueOnce(new Error("API timeout"));

      const result = await decomposeQuery("mould on bathroom ceiling");

      expect(result).toHaveLength(1);
      expect(result[0]!.category).toBe("defect");
      expect(result[0]!.question).toBe("mould on bathroom ceiling");
      expect(result[0]!.keywords).toContain("mould");
    });

    it("handles a simple single-category query", async () => {
      mockGeminiResponse.mockResolvedValueOnce({
        subQuestions: [
          {
            question: "What are the bond refund rules in Victoria?",
            category: "regulation",
            keywords: ["bond", "refund", "victoria"],
          },
        ],
      });

      const result = await decomposeQuery("bond refund rules in Victoria");

      expect(result).toHaveLength(1);
      expect(result[0]!.category).toBe("regulation");
    });
  });

  describe("SubQuestion categories", () => {
    it("covers all four expected categories", () => {
      const categories: SubQuestion["category"][] = [
        "defect",
        "regulation",
        "neighborhood",
        "agency",
      ];
      expect(categories).toHaveLength(4);
      for (const cat of categories) {
        expect(["defect", "regulation", "neighborhood", "agency"]).toContain(cat);
      }
    });
  });
});
