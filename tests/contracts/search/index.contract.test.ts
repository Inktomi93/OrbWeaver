import type { BlockKey, MemoryQueryOptions, MemoryRetrievalMode } from "@orb/contracts/search";
import { MEMORY_RETRIEVAL_MODES, memoryRetrievalModeSchema } from "@orb/contracts/search";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "vitest";

// Sample branded values built at the untyped seam (castId is the sanctioned cast) — no pasted secrets.
const SAMPLE_CHAT_ID = castId<ChatId>("chat_sample");
const SAMPLE_CHARACTER_ID = castId<CharacterId>("character_sample");

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
  expect(Object.keys(MODE_SEEN).sort()).toEqual([...MEMORY_RETRIEVAL_MODES].sort());
});

test("memoryRetrievalModeSchema round-trips every mode and rejects non-members", () => {
  for (const mode of MEMORY_RETRIEVAL_MODES) {
    expect(memoryRetrievalModeSchema.parse(mode)).toBe(mode);
  }
  expect(memoryRetrievalModeSchema.safeParse("on").success).toBe(false);
  expect(memoryRetrievalModeSchema.safeParse("mix").success).toBe(false);
  expect(memoryRetrievalModeSchema.safeParse("").success).toBe(false);
});

test("BlockKey pins the (chatId, tier, blockIdx, scopedCharacterId) shape", () => {
  const key: BlockKey = {
    chatId: SAMPLE_CHAT_ID,
    tier: 0,
    blockIdx: 3,
    scopedCharacterId: SAMPLE_CHARACTER_ID,
  };
  expect(Object.keys(key).sort()).toEqual(
    ["blockIdx", "chatId", "scopedCharacterId", "tier"].sort(),
  );
});

// The `''` empty-string sentinel (NOT null) is the SHARED-bucket value — it must be a VALID key value, or
// scoped/shared digests collide silently under dedupe.
test("BlockKey accepts the '' shared-bucket sentinel for scopedCharacterId", () => {
  const sharedBucket: BlockKey = {
    chatId: SAMPLE_CHAT_ID,
    tier: 1,
    blockIdx: 0,
    scopedCharacterId: "",
  };
  expect(sharedBucket.scopedCharacterId).toBe("");
});

test("MemoryQueryOptions pins first-class scope.chat + optional candidates:BlockKey[] + flat knobs", () => {
  const candidate: BlockKey = {
    chatId: SAMPLE_CHAT_ID,
    tier: 0,
    blockIdx: 7,
    scopedCharacterId: "",
  };
  const opts: MemoryQueryOptions = {
    scope: { chat: SAMPLE_CHAT_ID },
    candidates: [candidate],
    mode: "mixC",
    verbatimWindow: 2,
    keywordMatch: true,
    recencyBias: 0,
    minScore: 0.2,
  };
  // chat-scope is first-class (NOT collapsed to owner) — the scope nests the chat id directly.
  expect(opts.scope.chat).toBe(SAMPLE_CHAT_ID);
  expect(opts.candidates).toEqual([candidate]);
  expect(opts.mode).toBe("mixC");

  // `candidates` is optional — the full-pool scan omits it (the tiered bridge supplies it).
  const fullPool: MemoryQueryOptions = {
    scope: { chat: SAMPLE_CHAT_ID },
    mode: "mixA",
    verbatimWindow: 4,
    keywordMatch: false,
    recencyBias: 0.5,
    minScore: 0,
  };
  expect("candidates" in fullPool).toBe(false);
});
