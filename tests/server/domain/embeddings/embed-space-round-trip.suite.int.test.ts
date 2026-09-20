// THE EMBED-SPACE ROUND TRIP (inference program §10-2, the dtype axis) — the one drive that proves the
// vector WRITE and every vector READ agree on the space tag, end to end over a REAL db and the REAL
// `@orb/inference` runtime resolving a REAL `local-light` connection row.
//
// Why a suite and not four unit pins: the defect this exists to catch lives BETWEEN two correct halves.
// `embeddings/verbs/store.ts` stamps the tag the BACKEND reports (issue-724 ruling, `0fed0b3ee`:
// "snapshot getters are request-time hints"), and local-light reports `<repo>@<dtype>` because a
// re-quantised encoder is a different geometry (#2417). The READ side derives its tag from the resolved
// connection. If those two derivations disagree the tree is silently, permanently broken in the worst
// possible shape: every write succeeds, `nearest.ts` filters on a tag no row carries so search answers
// EMPTY forever, and `purgeStaleVectors` — whose predicate is `model != activeModel` — reclaims the
// owner's ENTIRE live corpus on the next bulk sweep. Nothing throws, nothing logs.
//
// A tag-equality unit test cannot see that: it asserts the string, not the round trip. So this drive
// WRITES through the production store verb, READS BACK through `nearest.ts` with the production space
// reader, and RUNS the real purge verb over the live corpus. The planted control is the derivation
// itself — drop the dtype fold from `embedSpaceOf` and both halves red.
//
// The principal every receipt below is taken as is the CONNECTION ROW'S OWNER (`seedOwner`), which is
// also the entity owner for the seeded card and document. That matters: under a per-user embedder an
// empty vector read is ambiguous between "no vectors" and "asked as the wrong principal", so each
// assertion below is preceded by a row-count read that proves vectors EXIST for this owner.

import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { characterEmbeddings, documentChunks } from "@orb/db";
import type { CharacterId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { EmbeddingsContext } from "../../../../packages/server/src/domain/embeddings/context.ts";
import type { EmbeddingsService } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { requireTaskModel } from "../../../../packages/server/src/domain/embeddings/substrate/task-model.ts";
import { SEARCH_SPACE_REINDEXING } from "../../../../packages/server/src/domain/search/contract/errors.ts";
import { nearestCharacters, nearestDocumentChunks } from "../../../../packages/server/src/domain/search/persistence/nearest.ts";
import { requireSpaceModel } from "../../../../packages/server/src/domain/search/substrate/space.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { ConnectionHarness } from "../connection/_support.ts";
import { makeHarness, seedOwner } from "../connection/_support.ts";
import type { StoreHarnessSources } from "./_support.ts";
import { makeStoreHarness, seedCharacter, seedDocument } from "./_support.ts";

const LOCAL_LIGHT = castId<ProviderId>("local-light");
/** The curated local-light encoder — the row `entry/boot/seed-local-light.ts` seeds on every fresh box. */
const ENCODER = "jinaai/jina-clip-v2";
/** A SECOND encoder the owner re-binds to mid-drive. The model id differs, so the `(model[@dtype])` space
 *  differs; the dtype matches the deployment's served precision so the backend's stamp and the read side's
 *  derivation agree about the NEW space exactly as they do about the old one (§10-2). */
const SECOND_ENCODER = "jinaai/jina-clip-v2-q4";
const SECOND_ENCODER_DTYPE = "q8";
const CARD_TEXT = "a seeded card, embedded through the real local-light connection";
const CHUNK_TEXT = "a seeded document slice";

/** A non-degenerate query vector at the deployment width — cosine needs a non-zero magnitude. */
function queryVector(): Float32Array {
  const v = new Float32Array(EMBED_SPACE_DIMS);
  for (let i = 0; i < EMBED_SPACE_DIMS; i += 1) {
    v[i] = ((i % 5) + 1) / 5;
  }
  return v;
}

interface Drive {
  readonly harness: ConnectionHarness;
  readonly principal: Principal;
  readonly userId: Principal["userId"];
  readonly connectionId: UserConnectionId;
  readonly svc: EmbeddingsService;
  readonly ctx: EmbeddingsContext;
  readonly roleClients: () => Promise<RoleClients>;
}

/** The whole graph one drive needs: a real runtime over a real db, an owner holding a bound `local-light`
 *  encoder connection, and an embeddings service whose role clients come from THAT runtime. */
async function driveOwnerWithBoundEncoder(db: Db, sources: StoreHarnessSources = {}, localLightEmbedDtype?: string): Promise<Drive> {
  const harness = await makeHarness(db, { localLight: true, ...(localLightEmbedDtype === undefined ? {} : { localLightEmbedDtype }) });
  const { userId, principal } = await seedOwner(db, "user_roundtrip");
  const connection = await harness.svc.create({
    principal,
    providerId: LOCAL_LIGHT,
    model: ENCODER,
    baseUrl: null,
    credentialId: null,
    allowBackground: true,
  });
  await harness.svc.setBinding({ principal, task: "embed", connectionId: connection.id });
  const roleClients = (): Promise<RoleClients> => Promise.resolve(harness.runtime.roleClientsFor(principal));
  const store = makeStoreHarness(db, sources);
  const ctx: EmbeddingsContext = {
    ...store.ctx,
    roleClientsFor: roleClients,
    resolveEmbeddingConnection: async (_ownerId, task) => {
      const rc = await roleClients();
      const resolved = await rc.resolved(task);
      return resolved === null
        ? null
        : {
            ...resolved,
            api: "test",
            wire: "test",
            baseUrl: null,
            features: {},
            extras: null,
            transport: null,
            embed: rc.embed,
            imageEmbed: rc.imageEmbed,
          };
    },
    embedDim: EMBED_SPACE_DIMS,
    imageEmbedDim: EMBED_SPACE_DIMS,
  };
  return { harness, principal, userId, connectionId: connection.id, svc: createEmbeddingsService(ctx), ctx, roleClients };
}

/** The three sweep terminals that between them cover the `embed` space (§10-5's scopes `cards`, `memory`,
 *  `documents`). Running the REAL verbs is the point: the completion rows only exist because work finished. */
async function runEmbedSweeps(drive: Drive): Promise<void> {
  await drive.svc.embedCorpus({ force: false, signal: new AbortController().signal, ownerId: drive.userId });
  const generation = await drive.svc.resolveGeneration(drive.userId, "embed");
  if (generation !== null) {
    await drive.svc.purgeMemoryVectors({ ownerId: drive.userId, generation });
    await drive.svc.purgeDocumentVectors({ ownerId: drive.userId, generation });
  }
}

describe("the embed space round trip — write tag === read tag (§10-2)", () => {
  test("a card embedded through a real local-light connection is FOUND by nearestCharacters", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const characterId = await seedCharacter(db, drive.userId, { name: "round-trip card" });

    // The WRITE side asks the embeddings substrate for the owner's space tag — the production reader.
    const writeTag = await requireTaskModel(drive.ctx, drive.userId, "embed");
    expect(writeTag).not.toBeNull();
    const written = await drive.svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: CARD_TEXT,
      model: writeTag ?? "",
      dim: EMBED_SPACE_DIMS,
      ownerId: drive.userId,
    });
    expect(written.outcome).toBe("written");

    // A VECTOR EXISTS FOR THIS OWNER — so an empty read below is about the TAG, not about the corpus.
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    await runEmbedSweeps(drive);

    // The READ side derives its own tag from the same resolved connection, through search's substrate.
    const readTag = await requireSpaceModel(drive.ctx, drive.userId, "embed");
    // THE DEFECT, stated as the thing it actually breaks: the stored row must be in the space the
    // retrieval scan filters on. Asserted on the row, not on two derivations agreeing in the abstract.
    expect(rows[0]?.model).toBe(readTag);

    const hits = await nearestCharacters(db, { ownerId: drive.userId, queryVector: queryVector(), model: readTag, limit: 5 });
    expect(hits.map((h) => h.characterId)).toEqual([characterId]);
  });

  test("the old-space purge does NOT reclaim the live corpus it just wrote", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const documentId = await seedDocument(db, drive.userId, { text: CHUNK_TEXT });

    const writeTag = await requireTaskModel(drive.ctx, drive.userId, "embed");
    await drive.svc.store({
      kind: "document",
      lens: "chunk",
      content: CHUNK_TEXT,
      model: writeTag ?? "",
      dim: EMBED_SPACE_DIMS,
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: CHUNK_TEXT.length },
      ownerId: drive.userId,
    });
    expect(await db.select().from(documentChunks)).toHaveLength(1);

    // `purgeStaleVectors` deletes every row whose `model != activeModel`. When the write tag and the
    // read tag disagree, THE LIVE ROW IS THE STALE ROW and the owner's corpus is eaten silently.
    const generation = await drive.svc.resolveGeneration(drive.userId, "embed");
    if (generation === null) {
      throw new Error("expected generation");
    }
    const { chunks } = await drive.svc.purgeDocumentVectors({ ownerId: drive.userId, generation });
    expect(chunks).toBe(0);
    expect(await db.select().from(documentChunks)).toHaveLength(1);
    await runEmbedSweeps(drive);

    const readTag = await requireSpaceModel(drive.ctx, drive.userId, "embed");
    const hits = await nearestDocumentChunks(db, {
      documentIds: [documentId],
      queryVector: queryVector(),
      model: readTag,
      dim: EMBED_SPACE_DIMS,
      limit: 5,
    });
    expect(hits).toHaveLength(1);
  });

  test("an undeclared dtype inherits a nondefault deployment precision for both write and read", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db, {}, "fp16");
    const characterId = await seedCharacter(db, drive.userId, { name: "fp16 card" });
    const tag = await requireTaskModel(drive.ctx, drive.userId, "embed");
    expect(tag).toBe(`${ENCODER}@fp16`);

    await drive.svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: CARD_TEXT,
      model: tag ?? "",
      dim: EMBED_SPACE_DIMS,
      ownerId: drive.userId,
    });
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(tag);
    expect(
      (await nearestCharacters(db, { ownerId: drive.userId, queryVector: queryVector(), model: tag ?? "", limit: 5 })).map((hit) => hit.characterId),
    ).toEqual([characterId]);
  });

  test("a local-light dtype declaration the deployment cannot serve is refused before write, read, or purge", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const documentId = await seedDocument(db, drive.userId, { text: CHUNK_TEXT });

    const servedTag = await requireTaskModel(drive.ctx, drive.userId, "embed");
    await drive.svc.store({
      kind: "document",
      lens: "chunk",
      content: CHUNK_TEXT,
      model: servedTag ?? "",
      dim: EMBED_SPACE_DIMS,
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: CHUNK_TEXT.length },
      ownerId: drive.userId,
    });
    expect(await db.select().from(documentChunks)).toHaveLength(1);
    expect(
      await nearestDocumentChunks(db, {
        documentIds: [documentId],
        queryVector: queryVector(),
        model: servedTag ?? "",
        dim: EMBED_SPACE_DIMS,
        limit: 5,
      }),
    ).toHaveLength(1);

    await drive.harness.svc.update({
      principal: drive.principal,
      connectionId: drive.connectionId,
      patch: { declared: { kind: "embedding", embedding: { dtype: "fp16" } } },
    });

    await expect(
      drive.svc.store({
        kind: "document",
        lens: "chunk",
        content: `${CHUNK_TEXT} changed`,
        model: `${ENCODER}@fp16`,
        dim: EMBED_SPACE_DIMS,
        fkRefs: { documentId, chunkIdx: 1, charStart: 0, charEnd: CHUNK_TEXT.length },
        ownerId: drive.userId,
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    await expect(drive.svc.resolveGeneration(drive.userId, "embed")).rejects.toMatchObject({ kind: "invalid" });
    await expect(requireSpaceModel(drive.ctx, drive.userId, "embed")).rejects.toMatchObject({ code: "search_space_reindexing" });
    expect(await db.select().from(documentChunks)).toHaveLength(1);
  });

  // ── §10-5: the transition, driven end to end ────────────────────────────────────────────────────────
  //
  // THE DEFECT: between a binding change and the reindex finishing, the READ side points at the new space
  // while the corpus is still in the old one. A tag-equality unit test cannot see it — both halves are
  // individually correct at every instant; only the ORDER of two real events produces the state. So this
  // drives the real events: a real connection write moves the space (it also fires the §10-4 PD-139a
  // trigger), and the assertions are what a user would experience at each step.
  //
  // THE PLANTED CONTROL is step 2's row count taken in the same breath as the refusal: the vectors are
  // provably still there and still findable in the space they were written in, so the refusal is about the
  // TRANSITION and not about an empty corpus, a wrong principal, or a broken fixture. Delete the refusal in
  // `search/substrate/space.ts` and step 2 goes green while step 3's "answers the NEW tag" stays green —
  // which is exactly the silent-empty shipping shape this exists to stop.
  test("a binding change does not serve a foreign space: reads refuse until the reindex lands, then swap", async () => {
    const db = await freshDb();
    const characterId = castId<CharacterId>("character_transition");
    const drive = await driveOwnerWithBoundEncoder(db, {
      characterIds: [characterId],
      cardTexts: new Map([[characterId, CARD_TEXT]]),
    });
    await seedCharacter(db, drive.userId, { id: characterId, name: "transition card" });

    // ── STEP 1: the steady state. The real sweeps run, record their completions, and the read answers.
    await runEmbedSweeps(drive);
    const oldTag = await requireSpaceModel(drive.ctx, drive.userId, "embed");
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(oldTag);
    expect((await nearestCharacters(db, { ownerId: drive.userId, queryVector: queryVector(), model: oldTag, limit: 5 })).map((h) => h.characterId)).toEqual([
      characterId,
    ]);

    // ── STEP 2: the space MOVES under a real connection write. `declared.embedding.dtype` is the top
    // evidence tier (§6.2), so this is a user re-declaring their own box's precision — the same class of
    // change as re-pointing the binding, and it moves the `(model[@dtype])` tag without touching `model`.
    const second = await drive.harness.svc.create({
      principal: drive.principal,
      providerId: LOCAL_LIGHT,
      model: SECOND_ENCODER,
      baseUrl: null,
      credentialId: null,
      allowBackground: true,
      // `declared` is the TOP evidence tier (§6.2) — the user telling us what their own box serves. It is
      // what makes a model the shipped catalog has never heard of pickable, which is exactly the shape of
      // "I swapped my encoder" that this whole transition exists for.
      declared: { kind: "embedding", embedding: { dims: EMBED_SPACE_DIMS, dtype: SECOND_ENCODER_DTYPE, input: ["text", "image"] } },
    });
    await drive.harness.svc.setBinding({ principal: drive.principal, task: "embed", connectionId: second.id });
    const newTag = await requireTaskModel(drive.ctx, drive.userId, "embed");
    expect(newTag, "the live space moved").not.toBe(oldTag);

    // THE VECTORS ARE STILL THERE, in the space they were written in — this is the control that makes the
    // refusal below mean "mid-move" rather than "nothing to find". The principal is the connection row's
    // OWNER, the same one every read above was taken as.
    const stillThere = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]?.model).toBe(oldTag);

    // …and the read REFUSES rather than scanning the new space (which holds nothing) or the old one with a
    // new-model query vector (which would rank garbage — both spaces are 1024-wide, so nothing throws).
    await expect(requireSpaceModel(drive.ctx, drive.userId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });

    // ── STEP 3: the reindex lands. Every scope records the new space and the read resumes — on the NEW tag,
    // finding the SAME card. The swap is complete and nothing was lost on the way through.
    await runEmbedSweeps(drive);
    const settled = await requireSpaceModel(drive.ctx, drive.userId, "embed");
    expect(settled).toBe(newTag);
    expect((await nearestCharacters(db, { ownerId: drive.userId, queryVector: queryVector(), model: settled, limit: 5 })).map((h) => h.characterId)).toEqual([
      characterId,
    ]);
  });

  test("a partial reindex cannot purge the last-complete document corpus before replacement", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const documentId = await seedDocument(db, drive.userId, { text: CHUNK_TEXT });
    const oldTag = await requireTaskModel(drive.ctx, drive.userId, "embed");

    await drive.svc.store({
      kind: "document",
      lens: "chunk",
      content: CHUNK_TEXT,
      model: oldTag ?? "",
      dim: EMBED_SPACE_DIMS,
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: CHUNK_TEXT.length },
      ownerId: drive.userId,
    });
    await runEmbedSweeps(drive);

    const second = await drive.harness.svc.create({
      principal: drive.principal,
      providerId: LOCAL_LIGHT,
      model: SECOND_ENCODER,
      baseUrl: null,
      credentialId: null,
      allowBackground: true,
      declared: { kind: "embedding", embedding: { dims: EMBED_SPACE_DIMS, dtype: SECOND_ENCODER_DTYPE, input: ["text", "image"] } },
    });
    await drive.harness.svc.setBinding({ principal: drive.principal, task: "embed", connectionId: second.id });

    // Documents finish independently from cards and memory. The terminal must retain the complete
    // generation until all three scopes can promote together; it cannot delete first and hope that the
    // other refill jobs catch up later.
    const generation = await drive.svc.resolveGeneration(drive.userId, "embed");
    if (generation === null) {
      throw new Error("expected generation");
    }
    const purged = await drive.svc.purgeDocumentVectors({ ownerId: drive.userId, generation });
    expect(purged.chunks).toBe(0);
    expect(await db.select().from(documentChunks)).toHaveLength(1);
    expect(
      await nearestDocumentChunks(db, {
        documentIds: [documentId],
        queryVector: queryVector(),
        model: oldTag ?? "",
        dim: EMBED_SPACE_DIMS,
        limit: 5,
      }),
    ).toHaveLength(1);
  });

  test("the derived read tag carries the encoder's curated dtype — the fact the backend stamps", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const readTag = await requireSpaceModel(drive.ctx, drive.userId, "embed");
    // Not a string literal: the ASSERTION is that the space tag is not merely the row's model column,
    // because a re-quantised encoder is a different geometry (#2417). A tag equal to the bare model id
    // is the pre-fix shape.
    expect(readTag).not.toBe(ENCODER);
    expect(readTag.startsWith(`${ENCODER}@`)).toBe(true);
  });
});
