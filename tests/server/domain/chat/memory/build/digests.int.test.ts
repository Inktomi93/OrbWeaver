import type { SummarizeResult } from "@orb/contracts/providers";
import type { Db } from "@orb/db";
import { chatDigestSpeakers, chatDigests, messages, messageVariants } from "@orb/db";
import type { CharacterId, ChatDigestId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { EmbeddingsStoreOp, StoreDigestParams } from "../../../../../../packages/server/src/domain/chat/contract/context";
import { generateDigests } from "../../../../../../packages/server/src/domain/chat/memory/build/digests";
import { CONSOLIDATION_SYSTEM_PROMPT } from "../../../../../../packages/server/src/domain/chat/memory/build/substrate/prompts";
import { blockHash } from "../../../../../../packages/server/src/domain/chat/memory/build/substrate/transcript";
import { loadWitnessHorizons } from "../../../../../../packages/server/src/domain/chat/memory/persistence/queries";
import type { MemoryLogEntry, MsgRow } from "../../../../../../packages/server/src/domain/chat/memory/types";
import { freshDb } from "../../../../../support/db";
import { expect, test } from "../../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedPersona, seedUser } from "../../_support";
import { fakeEmbeddingsStore, fakeSummarize, GROUP_CHAR, MODEL, seedDigest, seedTurns, sharedScope } from "../_support";

/** A summarizer that returns only whitespace — the empty-output degrade the F7 skip-and-flag guards against. */
const emptySummarize = (): Promise<SummarizeResult> =>
  Promise.resolve({
    items: [{ text: "  \n ", usage: { tokensIn: 1, tokensOut: 0, costUsd: null } }],
    model: MODEL,
  });

const ENTITIES_ANCHOR_RE = /^\[entities/u;
const aria = castId<CharacterId>("character_aria");
const bram = castId<CharacterId>("character_bram");

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  const owner = await seedUser(db, "owner");
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
    if (params.lens !== "digest") {
      return; // these tests build digests only
    }
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
    });
  };
  return { store, digests };
}

describe("memory/build/digests", () => {
  test("digests each complete aged-out block via the summarizer + stores the facets through embeddings.store", async () => {
    const chatId = await seedChat(db, "a");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });

    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 },
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

  test("verbatimWindow protects the tip — only aged-out blocks digest", async () => {
    const chatId = await seedChat(db, "b");
    await seedTurns(db, chatId, aria, 4); // maxSeq 4
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });

    // cutoff = 4 − 2 = 2 → only seq 1-2 (block 0) is aged out; seq 3-4 stays in the protected tip.
    await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 2, fanOut: 2, maxTier: 1 },
    });
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([0]);
  });

  test("self-heal: a second pass over unchanged canon skips everything (no summarizer spend)", async () => {
    const chatId = await seedChat(db, "c");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });
    const cfg = { blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 } as const;

    await generateDigests(ctx, { scope: sharedScope(chatId), config: cfg });
    const callsAfterFirst = sum.calls.length;
    const counts = await generateDigests(ctx, { scope: sharedScope(chatId), config: cfg });

    expect(counts.written).toBe(0);
    expect(counts.skipped).toBe(3); // 2 tier-0 + 1 tier-1, all unchanged
    expect(sum.calls).toHaveLength(callsAfterFirst); // the side-LLM is never re-spent
  });

  test("mode 'off' is a no-op (D36 global disable)", async () => {
    const chatId = await seedChat(db, "d");
    await seedTurns(db, chatId, aria, 4);
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { mode: "off" },
    });
    expect(counts).toEqual({ written: 0, skipped: 0 });
    expect(sum.calls).toHaveLength(0);
  });

  test("scoped build + witnessing (§4 / inv 12): only blocks the character was present for are digested", async () => {
    const chatId = await seedChat(db, "w");
    await seedTurns(db, chatId, aria, 6); // blockSize 2 → blocks 0 (seq 1-2), 1 (seq 3-4), 2 (seq 5-6)
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });

    // aria joined at seq 3 → block 0 (seq 1-2) is pre-join → NOT witnessed → no digest in aria's bucket.
    await generateDigests(ctx, {
      scope: { chatId, scopedCharacterId: aria, isGroup: true },
      witnessing: [{ joinSeq: 3, leftSeq: null }],
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
    });
    expect(store.digests.filter((d) => d.key.tier === 0).map((d) => d.key.blockIdx)).toEqual([1, 2]);
  });

  test("WIRING (D6): a kicked-then-rejoined character digests neither pre-join NOR kicked history — horizons SOURCED from chat_participants", async () => {
    const chatId = await seedChat(db, "kickrejoin");
    await seedTurns(db, chatId, aria, 8); // blockSize 2 → blocks 0(1-2) 1(3-4) 2(5-6) 3(7-8)
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });

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
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });

    await generateDigests(ctx, {
      scope: sharedScope(chatId), // GROUP_CHAR bucket, witnessing omitted
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
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
      summarize: sum.fn,
      embeddingsStore: store.store,
      summarizerContextTokens: 64, // far too small — even one message overflows
    });

    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
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
      summarize: fakeSummarize().fn,
      embeddingsStore: fakeEmbeddingsStore(db).store,
      log: (e) => entries.push(e),
    });
    await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 8, fanOut: 4, maxTier: 1 },
    });
    const build = entries.find((e) => e.event === "memory.build");
    expect(build?.note).toBe("no aged-out block");
    expect(build?.event === "memory.build" && build.trace.blocksBuilt).toBe(0);
  });
});

describe("memory/build/digests — adversarial (self-heal re-digest, tiering, token-guard, trigger discipline)", () => {
  test("a fresh chat does ZERO work: the summarize + embed fakes are NEVER touched (inv 10)", async () => {
    const chatId = await seedChat(db, "fresh");
    await seedTurns(db, chatId, aria, 2); // all inside the verbatim window → nothing aged out
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 8, fanOut: 4, maxTier: 1 },
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
    await generateDigests(ctx1(pass1.store), { scope: sharedScope(chatId), config: cfg });
    expect(pass1.digests.filter((d) => d.key.tier === 0)).toHaveLength(4);
    expect(pass1.digests.filter((d) => d.key.tier === 1)).toHaveLength(1);

    // edit a message in aged-out block 0 → its content hash changes (and so does the tier-1's child-hash fold).
    await db
      .update(messageVariants)
      .set({ content: "EDITED — a load-bearing reveal" })
      .where(eq(messageVariants.id, castId<MessageVariantId>(`variant_${chatId}_1_0`)));

    const sum2 = fakeSummarize();
    const pass2 = upsertingStore(db);
    const ctx = makeChatContext(db, { summarize: sum2.fn, embeddingsStore: pass2.store });
    const counts = await generateDigests(ctx, { scope: sharedScope(chatId), config: cfg });

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
    const human = await seedUser(db, "human");
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
    await generateDigests(ctx1(pass1.store), { scope: sharedScope(chatId), config: cfg });
    expect(pass1.digests.map((d) => d.key.blockIdx)).toEqual([0]);

    // Reattribute the block's persona Mara → Vex (same author, same content) — the `{{user}}` subject changed.
    // Pre-fix the block hash omitted personaId, so this was a SILENT no-op on memory (the digest never refreshed).
    await db.update(messages).set({ personaId: vex }).where(eq(messages.chatId, chatId));

    const sum2 = fakeSummarize();
    const pass2 = upsertingStore(db);
    const counts = await generateDigests(makeChatContext(db, { summarize: sum2.fn, embeddingsStore: pass2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
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
    await generateDigests(ctx1(pass1.store), { scope: sharedScope(chatId), config: cfg });
    expect(pass1.digests.map((d) => d.key.blockIdx)).toEqual([0]);

    // Re-voice the block from Aria → Bram (a genuine `{{char}}` re-attribution) — the characterId fold busts it.
    await db.update(messages).set({ characterId: bram }).where(eq(messages.chatId, chatId));

    const sum2 = fakeSummarize();
    const pass2 = upsertingStore(db);
    const counts = await generateDigests(makeChatContext(db, { summarize: sum2.fn, embeddingsStore: pass2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
    });
    expect(pass2.digests.map((d) => d.key.blockIdx)).toEqual([0]);
    expect(counts.written).toBe(1);
  });

  test("G1: the digest transcript resolves {{user}}→the persona name in the summarizer input (not the raw macro)", async () => {
    const chatId = await seedChat(db, "digestbody");
    const human = await seedUser(db, "human2");
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
    await generateDigests(makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store }), {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
      macroNames,
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
    await generateDigests(makeChatContext(db, { summarize: fakeSummarize().fn, embeddingsStore: store1.store }), {
      scope: sharedScope(chatId),
      config: cfg,
    });
    expect(store1.digests.map((d) => d.key.blockIdx)).toEqual([0]);

    // edit seq 4 — a TIP message (seq > cutoff, in the protected window) → must NOT touch the settled block-0 digest.
    await db
      .update(messageVariants)
      .set({ content: "EDITED TIP" })
      .where(eq(messageVariants.id, castId<MessageVariantId>(`variant_${chatId}_4_0`)));

    const sum2 = fakeSummarize();
    const store2 = fakeEmbeddingsStore(db);
    const counts = await generateDigests(makeChatContext(db, { summarize: sum2.fn, embeddingsStore: store2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
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
        characterId: aria,
        authorUserId: null,
        personaId: null,
        content: "turn 1",
      },
      {
        seq: 2,
        role: "assistant",
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
    const counts = await generateDigests(makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store }), {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
    });
    expect(store.digests.map((d) => d.key.blockIdx)).toEqual([1]); // only the divergent block (re)built
    expect(sum.calls).toHaveLength(1); // block 0's identical-hash digest skipped the LLM
    expect(counts.skipped).toBeGreaterThanOrEqual(1);
  });

  test("tier consolidation: an INCOMPLETE fanOut group is NOT consolidated (deferred until it fills)", async () => {
    const chatId = await seedChat(db, "incomplete");
    await seedTurns(db, chatId, aria, 6); // blockSize 2 → 3 tier-0 blocks; fanOut 4 needs 4 → no tier-1 yet
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    await generateDigests(makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store }), {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 2 },
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
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed.
      await seedMessage(db, chatId, i + 1, { characterId, content: `t${i + 1}` });
    }
    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    await generateDigests(makeChatContext(db, { summarize: sum.fn, embeddingsStore: store.store }), {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 2 },
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
      summarize: sum.fn,
      embeddingsStore: store.store,
      summarizerContextTokens: 6000, // above the floor, but the giant oldest message overflows it
      log: (e) => entries.push(e),
    });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
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
      summarize: sum.fn,
      embeddingsStore: store.store,
      summarizerContextTokens: 3000, // below the floor (4096) but the tiny block still fits the budget
      log: (e) => entries.push(e),
    });
    const counts = await generateDigests(ctx, {
      scope: sharedScope(chatId),
      config: { blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 },
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
        summarize: fakeSummarize().fn,
        embeddingsStore: wide.store,
        summarizerContextTokens: 200_000,
      }),
      { scope: sharedScope(chatId), config: cfg },
    );
    const chatId2 = await seedChat(db, "noresize2");
    await seedTurns(db, chatId2, aria, 4);
    const tight = fakeEmbeddingsStore(db);
    await generateDigests(
      makeChatContext(db, {
        summarize: fakeSummarize().fn,
        embeddingsStore: tight.store,
        summarizerContextTokens: 6000,
      }),
      { scope: sharedScope(chatId2), config: cfg },
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
        summarize: emptySummarize,
        embeddingsStore: store1.store,
        log: (e) => entries.push(e),
      }),
      { scope: sharedScope(chatId), config: cfg },
    );
    expect(store1.digests).toHaveLength(0); // nothing stored — no blank-text poison
    expect(counts1.written).toBe(0);
    const build = entries.find((e) => e.event === "memory.build" && e.note === undefined);
    expect(build?.event === "memory.build" && build.trace.blocksSkippedEmpty).toBe(1);

    // Pass 2: a real summarizer digests the SAME block — the empty pass left NO stored hash to skip on, so the
    // block is retried (not silently forgotten). This is the whole point of skip-and-flag over store-empty.
    const store2 = fakeEmbeddingsStore(db);
    const counts2 = await generateDigests(makeChatContext(db, { summarize: fakeSummarize().fn, embeddingsStore: store2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
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
        summarize: (inputs) => (inputs.at(0)?.systemPrompt === CONSOLIDATION_SYSTEM_PROMPT ? emptySummarize() : real.fn(inputs)),
        embeddingsStore: store1.store,
        log: (e) => entries.push(e),
      }),
      { scope: sharedScope(chatId), config: cfg },
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
    const counts2 = await generateDigests(makeChatContext(db, { summarize: fakeSummarize().fn, embeddingsStore: store2.store }), {
      scope: sharedScope(chatId),
      config: cfg,
    });
    expect(store2.digests.filter((d) => d.key.tier === 1)).toHaveLength(1);
    expect(counts2.written).toBe(1); // tier-0 blocks unchanged (same content hash) — only the parent writes
  });

  test("mode 'off' logs the zero-work note (observability)", async () => {
    const chatId = await seedChat(db, "offnote");
    await seedTurns(db, chatId, aria, 4);
    const entries: MemoryLogEntry[] = [];
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().fn,
      embeddingsStore: fakeEmbeddingsStore(db).store,
      log: (e) => entries.push(e),
    });
    await generateDigests(ctx, { scope: sharedScope(chatId), config: { mode: "off" } });
    const build = entries.find((e) => e.event === "memory.build");
    expect(build?.note).toBe("mode off");
  });
});

/** A `ChatContext` with the upserting store wired (the self-heal re-digest path). */
function ctx1(store: EmbeddingsStoreOp): ReturnType<typeof makeChatContext> {
  return makeChatContext(db, { summarize: fakeSummarize().fn, embeddingsStore: store });
}
