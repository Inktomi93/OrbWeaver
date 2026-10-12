import type { MemoryRetrievalMode, UnifiedSearchResult } from "@orb/contracts/search";
import { MEMORY_RETRIEVAL_MODES, memoryRetrievalModeSchema, unifiedSearchResultSchema } from "@orb/contracts/search";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("unified search output keeps coverage beside every branch without stripping or rejecting sibling fields", () => {
  const coverage = { requestLimit: 10, candidateLimit: 20, evidencePerCharacter: null, reranked: false };
  const answers = [
    { over: "entities", hits: [], coverage },
    { over: "characters", hits: [], coverage },
    { over: "discover", hits: [], standaloneSegments: [], coverage },
    { over: "segments", hits: [], coverage },
    { over: "digests", hits: [], coverage },
    { over: "corpus", hits: [], coverage },
    { over: "images", hits: [], coverage },
    { over: "documents", hits: [], coverage },
  ] satisfies UnifiedSearchResult[];
  for (const answer of answers) {
    expect(unifiedSearchResultSchema.parse(answer)).toEqual(answer);
    expect(unifiedSearchResultSchema.safeParse({ ...answer, privateQueryVector: [1] }).success).toBe(false);
    expect(unifiedSearchResultSchema.safeParse({ ...answer, coverage: { ...coverage, internalCandidateIds: [] } }).success).toBe(false);
  }
});

// The retrieval-mode axis is EXACTLY the neo `memoryDefaults.mode` members — a drift here would desync
// the `contracts/settings` memory-defaults enum that derives from this tuple.
test("MEMORY_RETRIEVAL_MODES is exactly [off, mixA, mixB, mixC, tiered]", () => {
  expect(MEMORY_RETRIEVAL_MODES).toEqual(["off", "mixA", "mixB", "mixC", "tiered"]);
  expect(memoryRetrievalModeSchema.options).toEqual(MEMORY_RETRIEVAL_MODES);
});

// Exhaustiveness: a `Record<MemoryRetrievalMode, …>` fails `tsc` if a member drifts, backing the runtime
// assert with a compile-time guard (no inline mode-union re-spelling anywhere else).
const MODE_SEEN: Record<MemoryRetrievalMode, true> = {
  off: true,
  mixA: true,
  mixB: true,
  mixC: true,
  tiered: true,
};
test("MemoryRetrievalMode has no member beyond the tuple", () => {
  expect(Object.keys(MODE_SEEN).sort()).toEqual(MEMORY_RETRIEVAL_MODES.toSorted());
});

test("memoryRetrievalModeSchema round-trips every mode and rejects non-members", () => {
  for (const mode of MEMORY_RETRIEVAL_MODES) {
    expect(memoryRetrievalModeSchema.parse(mode)).toBe(mode);
  }
  expect(memoryRetrievalModeSchema.safeParse("on").success).toBe(false);
  expect(memoryRetrievalModeSchema.safeParse("mix").success).toBe(false);
  expect(memoryRetrievalModeSchema.safeParse("").success).toBe(false);
});
