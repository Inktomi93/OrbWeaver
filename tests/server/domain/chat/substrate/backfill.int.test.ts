// substrate/backfill — the corpus sweeps. Pins the ENUMERATION (the sweep's own job — the per-chat
// build logic is pinned by the memory build suites): segments visit every chat; digest buckets mirror the
// engine's post-turn scopes (`__group__` bucket ONLY for >1-character rooms, then every seated character);
// the group-character sweep mints ONLY for group rooms lacking one (idempotent, host-owned); the signal
// aborts cooperatively (an aborted sweep does zero work).

import type { Db } from "@orb/db";
import { characters, chatDigests, chatSegments, embedGenerations, userConnections } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, EmbedGenerationId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { logger } from "@orb/server/foundation/observability";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import type { ResolveBackfillMemoryConfig } from "../../../../../packages/server/src/domain/chat/contract/memory.ts";
import { backfillGroupCharacters, backfillMemory } from "../../../../../packages/server/src/domain/chat/substrate/backfill.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, makeStoreHarness } from "../../embeddings/_support.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";
import { fakeEmbeddingsStore, fakeSummarize, seedTurns } from "../memory/_support.ts";

/** A memory-config resolver that leaves the host's memory ENABLED (empty partial ⇒ the baked floor, `mixC`),
 *  so the sweep builds exactly as the pre-#54 baked-defaults path did (the enumeration assertions below). */
const enabledMemory: ResolveBackfillMemoryConfig = () => Promise.resolve({});

/** A named error class so the plan-failure log spec can assert the CLASS reached the line (the live #165
 *  cause was a `ProviderError` whose name was invisible in the pretty single-line read). */
class ProviderLikeError extends Error {
  override readonly name = "ProviderLikeError";
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Seed: a solo room (1 char), a group room (2 chars), and an empty room (no characters). Tiny canon (none) —
 *  every memory build early-returns (cutoff < blockSize), so the sweep's ENUMERATION is what's observable. */
async function seedRooms(host: UserId): Promise<{ soloChar: CharacterId; groupChars: number }> {
  const soloChar = await seedCharacter(db, host, "solo_c");
  const g1 = await seedCharacter(db, host, "g1");
  const g2 = await seedCharacter(db, host, "g2");
  const solo = await seedChat(db, "solo");
  const group = await seedChat(db, "group");
  await seedChat(db, "empty");
  await seedParticipant(db, { chatId: solo, key: "s_h", userId: host, role: "host" });
  await seedParticipant(db, { chatId: solo, key: "s_c", characterId: soloChar });
  await seedParticipant(db, { chatId: group, key: "g_h", userId: host, role: "host" });
  await seedParticipant(db, { chatId: group, key: "g_c1", characterId: g1 });
  await seedParticipant(db, { chatId: group, key: "g_c2", characterId: g2 });
  return { soloChar, groupChars: 2 };
}

const HOST_ID = castId<UserId>("user_host");

describe("backfillMemory — the chat × scope enumeration", () => {
  test("a model change re-embeds unchanged memory before the real old-space purge", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_model_change");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 4);

    const harness = makeStoreHarness(db);
    const resolved = await harness.roleClients.resolved("embed");
    if (resolved === null) {
      throw new Error("expected test embed connection");
    }
    await db.insert(userConnections).values({
      id: resolved.connectionId,
      ownerId: host,
      label: "memory backfill embed",
      providerId: resolved.providerId,
      model: resolved.model,
    });
    const embeddings = createEmbeddingsService(harness.ctx);
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().op,
      resolveMemoryEmbedSpace: async (ownerId) => {
        const generation = await embeddings.resolveGeneration(ownerId, "embed");
        if (generation === null) {
          throw new Error("expected test embed generation");
        }
        return { ownerId, model: generation.space, generationId: generation.id, generationEpoch: generation.epoch };
      },
      embeddingsStore: async (params) => {
        const result = await embeddings.store({
          kind: "chat-block",
          lens: "digest",
          ownerId: host,
          chatId: params.key.chatId,
          scopedCharacterId: params.key.scopedCharacterId,
          isGroup: params.isGroup,
          tier: params.key.tier,
          blockIdx: params.key.blockIdx,
          text: params.text,
          topicAnchor: params.topicAnchor,
          keywords: params.keywords,
          speakerCharacterIds: params.speakerCharacterIds,
          contentHash: params.contentHash,
          model: EMBED_MODEL,
          dim: EMBED_DIM,
        });
        if (result.generationId === undefined || result.generationEpoch === undefined) {
          throw new Error("expected generation receipt");
        }
        return { ownerId: host, model: result.model, generationId: result.generationId, generationEpoch: result.generationEpoch };
      },
      embeddingsStoreSegments: async (params) => {
        const results = await embeddings.storeSegments(
          params.map((p) => ({
            kind: "chat-block" as const,
            lens: "segment" as const,
            ownerId: host,
            chatId: p.chatId,
            blockIdx: p.blockIdx,
            chunkIdx: p.chunkIdx,
            seqStart: p.seqStart,
            seqEnd: p.seqEnd,
            text: p.text,
            contentHash: p.contentHash,
            model: EMBED_MODEL,
            dim: EMBED_DIM,
          })),
        );
        return results.map((result) => {
          if (result.generationId === undefined || result.generationEpoch === undefined) {
            throw new Error("expected generation receipt");
          }
          return { ownerId: host, model: result.model, generationId: result.generationId, generationEpoch: result.generationEpoch };
        });
      },
    });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });
    await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    const oldSpace = "retired-embed-space";
    const retiredGenerationId = castId<EmbedGenerationId>("embed_generation_retired_backfill");
    await db.insert(embedGenerations).values({
      id: retiredGenerationId,
      ownerId: host,
      task: "embed",
      via: "embed",
      connectionId: resolved.connectionId,
      connectionRef: resolved.connectionId,
      fingerprint: "retired-backfill-space",
      space: oldSpace,
    });
    await db.update(chatDigests).set({ model: oldSpace, generationId: retiredGenerationId }).where(eq(chatDigests.chatId, room));

    const completed = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);
    const receipt = completed.completedSpaces[0];
    if (receipt === undefined) {
      throw new Error(`expected completed generation receipt: ${JSON.stringify(completed)}`);
    }
    const generation = await embeddings.resolveGeneration(host, "embed");
    if (generation === null) {
      throw new Error("expected generation");
    }
    await embeddings.embedCorpus({ ownerId: host, force: false, signal: new AbortController().signal });
    await embeddings.purgeDocumentVectors({ ownerId: host, generation });
    await embeddings.purgeMemoryVectors({
      ownerId: host,
      generation: { id: receipt.generationId, epoch: receipt.generationEpoch, task: "embed", via: "embed", space: receipt.model },
    });
    expect((await db.select().from(chatSegments)).map((row) => row.model)).toEqual([EMBED_MODEL, EMBED_MODEL]);
    expect((await db.select().from(chatDigests)).map((row) => row.model)).toEqual([EMBED_MODEL, EMBED_MODEL]);
  });

  test("a provider space drift during the segment flood fails the sweep receipt", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_drift");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: async (params) => {
        await store.storeSegments(params);
        return params.map((param) => ({
          ownerId: param.ownerId,
          model: "drifted-space",
          generationId: castId<EmbedGenerationId>("embed_generation_drifted"),
          generationEpoch: 2,
        }));
      },
    });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    expect(counts.failed).toBe(1);
    expect(counts.completedSpaces).toEqual([]);
  });

  test("segments visit every chat; digest buckets mirror the engine's scopes (group bucket only >1 character)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    await seedRooms(host);
    // The shared group bucket is find-or-minted (the REAL synthetic-char id — inv 8), so the sweep resolves
    // it exactly the way the engine's post-turn trigger does (no fabricated `__group__` handle).
    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: "character_group" as CharacterId }),
    });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, enabledMemory);

    // 3 chats swept for segments (solo + group + empty).
    expect(counts.segments).toEqual({ scanned: 3, changed: 0 });
    // Digest buckets: solo → 1 (its seated char; NO group bucket at one character); group → 3 (synthetic group char +
    // 2 seated); empty → 0 (no characters, no buckets). Zero writes (no canon past the window).
    expect(counts.digests).toEqual({ scanned: 4, changed: 0 });
    // A clean sweep reports zero failures — the isolation catch never fired (#41).
    expect(counts.failed).toBe(0);
  });

  test("WITNESSING wiring (D6): a kicked-then-rejoined seated char's SCOPED bucket excludes the kicked block; the GROUP bucket stays full", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const g1 = await seedCharacter(db, host, "g1");
    const g2 = await seedCharacter(db, host, "g2");
    await seedCharacter(db, host, "group"); // id character_group — FK target for the shared-bucket digests
    const group = await seedChat(db, "group");
    await seedParticipant(db, { chatId: group, key: "g_h", userId: host, role: "host" });
    // g1 present seq 1-4, KICKED at seq 5 (leftSeq exclusive), RE-ADDED at seq 7 → present NOW (in the roster).
    // Two participant rows = two witnessing intervals; block 2 (seq 5-6) is the kicked gap → NOT witnessed.
    await seedParticipant(db, { chatId: group, key: "g_c1a", characterId: g1, joinSeq: 1, leftSeq: 5 });
    await seedParticipant(db, { chatId: group, key: "g_c1b", characterId: g1, joinSeq: 7, leftSeq: null });
    await seedParticipant(db, { chatId: group, key: "g_c2", characterId: g2, joinSeq: 1, leftSeq: null });
    await seedTurns(db, group, g2, 8); // blockSize 2 → blocks 0(1-2) 1(3-4) 2(5-6) 3(7-8)

    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: store.storeSegments,
      mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: "character_group" as CharacterId }),
    });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    // The group chat (with its synthetic-char FK target present) builds its shared-bucket digests cleanly —
    // no FK throw, so the isolation catch never fires (#41: the row is a minted precondition, not a hope).
    expect(counts.failed).toBe(0);
    // g1 digested blocks 0,1 (present) + 3 (rejoined) — block 2 (the scene it was kicked out of) is EXCLUDED.
    const g1Blocks = store.digests.filter((d) => d.key.scopedCharacterId === g1 && d.key.tier === 0).map((d) => d.key.blockIdx);
    expect(g1Blocks).toEqual([0, 1, 3]);
    // The shared GROUP bucket has no participant seat → witnessing omitted → the full merged build (all blocks).
    const groupBlocks = store.digests.filter((d) => d.key.scopedCharacterId === "character_group" && d.key.tier === 0).map((d) => d.key.blockIdx);
    expect(groupBlocks).toEqual([0, 1, 2, 3]);
  });

  test("PHASE 4: consolidation is batched ACROSS buckets, tier-by-tier — the corpus cascade equals the per-bucket build", async () => {
    // Two solo rooms, each with 8 turns → blockSize 2 = 4 tier-0 blocks per bucket. fanOut 2, maxTier 2 forces
    // the FULL cascade: tier-0 (4) → tier-1 (2 parents) → tier-2 (1 parent). The old sweep consolidated one
    // bucket at a time (serial); PHASE 4 collects BOTH buckets' tier-k parents and summarizes them in ONE batch.
    const host = await seedUser(db, castId<Handle>("host"));
    const cA = await seedCharacter(db, host, "aria");
    const cB = await seedCharacter(db, host, "borin");
    const roomA = await seedChat(db, "roomA");
    const roomB = await seedChat(db, "roomB");
    await seedParticipant(db, { chatId: roomA, key: "a_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: roomA, key: "a_c", characterId: cA });
    await seedParticipant(db, { chatId: roomB, key: "b_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: roomB, key: "b_c", characterId: cB });
    await seedTurns(db, roomA, cA, 8);
    await seedTurns(db, roomB, cB, 8);

    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 2 });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    expect(counts.failed).toBe(0);
    // Each solo bucket builds the identical cascade the live per-turn path would — corpus REORDER ≠ different result.
    const byTier = (c: CharacterId, tier: number): number[] =>
      store.digests
        .filter((d) => d.key.scopedCharacterId === c && d.key.tier === tier)
        .map((d) => d.key.blockIdx)
        .sort((x, y) => x - y);
    for (const c of [cA, cB]) {
      expect(byTier(c, 0)).toEqual([0, 1, 2, 3]);
      expect(byTier(c, 1)).toEqual([0, 1]);
      expect(byTier(c, 2)).toEqual([0]);
    }
    // The load-bearing PHASE-4 assertion: the tier-1 consolidation summarizes BOTH buckets' parents in ONE call
    // (2 buckets × 2 parents = 4). The OLD per-bucket serial path could only ever batch 2 at a time here — a 4
    // proves the cross-bucket corpus batch. (Tier-0 also batches to 8; tier-2 to 2.)
    expect(sum.batchSizes).toContain(4);
  });

  test("MINT-ON-DEMAND (#41): a group chat with NO pre-existing synthetic-char row builds its shared bucket — the sweep mints the FK target inline, so the digest write never dangles", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const g1 = await seedCharacter(db, host, "g1");
    const g2 = await seedCharacter(db, host, "g2");
    const group = await seedChat(db, "group");
    await seedParticipant(db, { chatId: group, key: "g_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: group, key: "g_c1", characterId: g1, joinSeq: 1, leftSeq: null });
    await seedParticipant(db, { chatId: group, key: "g_c2", characterId: g2, joinSeq: 1, leftSeq: null });
    await seedTurns(db, group, g2, 4); // blockSize 2 → blocks 0(1-2) 1(3-4)

    // The mint fake MIRRORS PRODUCTION: it PERSISTS the synthetic `characters` row before returning its id
    // (real `mintSyntheticGroupCharacter` → `insertCharacter`), so the shared-bucket digest's FK to
    // `characters.id` resolves. No row was pre-seeded — the sweep's `resolveGroupBucketCharacterId` mints it.
    const groupCharId = castId<CharacterId>("character_synthetic_group");
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, {
      summarize: fakeSummarize().op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: store.storeSegments,
      mintSyntheticGroupCharacter: async ({ ownerId }) => {
        await db
          .insert(characters)
          .values({
            id: groupCharId,
            handle: castId<CharacterHandle>(`__group__${group}`),
            ownerId,
            name: "group",
            synthetic: true,
            contentHash: "hash_group",
            createdAt: 0,
          })
          .onConflictDoNothing();
        return { characterId: groupCharId };
      },
    });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    // No FK throw → no isolation skip: the group chat built cleanly.
    expect(counts.failed).toBe(0);
    // The shared group bucket (keyed by the minted synthetic-char id) built both blocks — the write the bug
    // report said silently vanished now lands.
    const groupBlocks = store.digests.filter((d) => d.key.scopedCharacterId === groupCharId && d.key.tier === 0).map((d) => d.key.blockIdx);
    expect(groupBlocks).toEqual([0, 1]);
  });

  test("PER-CHAT ISOLATION is NOT a silent skip: a poisoned chat is COUNTED in `failed`, the rest still process (#41)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    // Two group rooms; the FIRST poisons its group-bucket resolve (a mint failure). Without isolation its
    // throw would abort the WHOLE corpus sweep before the healthy room is ever reached.
    const p1 = await seedCharacter(db, host, "p1");
    const p2 = await seedCharacter(db, host, "p2");
    const h1 = await seedCharacter(db, host, "h1");
    const h2 = await seedCharacter(db, host, "h2");
    const poisoned = await seedChat(db, "poisoned");
    const healthy = await seedChat(db, "healthy");
    await seedParticipant(db, { chatId: poisoned, key: "p_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: poisoned, key: "p_c1", characterId: p1 });
    await seedParticipant(db, { chatId: poisoned, key: "p_c2", characterId: p2 });
    await seedParticipant(db, { chatId: healthy, key: "h_h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: healthy, key: "h_c1", characterId: h1 });
    await seedParticipant(db, { chatId: healthy, key: "h_c2", characterId: h2 });

    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: ({ chatId }) =>
        chatId === poisoned ? Promise.reject(new Error("boom: poisoned chat")) : Promise.resolve({ characterId: "character_group" as CharacterId }),
    });

    // The call RESOLVES (the poisoned chat's throw was isolated, not propagated) …
    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, enabledMemory);

    // … both chats were swept for segments; only the HEALTHY room's digest buckets enumerated (synthetic +
    // 2 seated = 3) — the poisoned room contributed zero digest scans but did NOT abort the healthy one.
    expect(counts.segments.scanned).toBe(2);
    expect(counts.digests.scanned).toBe(3);
    // …and the poisoned room is NOT swallowed silently (#41): its failure is COUNTED (surfaced to the
    // workload result + logged at `error` level), never a chat vanishing its memory without a trace.
    expect(counts.failed).toBe(1);
  });

  test("an already-aborted signal does zero work (cooperative abort)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    await seedRooms(host);
    const ctx = makeChatContext(db);
    const ac = new AbortController();
    ac.abort();

    const counts = await backfillMemory(ctx, { signal: ac.signal, funderUserId: HOST_ID }, enabledMemory);
    expect(counts).toEqual({
      segments: { scanned: 0, changed: 0 },
      segmentsSkippedOverWindow: 0,
      digests: { scanned: 0, changed: 0 },
      failed: 0,
      completedSpaces: [],
    });
  });

  test("a chat with no aged memory work does not resolve an embed binding", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const room = await seedChat(db, "empty_memory");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    const resolveMemoryEmbedSpace = vi.fn(() => Promise.reject(new Error("must not resolve")));
    const ctx = makeChatContext(db, { resolveMemoryEmbedSpace });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, enabledMemory);

    expect(counts.failed).toBe(0);
    expect(counts.completedSpaces).toEqual([]);
    expect(resolveMemoryEmbedSpace).not.toHaveBeenCalled();
  });

  test("a memory-disabled chat does not resolve an embed binding", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const room = await seedChat(db, "disabled_memory");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    const resolveMemoryEmbedSpace = vi.fn(() => Promise.reject(new Error("must not resolve")));
    const ctx = makeChatContext(db, { resolveMemoryEmbedSpace });
    const disabled: ResolveBackfillMemoryConfig = () => Promise.resolve({ mode: "off" });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, disabled);

    expect(counts.failed).toBe(0);
    expect(resolveMemoryEmbedSpace).not.toHaveBeenCalled();
  });

  test("a memory-DISABLED host's chat is SKIPPED (D36 opt-out) while an enabled host's chat still builds", async () => {
    // Two hosts, each hosting one group room. The resolver reports host_off as `mode:"off"` (memory disabled)
    // and host_on as enabled — the SAME opt-out the live turn path honors, now honored on the corpus sweep (#54).
    const hostOff = await seedUser(db, castId<Handle>("host_off"));
    const hostOn = await seedUser(db, castId<Handle>("host_on"));
    const oc1 = await seedCharacter(db, hostOff, "oc1");
    const oc2 = await seedCharacter(db, hostOff, "oc2");
    const nc1 = await seedCharacter(db, hostOn, "nc1");
    const nc2 = await seedCharacter(db, hostOn, "nc2");
    const roomOff = await seedChat(db, "room_off");
    const roomOn = await seedChat(db, "room_on");
    await seedParticipant(db, { chatId: roomOff, key: "off_h", userId: hostOff, role: "host" });
    await seedParticipant(db, { chatId: roomOff, key: "off_c1", characterId: oc1 });
    await seedParticipant(db, { chatId: roomOff, key: "off_c2", characterId: oc2 });
    await seedParticipant(db, { chatId: roomOn, key: "on_h", userId: hostOn, role: "host" });
    await seedParticipant(db, { chatId: roomOn, key: "on_c1", characterId: nc1 });
    await seedParticipant(db, { chatId: roomOn, key: "on_c2", characterId: nc2 });

    // The synthetic-group mint stands in for ALL per-scope work — a mint call proves the sweep reached the
    // disabled room's scope enumeration. It must fire ONLY for the enabled room.
    const mint = vi.fn(async (_args: { ownerId: UserId; chatId: ChatId }) => ({
      characterId: "character_group" as CharacterId,
    }));
    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: mint as never });
    const resolve: ResolveBackfillMemoryConfig = (hostUserId) => Promise.resolve(hostUserId === hostOff ? { mode: "off" } : {});

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, resolve);

    // The disabled host's room is skipped ENTIRELY — no segment scan, no scope enumeration, no synthetic mint.
    // Only the enabled room builds: 1 segment scan + its 3 digest buckets (synthetic group + 2 seated).
    expect(counts.segments).toEqual({ scanned: 1, changed: 0 });
    expect(counts.digests).toEqual({ scanned: 3, changed: 0 });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0]?.[0]).toMatchObject({ ownerId: hostOn, chatId: roomOn });
  });

  test("a resolver failure on one chat → warn + continue (the per-chat isolation belt covers the resolver)", async () => {
    // Two hosts, one group room each; the resolver THROWS for host_bad's settings read. Without the isolation
    // belt wrapping the resolver call, that throw would abort the whole sweep before host_good's room builds.
    const hostBad = await seedUser(db, castId<Handle>("host_bad"));
    const hostGood = await seedUser(db, castId<Handle>("host_good"));
    const bc1 = await seedCharacter(db, hostBad, "bc1");
    const bc2 = await seedCharacter(db, hostBad, "bc2");
    const gc1 = await seedCharacter(db, hostGood, "gc1");
    const gc2 = await seedCharacter(db, hostGood, "gc2");
    const roomBad = await seedChat(db, "room_bad");
    const roomGood = await seedChat(db, "room_good");
    await seedParticipant(db, { chatId: roomBad, key: "bad_h", userId: hostBad, role: "host" });
    await seedParticipant(db, { chatId: roomBad, key: "bad_c1", characterId: bc1 });
    await seedParticipant(db, { chatId: roomBad, key: "bad_c2", characterId: bc2 });
    await seedParticipant(db, { chatId: roomGood, key: "good_h", userId: hostGood, role: "host" });
    await seedParticipant(db, { chatId: roomGood, key: "good_c1", characterId: gc1 });
    await seedParticipant(db, { chatId: roomGood, key: "good_c2", characterId: gc2 });

    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: "character_group" as CharacterId }),
    });
    const resolve: ResolveBackfillMemoryConfig = (hostUserId) => (hostUserId === hostBad ? Promise.reject(new Error("settings boom")) : Promise.resolve({}));

    // Resolves (the resolver throw was isolated), and the healthy room still built its buckets.
    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, resolve);

    expect(counts.segments.scanned).toBe(1);
    expect(counts.digests.scanned).toBe(3);
  });

  // #165 END-TO-END, now under the ruled arm built in #172: the chat shape that burned a 120s embed timeout —
  // a room whose aged-out block is one huge pasted dump. Nothing is skipped and nothing is truncated: the
  // oversized block CHUNKS, and every message body survives ("if we are skimping out on messages that's a no
  // go since this feeds the memory system").
  test("a chat with an over-window block: the huge block CHUNKS and the whole room builds (#172)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_huge");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 3);
    // seq 4: the 200k-char message class the live corpus's worst block was made of (a code-dump chat).
    await seedMessage(db, room, 4, { characterId: aria, content: "she watched the harbour lights blur into the rain. ".repeat(4000) });

    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, maxTier: 1 });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    expect(counts.failed).toBe(0);
    expect(counts.segmentsSkippedOverWindow).toBe(0); // nothing was too big to chunk
    // Block 0 (turns 1-2) is one chunk; block 1 (turn 3 + the dump) is several — and the dump is IN them.
    const block1 = store.segments.filter((s) => s.blockIdx === 1);
    expect(block1.length).toBeGreaterThan(1);
    expect(counts.segments.changed).toBe(1 + block1.length);
    expect(block1.some((s) => s.text.includes("harbour lights"))).toBe(true);
    // The chat still builds everything it CAN: its digest buckets are unaffected.
    expect(counts.digests.changed).toBeGreaterThan(0);
  });

  // THE SEGMENT FLOOD (#172, owner batching ruling: "batch by phase … toss it all at vLLM, its scheduler can
  // handle it"). Every chat's pending chunks reach the write path in ONE call — the per-chat interleaved
  // embed the sweep used to do is exactly what starved the engine's continuous batcher.
  test("the segment phase submits the WHOLE corpus's chunks as ONE batch, not one per chat", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    for (const name of ["room_a", "room_b", "room_c"]) {
      const room = await seedChat(db, name);
      await seedParticipant(db, { chatId: room, key: `${name}_h`, userId: host, role: "host" });
      await seedParticipant(db, { chatId: room, key: `${name}_c`, characterId: aria });
      await seedTurns(db, room, aria, 4);
    }

    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { summarize: sum.op, embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, maxTier: 1 });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    expect(counts.segments.scanned).toBe(3);
    // 3 chats × 2 blocks = 6 chunks, submitted ONCE — a per-chat loop would read [2, 2, 2].
    expect(store.segmentBatchSizes).toEqual([6]);
    expect(counts.failed).toBe(0);
    expect(counts.segments.changed).toBe(6);
    // …and length-sorted, so similar-length sequences pack into the engine's batch with less padding waste.
    expect(store.segments.map((s) => s.text.length)).toEqual([...store.segments.map((s) => s.text.length)].sort((a, b) => a - b));
  });

  // The flood is ONE call for the whole corpus, so a poisoned chunk would take the entire sweep down with it
  // unless the phase is isolated like every other one (#41). It is: counted as a failure, logged with the
  // cause as scalars (#165), and the DIGEST half still builds — the self-heal re-offers every chunk next pass.
  test("a FAILING segment flood is isolated: counted, logged, and the digest phases still build", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_poison");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 4);

    const sum = fakeSummarize();
    const store = fakeEmbeddingsStore(db);
    const spy = vi.spyOn(logger, "error");
    const ctx = makeChatContext(db, {
      summarize: sum.op,
      embeddingsStore: store.store,
      embeddingsStoreSegments: () => Promise.reject(new Error("engine down")),
    });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, maxTier: 1 });

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, cfg);

    expect(counts.failed).toBe(1);
    expect(counts.segments.changed).toBe(0);
    expect(counts.digests.changed).toBeGreaterThan(0); // the digest half is untouched by the segment failure
    expect(spy.mock.calls.some((c) => (c[0] as { phase?: string } | undefined)?.phase === "segments")).toBe(true);
  });

  // A cancel (shutdown, or the owner stopping the run) cuts off whatever the sweep is waiting on. That is the run
  // ending, not a fault: the abort propagates for the workload runner to record the run cancelled, and nothing
  // logs an operator ERROR. The content-hash self-heal re-offers the work on the next run.
  describe("a cancel mid-phase is not an operator error", () => {
    async function seedOneRoom(): Promise<void> {
      const host = await seedUser(db, castId<Handle>("host"));
      const aria = await seedCharacter(db, host, "aria");
      const room = await seedChat(db, "room_cancel");
      await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
      await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
      await seedTurns(db, room, aria, 4);
    }
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, maxTier: 1 });

    /** Cancel the run from inside the wait, then reject the way a cut-off wait does: with the signal's reason. */
    function cutOff(controller: AbortController, signal: AbortSignal | undefined): Promise<never> {
      if (signal === undefined) {
        return Promise.reject(new Error("the sweep's signal did not reach the store"));
      }
      controller.abort(new Error("shutdown"));
      return Promise.reject(signal.reason);
    }

    test("the segment flood", async () => {
      await seedOneRoom();
      const controller = new AbortController();
      const store = fakeEmbeddingsStore(db);
      const spy = vi.spyOn(logger, "error");
      const ctx = makeChatContext(db, {
        summarize: fakeSummarize().op,
        embeddingsStore: store.store,
        embeddingsStoreSegments: (_batch, signal) => cutOff(controller, signal),
      });

      await expect(backfillMemory(ctx, { signal: controller.signal, funderUserId: HOST_ID }, cfg)).rejects.toThrow("shutdown");

      expect(spy).not.toHaveBeenCalled();
    });

    test("a tier-0 digest store", async () => {
      await seedOneRoom();
      const controller = new AbortController();
      const store = fakeEmbeddingsStore(db);
      const spy = vi.spyOn(logger, "error");
      const ctx = makeChatContext(db, {
        summarize: fakeSummarize().op,
        embeddingsStore: (params) => cutOff(controller, params.signal),
        embeddingsStoreSegments: store.storeSegments,
      });

      await expect(backfillMemory(ctx, { signal: controller.signal, funderUserId: HOST_ID }, cfg)).rejects.toThrow("shutdown");

      expect(spy).not.toHaveBeenCalled();
    });

    test("the plan phase", async () => {
      const host = await seedUser(db, castId<Handle>("host"));
      await seedRooms(host);
      const controller = new AbortController();
      const spy = vi.spyOn(logger, "error");
      const ctx = makeChatContext(db, {
        mintSyntheticGroupCharacter: () => cutOff(controller, controller.signal),
      });

      await expect(backfillMemory(ctx, { signal: controller.signal, funderUserId: HOST_ID }, enabledMemory)).rejects.toThrow("shutdown");

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // #165: the live 895-chat run logged `chat FAILED during plan and was skipped (unexpected error)` and the
  // ops read of the pretty single-line stream never reached the serialized `err` block, so the failure was
  // undiagnosable from the log at a glance for two whole runs. The CAUSE now rides as scalar fields on the
  // line itself — phase + error name + message — next to the (still-serialized) `err`.
  test("the plan-failure log carries the CAUSE on the line: phase + error name + message (#165)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const c1 = await seedCharacter(db, host, "c1");
    const c2 = await seedCharacter(db, host, "c2");
    const room = await seedChat(db, "room");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c1", characterId: c1 });
    await seedParticipant(db, { chatId: room, key: "c2", characterId: c2 });
    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: () => Promise.reject(new ProviderLikeError("vllm embed request exceeded the 120000ms bound")),
    });
    const spy = vi.spyOn(logger, "error");

    const counts = await backfillMemory(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID }, enabledMemory);

    expect(counts.failed).toBe(1);
    const fields = spy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(fields).toMatchObject({
      chatId: room,
      phase: "plan",
      errName: "ProviderLikeError",
      errMessage: "vllm embed request exceeded the 120000ms bound",
    });
    // The serialized error object still rides (the stack is the deep receipt) — the scalars are additive.
    expect(fields["err"]).toBeInstanceOf(Error);
  });
});

describe("backfillGroupCharacters — mint only for group rooms lacking one", () => {
  test("a >1-character room without a group character mints ONE under the host; solo/empty skipped", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    await seedRooms(host);
    const mint = vi.fn(async (_args: { ownerId: UserId; chatId: ChatId }) => ({
      characterId: "character_group" as CharacterId,
    }));
    const ctx = makeChatContext(db, {
      findSyntheticGroupCharacter: () => Promise.resolve(null),
      mintSyntheticGroupCharacter: mint as never,
    });

    const counts = await backfillGroupCharacters(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID });

    expect(counts).toEqual({ scanned: 1, changed: 1 });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0]?.[0]).toMatchObject({ ownerId: host });
  });

  test("an existing group character short-circuits (scanned, not changed) — idempotent", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    await seedRooms(host);
    const mint = vi.fn();
    const ctx = makeChatContext(db, {
      findSyntheticGroupCharacter: () => Promise.resolve({ characterId: "character_group" as CharacterId }),
      mintSyntheticGroupCharacter: mint as never,
    });

    const counts = await backfillGroupCharacters(ctx, { signal: new AbortController().signal, funderUserId: HOST_ID });

    expect(counts).toEqual({ scanned: 1, changed: 0 });
    expect(mint).not.toHaveBeenCalled();
  });
});
