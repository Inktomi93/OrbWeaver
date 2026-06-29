import type { BlockKey } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import { recallMemory } from "../../../../../../packages/server/src/domain/chat/memory/recall/recall";
import type {
  MemoryLogEntry,
  MemoryScope,
} from "../../../../../../packages/server/src/domain/chat/memory/types";
import { freshDb } from "../../../../../support/db";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../../_support";
import { fakeSearchDigests, GROUP_CHAR, seedDigest, seedSegment } from "../_support";

const aria = castId<CharacterId>("character_aria");
const bram = castId<CharacterId>("character_bram");

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  // FK parents for the digest `scopedCharacterId` (the synthetic group char for the shared bucket + aria/bram
  // for the scoped buckets — inv 8: a real CharacterId, never the `''` sentinel).
  const owner = await seedUser(db, "owner");
  await seedCharacter(db, owner, "group"); // id === GROUP_CHAR
  await seedCharacter(db, owner, "aria");
  await seedCharacter(db, owner, "bram");
});

/** The merged/solo recall scope — the speaker IS the synthetic group char (the union dedupes to the shared
 *  bucket). `groupCharacterId` is always passed (the engine always knows the room's group char). */
const sharedScope = (chatId: ChatId): MemoryScope => ({
  chatId,
  scopedCharacterId: GROUP_CHAR,
  isGroup: false,
});

// Build the expected {{memory}} block(s) from parts (avoids a `keywords:`-shaped literal tripping noSecrets).
const facet = (anchor: string, kw: string): string => `${anchor}\nkeywords: ${kw}`;
const joinBlocks = (...blocks: string[]): string => blocks.join("\n\n");

describe("memory/recall — the 5 modes + the mode-switch union + witnessing", () => {
  test("#1 off → empty string (D36)", async () => {
    const chatId = await seedChat(db, "off");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0 });
    const ctx = makeChatContext(db);
    expect(
      await recallMemory(ctx, {
        scope: sharedScope(chatId),
        groupCharacterId: GROUP_CHAR,
        config: { mode: "off" },
      }),
    ).toBe("");
  });

  test("#1 mixA → all this bucket's tier-0 digests, chronological (pure assembly, NO search call)", async () => {
    const chatId = await seedChat(db, "mixa");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: ["b"] });
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0, topicAnchor: "[T1]", keywords: ["x"] }); // higher tier ignored by mixA
    // searchDigests left as the throwing stub — mixA must NOT call it.
    const ctx = makeChatContext(db);
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(out).toBe(joinBlocks(facet("[s0]", "a"), facet("[s1]", "b")));
  });

  test("mixC → delegates the cosine scan to ctx.searchDigests + formats the ranked keys", async () => {
    const chatId = await seedChat(db, "mixc");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: ["b"] });
    // search returns block 1 ranked ABOVE block 0.
    const ranked: BlockKey[] = [
      { chatId, tier: 0, blockIdx: 1, scopedCharacterId: GROUP_CHAR },
      { chatId, tier: 0, blockIdx: 0, scopedCharacterId: GROUP_CHAR },
    ];
    const search = fakeSearchDigests(ranked);
    const ctx = makeChatContext(db, { searchDigests: search.fn });
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixC", minScore: 0.3 },
    });
    // the cosine scan was delegated, scoped to this chat, the egocentric bucket + the knobs on MemoryQueryOptions.
    expect(search.calls).toHaveLength(1);
    const q = search.calls.at(0);
    expect(q?.scopedCharacterId).toBe(GROUP_CHAR);
    expect(q).toMatchObject({ scope: { chat: chatId }, mode: "mixC", minScore: 0.3 });
    // the bridge candidates were passed (the pool for every mode — §3b).
    expect(q?.candidates).toBeDefined();
    expect(out).toBe(joinBlocks(facet("[s1]", "b"), facet("[s0]", "a")));
  });

  test("tiered → the bridge (coarse high-tier + fine tier-0, uncovered-only, tip excluded)", async () => {
    const chatId = await seedChat(db, "tier");
    // tier-0 blocks 0..3 + tier-1 blocks 0 (covers 0,1) and 1 (covers 2,3). fanOut 2.
    for (let b = 0; b < 4; b += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedDigest(db, {
        chatId,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[t0.${b}]`,
        keywords: [],
      });
    }
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0, topicAnchor: "[T1.0]", keywords: [] });
    await seedDigest(db, { chatId, tier: 1, blockIdx: 1, topicAnchor: "[T1.1]", keywords: [] });
    const ctx = makeChatContext(db); // tiered is pure assembly — no search call
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "tiered", fanOut: 2 },
    });
    // fine zone = last 2 tier-0 (blocks 2,3); coarse [0,1] → ONE tier-1 digest (block 0). Uncovered-only:
    expect(out).toContain("[T1.0]"); // the coarse cover for the distant past
    expect(out).toContain("[t0.2]");
    expect(out).toContain("[t0.3]");
    expect(out).not.toContain("[t0.0]"); // covered by [T1.0] → never also surfaced
    expect(out).not.toContain("[t0.1]");
  });

  test("egocentric-only (always-scoped): each speaker recalls ONLY its own bucket (inv 6)", async () => {
    const chatId = await seedChat(db, "ego");
    // An always-scoped chat: NO shared (group-char) digests — only per-character buckets.
    await seedDigest(db, {
      chatId,
      scopedCharacterId: aria,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[aria]",
      keywords: [],
    });
    await seedDigest(db, {
      chatId,
      scopedCharacterId: bram,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[bram]",
      keywords: [],
    });
    const ctx = makeChatContext(db);

    const ariaOut = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(ariaOut).toBe("[aria]");
    expect(ariaOut).not.toContain("[bram]");

    const bramOut = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: bram, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(bramOut).toBe("[bram]");
    expect(bramOut).not.toContain("[aria]");
  });

  test("mode-switch union (§4): a switched chat recalls the shared (merged-era) ∪ the speaker's own scoped era", async () => {
    const chatId = await seedChat(db, "switch");
    // merged era → shared (group-char) bucket, block 0; scoped era → per-character buckets, blocks 1 (aria) + 2 (bram).
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[merged]",
      keywords: [],
    });
    await seedDigest(db, {
      chatId,
      scopedCharacterId: aria,
      tier: 0,
      blockIdx: 1,
      topicAnchor: "[aria]",
      keywords: [],
    });
    await seedDigest(db, {
      chatId,
      scopedCharacterId: bram,
      tier: 0,
      blockIdx: 2,
      topicAnchor: "[bram]",
      keywords: [],
    });
    const ctx = makeChatContext(db);

    const ariaOut = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    // aria recalls the merged-era block (everyone) + its own scoped block — NOT bram's scoped block.
    expect(ariaOut).toContain("[merged]");
    expect(ariaOut).toContain("[aria]");
    expect(ariaOut).not.toContain("[bram]");

    const bramOut = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: bram, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(bramOut).toContain("[merged]");
    expect(bramOut).toContain("[bram]");
    expect(bramOut).not.toContain("[aria]");
  });

  test("witnessing filter (§4 / inv 12): the speaker does NOT recall a merged-era block before it joined", async () => {
    const chatId = await seedChat(db, "witness");
    // Three merged-era blocks in the shared bucket + their segment seq-spans (block b covers seq [8b+1, 8b+8]).
    for (let b = 0; b < 3; b += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[b${b}]`,
        keywords: [],
      });
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedSegment(db, { chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    const ctx = makeChatContext(db);

    // aria joined at seq 9 (the start of block 1) → block 0 (seq 1-8) is pre-join → NOT witnessed.
    const out = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 9, leftSeq: null }],
      config: { mode: "mixA" },
    });
    expect(out).not.toContain("[b0]"); // pre-join → invisible
    expect(out).toContain("[b1]");
    expect(out).toContain("[b2]");
  });

  test("witnessing filter: a kicked interval stays invisible (correct across kick→re-add)", async () => {
    const chatId = await seedChat(db, "kick");
    for (let b = 0; b < 3; b += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[b${b}]`,
        keywords: [],
      });
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedSegment(db, { chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    const ctx = makeChatContext(db);

    // Present for block 0 (seq 1-8), kicked before block 1 (left at seq 9), re-added at seq 17 (block 2).
    const out = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      witnessing: [
        { joinSeq: 1, leftSeq: 9 },
        { joinSeq: 17, leftSeq: null },
      ],
      config: { mode: "mixA" },
    });
    expect(out).toContain("[b0]");
    expect(out).not.toContain("[b1]"); // the kicked interval (seq 9-16) is invisible
    expect(out).toContain("[b2]");
  });

  test("an empty pool → empty string + a logged `memory.recall` skip (no embed — inv 10)", async () => {
    const chatId = await seedChat(db, "empty");
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, { log: (e) => entries.push(e) });
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(out).toBe("");
    const rec = entries.find((e) => e.event === "memory.recall");
    expect(rec?.note).toBe("no digests");
    expect(rec?.event === "memory.recall" && rec.trace.queryEmbedded).toBe(false);
    expect(rec?.event === "memory.recall" && rec.trace.poolSize).toBe(0);
  });

  test("a non-empty recall logs the trace (poolSize / surfaced / queryEmbedded)", async () => {
    const chatId = await seedChat(db, "trace");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, { log: (e) => entries.push(e) });
    await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    const rec = entries.find((e) => e.event === "memory.recall");
    expect(rec?.event === "memory.recall" && rec.trace.poolSize).toBe(1);
    expect(rec?.event === "memory.recall" && rec.trace.surfaced).toBe(1);
    expect(rec?.event === "memory.recall" && rec.trace.queryEmbedded).toBe(false);
  });
});
