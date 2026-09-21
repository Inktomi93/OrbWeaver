// verb: documents — the databank RAG lens (DB5, databank-design/05 §3). Asserts the reading-order restore
// (group by document, best-doc first, chunks ascending by chunkIdx even when a higher-idx chunk ranked
// better), the minScore floor, the content-hash collapse (fork/near-copy chunks → one better-ranked
// representative), the empty-allowlist ZERO-embed short-circuit (the trigger-discipline mirror), and THE
// flagship gate-8 owner/host-scope no-leak pin (two users share one chat; no cross-tenant chunk surfaces).

import { documentChunks, embedGenerations, embedSpaceState, userConnections } from "@orb/db";
import type { EmbedGenerationId, Handle, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { SEARCH_SPACE_REINDEXING, SearchError } from "@orb/server/domain/search";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  makeSearch,
  seedChat,
  seedChatDocument,
  seedChatParticipant,
  seedDocument,
  seedDocumentChunk,
  seedGlobalDocument,
  seedUser,
  vec,
} from "../_support.ts";

describe("documents", () => {
  test("restores reading order: best-doc first, chunks ascending by chunkIdx", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const docA = await seedDocument(db, { id: "document_a", ownerId: owner, name: "Alpha" });
    const docB = await seedDocument(db, { id: "document_b", ownerId: owner, name: "Beta" });
    // Query embeds to vec(1). Ranking (ascending distance): docA/chunk1 (0) < docB/chunk0 (~0.11) <
    // docA/chunk0 (~0.29). Reading-order restore must put docA first (its BEST chunk ranked #1), docA's
    // chunks ascending (chunk0 before chunk1 despite chunk1 ranking higher), docB after.
    await seedDocumentChunk(db, { documentId: docA, chunkIdx: 0, content: "a0", embedding: vec(1, 1) });
    await seedDocumentChunk(db, { documentId: docA, chunkIdx: 1, content: "a1", embedding: vec(1) });
    await seedDocumentChunk(db, { documentId: docB, chunkIdx: 0, content: "b0", embedding: vec(2, 1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.documents({ scope: { ownerId: owner }, queryText: "q", ownerId: owner });

    expect(hits.map((h) => [h.documentId, h.chunkIdx, h.content])).toEqual([
      [docA, 0, "a0"],
      [docA, 1, "a1"],
      [docB, 0, "b0"],
    ]);
  });

  test("applies the minScore floor (a far chunk is dropped)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const doc = await seedDocument(db, { ownerId: owner });
    await seedDocumentChunk(db, { documentId: doc, chunkIdx: 0, content: "near", embedding: vec(1) }); // dist 0
    await seedDocumentChunk(db, { documentId: doc, chunkIdx: 1, content: "far", embedding: vec(0, 1) }); // dist 1, similarity 0

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.documents({ scope: { ownerId: owner }, queryText: "q", minScore: 0.25, ownerId: owner });

    expect(hits.map((h) => h.content)).toEqual(["near"]);
  });

  test("collapses same-content-hash chunks to the better-ranked representative", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const docA = await seedDocument(db, { id: "document_a", ownerId: owner, name: "A" });
    const docB = await seedDocument(db, { id: "document_b", ownerId: owner, name: "B" });
    // Identical contentHash across two documents; docB/chunk0 ranks better (dist 0) — it survives.
    await seedDocumentChunk(db, { documentId: docA, chunkIdx: 0, content: "dup", embedding: vec(1, 1), contentHash: "SHARED" });
    await seedDocumentChunk(db, { documentId: docB, chunkIdx: 0, content: "dup", embedding: vec(1), contentHash: "SHARED" });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.documents({ scope: { ownerId: owner }, queryText: "q", ownerId: owner });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.documentId).toBe(docB);
  });

  test("empty allowlist short-circuits with ZERO embed calls", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") }); // owns NO documents
    let embedCalls = 0;
    const svc = makeSearch(db, {
      embedVector: () => {
        embedCalls += 1;
        return vec(1);
      },
    });

    const hits = await svc.documents({ scope: { ownerId: owner }, queryText: "q", ownerId: owner });

    expect(hits).toEqual([]);
    expect(embedCalls).toBe(0);
  });

  // #2510 — THE SHORT-CIRCUIT NOW PRECEDES THE SPACE READ, and that ordering is the whole fix. Both guards
  // used to live INSIDE the `withActiveQuerySpace` callback, so `requireQuerySpace` ran first: a bankless
  // owner whose vector space was mid-move took `search_space_reindexing` on the way to a return of `[]`. That
  // is not academic — the `{{databank}}` slot calls this verb once per chat turn whether or not the room has
  // documents, so it killed every turn with a 400 (`tests/server/entry/compose/retrieval-degrade.int.test.ts`
  // holds the end-to-end arm). "Nothing is in scope" is answerable WITHOUT a vector space.
  //
  // THE ORDINARY "MOVING" READ, seeded the way live usage reaches it: the harness's `seedUser` writes a
  // complete space, and deleting its `embed_space_state` rows leaves the generation + target rows behind —
  // exactly the shape `readGeneration` calls "moving" for an owner who has never completed a full
  // cards ∪ memory ∪ documents sweep.
  test("a MID-MOVE space still short-circuits an empty allowlist — and the refusal itself is untouched", async () => {
    const db = await freshDb();
    const bankless = await seedUser(db, { handle: castId<Handle>("bankless") }); // owns NO documents
    const banked = await seedUser(db, { handle: castId<Handle>("banked") });
    const doc = await seedDocument(db, { ownerId: banked });
    await seedDocumentChunk(db, { documentId: doc, chunkIdx: 0, content: "in scope", embedding: vec(1) });
    await db.delete(embedSpaceState); // both owners now read "moving"

    let embedCalls = 0;
    const svc = makeSearch(db, {
      embedVector: () => {
        embedCalls += 1;
        return vec(1);
      },
    });

    expect(await svc.documents({ scope: { ownerId: bankless }, queryText: "q", ownerId: bankless })).toEqual([]);
    expect(embedCalls).toBe(0);

    // THE POSITIVE CONTROL, in the same invocation: an owner with a document IN scope and the SAME moving
    // space still takes the named refusal. Without it this test would pass just as well against a search that
    // had stopped refusing at all, which is the one thing this change must not do.
    const refused: unknown = await svc.documents({ scope: { ownerId: banked }, queryText: "q", ownerId: banked }).catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(SearchError);
    expect((refused as SearchError).code).toBe(SEARCH_SPACE_REINDEXING);
  });

  // ── gate-8 twin (search-side): the D85 membership-widened scope + the no-leak floor ──
  // AMENDED at the DBK-F build (D85/D91, 2026-07-18): the chat turn scope is no longer host-only — every
  // PRESENT human member's globally-ATTACHED docs credit the room. The leak floor moves, unchanged in kind:
  // an UNATTACHED (private-bank) doc never surfaces, and personal search never crosses tenants.
  test("scope no-leak (D85 widened): a shared chat retrieves every present member's ATTACHED docs; private banks and cross-tenant personal search never leak", async () => {
    const db = await freshDb();
    const alpha = await seedUser(db, { handle: castId<Handle>("alpha") });
    const beta = await seedUser(db, { handle: castId<Handle>("beta") });
    const gamma = await seedUser(db, { handle: castId<Handle>("gamma") });
    const room = await seedChat(db, "chat_shared");
    await seedChatParticipant(db, room, alpha, "host");
    await seedChatParticipant(db, room, beta, "member");
    await seedChatParticipant(db, room, gamma, "member");

    // Alpha (host): one GLOBAL doc + one CHAT-attached doc. Beta (member): one ATTACHED global doc
    // + one PRIVATE (never-attached) doc — the widened scope's leak floor.
    const aGlobal = await seedDocument(db, { id: "document_a_global", ownerId: alpha, name: "AlphaGlobal" });
    const aChat = await seedDocument(db, { id: "document_a_chat", ownerId: alpha, name: "AlphaChat" });
    const bGlobal = await seedDocument(db, { id: "document_b_global", ownerId: beta, name: "BetaGlobal" });
    const bPrivate = await seedDocument(db, { id: "document_b_private", ownerId: beta, name: "BetaPrivate" });
    const bPending = await seedDocument(db, { id: "document_b_pending", ownerId: beta, name: "BetaPending" });
    const gIncompatible = await seedDocument(db, { id: "document_g_incompatible", ownerId: gamma, name: "GammaIncompatible" });
    await seedGlobalDocument(db, alpha, aGlobal);
    await seedChatDocument(db, room, aChat);
    await seedGlobalDocument(db, beta, bGlobal);
    await seedGlobalDocument(db, beta, bPending);
    await seedGlobalDocument(db, gamma, gIncompatible);
    await seedDocumentChunk(db, { documentId: aGlobal, chunkIdx: 0, content: "alpha-global", embedding: vec(1) });
    await seedDocumentChunk(db, { documentId: aChat, chunkIdx: 0, content: "alpha-chat", embedding: vec(1) });
    await seedDocumentChunk(db, { documentId: bGlobal, chunkIdx: 0, content: "beta-global", embedding: vec(1) });
    await seedDocumentChunk(db, { documentId: bPrivate, chunkIdx: 0, content: "beta-private", embedding: vec(1) });
    const pendingChunk = await seedDocumentChunk(db, { documentId: bPending, chunkIdx: 0, content: "beta-pending", embedding: vec(1) });
    await seedDocumentChunk(db, { documentId: gIncompatible, chunkIdx: 0, content: "gamma-incompatible", embedding: vec(1) });

    const generations = await db.select().from(embedGenerations);
    const alphaGeneration = generations.find((row) => row.ownerId === alpha);
    const betaGeneration = generations.find((row) => row.ownerId === beta);
    const gammaGeneration = generations.find((row) => row.ownerId === gamma);
    if (alphaGeneration === undefined || betaGeneration === undefined || gammaGeneration === undefined) {
      throw new Error("expected one active document generation per member");
    }
    expect(alphaGeneration.connectionId).not.toBe(betaGeneration.connectionId);
    expect(alphaGeneration.fingerprint).toBe(betaGeneration.fingerprint);
    if (betaGeneration.connectionId === null) {
      throw new Error("expected beta's generation to retain its connection parent");
    }
    const [betaConnection] = await db.select().from(userConnections).where(eq(userConnections.id, betaGeneration.connectionId));
    if (betaConnection === undefined) {
      throw new Error("expected beta's generation connection parent");
    }
    const pendingConnectionId = castId<UserConnectionId>("user_connection_beta_pending");
    await db.insert(userConnections).values({ ...betaConnection, id: pendingConnectionId, label: "Beta pending" });
    const pendingGenerationId = castId<EmbedGenerationId>("generation_beta_pending");
    await db.insert(embedGenerations).values({
      ...betaGeneration,
      id: pendingGenerationId,
      connectionId: pendingConnectionId,
      connectionRef: pendingConnectionId,
    });
    await db.update(documentChunks).set({ generationId: pendingGenerationId }).where(eq(documentChunks.id, pendingChunk));
    await db.update(embedGenerations).set({ fingerprint: "incompatible-vector-geometry" }).where(eq(embedGenerations.id, gammaGeneration.id));

    const svc = makeSearch(db, { embedVector: () => vec(1) });

    // (a) The chat turn scope resolves the MEMBERSHIP union — alpha's global ∪ the chat-attached ∪
    // beta's ATTACHED global (D85); beta's PRIVATE bank never surfaces.
    const turnScope = await svc.documents({ scope: { chatId: room }, queryText: "q", ownerId: alpha });
    expect(new Set(turnScope.map((h) => h.documentId))).toEqual(new Set([aGlobal, aChat, bGlobal]));
    expect(turnScope.some((h) => h.documentId === bPrivate)).toBe(false);
    expect(turnScope.some((h) => h.documentId === bPending || h.documentId === gIncompatible)).toBe(false);

    // (b) Beta's personal search sees ONLY beta's bank — zero of alpha's, even sharing the room.
    const betaPersonal = await svc.documents({ scope: { ownerId: beta }, queryText: "q", ownerId: alpha });
    expect(new Set(betaPersonal.map((h) => h.documentId))).toEqual(new Set([bGlobal, bPrivate]));
    expect(betaPersonal.some((h) => h.documentId === aGlobal || h.documentId === aChat)).toBe(false);

    // (c) Alpha's personal search sees alpha's bank — zero of beta's.
    const alphaPersonal = await svc.documents({ scope: { ownerId: alpha }, queryText: "q", ownerId: alpha });
    expect(new Set(alphaPersonal.map((h) => h.documentId))).toEqual(new Set([aGlobal, aChat]));
    expect(alphaPersonal.some((h) => h.documentId === bGlobal || h.documentId === bPrivate)).toBe(false);
  });
});
