import { describe, expect, it } from "vitest";
import { queryKnowledge } from "./queryKnowledge";

describe("queryKnowledge", () => {
  it("returns relevant matches for renter queries", () => {
    const results = queryKnowledge({
      query: "repair mould before lease signing",
      tags: ["negotiation", "mould"],
      topK: 3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title).toBeTruthy();
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
