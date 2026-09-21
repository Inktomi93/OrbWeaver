import type { BlockKey } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { CharacterId, ChatId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { generateDigests } from "../../../../../../packages/server/src/domain/chat/memory/build/digests.ts";
import { loadWitnessHorizons } from "../../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { createMemoryRecallWarningEpisode } from "../../../../../../packages/server/src/domain/chat/memory/recall/rerank-warning.ts";
import type { MemoryLogEntry } from "../../../../../../packages/server/src/domain/chat/memory/types.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "../../_support.ts";
import { fakeEmbeddingsStore, fakeSearchDigests, fakeSummarize, GROUP_CHAR, seedDigest, seedSegment, seedTurns, sharedScope } from "../_support.ts";

const aria = castId<CharacterId>("character_aria");
const bram = castId<CharacterId>("character_bram");

/** #250 — `recallMemory` now returns `{ text, trace }`. These suites assert the RENDERED `{{memory}}` block,
 *  so they read `.text` through this alias; the trace itself is pinned by `recall-trace.int.test.ts`. */
const recallText = async (...args: Parameters<typeof recallMemory>): Promise<string> => (await recallMemory(...args)).text;

let db: Db;
let owner: UserId;
beforeEach(async () => {
  db = await freshDb();
  // FK parents for the digest `scopedCharacterId` (the synthetic group char for the shared bucket + aria/bram
  // for the scoped buckets — inv 8: a real CharacterId, never the `''` sentinel).
  owner = await seedUser(db, castId<Handle>("owner"));
  await seedCharacter(db, owner, "group"); // id === GROUP_CHAR
  await seedCharacter(db, owner, "aria");
  await seedCharacter(db, owner, "bram");
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
      await recallText(ctx, {
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
    const out = await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(out).toBe(joinBlocks(facet("[s0]", "a"), facet("[s1]", "b")));
  });

  // #313 — the header brain-icon's live feed. A memory-ON recall opens the "recalling" window BEFORE it
  // works and closes it with the surfaced count; a memory-OFF recall fires NEITHER (an absent event is the
  // idle icon, never a lying "recalled 0"). The phase is stamped at the ONE recall convergence, so both the
  // round-level and the per-speaker recall feed it.
  test("#313 memory ON emits recalling → recalled:N; memory OFF emits nothing", async () => {
    const emitted: { phase: string; count: number | null }[] = [];
    const emitRecallPhase = (event: { phase: string; count: number | null }): void => {
      emitted.push({ phase: event.phase, count: event.count });
    };

    const onChatId = await seedChat(db, "recallphase_on");
    await seedDigest(db, { chatId: onChatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    await seedDigest(db, { chatId: onChatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: ["b"] });
    await recallMemory(makeChatContext(db, { emitRecallPhase }), {
      scope: sharedScope(onChatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    // recalling first (count null, before any work), then recalled with the surfaced block count (both tier-0).
    expect(emitted).toEqual([
      { phase: "recalling", count: null },
      { phase: "recalled", count: 2 },
    ]);

    emitted.length = 0;
    const offChatId = await seedChat(db, "recallphase_off");
    await seedDigest(db, { chatId: offChatId, tier: 0, blockIdx: 0 });
    await recallMemory(makeChatContext(db, { emitRecallPhase }), {
      scope: sharedScope(offChatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "off" },
    });
    expect(emitted).toEqual([]);
  });

  // THE END-TO-END SHRINK PIN (stickler 2026-08-08 leg-2 refutation). The recall seam is where the defect was
  // actually payable: hiding a trailing span removed those rows from the prompt AND from the ingest set, but
  // the digest already summarized FROM them survived in `chat_digests` — blocks are keyed `(tier, blockIdx)`
  // and the self-heal is content-hash keyed, so a block that VANISHES is unreachable by the heal. `{{memory}}`
  // then re-surfaced the hidden content into the very prompt it had been held out of. The build's shrink
  // reclaim closes it; this asserts the OUTCOME a host would actually see.
  test("hiding a trailing span keeps its content out of {{memory}} recall (the block's digest is reclaimed)", async () => {
    const chatId = await seedChat(db, "shrinkrecall");
    await seedTurns(db, chatId, aria, 4); // blockSize 2 → block 0 (seq 1-2), block 1 (seq 3-4)
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 } as const;
    const build = (): ReturnType<typeof makeChatContext> =>
      makeChatContext(db, { summarize: fakeSummarize().op, embeddingsStore: fakeEmbeddingsStore(db).store });

    await generateDigests(build(), { scope: sharedScope(chatId), config: cfg, funderUserId: owner });
    const before = await recallText(makeChatContext(db), { scope: sharedScope(chatId), groupCharacterId: GROUP_CHAR, config: { mode: "mixA" } });
    // Both blocks' digests are recallable — the fake summarizer numbers each call, so block 1's is "scene 2".
    expect(before).toContain("scene 1");
    expect(before).toContain("scene 2");

    for (const seq of [3, 4]) {
      await db
        .update(messages)
        .set({ excludedFromPrompt: true })
        .where(eq(messages.id, castId<MessageId>(`message_${chatId}_${seq}`)));
    }
    await generateDigests(build(), { scope: sharedScope(chatId), config: cfg, funderUserId: owner });

    const after = await recallText(makeChatContext(db), { scope: sharedScope(chatId), groupCharacterId: GROUP_CHAR, config: { mode: "mixA" } });
    expect(after).toContain("scene 1"); // the surviving block still recalls
    expect(after).not.toContain("scene 2"); // …the hidden span's digest does not
  });

  test("mixC → delegates the cosine scan to ctx.searchDigests + formats the ranked keys", async () => {
    const chatId = await seedChat(db, "mixc");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    await seedDigest(db, { chatId, tier: 0, blockIdx: 1, topicAnchor: "[s1]", keywords: ["b"] });
    const ranked: BlockKey[] = [
      { chatId, tier: 0, blockIdx: 1, scopedCharacterId: GROUP_CHAR },
      { chatId, tier: 0, blockIdx: 0, scopedCharacterId: GROUP_CHAR },
    ];
    const search = fakeSearchDigests(ranked);
    const ctx = makeChatContext(db, { searchDigests: search.fn });
    const out = await recallText(ctx, {
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
    // #330 P7: the search returned rank order [block1, block0], but the {{memory}} TEXT injects CHRONOLOGICALLY
    // (block0 then block1) — a rank-ordered "story so far" reads as scrambled chronology to the model.
    expect(out).toBe(joinBlocks(facet("[s0]", "a"), facet("[s1]", "b")));
  });

  test("maxTier excludes stored digests above the configured recall ceiling", async () => {
    const chatId = await seedChat(db, "max-tier");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, text: "tier zero" });
    await seedDigest(db, { chatId, tier: 1, blockIdx: 0, text: "tier one" });

    const out = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "tiered", fanOut: 2, maxTier: 0 },
    });

    expect(out.text).toContain("tier zero");
    expect(out.text).not.toContain("tier one");
    expect(out.trace.candidates.every((candidate) => candidate.tier <= 0)).toBe(true);
  });

  test("mixC threads the rerank-unavailable report into one shared recall episode", async () => {
    const chatId = await seedChat(db, "mixc-rerank-warning");
    await seedDigest(db, { chatId, tier: 0, blockIdx: 0, topicAnchor: "[s0]", keywords: ["a"] });
    const episode = createMemoryRecallWarningEpisode();
    const ctx = makeChatContext(db, {
      searchDigests: (query, onRerankUnavailable) => {
        onRerankUnavailable?.();
        const blockKey = query.candidates?.[0];
        return Promise.resolve(blockKey === undefined ? [] : [{ blockKey, score: 0.8, relevance: 0.9 }]);
      },
    });

    await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixC" },
      warningEpisode: episode,
    });
    expect(episode.takeRerankUnavailable()).toBe(true);

    await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixC" },
      warningEpisode: episode,
    });
    expect(episode.takeRerankUnavailable()).toBe(false);
  });

  test("tiered → the bridge (coarse high-tier + fine tier-0, uncovered-only, tip excluded)", async () => {
    const chatId = await seedChat(db, "tier");
    // tier-0 blocks 0..3 + tier-1 blocks 0 (covers 0,1) and 1 (covers 2,3). fanOut 2.
    for (let b = 0; b < 4; b += 1) {
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
    const out = await recallText(ctx, {
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

    const ariaOut = await recallText(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(ariaOut).toBe("[aria]");
    expect(ariaOut).not.toContain("[bram]");

    const bramOut = await recallText(ctx, {
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

    const ariaOut = await recallText(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    // aria recalls the merged-era block (everyone) + its own scoped block — NOT bram's scoped block.
    expect(ariaOut).toContain("[merged]");
    expect(ariaOut).toContain("[aria]");
    expect(ariaOut).not.toContain("[bram]");

    const bramOut = await recallText(ctx, {
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
      await seedDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[b${b}]`,
        keywords: [],
      });
      await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    const ctx = makeChatContext(db);

    // aria joined at seq 9 (the start of block 1) → block 0 (seq 1-8) is pre-join → NOT witnessed.
    const out = await recallText(ctx, {
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
      await seedDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[b${b}]`,
        keywords: [],
      });
      await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    const ctx = makeChatContext(db);

    // Present for block 0 (seq 1-8), kicked before block 1 (left at seq 9), re-added at seq 17 (block 2).
    const out = await recallText(ctx, {
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

  test("END-TO-END (D6): horizons SOURCED from chat_participants → a since-open speaker recalls a block a late joiner cannot", async () => {
    const chatId = await seedChat(db, "e2e");
    // Three shared-bucket blocks + their spans (block b covers seq [8b+1, 8b+8]).
    for (let b = 0; b < 3; b += 1) {
      await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 0, blockIdx: b, topicAnchor: `[b${b}]`, keywords: [] });
      await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    // aria present since the chat opened (seq 1); bram joined at seq 17 (the start of block 2).
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 1, leftSeq: null });
    await seedParticipant(db, { chatId, key: "bram", characterId: bram, joinSeq: 17, leftSeq: null });
    const ctx = makeChatContext(db);

    // Horizons SOURCED live (not hand-passed) — exactly what the engine's per-speaker recall feeds.
    const ariaHorizons = await loadWitnessHorizons(db, chatId, aria);
    const bramHorizons = await loadWitnessHorizons(db, chatId, bram);

    const recall = async (scopedCharacterId: typeof aria, witnessing: Awaited<ReturnType<typeof loadWitnessHorizons>>): Promise<string> =>
      recallText(ctx, { scope: { chatId, scopedCharacterId, isGroup: true }, groupCharacterId: GROUP_CHAR, witnessing, config: { mode: "mixA" } });

    const ariaOut = await recall(aria, ariaHorizons);
    const bramOut = await recall(bram, bramHorizons);

    // aria (since open) recalls the early scene; bram (joined at block 2) does NOT — DIFFERENT recall per presence.
    expect(ariaOut).toContain("[b0]");
    expect(bramOut).not.toContain("[b0]");
    expect(bramOut).not.toContain("[b1]");
    expect(bramOut).toContain("[b2]"); // bram witnessed block 2 onward
  });

  test("an empty pool → empty string + a logged `memory.recall` skip (no embed — inv 10)", async () => {
    const chatId = await seedChat(db, "empty");
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, { log: (e) => entries.push(e) });
    const out = await recallText(ctx, {
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
    await recallText(ctx, {
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
    const out = await recallText(ctx, {
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
    await recallText(ctx, {
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
    const out = await recallText(ctx, {
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
    const out = await recallText(ctx, {
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
    await seedSegment(db, { ownerId: owner, chatId, blockIdx: 0, seqStart: 1, seqEnd: 8 });
    await seedSegment(db, { ownerId: owner, chatId, blockIdx: 1, seqStart: 9, seqEnd: 16 });
    const ctx = makeChatContext(db);
    const out = await recallText(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 9, leftSeq: null }],
      config: { mode: "mixA" },
    });
    expect(out).toContain("[aria]"); // own scoped block it witnessed
    expect(out).not.toContain("[shared-prejoin]"); // the shared bucket is witness-filtered too — not a free pass
  });

  test("witness filter fails closed when a post-join digest has no segment span evidence", async () => {
    const chatId = await seedChat(db, "spanless");
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 1,
      topicAnchor: "[post-join-unknown-span]",
      keywords: [],
    });
    // NO seedSegment → the span resolver cannot prove where block 1 sits relative to the join floor.
    const ctx = makeChatContext(db);
    const { text, trace } = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 9, leftSeq: null }],
      config: { mode: "mixA" },
    });
    expect(text).not.toContain("[post-join-unknown-span]");
    expect(trace.candidates).toContainEqual(expect.objectContaining({ blockIdx: 1, verdict: "unwitnessed" }));
  });

  test("witness filter fails closed when a higher-tier digest's FIRST covered block span is missing", async () => {
    const chatId = await seedChat(db, "missing-first-span");
    for (let b = 0; b < 4; b += 1) {
      await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 0, blockIdx: b, topicAnchor: `[t0.${b}]`, keywords: [] });
      if (b > 0) {
        await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
      }
    }
    await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 1, blockIdx: 0, topicAnchor: "[T1.0]", keywords: [] });

    const out = await recallText(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 1, leftSeq: null }],
      config: { mode: "tiered", fanOut: 2 },
    });
    expect(out).not.toContain("[T1.0]");
    expect(out).toContain("[t0.2]");
  });

  test("witness filter fails closed when a higher-tier digest's LAST covered block span is missing", async () => {
    const chatId = await seedChat(db, "missing-last-span");
    for (let b = 0; b < 4; b += 1) {
      await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 0, blockIdx: b, topicAnchor: `[t0.${b}]`, keywords: [] });
      if (b !== 1) {
        await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
      }
    }
    await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 1, blockIdx: 0, topicAnchor: "[T1.0]", keywords: [] });

    const out = await recallText(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 1, leftSeq: null }],
      config: { mode: "tiered", fanOut: 2 },
    });
    expect(out).not.toContain("[T1.0]");
    expect(out).toContain("[t0.0]");
  });

  test("witness filter preserves a higher-tier digest when both covered endpoint spans prove it was witnessed", async () => {
    const chatId = await seedChat(db, "known-endpoint-spans");
    for (let b = 0; b < 4; b += 1) {
      await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 0, blockIdx: b, topicAnchor: `[t0.${b}]`, keywords: [] });
      await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 1, blockIdx: 0, topicAnchor: "[T1.0]", keywords: [] });

    const out = await recallText(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 1, leftSeq: null }],
      config: { mode: "tiered", fanOut: 2 },
    });
    expect(out).toContain("[T1.0]");
    expect(out).toContain("[t0.2]");
  });

  test("witness filter resolves a HIGHER-TIER digest's span via its tier-0 range (a distant arc never seen is dropped)", async () => {
    const chatId = await seedChat(db, "htw");
    for (let b = 0; b < 4; b += 1) {
      await seedDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[t0.${b}]`,
        keywords: [],
      });
      await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
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
    const full = await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      witnessing: [{ joinSeq: 1, leftSeq: null }],
      config: { mode: "tiered", fanOut: 2 },
    });
    expect(full).toContain("[T1.0]");
    // joined at seq 17 → never witnessed tier-1 block 0's span (seq 1-16) → its arc is filtered out (tier>0 math).
    const late = await recallText(ctx, {
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
    const out = await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    // the significance-filtered FACTS line is present — proves format reads `text`, not renderDigestFacets(facets).
    expect(out).toContain(facts);
    expect(out).toBe(fullText);
  });
});

describe("memory/recall — the §3a recall window-filter (the SECOND guard, token-driven + uniform)", () => {
  /** Seed three shared-bucket tier-0 blocks 0/1/2 with seq-spans [1-8] / [9-16] / [17-24]. */
  async function seedThreeBlocks(chatId: ChatId): Promise<void> {
    for (let b = 0; b < 3; b += 1) {
      await seedDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        tier: 0,
        blockIdx: b,
        topicAnchor: `[b${b}]`,
        keywords: [],
      });

      await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
  }

  test("mixA: a digest still in the live window is dropped; an aged-out one is surfaced (cutoff, not verbatimWindow)", async () => {
    const chatId = await seedChat(db, "lw-mixa");
    await seedThreeBlocks(chatId);
    const ctx = makeChatContext(db);
    // cutoff 9 ⇒ blocks starting at seq ≥ 9 (b1 @9, b2 @17) are verbatim in the live window → dropped; b0 (@1) surfaces.
    // `verbatimWindow` is deliberately HUGE — a mutant filtering by the fixed window (not the cutoff) would differ.
    const out = await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      liveWindowCutoffSeq: 9,
      config: { mode: "mixA", verbatimWindow: 100 },
    });
    expect(out).toContain("[b0]");
    expect(out).not.toContain("[b1]");
    expect(out).not.toContain("[b2]");
  });

  test("boundary: seqStart == cutoff is filtered (still in window); seqStart < cutoff is surfaced", async () => {
    const chatId = await seedChat(db, "lw-bound");
    await seedThreeBlocks(chatId);
    const ctx = makeChatContext(db);
    // cutoff 17 ⇒ b2 starts AT 17 (dropped); b1 (@9) and b0 (@1) are strictly below → surfaced.
    const out = await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      liveWindowCutoffSeq: 17,
      config: { mode: "mixA" },
    });
    expect(out).toContain("[b0]");
    expect(out).toContain("[b1]");
    expect(out).not.toContain("[b2]"); // seqStart === cutoff → still in the live window
  });

  test("tiered: the window-filter applies to pure-assembly modes too (NOT just mixB/mixC)", async () => {
    const chatId = await seedChat(db, "lw-tiered");
    await seedThreeBlocks(chatId);
    const ctx = makeChatContext(db);
    const out = await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      liveWindowCutoffSeq: 9,
      config: { mode: "tiered", fanOut: 2 },
    });
    // only b0 remains in the pool → the bridge surfaces b0 alone (the recent blocks are verbatim in the prompt).
    expect(out).toContain("[b0]");
    expect(out).not.toContain("[b1]");
    expect(out).not.toContain("[b2]");
  });

  test("mixC: the window-filtered pool feeds the bridge candidates (in-window blocks never reach search)", async () => {
    const chatId = await seedChat(db, "lw-mixc");
    await seedThreeBlocks(chatId);
    const search = fakeSearchDigests([]);
    const ctx = makeChatContext(db, { searchDigests: search.fn });
    await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      liveWindowCutoffSeq: 9,
      config: { mode: "mixC", fanOut: 2 },
    });
    const cand = search.calls.at(0)?.candidates ?? [];
    // only b0 (blockIdx 0) is a candidate — the in-window b1/b2 were filtered BEFORE the bridge/candidates.
    expect(cand.map((k) => k.blockIdx)).toEqual([0]);
  });

  // ── #1518: the drop test reads the digest's whole SPAN, not just its first covered block ───────────────
  // `filterPool` resolves both endpoints (`first`/`last`) and the witnessing check uses both, but the
  // live-window test read only `first.seqStart` — so a tier>0 digest whose span STRADDLES the cutoff stayed
  // in the pool, summarising content the prompt already carries verbatim. It is dropped now, and the pool's
  // FINER coverage of its aged-out half takes over (the bridge re-covers the same blocks at tier 0) — which
  // is exactly why the rule is tier-aware: a tier-0 straddler has nothing finer behind it, so it is KEPT
  // (the second pin). The verdict ledger is the observable: today the straddler is eliminated one stage
  // later as "bridge-covered", which reports the wrong reason for the wrong block.
  /** Eight shared-bucket tier-0 blocks 0…7, spans [1-8] … [57-64], plus tier-1 parents over each pair. */
  async function seedEightBlocksWithTier1(chatId: ChatId): Promise<void> {
    for (let b = 0; b < 8; b += 1) {
      await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 0, blockIdx: b, topicAnchor: `[t0.${b}]`, keywords: [] });
      await seedSegment(db, { ownerId: owner, chatId, blockIdx: b, seqStart: 8 * b + 1, seqEnd: 8 * b + 8 });
    }
    for (let p = 0; p < 4; p += 1) {
      await seedDigest(db, { chatId, scopedCharacterId: GROUP_CHAR, tier: 1, blockIdx: p, topicAnchor: `[T1.${p}]`, keywords: [] });
    }
  }

  /** The verdict the trace recorded for one pool member (undefined ⇒ it never entered the ledger). */
  function verdictOf(candidates: readonly { tier: number; blockIdx: number; verdict?: string }[], tier: number, blockIdx: number): string | undefined {
    return candidates.find((c) => c.tier === tier && c.blockIdx === blockIdx)?.verdict;
  }

  test("#1518 a tier-1 digest whose span STRADDLES the cutoff is dropped by the live-window filter", async () => {
    const chatId = await seedChat(db, "lw-straddle");
    await seedEightBlocksWithTier1(chatId);
    // Cutoff 45 sits INSIDE tier-0 block 5 (seq 41-48). T1.2 covers blocks 4-5 (seq 33-48): it STARTS below
    // the cutoff (so the old start-only test kept it) and ENDS above it — half of what it summarises is
    // verbatim in the prompt.
    const { trace } = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      liveWindowCutoffSeq: 45,
      config: { mode: "tiered", fanOut: 2, maxTier: 1 },
    });
    expect(verdictOf(trace.candidates, 1, 2)).toBe("live-window");
    // The wholly-aged-out coarse parents are untouched — the fix drops the OVERLAP, not the tier.
    expect(verdictOf(trace.candidates, 1, 0)).toBe("admitted");
  });

  test("#1518 …but a TIER-0 straddler is KEPT — nothing finer covers its aged-out half", async () => {
    const chatId = await seedChat(db, "lw-straddle-t0");
    await seedEightBlocksWithTier1(chatId);
    const { trace } = await recallMemory(makeChatContext(db), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      liveWindowCutoffSeq: 45,
      config: { mode: "mixA", fanOut: 2, maxTier: 1 },
    });
    // Block 5 (seq 41-48) straddles cutoff 45: dropping it would delete seq 41-44 from BOTH planes.
    expect(verdictOf(trace.candidates, 0, 5)).toBe("admitted");
    // Block 6 (seq 49-56) is wholly inside the live window — still dropped.
    expect(verdictOf(trace.candidates, 0, 6)).toBe("live-window");
  });

  test("cutoff absent ⇒ NO live-window filtering (current behavior preserved)", async () => {
    const chatId = await seedChat(db, "lw-none");
    await seedThreeBlocks(chatId);
    const ctx = makeChatContext(db);
    const out = await recallText(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      config: { mode: "mixA" },
    });
    expect(out).toContain("[b0]");
    expect(out).toContain("[b1]");
    expect(out).toContain("[b2]");
  });
});
