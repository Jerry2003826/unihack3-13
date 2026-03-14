import { describe, expect, it } from "vitest";
import { buildKnowledgeChunks, queryKnowledge } from "./queryKnowledge";

describe("queryKnowledge", () => {
  it("chunks long corpus entries into stable chunk ids", () => {
    const docs = [
      {
        sourceId: "doc-a",
        title: "Doc A",
        tags: ["inspection"],
        content:
          "This is a long entry. ".repeat(80) +
          "Focus on mould around window seals and bathroom corners before signing.",
      },
    ];

    const chunks = buildKnowledgeChunks(docs);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.chunkId).toBe("doc-a::0");
    expect(chunks.at(-1)?.chunkId).toMatch(/^doc-a::\d+$/);
    expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
  });

  it("builds deterministic chunks for the same input", () => {
    const docs = [
      {
        sourceId: "doc-b",
        title: "Doc B",
        tags: ["paperwork"],
        content: "Bond receipts and lease terms must be documented in writing. ".repeat(20),
      },
    ];

    const first = buildKnowledgeChunks(docs);
    const second = buildKnowledgeChunks(docs);
    expect(second).toEqual(first);
  });

  it("returns relevant matches for renter queries", () => {
    const results = queryKnowledge({
      query: "repair mould before lease signing",
      tags: ["negotiation", "mould"],
      topK: 3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title).toBeTruthy();
    expect(results[0]?.documentId).toBeTruthy();
    expect(results[0]?.chunkId).toBeTruthy();
    expect(typeof results[0]?.retrievalScore).toBe("number");
  });

  it("uses tag filtering to narrow candidate set", () => {
    const results = queryKnowledge({
      query: "document checklist and lease draft",
      tags: ["paperwork"],
      topK: 4,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => item.tags.some((tag) => tag.toLowerCase() === "paperwork"))).toBe(true);
  });

  it("returns an empty array when nothing matches", () => {
    expect(
      queryKnowledge({
        query: "zebra spaceship banana",
        topK: 3,
      })
    ).toEqual([]);
  });
});
