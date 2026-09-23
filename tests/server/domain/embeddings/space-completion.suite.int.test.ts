// THE COMPLETION LEDGER vs THE VECTOR TABLES (#2517) — a SUITE, because the defect lives BETWEEN four
// domains that may not import each other: chat's and databank's sweep contributions decide WHEN a scope is
// claimed, `domain/embeddings/persistence/space-state.ts` owns the write, and `domain/search`'s
// `readGeneration` is the only reader. There is no single source module to mirror, which is why this is
// `.suite.int.test.ts` and not the `.int.test.ts` the issue's DoD named (the `test-layout` gate refuses a
// module-mirrored test with no `packages/server/src/domain/embeddings/space-completion.ts` behind it).
// `embed_space_state` is not the vectors — it is the
// separate per-`(owner, scope)` ledger recording that a SWEEP re-derived that scope into the owner's target
// generation, and `domain/search/persistence/active-space.ts readGeneration` reads ONLY it. So an owner whose
// `chat_segments` / `chat_digests` / `document_chunks` are perfectly current still reads `moving` forever if
// no sweep ever wrote their ledger row — which is exactly what the owner observed.
//
// WHY: of the three scopes `VECTOR_SCOPES_BY_TASK.embed` folds, only `cards` had a per-owner completion
// route (`embed-corpus.ts completeCardSweep`, whose header already states the per-owner arm is safe
// because "a bulk pass covers every owner, a singular pass exactly one, and neither can reach a neighbour's
// live space"). `memory` and `documents` recorded completion ONLY from the all-owners BULK arm, because in
// both contributions the COMPLETION call and the cross-owner FAN-OUT were welded into one `ownerId === null`
// conditional. That is an argument about the fan-out, not about the completion: separating them is
// the fix, and the fan-out fence now lives where it belongs — in the injected op's enumeration.
//
// THE PRINCIPAL EVERY RECEIPT BELOW IS TAKEN AS is the seeded owner of the connection, the card, the chat
// (as its `host` participant — the row chat-memory vectors are scoped by) and the document. A per-owner
// empty read is ambiguous between "nothing there" and "asked as the wrong principal", so the cross-owner
// pin asserts a NON-empty state for the swept owner in the same breath as the empty one for their neighbour.

import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { WorkloadRunContext } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { chatDigests, chatSegments, embedGenerations, embedSpaceState } from "@orb/db";
import type { CharacterId, ChatDigestId, ChatId, ChatSegmentId, EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import type { ChatWorkloadDeps } from "../../../../packages/server/src/domain/chat/contract/workloads.ts";
import { createChatWorkloadContributions } from "../../../../packages/server/src/domain/chat/workload-contributions.ts";
import type { DatabankWorkloadDeps } from "../../../../packages/server/src/domain/databank/contract/service.ts";
import { createDatabankWorkloadContributions } from "../../../../packages/server/src/domain/databank/workload-contributions.ts";
import type { EmbeddingsService, PinnedGeneration } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { upsertChatDigest, upsertChatSegment } from "../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { resolveTargetGeneration } from "../../../../packages/server/src/domain/embeddings/substrate/generation.ts";
import { readGeneration } from "../../../../packages/server/src/domain/search/persistence/active-space.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { StoreHarness } from "./_support.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, makeStoreHarness, seedCharacter, seedChat, seedDocument, seedUser } from "./_support.ts";

const NOW = 1_750_000_000_000;
const CARD_TEXT = "a seeded card, embedded through the per-owner catch-up";
const STALE_MODEL = "old-embed-model-v0";
const NO_OP_REINDEX = { documents: 0, chunksUpserted: 0, chunksNoop: 0, chunksPruned: 0, reExtracted: 0, failed: [] } as const;

function runContext(ownerId: UserId | null, actor: UserId): WorkloadRunContext {
  return { userId: actor, ownerId, now: () => NOW };
}

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/** The owner's pinned `embed` target — the generation every scope below must record against. */
async function targetOf(harness: StoreHarness, ownerId: UserId): Promise<PinnedGeneration> {
  const generation = await resolveTargetGeneration(harness.ctx, ownerId, "embed");
  if (generation === null) {
    throw new Error("the fixture owner must resolve an embed generation");
  }
  return generation;
}

/**
 * The chat deps compose wires (`entry/compose/services.ts`): `backfillMemory` is the sweep, and
 * `purgeMemoryVectors` is the INJECTED cross-domain op whose body enumerates the ENUMERATION SCOPE —
 * every corpus owner on the bulk arm, exactly the one swept owner on the singular arm. The sweep itself is
 * faked (its `completedSpaces` derivation is pinned by `tests/server/domain/chat/substrate/backfill.int.test.ts`);
 * everything downstream of it — the contribution's fence, the op, `markGenerationComplete`, the ledger — is real.
 */
function chatDeps(
  svc: EmbeddingsService,
  sweep: { readonly spaces: readonly { ownerId: UserId; generation: PinnedGeneration }[]; readonly failed?: number },
): ChatWorkloadDeps {
  return {
    backfillMemory: vi.fn(async () => ({
      segments: { scanned: 1, changed: 1 },
      digests: { scanned: 1, changed: 1 },
      segmentsSkippedOverWindow: 0,
      failed: sweep.failed ?? 0,
      completedSpaces: sweep.spaces.map(({ ownerId, generation }) => ({
        ownerId,
        model: generation.space,
        generationId: generation.id,
        generationEpoch: generation.epoch,
      })),
    })),
    backfillGroupCharacters: vi.fn(async () => ({ scanned: 0, changed: 0 })),
    purgeMemoryVectors: async (spaces, enumerationScope): Promise<void> => {
      const swept = enumerationScope === null ? spaces : spaces.filter((space) => space.ownerId === enumerationScope);
      for (const space of swept) {
        await svc.purgeMemoryVectors({
          ownerId: space.ownerId,
          generation: { id: space.generationId, task: "embed", via: "embed", epoch: space.generationEpoch, space: space.model },
        });
      }
    },
    isMemoryEnabled: vi.fn(async () => true),
  };
}

/** The databank deps compose wires — same shape: the reindex is faked, the sweep-begin + completion are real. */
function databankDeps(svc: EmbeddingsService, harness: StoreHarness, owners: readonly UserId[]): DatabankWorkloadDeps {
  return {
    databankIngest: {
      ingestDocument: vi.fn(async () => NO_OP_REINDEX),
      reindex: vi.fn(async () => NO_OP_REINDEX),
    },
    beginDocumentVectorSweep: async (enumerationScope): Promise<readonly { readonly ownerId: UserId; readonly generation: PinnedGeneration }[]> => {
      const scoped = enumerationScope === null ? owners : owners.filter((ownerId) => ownerId === enumerationScope);
      const receipts: { ownerId: UserId; generation: PinnedGeneration }[] = [];
      for (const ownerId of scoped) {
        const generation = await resolveTargetGeneration(harness.ctx, ownerId, "embed");
        if (generation !== null) {
          receipts.push({ ownerId, generation });
        }
      }
      return receipts;
    },
    purgeDocumentVectors: async (receipts): Promise<void> => {
      for (const receipt of receipts) {
        await svc.purgeDocumentVectors(receipt);
      }
    },
  };
}

interface Fixture {
  readonly db: Db;
  readonly owner: UserId;
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly harness: StoreHarness;
  readonly svc: EmbeddingsService;
}

async function fixture(handle = "owner"): Promise<Fixture> {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>(handle) });
  const characterId = await seedCharacter(db, owner, { id: `character_${handle}` });
  const chatId = await seedChat(db, `chat_${handle}`, owner);
  await seedDocument(db, owner, { id: `document_${handle}` });
  const harness = makeStoreHarness(db, { characterIds: [characterId], cardTexts: new Map([[characterId, CARD_TEXT]]) });
  return { db, owner, chatId, characterId, harness, svc: createEmbeddingsService(harness.ctx) };
}

/** The three per-owner catch-ups an owner can run from their own Jobs surface, in the order they land. */
async function runPerOwnerCatchUp(f: Fixture, owners: readonly UserId[] = [f.owner]): Promise<void> {
  await f.svc.embedCorpus({ ownerId: f.owner, signal: liveSignal(), force: false });
  const generation = await targetOf(f.harness, f.owner);
  const chat = createChatWorkloadContributions(chatDeps(f.svc, { spaces: owners.map((ownerId) => ({ ownerId, generation })) }));
  await chat[0].run(runContext(f.owner, f.owner), {}, vi.fn(), liveSignal());
  const databank = createDatabankWorkloadContributions(databankDeps(f.svc, f.harness, owners));
  await databank[1].run(runContext(f.owner, f.owner), { scope: { kind: "owner" } }, vi.fn(), liveSignal());
}

async function ledgerScopes(db: Db, ownerId: UserId): Promise<string[]> {
  const rows = await db.select({ scope: embedSpaceState.scope }).from(embedSpaceState).where(eq(embedSpaceState.ownerId, ownerId));
  return rows.map((row) => row.scope).sort();
}

describe("the completion ledger under a per-owner catch-up (#2517)", () => {
  // THE DEFECT PIN. Pre-fix this reads `["cards"]` / `moving`: the card sweep's singular arm recorded its
  // scope, memory and documents did not, and `readGeneration` — which requires ALL THREE to name the same
  // generation — reported a corpus in motion that was in fact entirely at rest.
  test("records every scope for the swept owner, and readGeneration goes READY", async () => {
    const f = await fixture();
    await runPerOwnerCatchUp(f);

    expect(await ledgerScopes(f.db, f.owner)).toEqual([...VECTOR_SCOPES_BY_TASK.embed].sort());
    const generation = await targetOf(f.harness, f.owner);
    const read = await readGeneration(f.db, f.owner, "embed");
    expect(read.status).toBe("ready");
    expect(read.status === "ready" ? read.generation.id : null).toBe(generation.id);
  });

  // The fan-out fence stays PRESERVED, and this is the pin that says so. The fence's REASON was never "a singular run
  // may not record a completion" — it was "a singular run may not reach a neighbour's live space". That
  // survives, relocated into the op's enumeration: the neighbour's ledger and vectors are untouched.
  test("a singular catch-up records NOTHING for a neighbour it did not sweep", async () => {
    const f = await fixture();
    const neighbour = await seedUser(f.db, { handle: castId<Handle>("neighbour") });
    await seedChat(f.db, "chat_neighbour", neighbour);

    await runPerOwnerCatchUp(f, [f.owner, neighbour]);

    // Non-empty for the principal who swept — so the neighbour's empty read is about SCOPE, not about the run.
    expect(await ledgerScopes(f.db, f.owner)).toEqual([...VECTOR_SCOPES_BY_TASK.embed].sort());
    expect(await ledgerScopes(f.db, neighbour)).toEqual([]);
    expect((await readGeneration(f.db, neighbour, "embed")).status).not.toBe("ready");
  });

  // DOES RECORDING COMPLETION WITHOUT PURGING STRAND ANYTHING? No — and this is the arm that says so.
  // `markGenerationComplete` writes the scope's CANDIDATE row and returns without promoting until every
  // scope of the task names the same generation, so a lone memory completion moves no vectors at all: the
  // old geometry is still readable, and `readGeneration` correctly still says `moving` because the corpus
  // genuinely IS half-migrated. The completion is a receipt, not a promotion.
  test("a lone memory completion promotes nothing, deletes nothing, and still reads moving", async () => {
    const f = await fixture();
    const generation = await targetOf(f.harness, f.owner);
    await upsertChatSegment(f.db, {
      id: castId<ChatSegmentId>("chat_segment_lone"),
      chatId: f.chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "block",
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: STALE_MODEL,
      generationId: generation.id,
      dim: EMBED_DIM,
      now: NOW,
    });
    const chat = createChatWorkloadContributions(chatDeps(f.svc, { spaces: [{ ownerId: f.owner, generation }] }));
    await chat[0].run(runContext(f.owner, f.owner), {}, vi.fn(), liveSignal());

    expect(await ledgerScopes(f.db, f.owner)).toEqual(["memory"]);
    expect(await f.db.select().from(chatSegments)).toHaveLength(1);
    expect((await readGeneration(f.db, f.owner, "embed")).status).toBe("moving");
  });

  // The abort + failure fences are the OTHER half of the old conditional and they do NOT move: a sweep that
  // skipped chats or was cancelled did not re-derive the corpus, so it may not claim the scope.
  test("an ABORTED per-owner catch-up records no memory completion", async () => {
    const f = await fixture();
    const generation = await targetOf(f.harness, f.owner);
    const controller = new AbortController();
    controller.abort();
    const chat = createChatWorkloadContributions(chatDeps(f.svc, { spaces: [{ ownerId: f.owner, generation }] }));
    await chat[0].run(runContext(f.owner, f.owner), {}, vi.fn(), controller.signal);

    expect(await ledgerScopes(f.db, f.owner)).toEqual([]);
  });

  test("a per-owner catch-up whose sweep had per-chat FAILURES records no memory completion", async () => {
    const f = await fixture();
    const generation = await targetOf(f.harness, f.owner);
    const chat = createChatWorkloadContributions(chatDeps(f.svc, { spaces: [{ ownerId: f.owner, generation }], failed: 2 }));
    await expect(chat[0].run(runContext(f.owner, f.owner), {}, vi.fn(), liveSignal())).rejects.toThrow();

    expect(await ledgerScopes(f.db, f.owner)).toEqual([]);
  });

  // THE RECLAIM, at the per-owner granularity. Once all three scopes name the target, the promotion
  // transaction fires — and its DELETEs are owner-scoped by construction (`retiredVectorStatements` derives
  // its row sets from this owner's characters / hosted chats / documents), which is precisely why a
  // per-owner completion cannot reach a global space. The stale-geometry rows go; the current ones stay.
  test("completing every scope per-owner reclaims that owner's OLD space and keeps the current one", async () => {
    const f = await fixture();
    const staleGenerationId = castId<EmbedGenerationId>("embed_generation_stale");
    await f.db.insert(embedGenerations).values({
      id: staleGenerationId,
      ownerId: f.owner,
      task: "embed",
      via: "embed",
      connectionId: null,
      connectionRef: castId<UserConnectionId>(`fixture:${STALE_MODEL}`),
      fingerprint: `fixture:${STALE_MODEL}`,
      space: STALE_MODEL,
      createdAt: NOW,
    });
    const generation = await targetOf(f.harness, f.owner);
    for (const [suffix, model, generationId, seed] of [
      ["old", STALE_MODEL, staleGenerationId, 1],
      ["new", EMBED_MODEL, generation.id, 2],
    ] as const) {
      await upsertChatSegment(f.db, {
        id: castId<ChatSegmentId>(`chat_segment_${suffix}`),
        chatId: f.chatId,
        blockIdx: 0,
        chunkIdx: 0,
        seqStart: 0,
        seqEnd: 1,
        text: "block",
        embedding: fakeVector(EMBED_DIM, seed),
        contentHash: `h${seed}`,
        model,
        generationId,
        dim: EMBED_DIM,
        now: NOW,
      });
      await upsertChatDigest(f.db, {
        id: castId<ChatDigestId>(`chat_digest_${suffix}`),
        chatId: f.chatId,
        scopedCharacterId: f.characterId,
        isGroup: false,
        tier: 0,
        blockIdx: 0,
        text: "digest",
        topicAnchor: "[a — scene]",
        keywords: ["k"],
        embedding: fakeVector(EMBED_DIM, seed),
        contentHash: `h${seed}`,
        model,
        generationId,
        dim: EMBED_DIM,
        now: NOW,
        speakerCharacterIds: [],
      });
    }

    await runPerOwnerCatchUp(f);

    expect((await f.db.select().from(chatSegments)).map((row) => row.model)).toEqual([EMBED_MODEL]);
    expect((await f.db.select().from(chatDigests)).map((row) => row.model)).toEqual([EMBED_MODEL]);
  });
});
