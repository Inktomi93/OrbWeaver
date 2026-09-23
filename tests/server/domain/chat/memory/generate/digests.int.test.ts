import type { SummarizeResult } from "@orb/contracts/providers";
import type { SummarizeInput } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { chatDigestSpeakers, chatDigests, messages, messageVariants } from "@orb/db";
import type { CharacterId, ChatDigestId, Handle, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { EmbeddingsStoreOp, StoreDigestParams } from "../../../../../../packages/server/src/domain/chat/contract/context.ts";
import { generateDigests } from "../../../../../../packages/server/src/domain/chat/memory/generate/digests.ts";
import { consolidationSystemPrompt } from "../../../../../../packages/server/src/domain/chat/memory/generate/substrate/prompts.ts";
import { blockHash } from "../../../../../../packages/server/src/domain/chat/memory/generate/substrate/transcript.ts";
import { loadDigestsForScope, loadWitnessHorizons } from "../../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import type { MemoryLogEntry, MsgRow } from "../../../../../../packages/server/src/domain/chat/memory/types.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { asSummarizeOp, makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedPersona, seedUser } from "../../_support.ts";
import { fakeEmbeddingsStore, fakeSummarize, GROUP_CHAR, MODEL, seedDigest, seedTurns, sharedScope, testGenerationId } from "../_support.ts";

// PROSE-1 S1: the consolidation system prompt is a slot resolved off the ROOM HOST. The harness's chat ctx
// carries no override, so the discriminator these tests key on is the resolved shipped default.
const CONSOLIDATION_SYSTEM_PROMPT = consolidationSystemPrompt({});

/** A summarizer that returns only whitespace — the empty-output degrade the F7 skip-and-flag guards against.
 *  Returns ONE blank item per input so a BATCHED call resolves every slot (the build now batches). */
const emptySummarize = (inputs: readonly SummarizeInput[]): Promise<SummarizeResult> =>
  Promise.resolve({
    items: inputs.map(() => ({ text: "  \n ", usage: { tokensIn: 1, tokensOut: 0, costUsd: null } })),
    model: MODEL,
  });

const ENTITIES_ANCHOR_RE = /^\[entities/u;
const aria = castId<CharacterId>("character_aria");
const bram = castId<CharacterId>("character_bram");

let db: Db;
let owner: UserId;
beforeEach(async () => {
  db = await freshDb();
  owner = await seedUser(db, castId<Handle>("owner"));
  await seedCharacter(db, owner, "aria"); // id === `character_aria` (the `aria` const) — FK target for speakers
  await seedCharacter(db, owner, "bram"); // a second cast char — FK target for the consolidation speaker-union
  await seedCharacter(db, owner, "group"); // id === GROUP_CHAR — FK target for the shared-bucket digests
});

/** An `embeddingsStore` fake that UPSERTS (delete-by-id then re-seed) so a re-digest on a content-hash change
 *  does not collide on the deterministic digest id (the production store upserts; the shared `fakeEmbeddingsStore`
 *  plain-inserts, which is fine for first-write tests but throws on the self-heal RE-write path). Records only
 *  THIS instance's writes — pass a fresh one per build pass to capture exactly that pass's re-digests. */
function upsertingStore(database: Db): { store: EmbeddingsStoreOp; digests: StoreDigestParams[] } {
  const digests: StoreDigestParams[] = [];
  const store: EmbeddingsStoreOp = async (params) => {
    digests.push(params);
    const id = castId<ChatDigestId>(`chat_digest_${params.key.chatId}_${params.key.scopedCharacterId}_${params.key.tier}_${params.key.blockIdx}`);
    await database.delete(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, id));
    await database.delete(chatDigests).where(eq(chatDigests.id, id));
    await seedDigest(database, {
      chatId: params.key.chatId,
      scopedCharacterId: params.key.scopedCharacterId,
      tier: params.key.tier,
      blockIdx: params.key.blockIdx,
      text: params.text,
      contentHash: params.contentHash,
      topicAnchor: params.topicAnchor,
      keywords: [...params.keywords],
      isGroup: params.isGroup,
      speakers: [...params.speakerCharacterIds],
      ownerId: params.ownerId,
    });
    return { ownerId: params.ownerId, model: params.model, generationId: testGenerationId(params.ownerId), generationEpoch: 1 };
  };
  return { store, digests };
}

describe("memory/generate/digests", () => {
  test("digests each complete aged-out block via the summarizer + stores the facets through embeddings.store", async () => {
    const chatId = await seedChat(db, "a");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 },
      funderUserId: owner,
    });

    // 2 tier-0 blocks (seq 1-2, 3-4) + 1 tier-1 consolidation (fanOut 2).
    const tier0 = store.digests.filter((d) => d.key.tier === 0);
    const tier1 = store.digests.filter((d) => d.key.tier === 1);
    expect(tier0.map((d) => d.key.blockIdx)).toEqual([0, 1]);
    expect(tier1).toHaveLength(1);
    expect(counts.written).toBe(3);

    // the digest carries the parsed facets + a content hash + the block's speakers (the join), isGroup false.
    const first = tier0[0];
    expect(first).toBeDefined();
    expect(first?.lens).toBe("digest");
    expect(first?.key).toMatchObject({
      chatId,
      tier: 0,
      blockIdx: 0,
      scopedCharacterId: GROUP_CHAR,
    });
    expect(first?.topicAnchor).toMatch(ENTITIES_ANCHOR_RE);
    expect(first?.keywords).toEqual(["alpha", "beta", "gamma"]);
    expect(first?.contentHash).toHaveLength(64); // sha-256 hex
    expect(first?.speakerCharacterIds).toEqual([aria]);
    expect(first?.isGroup).toBe(false);
    // the summarizer was called once per block + once for the consolidation.
    expect(sum.calls).toHaveLength(3);
  });

  test("rejects an embedding-store receipt for a different generation principal", async () => {
    const chatId = await seedChat(db, "receipt-owner");
    await seedTurns(db, chatId, aria, 2);
    const otherOwner = castId<UserId>("user_other_generation_owner");
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().op,
      embeddingsStore: (params) =>
        Promise.resolve({
          ownerId: otherOwner,
          model: params.model,
          generationId: testGenerationId(params.ownerId),
          generationEpoch: 1,
        }),
    });

    await expect(
      generateDigests(ctx, {
        scope: sharedScope(chatId),
        config: { blockSize: 2, verbatimWindow: 0 },
        funderUserId: owner,
      }),
    ).rejects.toThrow("memory digest embed space changed during sweep");
  });

  // PROSE-1 census 78/80/81 — the digest + consolidation prompts are per-USER slots resolved against the ROOM
  // HOST. `resolveChatProse` is the ONE seam; with no override the calls carry the shipped defaults (asserted
  // implicitly everywhere else in this file), with one they carry the host's bytes.
  test("PROSE-1: the room host's prose overrides ride the digest AND consolidation prompts", async () => {
    const chatId = await seedChat(db, "prose");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, {
      summarize: sum.op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: store.storeSegments,
      resolveChatProse: () =>
        Promise.resolve({
          "chat.memory.digestSystem": { text: "HOST DIGEST RULES", baseVersion: 1 },
          "chat.memory.consolidationSystem": { text: "HOST ARC RULES", baseVersion: 1 },
          "chat.memory.consolidationLead": { text: "HOST LEAD:", baseVersion: 1 },
        }),
    });

    await generateDigests(ctx, { scope: sharedScope(chatId), config: { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 }, funderUserId: owner });

    expect(sum.calls.filter((c) => c.systemPrompt === "HOST DIGEST RULES")).toHaveLength(2);
    const consolidation = sum.calls.find((c) => c.systemPrompt === "HOST ARC RULES");
    expect(consolidation).toBeDefined();
    // The lead is the authored half of the user prompt; the numbered facets after it stay builder-owned data.
    expect(consolidation?.userPrompt.startsWith("HOST LEAD:\n\n[1]\n")).toBe(true);
  });

  test("the resolved AppSettings.memorySummarizer sampling rides every summarize call (plus the loop-guard presence default)", async () => {
    const chatId = await seedChat(db, "sampling");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, memorySummarizer: { maxTokens: 512, temperature: 0.3 } });

    await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 },
      funderUserId: owner,
    });

    // every summarize call (both tier-0 blocks + the tier-1 consolidation) carries the admin's sampling AND the
    // Qwen3-VL loop-stopping presence-penalty default the memory build always rides.
    expect(sum.optsSeen).toHaveLength(3);
    for (const opts of sum.optsSeen) {
      expect(opts).toEqual({ maxOutputTokens: 512, temperature: 0.3, presencePenalty: 1.5 });
    }
  });

  // RED-FIRST (the loop fix): with memorySummarizer UNSET, the summarize opts MUST still carry a loop-stopping
  // presence penalty (Qwen3-VL card default 1.5) — the summarize wire does not inherit the vLLM chat surface's
  // per-request presence default, so a repetition_penalty=1.0 model degenerates into a loop without this. Read
  // via a Record cast so the assertion compiles against the OLD contract (which returned `{}`).
  test("an unset memorySummarizer STILL rides the loop-stopping presence-penalty default (1.5)", async () => {
    const chatId = await seedChat(db, "sampling-default");
    await seedTurns(db, chatId, aria, 2);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    await generateDigests(ctx, { scope: sharedScope(chatId), config: { blockSize: 2, verbatimWindow: 0 }, funderUserId: owner });

    expect(sum.optsSeen.length).toBeGreaterThan(0);
    for (const opts of sum.optsSeen) {
      expect((opts as Record<string, unknown> | undefined)?.["presencePenalty"]).toBe(1.5);
      // An unset admin config rides the TWO loop-guard defaults and nothing else: the presence penalty (1.5)
      // AND a hard max_tokens ceiling (1024) — both bound the Qwen3-VL repetition_penalty=1.0 loop that would
      // otherwise run unbounded to the 120s request timeout. The other samplers stay at provider default.
      expect(opts).toEqual({ maxOutputTokens: 1024, presencePenalty: 1.5 });
    }
  });

  // #329 P1 (RED-FIRST): the consolidation is fed the children's FULL stored digests (anchor · facts · keywords),
  // NOT just the anchor+keywords facets. Facts-stripped input made the summarizer CONFABULATE relations (measured
  // live: an arc said "Bess married to Nate" when the child tier-0 digest correctly says Liam). The child's facts
  // BODY must reach the consolidation prompt. Compiles against OLD source (it asserts on the summarizer input).
  test("the consolidation prompt is fed the children's FULL facts body, not just anchor+keywords (#329 P1)", async () => {
    const chatId = await seedChat(db, "consolidation-facts");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    await generateDigests(ctx, { scope: sharedScope(chatId), config: { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 1 }, funderUserId: owner });

    const consolidation = sum.calls.find((c) => c.systemPrompt === CONSOLIDATION_SYSTEM_PROMPT);
    expect(consolidation).toBeDefined();
    // The two children's FACTS lines reach the summarizer — the fix. OLD (renderDigestFacets) stripped them,
    // passing only "[entities — scene N]\nkeywords: …" and starving the summarizer of the facts.
    expect(consolidation?.userPrompt).toContain("Facts about turn 1.");
    expect(consolidation?.userPrompt).toContain("Facts about turn 2.");
  });

  // #329 P1b (RED-FIRST): the OUTPUT-SHAPE guard against depth starvation — a consolidation whose summarizer
  // returned an anchor+keywords with NO narrative body (the tier ≥ 3 collapse) must be skipped-and-flagged like
  // a blank digest, never stored as a bodyless arc. Scripts a summarizer that gives tier-0 real facts but the
  // consolidation only a keyword list.
  test("a consolidation that returns NO facts body is skipped, not stored as a bodyless arc (#329 P1b)", async () => {
    const chatId = await seedChat(db, "bodyless-arc");
    await seedTurns(db, chatId, aria, 4);
    const bodylessArc = (inputs: readonly SummarizeInput[]): Promise<SummarizeResult> =>
      Promise.resolve({
        items: inputs.map((inp) => ({
          text:
            inp.systemPrompt === CONSOLIDATION_SYSTEM_PROMPT
              ? "[entities — arc]\nkeywords: a, b, c"
              : "[entities — scene]\nReal facts here.\nkeywords: a, b, c",
          usage: { tokensIn: 1, tokensOut: 1, costUsd: null },
        })),
        model: MODEL,
      });
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: asSummarizeOp(bodylessArc), embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    await generateDigests(ctx, { scope: sharedScope(chatId), config: { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 1 }, funderUserId: owner });

    // Both tier-0 blocks (real facts) stored; the bodyless tier-1 arc is NOT — the guard skips-and-retries it.
    expect(store.digests.filter((d) => d.key.tier === 0)).toHaveLength(2);
    expect(store.digests.filter((d) => d.key.tier === 1)).toHaveLength(0);
  });

  // RED-FIRST (the throughput fix): the tier-0 block summarizes go out as ONE batched ctx.summarize call
  // (inputs.length > 1) so the surface's worker pool feeds vLLM's continuous batcher. Under the OLD per-block
  // loop every call carried exactly one input, so `batchSizes` was all 1s — this asserts a >1 batch exists.
  test("the tier-0 block summarizes are issued as ONE batched call (inputs.length > 1)", async () => {
    const chatId = await seedChat(db, "batched");
    await seedTurns(db, chatId, aria, 8); // blockSize 2 → 4 tier-0 blocks in one pass
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });

    // 4 blocks summarized in ONE call, not four singles — the batch is what makes the worker pool concurrent.
    expect(sum.batchSizes).toContain(4);
    expect(Math.max(...sum.batchSizes)).toBeGreaterThan(1);
    // all four blocks still built (batching preserves the per-block write + content-hash self-heal).
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([0, 1, 2, 3]);
  });

  test("verbatimWindow protects the tip — only aged-out blocks digest", async () => {
    const chatId = await seedChat(db, "b");
    await seedTurns(db, chatId, aria, 4); // maxSeq 4
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    // cutoff = 4 − 2 = 2 → only seq 1-2 (block 0) is aged out; seq 3-4 stays in the protected tip.
    await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 2, fanOut: 2, maxTier: 1 },
      funderUserId: owner,
    });
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([0]);
  });

  test("self-heal: a second pass over unchanged canon skips everything (no summarizer spend)", async () => {
    const chatId = await seedChat(db, "c");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 } as const;

    await generateDigests(ctx, { scope: sharedScope(chatId), config: cfg, funderUserId: owner });
    const callsAfterFirst = sum.calls.length;
    const counts = await generateDigests(ctx, { scope: sharedScope(chatId), config: cfg, funderUserId: owner });

    expect(counts.written).toBe(0);
    expect(counts.skipped).toBe(3); // 2 tier-0 + 1 tier-1, all unchanged
    expect(sum.calls).toHaveLength(callsAfterFirst); // the side-LLM is never re-spent
  });

  // ── THE SHRINK: blocks that VANISH must take their digests with them ────────────────────────────────
  // The self-heal is content-hash keyed and therefore only ever heals a block that STILL EXISTS. Blocks are
  // sliced by POSITION and stored keyed `(tier, blockIdx)`, so when the ingest set shrinks — a host hides a
  // trailing span, so `loadCanonThroughSeq` returns fewer rows — the trailing block simply stops being
  // produced. Nothing re-summarizes it (the surviving blocks' rows did not move, so no hash changed) and
  // until this pass nothing deleted it: the digest summarized VERBATIM FROM the now-hidden rows stayed in
  // `chat_digests`, and `loadDigestsForScope` returns every row for the scope regardless of whether its block
  // still exists — so `{{memory}}` recall could still surface it. Hiding the rows was exactly the act meant
  // to remove them. The consolidation that folded that block is the same defect one tier up.
  test("hiding a trailing span PRUNES the digest built from it — and the consolidation that folded it", async () => {
    const chatId = await seedChat(db, "shrink");
    await seedTurns(db, chatId, aria, 4); // blockSize 2 → block 0 (seq 1-2), block 1 (seq 3-4)
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 } as const;
    const first = upsertingStore(db);
    await generateDigests(makeChatContext(db, { summarize: fakeSummarize().op, embeddingsStore: first.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    // Baseline: both tier-0 blocks digested + the tier-1 consolidation over them.
    const seeded = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
    expect(seeded.map((d) => `${d.tier}:${d.blockIdx}`).sort()).toEqual(["0:0", "0:1", "1:0"]);

    // The host HIDES the trailing span (seq 3-4) — block 1's rows leave the ingest set entirely.
    for (const seq of [3, 4]) {
      await db
        .update(messages)
        .set({ excludedFromPrompt: true })
        .where(eq(messages.id, castId<MessageId>(`message_${chatId}_${seq}`)));
    }

    const second = upsertingStore(db);
    const sum = fakeSummarize();
    await generateDigests(makeChatContext(db, { summarize: sum.op, embeddingsStore: second.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });

    // Block 0's rows did not move, so the self-heal legitimately re-summarizes NOTHING…
    expect(second.digests).toHaveLength(0);
    // …and the rows derived from the hidden span are GONE: `0:1` (summarized from seq 3-4) and `1:0` (the
    // consolidation that folded it — a parent whose group can no longer be complete).
    const after = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
    expect(after.map((d) => `${d.tier}:${d.blockIdx}`).sort()).toEqual(["0:0"]);
    // The pruned digest's SPEAKER join rows go with it (no orphan `chat_digest_speakers` pointing at nothing).
    const speakers = await db.select().from(chatDigestSpeakers);
    const liveIds = new Set(after.map((d) => d.id));
    expect(speakers.every((s) => liveIds.has(s.digestId))).toBe(true);
  });

  test("mode 'off' is a no-op (D36 global disable)", async () => {
    const chatId = await seedChat(db, "d");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { mode: "off" },
      funderUserId: owner,
    });
    expect(counts).toEqual({ written: 0, skipped: 0 });
    expect(sum.calls).toHaveLength(0);
  });

  test("scoped build + witnessing (§4 / inv 12): only blocks the character was present for are digested", async () => {
    const chatId = await seedChat(db, "w");
    await seedTurns(db, chatId, aria, 6); // blockSize 2 → blocks 0 (seq 1-2), 1 (seq 3-4), 2 (seq 5-6)
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    // aria joined at seq 3 → block 0 (seq 1-2) is pre-join → NOT witnessed → no digest in aria's bucket.
    await generateDigests(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      witnessing: [{ joinSeq: 3, leftSeq: null }],
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([1, 2]);
  });

  test("WIRING (D6): a kicked-then-rejoined character digests neither pre-join NOR kicked history — horizons SOURCED from chat_participants", async () => {
    const chatId = await seedChat(db, "kickrejoin");
    await seedTurns(db, chatId, aria, 8); // blockSize 2 → blocks 0(1-2) 1(3-4) 2(5-6) 3(7-8)
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    // aria: present seq 1-4 (blocks 0,1), KICKED at seq 5 (leftSeq exclusive), RE-ADDED at seq 7 (block 3).
    // Two participant rows = two witnessing intervals; block 2 (seq 5-6) is the kicked gap → NOT witnessed.
    await seedParticipant(db, { chatId, key: "aria_ep1", characterId: aria, joinSeq: 1, leftSeq: 5 });
    await seedParticipant(db, { chatId, key: "aria_ep2", characterId: aria, joinSeq: 7, leftSeq: null });

    // The FIX: the wiring sources horizons from the participant rows (the pre-fix state passed `undefined` here
    // → the character wrongly digested the whole 8-turn history including the scene it was kicked out of).
    const witnessing = await loadWitnessHorizons(db, chatId, aria);
    expect(witnessing).toEqual([
      { joinSeq: 1, leftSeq: 5 },
      { joinSeq: 7, leftSeq: null },
    ]);

    await generateDigests(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      witnessing,
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    // Blocks 0,1 (present) + 3 (rejoined) are digested; block 2 (the kicked scene) is EXCLUDED.
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([0, 1, 3]);
  });

  test("SHARED bucket byte-identity: witnessing ABSENT ⇒ the full-history merged build (unfiltered)", async () => {
    const chatId = await seedChat(db, "sharedmerged");
    await seedTurns(db, chatId, aria, 8);
    // Even with the SAME kick/rejoin horizons present in chat_participants, the shared bucket omits witnessing
    // (the synthetic group char has no seat) → the merged build digests EVERY aged-out block, block 2 included.
    await seedParticipant(db, { chatId, key: "aria_ep1", characterId: aria, joinSeq: 1, leftSeq: 5 });
    await seedParticipant(db, { chatId, key: "aria_ep2", characterId: aria, joinSeq: 7, leftSeq: null });
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    await generateDigests(ctx, {
      scope: sharedScope(chatId), // GROUP_CHAR bucket, witnessing omitted
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([0, 1, 2, 3]);
  });

  test("token-guard: a block that cannot fit even one message is skipped-and-flagged (no silent truncation)", async () => {
    const chatId = await seedChat(db, "tg");
    // One aged-out block of 2 long messages; a tiny summarizer context cannot fit even the newest message.
    await seedMessage(db, chatId, 1, { characterId: aria, content: "x".repeat(4000) });
    await seedMessage(db, chatId, 2, { characterId: aria, content: "y".repeat(4000) });
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, {
      summarize: sum.op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: store.storeSegments,
      summarizerContextTokens: () => Promise.resolve(64), // far too small — even one message overflows
    });

    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    // skip-and-flag: NOT summarized, NOT stored — never a silent tail truncation.
    expect(sum.calls).toHaveLength(0);
    expect(store.digests).toHaveLength(0);
    expect(counts.written).toBe(0);
  });

  test("emits a `memory.build` trace; a fresh chat (no aged-out block) logs the zero-work skip (inv 10)", async () => {
    const chatId = await seedChat(db, "trace");
    await seedTurns(db, chatId, aria, 2); // only ~1 block, all inside the verbatim window → nothing aged out
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().op,
      embeddingsStore: fakeEmbeddingsStore(db).store,
      log: (e) => entries.push(e),
    });
    await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 8, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    const build = entries.find((e) => e.event === "memory.build");
    expect(build?.note).toBe("no aged-out block");
    expect(build?.event === "memory.build" && build.trace.blocksBuilt).toBe(0);
  });
});

describe("memory/generate/digests — adversarial (self-heal re-digest, tiering, token-guard, trigger discipline)", () => {
  test("a fresh chat does ZERO work: the summarize + embed fakes are NEVER touched (inv 10)", async () => {
    const chatId = await seedChat(db, "fresh");
    await seedTurns(db, chatId, aria, 2); // all inside the verbatim window → nothing aged out
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 8, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    expect(counts).toEqual({ written: 0, skipped: 0 });
    // the existing trace test asserts the LOG; this pins that NO summarizer/embed spend happened at all.
    expect(sum.calls).toHaveLength(0);
    expect(store.digests).toHaveLength(0);
  });

  test("self-heal: EDITING an aged-out block re-digests THAT block AND re-consolidates its tier-1 (anti-forgetting)", async () => {
    const chatId = await seedChat(db, "edit");
    await seedTurns(db, chatId, aria, 8); // blockSize 2 → 4 tier-0 blocks; fanOut 4 → one tier-1
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 2 } as const;
    const pass1 = upsertingStore(db);
    await generateDigests(ctx1(pass1.store), { scope: sharedScope(chatId), config: cfg, funderUserId: owner });
    expect(pass1.digests.filter((d) => d.key.tier === 0)).toHaveLength(4);
    expect(pass1.digests.filter((d) => d.key.tier === 1)).toHaveLength(1);

    // edit a message in aged-out block 0 → its content hash changes (and so does the tier-1's child-hash fold).
    await db
      .update(messageVariants)
      .set({ content: "EDITED — a load-bearing reveal" })
      .where(eq(messageVariants.id, castId<MessageVariantId>(`variant_${chatId}_1_0`)));

    const sum2 = fakeSummarize();
    const pass2 = upsertingStore(db);
    const ctx = makeChatContext(db, { summarize: sum2.op, embeddingsStore: pass2.store });
    const counts = await generateDigests(ctx, { scope: sharedScope(chatId), config: cfg, funderUserId: owner });

    const rebuilt = pass2.digests.map((d) => [d.key.tier, d.key.blockIdx]);
    expect(rebuilt).toContainEqual([0, 0]); // the edited block re-digested
    expect(rebuilt).toContainEqual([1, 0]); // its arc re-consolidated (parent hash folds the children's hashes)
    expect(rebuilt).not.toContainEqual([0, 1]); // the UNCHANGED blocks stay settled (no re-summarize)
    expect(rebuilt).not.toContainEqual([0, 2]);
    expect(rebuilt).not.toContainEqual([0, 3]);
    expect(counts.written).toBe(2);
    expect(sum2.calls).toHaveLength(2); // exactly the re-digest + the re-consolidation, nothing else
  });

  test("self-heal: PERSONA reattribution of a digested user block re-digests it (G2 — memory was persona-BLIND before; FAILS pre-fix)", async () => {
    const chatId = await seedChat(db, "personareattr");
    const human = await seedUser(db, castId<Handle>("human"));
    const mara = await seedPersona(db, human, "mara");
    const vex = await seedPersona(db, human, "vex");
    // One aged-out block of two USER turns authored under persona Mara.
    await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: human,
      personaId: mara,
      content: "hello 1",
    });
    await seedMessage(db, chatId, 2, {
      role: "user",
      authorUserId: human,
      personaId: mara,
      content: "hello 2",
    });
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 } as const;

    const pass1 = upsertingStore(db);
    await generateDigests(ctx1(pass1.store), { scope: sharedScope(chatId), config: cfg, funderUserId: owner });
    expect(pass1.digests.map((d) => d.key.blockIdx)).toEqual([0]);

    // Reattribute the block's persona Mara → Vex (same author, same content) — the `{{user}}` subject changed.
    // Pre-fix the block hash omitted personaId, so this was a SILENT no-op on memory (the digest never refreshed).
    await db.update(messages).set({ personaId: vex }).where(eq(messages.chatId, chatId));

    const sum2 = fakeSummarize();
    const pass2 = upsertingStore(db);
    const counts = await generateDigests(makeChatContext(db, { summarize: sum2.op, embeddingsStore: pass2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect(pass2.digests.map((d) => d.key.blockIdx)).toEqual([0]); // the block re-digested (self-heal)
    expect(counts.written).toBe(1);
    expect(sum2.calls).toHaveLength(1); // exactly the one re-summarize the persona re-stamp triggered
  });

  test("self-heal: CHARACTER reattribution of a digested block re-digests it (regression — the character axis still busts)", async () => {
    const chatId = await seedChat(db, "charreattr");
    await seedMessage(db, chatId, 1, { characterId: aria, content: "line 1" });
    await seedMessage(db, chatId, 2, { characterId: aria, content: "line 2" });
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 } as const;

    const pass1 = upsertingStore(db);
    await generateDigests(ctx1(pass1.store), { scope: sharedScope(chatId), config: cfg, funderUserId: owner });
    expect(pass1.digests.map((d) => d.key.blockIdx)).toEqual([0]);

    // Re-voice the block from Aria → Bram (a genuine `{{char}}` re-attribution) — the characterId fold busts it.
    await db.update(messages).set({ characterId: bram }).where(eq(messages.chatId, chatId));

    const sum2 = fakeSummarize();
    const pass2 = upsertingStore(db);
    const counts = await generateDigests(makeChatContext(db, { summarize: sum2.op, embeddingsStore: pass2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect(pass2.digests.map((d) => d.key.blockIdx)).toEqual([0]);
    expect(counts.written).toBe(1);
  });

  test("G1: the digest transcript resolves {{user}}→the persona name in the summarizer input (not the raw macro)", async () => {
    const chatId = await seedChat(db, "digestbody");
    const human = await seedUser(db, castId<Handle>("human2"));
    const mara = await seedPersona(db, human, "mara");
    await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: human,
      personaId: mara,
      content: "I am {{user}}.",
    });
    await seedMessage(db, chatId, 2, { characterId: aria, content: "Hi {{char}} speaking." });
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const macroNames: RowMacroNameContext = {
      characterNamesById: new Map([[aria, { name: "Aria" }]]),
      personaNamesById: new Map([[mara, { name: "Mara", description: "" }]]),
    };
    await generateDigests(makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments }), {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      macroNames,
      funderUserId: owner,
    });
    const prompt = sum.calls.at(0)?.userPrompt ?? "";
    expect(prompt).toContain("I am Mara."); // {{user}} → the authoring persona name
    expect(prompt).toContain("Aria speaking"); // {{char}} → the row's character name
    expect(prompt).not.toContain("{{user}}"); // never the literal macro
    expect(prompt).not.toContain("persona_mara"); // never the raw typeid
  });

  test("self-heal: editing a PROTECTED-TIP message never busts a settled digest (the protect zone shields it)", async () => {
    const chatId = await seedChat(db, "tipedit");
    await seedTurns(db, chatId, aria, 4); // maxSeq 4
    const cfg = { blockSize: 2, verbatimWindow: 2, fanOut: 4, maxTier: 1 } as const; // cutoff 2 → only block 0 aged out
    const store1 = fakeEmbeddingsStore(db);
    await generateDigests(makeChatContext(db, { summarize: fakeSummarize().op, embeddingsStore: store1.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect(store1.digests.map((d) => d.key.blockIdx)).toEqual([0]);

    // edit seq 4 — a TIP message (seq > cutoff, in the protected window) → must NOT touch the settled block-0 digest.
    await db
      .update(messageVariants)
      .set({ content: "EDITED TIP" })
      .where(eq(messageVariants.id, castId<MessageVariantId>(`variant_${chatId}_4_0`)));

    const sum2 = fakeSummarize();
    const store2 = fakeEmbeddingsStore(db);
    const counts = await generateDigests(makeChatContext(db, { summarize: sum2.op, embeddingsStore: store2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect(counts.written).toBe(0);
    expect(sum2.calls).toHaveLength(0); // no re-summarize — the tip edit is below the cutoff's reach
    expect(store2.digests).toHaveLength(0);
  });

  test("fork-lazy / hash-keyed skip: a pre-existing digest with the MATCHING content_hash reuses (NO summarizer call)", async () => {
    const chatId = await seedChat(db, "fork");
    await seedTurns(db, chatId, aria, 4); // blocks 0 (seq 1-2), 1 (seq 3-4)
    // Pre-seed block 0's digest with the EXACT hash the build will compute (a fork copying the parent's digest);
    // block 1 has none. The build must SKIP block 0 by hash (no summarize) and only summarize the divergent block 1.
    const block0Rows: MsgRow[] = [
      {
        seq: 1,
        role: "assistant",
        kind: "standard",
        characterId: aria,
        authorUserId: null,
        personaId: null,
        content: "turn 1",
      },
      {
        seq: 2,
        role: "assistant",
        kind: "standard",
        characterId: aria,
        authorUserId: null,
        personaId: null,
        content: "turn 2",
      },
    ];
    await seedDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      tier: 0,
      blockIdx: 0,
      contentHash: blockHash(`${GROUP_CHAR}:0:0`, block0Rows),
      topicAnchor: "[reused]",
      keywords: [],
    });
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const counts = await generateDigests(
      makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments }),
      {
        scope: sharedScope(chatId),
        config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
        funderUserId: owner,
      },
    );
    expect(store.digests.map((d) => d.key.blockIdx)).toEqual([1]); // only the divergent block (re)built
    expect(sum.calls).toHaveLength(1); // block 0's identical-hash digest skipped the LLM
    expect(counts.skipped).toBeGreaterThanOrEqual(1);
  });

  test("tier consolidation: an INCOMPLETE fanOut group is NOT consolidated (deferred until it fills)", async () => {
    const chatId = await seedChat(db, "incomplete");
    await seedTurns(db, chatId, aria, 6); // blockSize 2 → 3 tier-0 blocks; fanOut 4 needs 4 → no tier-1 yet
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    await generateDigests(makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments }), {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 2 },
      funderUserId: owner,
    });
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([0, 1, 2]);
    expect(store.digests.some((d) => d.key.tier >= 1)).toBe(false); // 3 < fanOut 4 → no consolidation
    expect(sum.calls).toHaveLength(3); // only the 3 tier-0 blocks summarized
  });

  test("tier consolidation: ONE tier-1 per fanOut group via the DELTA prompt, a real synthesis, speakers unioned", async () => {
    const chatId = await seedChat(db, "consol");
    // 4 tier-0 blocks (blockSize 2) voiced by alternating speakers → the tier-1 unions [aria, bram] (first-seen).
    const voices = [aria, aria, bram, bram, aria, aria, bram, bram];
    for (const [i, characterId] of voices.entries()) {
      await seedMessage(db, chatId, i + 1, { characterId, content: `t${i + 1}` });
    }
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    await generateDigests(makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments }), {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 2 },
      funderUserId: owner,
    });
    const tier1 = store.digests.filter((d) => d.key.tier === 1);
    expect(tier1).toHaveLength(1);
    // the consolidation used the DELTA system prompt ("synthesize the arc — do NOT repeat"), not the tier-0 prompt.
    const consolidationCall = sum.calls.find((c) => c.systemPrompt === CONSOLIDATION_SYSTEM_PROMPT);
    expect(consolidationCall).toBeDefined();
    expect(consolidationCall?.userPrompt).toContain("[1]"); // the children's facets are numbered (do-not-repeat framing)
    // the tier-1 text is the model's SYNTHESIS (the 5th fake call), NOT a concatenation of the children's texts.
    expect(tier1[0]?.text).toContain("scene 5");
    expect(tier1[0]?.text).not.toContain("scene 1");
    // speakers unioned across the group, first-seen order.
    expect(tier1[0]?.speakerCharacterIds).toEqual([aria, bram]);
  });

  test("token-guard at build: an over-budget OLDEST message is trimmed (block STILL digested) — never a silent tail truncation", async () => {
    const chatId = await seedChat(db, "tgtrim");
    await seedMessage(db, chatId, 1, { characterId: aria, content: "a".repeat(40_000) }); // huge oldest
    await seedMessage(db, chatId, 2, { characterId: aria, content: "keepme" }); // small newest (the tail)
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, {
      summarize: sum.op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: store.storeSegments,
      summarizerContextTokens: () => Promise.resolve(6000), // above the floor, but the giant oldest message overflows it
      log: (e) => entries.push(e),
    });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    expect(counts.written).toBe(1); // trimmed-to-fit, NOT skipped
    expect(sum.calls).toHaveLength(1);
    expect(sum.calls[0]?.userPrompt).toContain("keepme"); // the NEWEST (tail) survives
    expect(sum.calls[0]?.userPrompt).not.toContain("aaaa"); // the over-budget OLDEST is dropped, not the tail
    const build = entries.find((e) => e.event === "memory.build" && e.note === undefined);
    expect(build?.event === "memory.build" && build.trace.blocksSkippedTokenGuard).toBe(0);
    expect(build?.event === "memory.build" && build.trace.blocksBuilt).toBe(1);
  });

  test("token-guard config floor: a below-floor summarizer context logs the soft-warning but STILL digests (degrade visible, not silent)", async () => {
    const chatId = await seedChat(db, "floor");
    await seedTurns(db, chatId, aria, 2); // one tiny aged-out block
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, {
      summarize: sum.op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: store.storeSegments,
      summarizerContextTokens: () => Promise.resolve(3000), // below the floor (4096) but the tiny block still fits the budget
      log: (e) => entries.push(e),
    });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      funderUserId: owner,
    });
    expect(entries.some((e) => e.event === "memory.build" && e.note === "summarizer context below floor")).toBe(true);
    expect(counts.written).toBe(1); // soft-warning, NOT a hard skip — the block is still digested
    expect(store.digests).toHaveLength(1);
  });

  test("blockSize is NOT auto-resized by the summarizer context: block boundaries depend only on `blockSize`", async () => {
    const chatId = await seedChat(db, "noresize");
    await seedTurns(db, chatId, aria, 4); // blockSize 2 → blocks [0,1] regardless of context size
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 } as const;
    const wide = fakeEmbeddingsStore(db);
    await generateDigests(
      makeChatContext(db, {
        summarize: fakeSummarize().op,
        embeddingsStore: wide.store,
        summarizerContextTokens: () => Promise.resolve(200_000),
      }),
      { scope: sharedScope(chatId), config: cfg, funderUserId: owner },
    );
    const chatId2 = await seedChat(db, "noresize2");
    await seedTurns(db, chatId2, aria, 4);
    const tight = fakeEmbeddingsStore(db);
    await generateDigests(
      makeChatContext(db, {
        summarize: fakeSummarize().op,
        embeddingsStore: tight.store,
        summarizerContextTokens: () => Promise.resolve(6000),
      }),
      { scope: sharedScope(chatId2), config: cfg, funderUserId: owner },
    );
    const blocks = (s: typeof wide): number[] => s.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx);
    expect(blocks(wide)).toEqual([0, 1]);
    expect(blocks(tight)).toEqual([0, 1]); // same boundaries — the context never reshapes the block grid
  });

  test("empty summarizer output is SKIP-AND-FLAGGED, not stored — the next build retries the block (F7)", async () => {
    const chatId = await seedChat(db, "emptyout");
    await seedTurns(db, chatId, aria, 2); // one aged-out block (seq 1-2)
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 } as const;

    // Pass 1: the summarizer returns only whitespace → the block must NOT be stored (a blank digest keyed by
    // the block's content-hash would skip forever, permanently absent from {{memory}}). Flagged, not stored.
    const store1 = fakeEmbeddingsStore(db);
    const entries: MemoryLogEntry[] = [];
    const counts1 = await generateDigests(
      makeChatContext(db, {
        summarize: asSummarizeOp(emptySummarize),
        embeddingsStore: store1.store,
        log: (e) => entries.push(e),
      }),
      { scope: sharedScope(chatId), config: cfg, funderUserId: owner },
    );
    expect(store1.digests).toHaveLength(0); // nothing stored — no blank-text poison
    expect(counts1.written).toBe(0);
    const build = entries.find((e) => e.event === "memory.build" && e.note === undefined);
    expect(build?.event === "memory.build" && build.trace.blocksSkippedEmpty).toBe(1);

    // Pass 2: a real summarizer digests the SAME block — the empty pass left NO stored hash to skip on, so the
    // block is retried (not silently forgotten). This is the whole point of skip-and-flag over store-empty.
    const store2 = fakeEmbeddingsStore(db);
    const counts2 = await generateDigests(makeChatContext(db, { summarize: fakeSummarize().op, embeddingsStore: store2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect(counts2.written).toBe(1);
    expect(store2.digests.map((d) => d.key.blockIdx)).toEqual([0]);
  });

  test("CONSOLIDATION-site: empty summarizer output on the parent call is SKIP-AND-FLAGGED, not stored — the next build retries it (mirrors the tier-0 guard)", async () => {
    const chatId = await seedChat(db, "emptyconsolidate");
    await seedTurns(db, chatId, aria, 4); // 2 complete tier-0 blocks (seq 1-2, 3-4) → 1 complete fanOut-2 group
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 } as const;

    // Pass 1: tier-0 summarizes normally; the CONSOLIDATION call returns only whitespace → the parent digest
    // must NOT be stored (a blank arc digest keyed by the parent hash would skip forever).
    const real = fakeSummarize();
    const store1 = fakeEmbeddingsStore(db);
    const entries: MemoryLogEntry[] = [];
    const counts1 = await generateDigests(
      makeChatContext(db, {
        summarize: asSummarizeOp((inputs) => (inputs.at(0)?.systemPrompt === CONSOLIDATION_SYSTEM_PROMPT ? emptySummarize([...inputs]) : real.fn([...inputs]))),
        embeddingsStore: store1.store,
        log: (e) => entries.push(e),
      }),
      { scope: sharedScope(chatId), config: cfg, funderUserId: owner },
    );
    // Both tier-0 blocks were written; the tier-1 consolidation was skipped-and-flagged, not stored.
    expect(store1.digests.filter((d) => d.key.tier === 0)).toHaveLength(2);
    expect(store1.digests.filter((d) => d.key.tier === 1)).toHaveLength(0);
    expect(counts1.written).toBe(2);
    const build = entries.find((e) => e.event === "memory.build" && e.note === undefined);
    expect(build?.event === "memory.build" && build.trace.blocksSkippedEmpty).toBe(1);

    // Pass 2: a real summarizer for BOTH tiers digests the SAME parent group — the empty pass left NO stored
    // parent hash to skip on, so tier-1 is retried (not silently forgotten).
    const store2 = fakeEmbeddingsStore(db);
    const counts2 = await generateDigests(makeChatContext(db, { summarize: fakeSummarize().op, embeddingsStore: store2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect(store2.digests.filter((d) => d.key.tier === 1)).toHaveLength(1);
    expect(counts2.written).toBe(1); // tier-0 blocks unchanged (same content hash) — only the parent writes
  });

  test("#1395 — a re-digest that comes back EMPTY invalidates the row it proved stale (recall stops serving it)", async () => {
    const chatId = await seedChat(db, "staleinvalidate");
    await seedTurns(db, chatId, aria, 4); // blockSize 2 → tier-0 blocks 0 and 1
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 } as const;
    const pass1 = upsertingStore(db);
    await generateDigests(ctx1(pass1.store), { scope: sharedScope(chatId), config: cfg, funderUserId: owner });
    expect((await loadDigestsForScope(db, chatId, GROUP_CHAR, { tier: 0 })).map((d) => d.blockIdx)).toEqual([0, 1]);

    // EDIT block 0 → its content hash changes, which is the build PROVING the stored digest stale. The
    // re-summarize then fails (whitespace): the block is skipped, and the digest summarized from the
    // PRE-EDIT bytes must not keep serving {{memory}} as if it were current.
    await db
      .update(messageVariants)
      .set({ content: "EDITED — the reveal that changes the scene" })
      .where(eq(messageVariants.id, castId<MessageVariantId>(`variant_${chatId}_1_0`)));

    const pass2 = upsertingStore(db);
    const counts = await generateDigests(makeChatContext(db, { summarize: asSummarizeOp(emptySummarize), embeddingsStore: pass2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect(counts.written).toBe(0);
    const surviving = await loadDigestsForScope(db, chatId, GROUP_CHAR, { tier: 0 });
    // Block 0's known-stale row is GONE; block 1 (never re-queued, still current) is untouched.
    expect(surviving.map((d) => d.blockIdx)).toEqual([1]);

    // …and the block is still RETRYABLE: nothing was keyed under the new hash, so a working summarizer
    // rebuilds it (the skip-and-flag contract survives the invalidation).
    const pass3 = upsertingStore(db);
    await generateDigests(makeChatContext(db, { summarize: fakeSummarize().op, embeddingsStore: pass3.store }), {
      scope: sharedScope(chatId),
      config: cfg,
      funderUserId: owner,
    });
    expect((await loadDigestsForScope(db, chatId, GROUP_CHAR, { tier: 0 })).map((d) => d.blockIdx)).toEqual([0, 1]);
  });

  test("mode 'off' logs the zero-work note (observability)", async () => {
    const chatId = await seedChat(db, "offnote");
    await seedTurns(db, chatId, aria, 4);
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().op,
      embeddingsStore: fakeEmbeddingsStore(db).store,
      log: (e) => entries.push(e),
    });
    await generateDigests(ctx, { scope: sharedScope(chatId), config: { mode: "off" }, funderUserId: owner });
    const build = entries.find((e) => e.event === "memory.build");
    expect(build?.note).toBe("mode off");
  });
});

/** A `ChatContext` with the upserting store wired (the self-heal re-digest path). */
function ctx1(store: EmbeddingsStoreOp): ReturnType<typeof makeChatContext> {
  return makeChatContext(db, { summarize: fakeSummarize().op, embeddingsStore: store });
}
