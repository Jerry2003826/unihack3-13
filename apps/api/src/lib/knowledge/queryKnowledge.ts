import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  knowledgeAnswerSchema,
  type KnowledgeAnswer,
  type KnowledgeCitation,
  type KnowledgeMatch,
  type KnowledgeQueryResponse,
  type KnowledgeQueryTrace,
} from "@inspect-ai/contracts";
import { appEnv } from "../env";

interface KnowledgeDocument {
  sourceId: string;
  title: string;
  tags: string[];
  content: string;
}

export interface KnowledgeChunk {
  documentId: string;
  chunkId: string;
  sourceId: string;
  title: string;
  url: string;
  tags: string[];
  content: string;
  chunkIndex: number;
  totalChunks: number;
}

interface RankedKnowledgeChunk {
  chunk: KnowledgeChunk;
  retrievalScore: number;
  rerankScore?: number;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_CHUNK_TARGET = 420;
const KNOWLEDGE_CHUNK_OVERLAP = 80;
const RAG_RETRIEVE_LIMIT = 12;

let cachedKnowledgeDocs: KnowledgeDocument[] | null = null;
let cachedKnowledgeChunks: KnowledgeChunk[] | null = null;

function buildKbUrl(sourceId: string) {
  return `kb://${sourceId}`;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function loadKnowledgeDocs() {
  if (cachedKnowledgeDocs) {
    return cachedKnowledgeDocs;
  }

  const filePath = resolve(moduleDir, "../../data/rental-knowledge.json");
  cachedKnowledgeDocs = JSON.parse(readFileSync(filePath, "utf8")) as KnowledgeDocument[];
  return cachedKnowledgeDocs;
}

function findChunkBoundary(text: string, start: number, suggestedEnd: number) {
  const max = Math.min(text.length, suggestedEnd + 60);
  const min = Math.min(text.length, start + Math.floor(KNOWLEDGE_CHUNK_TARGET * 0.55));

  let boundary = suggestedEnd;
  for (let index = suggestedEnd; index <= max; index += 1) {
    const char = text[index];
    if (char === "." || char === "!" || char === "?" || char === ";") {
      boundary = index + 1;
      break;
    }
  }

  if (boundary < min) {
    boundary = Math.min(text.length, start + KNOWLEDGE_CHUNK_TARGET);
  }

  return boundary;
}

function chunkKnowledgeDocument(doc: KnowledgeDocument): KnowledgeChunk[] {
  const normalized = normalizeText(doc.content);
  if (!normalized) {
    return [];
  }

  if (normalized.length <= KNOWLEDGE_CHUNK_TARGET) {
    return [
      {
        documentId: doc.sourceId,
        chunkId: `${doc.sourceId}::0`,
        sourceId: doc.sourceId,
        title: doc.title,
        url: buildKbUrl(doc.sourceId),
        tags: doc.tags,
        content: normalized,
        chunkIndex: 0,
        totalChunks: 1,
      },
    ];
  }

  const fragments: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const suggestedEnd = Math.min(normalized.length, cursor + KNOWLEDGE_CHUNK_TARGET);
    const boundary = findChunkBoundary(normalized, cursor, suggestedEnd);
    const fragment = normalized.slice(cursor, boundary).trim();

    if (fragment) {
      fragments.push(fragment);
    }

    if (boundary >= normalized.length) {
      break;
    }

    cursor = Math.max(boundary - KNOWLEDGE_CHUNK_OVERLAP, cursor + 1);
  }

  return fragments.map((content, chunkIndex) => ({
    documentId: doc.sourceId,
    chunkId: `${doc.sourceId}::${chunkIndex}`,
    sourceId: doc.sourceId,
    title: doc.title,
    url: buildKbUrl(doc.sourceId),
    tags: doc.tags,
    content,
    chunkIndex,
    totalChunks: fragments.length,
  }));
}

export function buildKnowledgeChunks(docs: KnowledgeDocument[] = loadKnowledgeDocs()) {
  if (docs === cachedKnowledgeDocs && cachedKnowledgeChunks) {
    return cachedKnowledgeChunks;
  }

  const chunks = docs.flatMap(chunkKnowledgeDocument);

  if (docs === cachedKnowledgeDocs) {
    cachedKnowledgeChunks = chunks;
  }

  return chunks;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function buildSnippet(content: string, queryTokens: string[]) {
  const normalized = content.toLowerCase();
  const firstMatch = queryTokens.find((token) => normalized.includes(token));

  if (!firstMatch) {
    return content.slice(0, 220);
  }

  const index = normalized.indexOf(firstMatch);
  const start = Math.max(0, index - 100);
  const end = Math.min(content.length, index + 180);
  return content.slice(start, end).trim();
}

function toKnowledgeMatch(args: {
  chunk: KnowledgeChunk;
  queryTokens: string[];
  retrievalScore?: number;
  rerankScore?: number;
}): KnowledgeMatch {
  return {
    sourceId: args.chunk.sourceId,
    title: args.chunk.title,
    snippet: buildSnippet(args.chunk.content, args.queryTokens),
    tags: args.chunk.tags,
    documentId: args.chunk.documentId,
    chunkId: args.chunk.chunkId,
    retrievalScore: args.retrievalScore,
    rerankScore: args.rerankScore,
  };
}

function intersectsTags(left: string[], right: Set<string>) {
  for (const tag of left) {
    if (right.has(tag.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function queryKnowledge(args: {
  query: string;
  tags?: string[];
  topK?: number;
}): KnowledgeMatch[] {
  const chunks = buildKnowledgeChunks();
  const queryTokens = tokenize(args.query);
  const requestedTags = new Set((args.tags ?? []).map((tag) => tag.toLowerCase()));

  const scored = chunks
    .map((chunk) => {
      const docText = `${chunk.title} ${chunk.content} ${chunk.tags.join(" ")}`.toLowerCase();
      let score = 0;

      for (const token of queryTokens) {
        if (docText.includes(token)) {
          score += 4;
        }
      }

      for (const tag of chunk.tags) {
        if (requestedTags.has(tag.toLowerCase())) {
          score += 6;
        }
      }

      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .filter((item) => (requestedTags.size > 0 ? intersectsTags(item.chunk.tags, requestedTags) : true))
    .sort((left, right) => right.score - left.score)
    .slice(0, args.topK ?? 4);

  return scored.map(({ chunk, score }) =>
    toKnowledgeMatch({
      chunk,
      queryTokens,
      retrievalScore: Number(score.toFixed(4)),
      rerankScore: Number(score.toFixed(4)),
    })
  );
}

function buildCitations(matches: KnowledgeMatch[]): KnowledgeCitation[] {
  const seen = new Set<string>();
  const citations: KnowledgeCitation[] = [];

  for (const match of matches) {
    const citation: KnowledgeCitation = {
      sourceId: match.sourceId,
      title: match.title,
      url: buildKbUrl(match.sourceId),
      documentId: match.documentId,
      chunkId: match.chunkId,
    };

    const key = `${citation.sourceId}:${citation.chunkId ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    citations.push(citation);
  }

  return citations;
}

function buildFallbackAnswer(query: string, matches: KnowledgeMatch[]): KnowledgeAnswer {
  if (matches.length === 0) {
    return {
      summary:
        "Knowledge base has no high-confidence matches for this query. Continue with on-site checks and paperwork verification.",
      keyPoints: [
        "Capture clearer inspection evidence before committing.",
        "Prioritize lease paperwork and written repair commitments.",
      ],
      confidence: "low",
    };
  }

  return {
    summary: `Retrieved ${matches.length} renter-knowledge matches for: ${query.slice(0, 90)}`,
    keyPoints: matches.slice(0, 3).map((match) => `${match.title}: ${match.snippet}`),
    confidence: "medium",
  };
}

function buildFallbackKnowledgeResponse(args: {
  query: string;
  tags?: string[];
  topK: number;
  reason: string;
  extraFailures?: string[];
}): KnowledgeQueryResponse {
  const matches = queryKnowledge({
    query: args.query,
    tags: args.tags,
    topK: args.topK,
  });

  const trace: KnowledgeQueryTrace = {
    mode: "fallback",
    collection: appEnv.qdrantCollection,
    embedModel: appEnv.cohereEmbedModel,
    rerankModel: appEnv.cohereRerankModel,
    answerModel: "gemini-2.5-flash",
    retrievedCount: matches.length,
    rerankedCount: matches.length,
    rerankUsed: false,
    generationUsed: false,
    failures: [args.reason, ...(args.extraFailures ?? [])],
  };

  return {
    answer: buildFallbackAnswer(args.query, matches),
    citations: buildCitations(matches),
    matches,
    trace,
  };
}

function isRagRuntimeConfigured() {
  return Boolean(appEnv.cohereApiKey && appEnv.qdrantUrl && appEnv.qdrantCollection);
}

function buildQdrantHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (appEnv.qdrantApiKey) {
    headers["api-key"] = appEnv.qdrantApiKey;
  }

  return headers;
}

function parseEmbeddings(payload: unknown): number[][] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Cohere embedding payload is empty.");
  }

  const candidate = payload as {
    embeddings?: {
      float?: number[][];
      int8?: number[][];
      binary?: number[][];
    } | number[][];
  };

  if (Array.isArray(candidate.embeddings)) {
    return candidate.embeddings;
  }

  if (candidate.embeddings?.float && Array.isArray(candidate.embeddings.float)) {
    return candidate.embeddings.float;
  }

  if (candidate.embeddings?.int8 && Array.isArray(candidate.embeddings.int8)) {
    return candidate.embeddings.int8;
  }

  if (candidate.embeddings?.binary && Array.isArray(candidate.embeddings.binary)) {
    return candidate.embeddings.binary;
  }

  throw new Error("Unsupported embedding response shape from Cohere.");
}

async function embedTexts(texts: string[], inputType: "search_document" | "search_query") {
  if (!appEnv.cohereApiKey) {
    throw new Error("Cohere API key is missing.");
  }

  const response = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appEnv.cohereApiKey}`,
    },
    body: JSON.stringify({
      model: appEnv.cohereEmbedModel,
      texts,
      input_type: inputType,
      embedding_types: ["float"],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Cohere embed failed with ${response.status}: ${details.slice(0, 220)}`);
  }

  const payload = (await response.json()) as unknown;
  const vectors = parseEmbeddings(payload);

  if (vectors.length !== texts.length) {
    throw new Error("Cohere embed response size does not match input.");
  }

  return vectors;
}

async function rerankCandidates(query: string, candidates: RankedKnowledgeChunk[], topN: number) {
  if (!appEnv.cohereApiKey) {
    throw new Error("Cohere API key is missing.");
  }

  const response = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appEnv.cohereApiKey}`,
    },
    body: JSON.stringify({
      model: appEnv.cohereRerankModel,
      query,
      top_n: topN,
      documents: candidates.map((candidate) => ({
        text: `${candidate.chunk.title}\n${candidate.chunk.content}`,
      })),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Cohere rerank failed with ${response.status}: ${details.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    results?: Array<{ index: number; relevance_score: number }>;
  };

  if (!Array.isArray(payload.results)) {
    throw new Error("Cohere rerank returned no results.");
  }

  return payload.results
    .filter((result) => Number.isInteger(result.index) && result.index >= 0 && result.index < candidates.length)
    .map((result) => ({
      ...candidates[result.index],
      rerankScore: result.relevance_score,
    }));
}

async function retrieveDenseCandidates(query: string) {
  if (!appEnv.qdrantUrl || !appEnv.qdrantCollection) {
    throw new Error("Qdrant runtime config is missing.");
  }

  const [vector] = await embedTexts([query], "search_query");
  if (!vector) {
    throw new Error("Embedding vector is empty.");
  }

  const response = await fetch(
    `${appEnv.qdrantUrl.replace(/\/+$/, "")}/collections/${encodeURIComponent(appEnv.qdrantCollection)}/points/search`,
    {
      method: "POST",
      headers: buildQdrantHeaders(),
      body: JSON.stringify({
        vector,
        limit: RAG_RETRIEVE_LIMIT,
        with_payload: true,
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Qdrant search failed with ${response.status}: ${details.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    result?: Array<{
      score?: number;
      payload?: {
        documentId?: string;
        chunkId?: string;
        sourceId?: string;
        title?: string;
        tags?: string[];
        content?: string;
        chunkIndex?: number;
        totalChunks?: number;
        url?: string;
      };
    }>;
  };

  const results = payload.result ?? [];
  return results
    .flatMap((item) => {
      const record = item.payload;
      if (!record?.sourceId || !record.title || !record.content || !record.chunkId) {
        return [];
      }

      return [
        {
          chunk: {
            documentId: record.documentId ?? record.sourceId,
            chunkId: record.chunkId,
            sourceId: record.sourceId,
            title: record.title,
            url: record.url ?? buildKbUrl(record.sourceId),
            tags: Array.isArray(record.tags) ? record.tags : [],
            content: record.content,
            chunkIndex: typeof record.chunkIndex === "number" ? record.chunkIndex : 0,
            totalChunks: typeof record.totalChunks === "number" ? record.totalChunks : 1,
          },
          retrievalScore: typeof item.score === "number" ? item.score : 0,
        } satisfies RankedKnowledgeChunk,
      ];
    })
    .sort((left, right) => right.retrievalScore - left.retrievalScore);
}

function toRagMatches(items: RankedKnowledgeChunk[], query: string) {
  const queryTokens = tokenize(query);
  return items.map((item) =>
    toKnowledgeMatch({
      chunk: item.chunk,
      queryTokens,
      retrievalScore: Number(item.retrievalScore.toFixed(6)),
      rerankScore: typeof item.rerankScore === "number" ? Number(item.rerankScore.toFixed(6)) : undefined,
    })
  );
}

async function generateRagAnswer(query: string, matches: KnowledgeMatch[]) {
  const fallback = buildFallbackAnswer(query, matches);
  if (!appEnv.geminiApiKey || matches.length === 0) {
    return { answer: fallback, generationUsed: false, failure: undefined as string | undefined };
  }

  try {
    const { callGeminiJson } = await import("../ai");
    const answer = await callGeminiJson({
      model: "gemini-2.5-flash",
      schema: knowledgeAnswerSchema,
      timeoutMs: 9_000,
      prompt: [
        "You are a renter assistant. Use ONLY the retrieved private knowledge chunks.",
        "Do not invent facts and do not cite outside sources.",
        "Return concise guidance suitable for a rental decision workflow.",
        "summary: one sentence under 180 chars.",
        "keyPoints: 2-4 actionable bullets under 120 chars each.",
        "confidence: low|medium|high based only on chunk coverage quality.",
        `User query: ${query}`,
        JSON.stringify(
          {
            matches: matches.map((match) => ({
              sourceId: match.sourceId,
              title: match.title,
              chunkId: match.chunkId,
              snippet: match.snippet,
              tags: match.tags,
            })),
          },
          null,
          2
        ),
      ].join("\n"),
    });

    return { answer, generationUsed: true, failure: undefined as string | undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { answer: fallback, generationUsed: false, failure: `answer_generation_failed: ${message}` };
  }
}

export async function queryKnowledgeRag(args: {
  query: string;
  tags?: string[];
  topK?: number;
}): Promise<KnowledgeQueryResponse> {
  const safeTopK = Math.max(1, Math.min(args.topK ?? 5, 8));
  const failures: string[] = [];

  if (!isRagRuntimeConfigured()) {
    return buildFallbackKnowledgeResponse({
      query: args.query,
      tags: args.tags,
      topK: safeTopK,
      reason: "rag_config_missing",
    });
  }

  try {
    let candidates = await retrieveDenseCandidates(args.query);

    if (args.tags?.length) {
      const requested = new Set(args.tags.map((tag) => tag.toLowerCase()));
      const filtered = candidates.filter((candidate) => intersectsTags(candidate.chunk.tags, requested));
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    if (candidates.length === 0) {
      return buildFallbackKnowledgeResponse({
        query: args.query,
        tags: args.tags,
        topK: safeTopK,
        reason: "rag_no_matches",
      });
    }

    let ranked = candidates.slice(0, RAG_RETRIEVE_LIMIT);
    let rerankUsed = false;

    try {
      if (ranked.length > 1) {
        ranked = await rerankCandidates(args.query, ranked, safeTopK);
        rerankUsed = true;
      } else {
        ranked = ranked.slice(0, safeTopK).map((item) => ({
          ...item,
          rerankScore: item.retrievalScore,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`rerank_failed: ${message}`);
      ranked = ranked.slice(0, safeTopK).map((item) => ({
        ...item,
        rerankScore: item.retrievalScore,
      }));
      rerankUsed = false;
    }

    const matches = toRagMatches(ranked.slice(0, safeTopK), args.query);
    const citations = buildCitations(matches);
    const generation = await generateRagAnswer(args.query, matches);

    if (generation.failure) {
      failures.push(generation.failure);
    }

    const trace: KnowledgeQueryTrace = {
      mode: "rag",
      collection: appEnv.qdrantCollection,
      embedModel: appEnv.cohereEmbedModel,
      rerankModel: appEnv.cohereRerankModel,
      answerModel: "gemini-2.5-flash",
      retrievedCount: candidates.length,
      rerankedCount: matches.length,
      rerankUsed,
      generationUsed: generation.generationUsed,
      failures: failures.length > 0 ? failures : undefined,
    };

    return {
      answer: generation.answer,
      citations,
      matches,
      trace,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildFallbackKnowledgeResponse({
      query: args.query,
      tags: args.tags,
      topK: safeTopK,
      reason: "rag_runtime_failed",
      extraFailures: [message],
    });
  }
}
