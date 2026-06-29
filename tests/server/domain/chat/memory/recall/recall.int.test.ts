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

describe("memory/recall — adversarial (trigger discipline, bridge-pool, witness-filter, no-omniscience)", () => {
  test("mixC + empty pool → '' and NEVER embeds — the early-return is BEFORE the cosine scan (inv 10)", async () => {
    // The existing empty-pool test uses mixA (which never calls search regardless). This pins the early-return
    // for an EMBEDDING mode: a fresh chat with mixC must not fire the per-turn query embed.
    const chatId = await seedChat(db, "mixc-empty");
    const search = fakeSearchDigests([]);
    const ctx = makeChatContext(db, { searchDigests: search.fn });
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixC" },
    });
    expect(out).toBe("");
    expect(search.calls).toHaveLength(0);
  });

  test("mixB/mixC hand search the §5 BRIDGE (coarse for the distant past) as candidates — NOT the flat union", async () => {
    const chatId = await seedChat(db, "cand");
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
    const search = fakeSearchDigests([]);
    const ctx = makeChatContext(db, { searchDigests: search.fn });
    await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixC", fanOut: 2 },
    });
    const cand = search.calls.at(0)?.candidates ?? [];
    // bridge: fine [2,3] tier-0 + coarse [0,1] → ONE tier-1. A `candidates: union` mutation would include t0.0/t0.1.
    expect(cand.some((k) => k.tier === 1 && k.blockIdx === 0)).toBe(true);
    expect(cand.some((k) => k.tier === 0 && k.blockIdx <= 1)).toBe(false);
  });

  test("the trace counts only SURFACED (loaded) keys + records queryEmbedded=true for mixC", async () => {
    const chatId = await seedChat(db, "surf");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    // search returns one REAL key + one bogus key outside the loaded pool (a hit that fell out of scope).
    const ranked: BlockKey[] = [
      { chatId, tier: 0, blockIdx: 0, scopedCharacterId: GROUP_CHAR },
      { chatId, tier: 0, blockIdx: 99, scopedCharacterId: GROUP_CHAR },
    ];
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, {
      searchDigests: fakeSearchDigests(ranked).fn,
      log: (e) => entries.push(e),
    });
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixC" },
    });
    expect(out).toBe(facet("[s0]", "a")); // the bogus key is dropped from {{memory}}
    const rec = entries.find((e) => e.event === "memory.recall");
    expect(rec?.event === "memory.recall" && rec.trace.surfaced).toBe(1); // NOT 2 — only the loaded key counts
    expect(rec?.event === "memory.recall" && rec.trace.queryEmbedded).toBe(true);
    expect(rec?.event === "memory.recall" && rec.trace.mode).toBe("mixC");
  });

  test("no retroactive omniscience: a merged/narrator speaker (the group char) does NOT read others' scoped buckets", async () => {
    const chatId = await seedChat(db, "omni");
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[shared]",
      keywords: [],
    });
    await seedDigest(db, {
      chatId,
      scopedCharacterId: aria,
      tier: 0,
      blockIdx: 1,
      topicAnchor: "[aria-private]",
      keywords: [],
    });
    const ctx = makeChatContext(db);
    // speaking AS the group char (currently merged/narrator): pool = shared ∪ own(==shared) = shared ONLY.
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(out).toContain("[shared]");
    // flipping to merged must NOT retroactively expose aria's private scoped era (§4 keep-each-era's-scope).
    expect(out).not.toContain("[aria-private]");
  });

  test("witnessing applies to the SHARED bucket too: a pre-join merged-era block is invisible (union ∧ witness)", async () => {
    const chatId = await seedChat(db, "wsw");
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[shared-prejoin]",
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
    await seedSegment(db, { chatId, blockIdx: 0, seqStart: 1, seqEnd: 8 });
    await seedSegment(db, { chatId, blockIdx: 1, seqStart: 9, seqEnd: 16 });
    const ctx = makeChatContext(db);
    const out = await recallMemory(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 9, leftSeq: null }],
      config: { mode: "mixA" },
    });
    expect(out).toContain("[aria]"); // own scoped block it witnessed
    expect(out).not.toContain("[shared-prejoin]"); // the shared bucket is witness-filtered too — not a free pass
  });

  test("witness filter FAILS OPEN: a digest whose segment span is missing is KEPT (never erase real memory)", async () => {
    const chatId = await seedChat(db, "failopen");
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[b0]",
      keywords: [],
    });
    // NO seedSegment → the span resolver cannot find block 0's seq-span.
    const ctx = makeChatContext(db);
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 1000, leftSeq: null }], // WOULD exclude it if the span resolved
      config: { mode: "mixA" },
    });
    expect(out).toContain("[b0]"); // fail-open — a missing segment must not hide a real digest
  });

  test("witness filter resolves a HIGHER-TIER digest's span via its tier-0 range (a distant arc never seen is dropped)", async () => {
    const chatId = await seedChat(db, "htw");
    for (let b = 0; b < 4; b += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[t0.${b}]`,
        keywords: [],
      });
      await seedSegment(db, { chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    // tier-1 block 0 covers tier-0 {0,1} (seq 1-16); block 1 covers {2,3} (seq 17-32).
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 1,
      blockIdx: 0,
      topicAnchor: "[T1.0]",
      keywords: [],
    });
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 1,
      blockIdx: 1,
      topicAnchor: "[T1.1]",
      keywords: [],
    });
    const ctx = makeChatContext(db);
    // control: a member present from seq 1 sees the coarse arc T1.0 for the distant past.
    const full = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 1, leftSeq: null }],
      config: { mode: "tiered", fanOut: 2 },
    });
    expect(full).toContain("[T1.0]");
    // joined at seq 17 → never witnessed tier-1 block 0's span (seq 1-16) → its arc is filtered out (tier>0 math).
    const late = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 17, leftSeq: null }],
      config: { mode: "tiered", fanOut: 2 },
    });
    expect(late).not.toContain("[T1.0]");
  });

  test("{{memory}} surfaces the full stored distilled `text` (the facts BODY), not just the anchor+keywords facets", async () => {
    const chatId = await seedChat(db, "body");
    const facts = "The ledger was hidden behind the painting.";
    const fullText = facet(`[A]\n${facts}`, "k"); // `[A]\n<facts>\nkeywords: k`
    await seedDigest(db, {
      chatId,
      tier: 0,
      blockIdx: 0,
      topicAnchor: "[A]",
      keywords: ["k"],
      text: fullText,
    });
    const ctx = makeChatContext(db);
    const out = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    // the significance-filtered FACTS line is present — proves format reads `text`, not renderDigestFacets(facets).
    expect(out).toContain(facts);
    expect(out).toBe(fullText);
  });
});
