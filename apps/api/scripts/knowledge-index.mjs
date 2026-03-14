#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KNOWLEDGE_CHUNK_TARGET = 420;
const KNOWLEDGE_CHUNK_OVERLAP = 80;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../../..");

function log(message) {
  process.stdout.write(`[knowledge:index] ${message}\n`);
}

function die(message) {
  process.stderr.write(`[knowledge:index] ERROR: ${message}\n`);
  process.exit(1);
}

function parseEnvFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const parsed = {
    envFile: resolve(workspaceRoot, ".env.local"),
    docsFile: resolve(scriptDir, "../src/data/rental-knowledge.json"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env-file") {
      parsed.envFile = resolve(process.cwd(), argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (arg === "--docs-file") {
      parsed.docsFile = resolve(process.cwd(), argv[i + 1] ?? "");
      i += 1;
    }
  }

  return parsed;
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function qdrantPointId(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function findChunkBoundary(text, start, suggestedEnd) {
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

function chunkDocument(doc) {
  const normalized = normalizeText(doc.content ?? "");
  if (!normalized) {
    return [];
  }

  const chunks = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const suggestedEnd = Math.min(normalized.length, cursor + KNOWLEDGE_CHUNK_TARGET);
    const boundary = findChunkBoundary(normalized, cursor, suggestedEnd);
    const content = normalized.slice(cursor, boundary).trim();
    if (content) {
      chunks.push(content);
    }
    if (boundary >= normalized.length) {
      break;
    }
    cursor = Math.max(boundary - KNOWLEDGE_CHUNK_OVERLAP, cursor + 1);
  }

  return chunks.map((content, chunkIndex) => ({
    id: qdrantPointId(`${doc.sourceId}::${chunkIndex}`),
    payload: {
      documentId: doc.sourceId,
      chunkId: `${doc.sourceId}::${chunkIndex}`,
      sourceId: doc.sourceId,
      title: doc.title,
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      url: `kb://${doc.sourceId}`,
      content,
      chunkIndex,
      totalChunks: chunks.length,
    },
  }));
}

function parseEmbeddings(payload) {
  if (Array.isArray(payload?.embeddings)) {
    return payload.embeddings;
  }
  if (Array.isArray(payload?.embeddings?.float)) {
    return payload.embeddings.float;
  }
  throw new Error("Unsupported Cohere embedding payload.");
}

async function embedBatch(texts, model, apiKey) {
  const response = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      texts,
      input_type: "search_document",
      embedding_types: ["float"],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Cohere embed failed with ${response.status}: ${details.slice(0, 240)}`);
  }

  return parseEmbeddings(await response.json());
}

function qdrantHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["api-key"] = apiKey;
  }
  return headers;
}

async function qdrantDeleteCollection(qdrantUrl, collection, apiKey) {
  const url = `${qdrantUrl}/collections/${encodeURIComponent(collection)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: qdrantHeaders(apiKey),
  });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Qdrant delete collection failed with ${response.status}: ${details.slice(0, 200)}`);
  }
}

async function qdrantCreateCollection(qdrantUrl, collection, apiKey, vectorSize) {
  const url = `${qdrantUrl}/collections/${encodeURIComponent(collection)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: qdrantHeaders(apiKey),
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Qdrant create collection failed with ${response.status}: ${details.slice(0, 200)}`);
  }
}

async function qdrantUpsertPoints(qdrantUrl, collection, apiKey, points) {
  const url = `${qdrantUrl}/collections/${encodeURIComponent(collection)}/points?wait=true`;
  const response = await fetch(url, {
    method: "PUT",
    headers: qdrantHeaders(apiKey),
    body: JSON.stringify({ points }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Qdrant upsert failed with ${response.status}: ${details.slice(0, 200)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  parseEnvFile(args.envFile);

  const cohereApiKey = process.env.COHERE_API_KEY?.trim();
  const embedModel = process.env.COHERE_EMBED_MODEL?.trim() || "embed-v4.0";
  const qdrantUrl = (process.env.QDRANT_URL?.trim() || "http://127.0.0.1:6333").replace(/\/+$/, "");
  const qdrantCollection = process.env.QDRANT_COLLECTION?.trim() || "rental_kb_v1";
  const qdrantApiKey = process.env.QDRANT_API_KEY?.trim() || "";

  if (!cohereApiKey) {
    die("COHERE_API_KEY is required.");
  }

  const docs = JSON.parse(readFileSync(args.docsFile, "utf8"));
  const chunks = docs.flatMap(chunkDocument);
  if (chunks.length === 0) {
    die("No chunks generated from knowledge corpus.");
  }

  log(`Loaded ${docs.length} docs and generated ${chunks.length} chunks.`);

  const vectors = [];
  const batchSize = 64;
  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize);
    const embeddings = await embedBatch(
      batch.map((item) => `${item.payload.title}\n${item.payload.content}`),
      embedModel,
      cohereApiKey
    );
    for (let offset = 0; offset < batch.length; offset += 1) {
      vectors.push({
        id: batch[offset].id,
        vector: embeddings[offset],
        payload: batch[offset].payload,
      });
    }
    log(`Embedded ${Math.min(index + batchSize, chunks.length)}/${chunks.length} chunks`);
  }

  const vectorSize = vectors[0]?.vector?.length;
  if (!vectorSize || !Number.isFinite(vectorSize)) {
    die("Invalid vector size from embed model.");
  }

  await qdrantDeleteCollection(qdrantUrl, qdrantCollection, qdrantApiKey);
  await qdrantCreateCollection(qdrantUrl, qdrantCollection, qdrantApiKey, vectorSize);

  for (let index = 0; index < vectors.length; index += batchSize) {
    const batch = vectors.slice(index, index + batchSize);
    await qdrantUpsertPoints(qdrantUrl, qdrantCollection, qdrantApiKey, batch);
    log(`Upserted ${Math.min(index + batchSize, vectors.length)}/${vectors.length} vectors`);
  }

  log(`Indexing complete. Collection=${qdrantCollection} vectors=${vectors.length} dim=${vectorSize}`);
}

main().catch((error) => {
  die(error instanceof Error ? error.message : String(error));
});
