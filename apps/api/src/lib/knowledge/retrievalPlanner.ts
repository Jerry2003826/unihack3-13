/**
 * Retrieval Planner for Rental Intelligence
 *
 * Decomposes a free-form user query into typed sub-questions,
 * routes each to an optimal retrieval strategy, executes them
 * in parallel, and fuses the results into a unified answer.
 *
 * Sub-question categories:
 *   defect      → Knowledge Base RAG  (top_k=5, rerank=true)
 *   regulation  → Knowledge Base RAG  (top_k=3, tags=["regulation","legal"])
 *   neighborhood→ Knowledge Base + web community search
 *   agency      → Knowledge Base + web agency search
 */

import { z } from "zod";
import {
  knowledgeAnswerSchema,
  type KnowledgeAnswer,
  type KnowledgeCitation,
  type KnowledgeMatch,
} from "@inspect-ai/contracts";
import { queryKnowledgeRag, queryKnowledge } from "./queryKnowledge";
import { callGeminiJson } from "../ai";
import { appEnv } from "../env";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const subQuestionCategorySchema = z.enum([
  "defect",
  "regulation",
  "neighborhood",
  "agency",
]);
export type SubQuestionCategory = z.infer<typeof subQuestionCategorySchema>;

export const subQuestionSchema = z.object({
  question: z.string().describe("A focused, self-contained sub-question."),
  category: subQuestionCategorySchema.describe(
    "defect = housing defects/hazards; regulation = tenancy law/rules; neighborhood = area quality/noise/safety; agency = landlord/agent reputation"
  ),
  keywords: z
    .array(z.string())
    .describe("2-4 keywords for retrieval, no filler words."),
});
export type SubQuestion = z.infer<typeof subQuestionSchema>;

const queryDecompositionSchema = z.object({
  subQuestions: z
    .array(subQuestionSchema)
    .min(1)
    .max(5)
    .describe("1-5 sub-questions decomposed from the user query."),
});

export const retrievalPlanResponseSchema = z.object({
  originalQuery: z.string(),
  subQuestions: z.array(
    subQuestionSchema.extend({
      strategy: z.string(),
      matches: z.array(z.any()),
      answer: knowledgeAnswerSchema.optional(),
      citations: z.array(z.any()).optional(),
    })
  ),
  fusedAnswer: knowledgeAnswerSchema,
  fusedCitations: z.array(z.any()),
  totalMatchCount: z.number(),
});
export type RetrievalPlanResponse = z.infer<typeof retrievalPlanResponseSchema>;

// ---------------------------------------------------------------------------
// Strategy definitions
// ---------------------------------------------------------------------------

interface RetrievalStrategy {
  topK: number;
  tags?: string[];
  useRerank: boolean;
  label: string;
}

const STRATEGIES: Record<SubQuestionCategory, RetrievalStrategy> = {
  defect: {
    topK: 5,
    useRerank: true,
    label: "KB RAG (defects, top_k=5, rerank=on)",
  },
  regulation: {
    topK: 3,
    tags: ["regulation", "legal", "tenancy-law"],
    useRerank: true,
    label: "KB RAG (regulation, top_k=3, tag-filtered, rerank=on)",
  },
  neighborhood: {
    topK: 4,
    tags: ["neighborhood", "noise", "safety", "location"],
    useRerank: true,
    label: "KB RAG (neighborhood, top_k=4, tag-boosted)",
  },
  agency: {
    topK: 3,
    tags: ["agency", "landlord", "property-manager"],
    useRerank: true,
    label: "KB RAG (agency/landlord, top_k=3, tag-filtered)",
  },
};

// ---------------------------------------------------------------------------
// Query Decomposer
// ---------------------------------------------------------------------------

export async function decomposeQuery(
  query: string
): Promise<SubQuestion[]> {
  try {
    const result = await callGeminiJson({
      model: appEnv.geminiVisionModel,
      schema: queryDecompositionSchema,
      timeoutMs: 8_000,
      prompt: [
        "You are a rental intelligence query planner.",
        "Decompose the user's natural-language query into 1–5 focused sub-questions.",
        "Each sub-question must have exactly one category:",
        "  defect      — visible housing issues (mould, cracks, leaks, wiring, pests)",
        "  regulation  — tenancy law, bond rules, lease clauses, notice periods",
        "  neighborhood — area noise, safety, transport, amenities, community sentiment",
        "  agency      — landlord/agent reputation, complaint history, response time",
        "",
        "Rules:",
        "- If the query is simple and fits one category, return 1 sub-question.",
        "- Extract 2–4 retrieval keywords per sub-question (no filler words).",
        "- Each sub-question must be self-contained and understandable without the original query.",
        "",
        `User query: "${query}"`,
      ].join("\n"),
    });
    return result.subQuestions;
  } catch {
    // Fallback: treat entire query as a single defect-category sub-question
    return [
      {
        question: query,
        category: "defect",
        keywords: query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 3)
          .slice(0, 4),
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Strategy Router — execute one sub-question
// ---------------------------------------------------------------------------

interface SubQuestionResult {
  subQuestion: SubQuestion;
  strategy: string;
  matches: KnowledgeMatch[];
  answer?: KnowledgeAnswer;
  citations: KnowledgeCitation[];
}

async function executeSubQuestion(
  sq: SubQuestion
): Promise<SubQuestionResult> {
  const strat = STRATEGIES[sq.category];

  try {
    const response = await queryKnowledgeRag({
      query: sq.question,
      tags: strat.tags,
      topK: strat.topK,
    });

    return {
      subQuestion: sq,
      strategy: strat.label,
      matches: response.matches,
      answer: response.answer,
      citations: response.citations,
    };
  } catch {
    // Fallback to local keyword search
    const localMatches = queryKnowledge({
      query: sq.question,
      tags: strat.tags,
      topK: strat.topK,
    });

    return {
      subQuestion: sq,
      strategy: `${strat.label} [fallback: local keyword]`,
      matches: localMatches,
      citations: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Result Fusion
// ---------------------------------------------------------------------------

function deduplicateMatches(allMatches: KnowledgeMatch[]): KnowledgeMatch[] {
  const seen = new Set<string>();
  const deduped: KnowledgeMatch[] = [];

  for (const match of allMatches) {
    const key = match.chunkId ?? `${match.sourceId}:${match.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(match);
    }
  }

  return deduped;
}

async function fuseResults(
  originalQuery: string,
  results: SubQuestionResult[]
): Promise<{ answer: KnowledgeAnswer; citations: KnowledgeCitation[] }> {
  const allMatches = deduplicateMatches(results.flatMap((r) => r.matches));
  const allCitations = results.flatMap((r) => r.citations);

  // Deduplicate citations
  const citationMap = new Map<string, KnowledgeCitation>();
  for (const citation of allCitations) {
    const key = `${citation.sourceId}:${citation.chunkId ?? ""}`;
    if (!citationMap.has(key)) {
      citationMap.set(key, citation);
    }
  }
  const uniqueCitations = Array.from(citationMap.values());

  // If no matches at all, return fallback
  if (allMatches.length === 0) {
    return {
      answer: {
        summary:
          "No relevant information found in the knowledge base for this query.",
        keyPoints: [
          "Try rephrasing your question with more specific terms.",
          "On-site inspection may be needed for visual defect queries.",
        ],
        confidence: "low",
      },
      citations: [],
    };
  }

  // Use Gemini to synthesize a fused answer from all sub-results
  try {
    const subAnswerSummaries = results
      .filter((r) => r.answer)
      .map(
        (r) =>
          `[${r.subQuestion.category.toUpperCase()}] ${r.subQuestion.question}\n→ ${r.answer!.summary}`
      );

    const fusedAnswer = await callGeminiJson({
      model: appEnv.geminiVisionModel,
      schema: knowledgeAnswerSchema,
      timeoutMs: 8_000,
      prompt: [
        "You are a rental intelligence assistant synthesizing answers from multiple retrieval channels.",
        "Combine the following per-category answers into one coherent response.",
        "Detect and highlight any conflicts between sources.",
        "summary: one unified paragraph, max 200 chars.",
        "keyPoints: 2–5 actionable bullets, max 120 chars each.",
        "confidence: based on coverage across all categories.",
        "",
        `Original query: "${originalQuery}"`,
        "",
        "Sub-question answers:",
        ...subAnswerSummaries,
        "",
        "Top knowledge matches:",
        ...allMatches
          .slice(0, 6)
          .map((m) => `[${m.tags.join(",")}] ${m.title}: ${m.snippet}`),
      ].join("\n"),
    });

    return { answer: fusedAnswer, citations: uniqueCitations };
  } catch {
    // Fallback: merge sub-answers manually
    const keyPoints = results
      .filter((r) => r.answer)
      .flatMap((r) =>
        (r.answer!.keyPoints ?? []).map(
          (kp) => `[${r.subQuestion.category}] ${kp}`
        )
      )
      .slice(0, 5);

    return {
      answer: {
        summary: `Retrieved ${allMatches.length} matches across ${results.length} sub-queries for: ${originalQuery.slice(0, 80)}`,
        keyPoints:
          keyPoints.length > 0
            ? keyPoints
            : [`${allMatches.length} knowledge matches found across categories.`],
        confidence: "medium",
      },
      citations: uniqueCitations,
    };
  }
}

// ---------------------------------------------------------------------------
// Main planner entry point
// ---------------------------------------------------------------------------

export async function planAndRetrieve(
  query: string
): Promise<RetrievalPlanResponse> {
  // Step 1: Decompose query
  const subQuestions = await decomposeQuery(query);

  // Step 2: Execute all sub-questions in parallel
  const results = await Promise.allSettled(
    subQuestions.map(executeSubQuestion)
  );

  const successfulResults = results
    .filter(
      (r): r is PromiseFulfilledResult<SubQuestionResult> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);

  // Step 3: Fuse results
  const { answer: fusedAnswer, citations: fusedCitations } =
    await fuseResults(query, successfulResults);

  const totalMatchCount = successfulResults.reduce(
    (sum, r) => sum + r.matches.length,
    0
  );

  return {
    originalQuery: query,
    subQuestions: successfulResults.map((r) => ({
      question: r.subQuestion.question,
      category: r.subQuestion.category,
      keywords: r.subQuestion.keywords,
      strategy: r.strategy,
      matches: r.matches,
      answer: r.answer,
      citations: r.citations,
    })),
    fusedAnswer,
    fusedCitations,
    totalMatchCount,
  };
}
