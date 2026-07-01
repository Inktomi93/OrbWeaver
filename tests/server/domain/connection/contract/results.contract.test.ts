// catalogSnapshotSchema — the tightened read-seam parse (connection.md Esoteric §7). Round-trips a valid
// snapshot and rejects a malformed one (a missing required field is a parse failure, not a silent pass —
// the replacement for neo's `.loose()` blind cast).

import { describe } from "vitest";
import { catalogSnapshotSchema } from "../../../../../packages/server/src/domain/connection/contract/results.ts";
import { expect, test } from "../../../../support/fixtures";

const VALID = {
  fetchedAt: 1_750_000_000_000,
  models: [
    {
      id: "openai/gpt-5",
      name: "GPT-5",
      contextLength: 128_000,
      promptPrice: null,
      completionPrice: null,
      cacheReadPrice: null,
      cacheWritePrice: null,
      inputModalities: ["text"],
      supportedParameters: ["temperature"],
    },
  ],
};

describe("catalogSnapshotSchema", () => {
  test("parses + round-trips a valid snapshot", () => {
    const parsed = catalogSnapshotSchema.parse(VALID);
    expect(parsed).toEqual(VALID);
  });

  test("rejects a snapshot missing fetchedAt", () => {
    expect(catalogSnapshotSchema.safeParse({ models: [] }).success).toBe(false);
  });

  test("rejects a snapshot whose entry omits a required field", () => {
    const bad = { fetchedAt: 0, models: [{ id: "x" }] };
    expect(catalogSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
