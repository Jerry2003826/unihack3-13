import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeMatch } from "@inspect-ai/contracts";

interface KnowledgeDocument {
  sourceId: string;
  title: string;
  tags: string[];
  content: string;
}

let cachedKnowledgeDocs: KnowledgeDocument[] | null = null;
const moduleDir = dirname(fileURLToPath(import.meta.url));

function loadKnowledgeDocs() {
  if (cachedKnowledgeDocs) {
    return cachedKnowledgeDocs;
  }

  const filePath = resolve(moduleDir, "../../data/rental-knowledge.json");
  cachedKnowledgeDocs = JSON.parse(readFileSync(filePath, "utf8")) as KnowledgeDocument[];
  return cachedKnowledgeDocs;
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
    return content.slice(0, 200);
  }

  const index = normalized.indexOf(firstMatch);
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + 160);
  return content.slice(start, end).trim();
}

export function queryKnowledge(args: {
  query: string;
  tags?: string[];
  topK?: number;
}): KnowledgeMatch[] {
  const docs = loadKnowledgeDocs();
  const queryTokens = tokenize(args.query);
  const requestedTags = new Set((args.tags ?? []).map((tag) => tag.toLowerCase()));

  const scored = docs
    .map((doc) => {
      const docText = `${doc.title} ${doc.content} ${doc.tags.join(" ")}`.toLowerCase();
      let score = 0;

      for (const token of queryTokens) {
        if (docText.includes(token)) {
          score += 4;
        }
      }

      for (const tag of doc.tags) {
        if (requestedTags.has(tag.toLowerCase())) {
          score += 6;
        }
      }

      return {
        doc,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, args.topK ?? 4);

  return scored.map(({ doc }) => ({
    sourceId: doc.sourceId,
    title: doc.title,
    snippet: buildSnippet(doc.content, queryTokens),
    tags: doc.tags,
  }));
}
