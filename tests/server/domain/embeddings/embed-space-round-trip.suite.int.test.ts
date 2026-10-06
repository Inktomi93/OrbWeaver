// THE EMBED-SPACE ROUND TRIP (inference program §10-2, the dtype axis) — the one drive that proves the
// vector WRITE and every vector READ agree on the space tag, end to end over a REAL db and the REAL
// `@orb/inference` runtime resolving a REAL `local-light` connection row.
//
// Why a suite and not four unit pins: the defect this exists to catch lives BETWEEN two correct halves.
// `embeddings/verbs/store.ts` stamps the tag the BACKEND reports (issue-724 ruling, `088209c8be`:
// "snapshot getters are request-time hints"), and local-light reports `<repo>@<dtype>` because a
// re-quantised encoder is a different geometry (#2417). The READ side derives its tag from the resolved
// connection. If those two derivations disagree the tree is silently, permanently broken in the worst
// possible shape: every write succeeds, `nearest.ts` filters on a tag no row carries so search answers
// EMPTY forever, and the promotion retire — whose predicate is `generation_id != <promoted>` — reclaims
// the owner's ENTIRE live corpus on the next bulk sweep. Nothing throws, nothing logs.
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

import type { EmbeddingTask } from "@orb/contracts/embeddings";
import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import { BUILT_IN_EMBED_DIMS } from "@orb/contracts/inference";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { characterEmbeddings, documentChunks } from "@orb/db";
import type { CharacterEmbeddingId, CharacterId, ChatId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { readOwnedCharacterVectors } from "../../../../packages/server/src/domain/discovery/persistence/embed-store-reads.ts";
import type { EmbeddingsContext } from "../../../../packages/server/src/domain/embeddings/context.ts";
import type { EmbeddingsService } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { upsertCharacterEmbedding } from "../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { requireTaskModel } from "../../../../packages/server/src/domain/embeddings/substrate/task-model.ts";
import { SEARCH_SPACE_REINDEXING } from "../../../../packages/server/src/domain/search/contract/errors.ts";
import type { ActiveQuerySpace } from "../../../../packages/server/src/domain/search/contract/service.ts";
import { nearestDigests, nearestSegments } from "../../../../packages/server/src/domain/search/persistence/digest-rows.ts";
import { nearestCharacters, nearestDocumentChunks } from "../../../../packages/server/src/domain/search/persistence/nearest.ts";
import { withActiveQuerySpace } from "../../../../packages/server/src/domain/search/substrate/space.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { ConnectionHarness } from "../connection/_support.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../connection/_support.ts";
import type { StoreHarnessSources } from "./_support.ts";
import { makeStoreHarness, seedCharacter, seedChat, seedDocument } from "./_support.ts";

const LOCAL_LIGHT = castId<ProviderId>("local-light");
/** The curated local-light encoder — the row `entry/boot/seed-local-light.ts` seeds on every fresh box. */
const ENCODER = "jinaai/jina-clip-v2";
/** A common local embedder the curated rows know as 768 wide and MRL, served by the owner's own endpoint. */
const NARROW_ENCODER = "nomic-embed-text";
const NARROW_DIMS = 768;
const NARROW_BASE_URL = "http://127.0.0.1:18705/v1";
/** A SECOND encoder the owner re-binds to mid-drive, served by their own OpenAI-compatible endpoint. The
 *  builtin local-light catalog is closed (`requireCatalogModel`), so a swapped encoder is an endpoint row,
 *  whose `url` catalog admits the id; the model id differs, so the `(model[@dtype])` space differs. */
const SECOND_ENCODER = "Qwen/Qwen3-VL-Embedding-2B";
const CARD_TEXT = "a seeded card, embedded through the real local-light connection";
const CHUNK_TEXT = "a seeded document slice";

/** The endpoint's canned OpenAI-dialect embeddings answer: one vector per POST, which fits the one-card corpus
 *  the transition drive re-embeds. */
const SECOND_ENCODER_ROUTE = {
  match: `${BYO_BASE_URL}/embeddings`,
  json: {
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: Array.from({ length: BUILT_IN_EMBED_DIMS }, (_value, i) => ((i % 7) + 1) / 10) }],
    model: SECOND_ENCODER,
  },
};

/** The narrow endpoint behaves like a real MRL server: one vector per input, at the `dimensions` it was asked
 *  for, else its native width. */
const NARROW_ENCODER_ROUTE = {
  match: `${NARROW_BASE_URL}/embeddings`,
  reply: (body: string | null): unknown => {
    const request = JSON.parse(body ?? "{}") as { readonly input?: unknown; readonly dimensions?: number };
    const inputs = Array.isArray(request.input) ? request.input.length : 1;
    const width = request.dimensions ?? NARROW_DIMS;
    return {
      object: "list",
      data: Array.from({ length: inputs }, (_input, index) => ({
        object: "embedding",
        index,
        embedding: Array.from({ length: width }, (_value, i) => (((i + index) % 7) + 1) / 10),
      })),
      model: NARROW_ENCODER,
    };
  },
};

/** A non-degenerate query vector — cosine needs a non-zero magnitude. */
function queryVector(width = BUILT_IN_EMBED_DIMS): Float32Array {
  const v = new Float32Array(width);
  for (let i = 0; i < width; i += 1) {
    v[i] = ((i % 5) + 1) / 5;
  }
  return v;
}

/** The connection row an owner binds for `embed`. */
interface EncoderRow {
  readonly providerId: ProviderId;
  readonly model: string;
  readonly baseUrl: string | null;
}

const BUILT_IN_ROW: EncoderRow = { providerId: LOCAL_LIGHT, model: ENCODER, baseUrl: null };
const NARROW_ROW: EncoderRow = { providerId: BYO_PROVIDER, model: NARROW_ENCODER, baseUrl: NARROW_BASE_URL };

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
async function driveOwnerWithBoundEncoder(
  db: Db,
  sources: StoreHarnessSources = {},
  localLightEmbedDtype?: string,
  encoder: EncoderRow = BUILT_IN_ROW,
): Promise<Drive> {
  const harness = await makeHarness(db, {
    localLight: true,
    routes: [SECOND_ENCODER_ROUTE, NARROW_ENCODER_ROUTE],
    ...(localLightEmbedDtype === undefined ? {} : { localLightEmbedDtype }),
  });
  const { userId, principal } = await seedOwner(db, "user_roundtrip");
  const connection = await harness.svc.create({
    principal,
    providerId: encoder.providerId,
    model: encoder.model,
    baseUrl: encoder.baseUrl,
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
  };
  return { harness, principal, userId, connectionId: connection.id, svc: createEmbeddingsService(ctx), ctx, roleClients };
}

/** The settled read tag, taken through the ONE door every query verb calls (`withActiveQuerySpace`). */
async function spaceModel(ctx: EmbeddingsContext, ownerId: UserId, task: EmbeddingTask): Promise<string> {
  return await withActiveQuerySpace(ctx, ownerId, task, (space) => Promise.resolve(space.model));
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
      ownerId: drive.userId,
    });
    expect(written.outcome).toBe("written");

    // A VECTOR EXISTS FOR THIS OWNER — so an empty read below is about the TAG, not about the corpus.
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    await runEmbedSweeps(drive);

    // The READ side derives its own tag from the same resolved connection, through search's substrate.
    const readTag = await spaceModel(drive.ctx, drive.userId, "embed");
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
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: CHUNK_TEXT.length },
      ownerId: drive.userId,
    });
    expect(await db.select().from(documentChunks)).toHaveLength(1);

    // Promotion deletes every row whose `generation_id` is not the promoted one. When the write tag and
    // the read tag disagree, THE LIVE ROW IS THE STALE ROW and the owner's corpus is eaten silently.
    const generation = await drive.svc.resolveGeneration(drive.userId, "embed");
    if (generation === null) {
      throw new Error("expected generation");
    }
    const { chunks } = await drive.svc.purgeDocumentVectors({ ownerId: drive.userId, generation });
    expect(chunks).toBe(0);
    expect(await db.select().from(documentChunks)).toHaveLength(1);
    await runEmbedSweeps(drive);

    const readTag = await spaceModel(drive.ctx, drive.userId, "embed");
    const hits = await nearestDocumentChunks(db, {
      documentIds: [documentId],
      queryVector: queryVector(),
      model: readTag,
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
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: CHUNK_TEXT.length },
      ownerId: drive.userId,
    });
    expect(await db.select().from(documentChunks)).toHaveLength(1);
    expect(
      await nearestDocumentChunks(db, {
        documentIds: [documentId],
        queryVector: queryVector(),
        model: servedTag ?? "",
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
        fkRefs: { documentId, chunkIdx: 1, charStart: 0, charEnd: CHUNK_TEXT.length },
        ownerId: drive.userId,
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    await expect(drive.svc.resolveGeneration(drive.userId, "embed")).rejects.toMatchObject({ kind: "invalid" });
    await expect(spaceModel(drive.ctx, drive.userId, "embed")).rejects.toMatchObject({ code: "search_space_reindexing" });
    expect(await db.select().from(documentChunks)).toHaveLength(1);
  });

  // ── §10-5: the transition, driven end to end ────────────────────────────────────────────────────────
  //
  // THE DEFECT: between a binding change and the reindex finishing, the READ side points at the new space
  // while the corpus is still in the old one. A tag-equality unit test cannot see it — both halves are
  // individually correct at every instant; only the ORDER of two real events produces the state. So this
  // drives the real events: a real connection write moves the space (it also fires the §10-4 embed-space
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
    const oldTag = await spaceModel(drive.ctx, drive.userId, "embed");
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(oldTag);
    expect((await nearestCharacters(db, { ownerId: drive.userId, queryVector: queryVector(), model: oldTag, limit: 5 })).map((h) => h.characterId)).toEqual([
      characterId,
    ]);

    // ── STEP 2: the space MOVES under real connection writes: the owner adds an endpoint encoder and
    // re-points the `embed` binding at it, which moves the `(model[@dtype])` tag.
    const second = await drive.harness.svc.create({
      principal: drive.principal,
      providerId: BYO_PROVIDER,
      model: SECOND_ENCODER,
      baseUrl: BYO_BASE_URL,
      credentialId: null,
      allowBackground: true,
      // `declared` is the TOP evidence tier (§6.2) — the user telling us what their own box serves. It is
      // what makes an endpoint model the curated rows have never heard of an encoder, which is exactly the
      // shape of "I swapped my encoder" that this whole transition exists for.
      declared: { kind: "embedding", embedding: { dims: BUILT_IN_EMBED_DIMS, input: ["text", "image"] } },
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
    await expect(spaceModel(drive.ctx, drive.userId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });

    // ── STEP 3: the reindex lands. Every scope records the new space and the read resumes — on the NEW tag,
    // finding the SAME card. The swap is complete and nothing was lost on the way through.
    await runEmbedSweeps(drive);
    const settled = await spaceModel(drive.ctx, drive.userId, "embed");
    expect(settled).toBe(newTag);
    expect((await nearestCharacters(db, { ownerId: drive.userId, queryVector: queryVector(), model: settled, limit: 5 })).map((h) => h.characterId)).toEqual([
      characterId,
    ]);
  });

  test("a generation switch deletes the old corpus at once, and a partial rebuild leaves nothing stale", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const documentId = await seedDocument(db, drive.userId, { text: CHUNK_TEXT });
    const oldTag = await requireTaskModel(drive.ctx, drive.userId, "embed");

    await drive.svc.store({
      kind: "document",
      lens: "chunk",
      content: CHUNK_TEXT,
      model: oldTag ?? "",
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: CHUNK_TEXT.length },
      ownerId: drive.userId,
    });
    await runEmbedSweeps(drive);
    expect(await db.select().from(documentChunks)).toHaveLength(1);

    const second = await drive.harness.svc.create({
      principal: drive.principal,
      providerId: BYO_PROVIDER,
      model: SECOND_ENCODER,
      baseUrl: BYO_BASE_URL,
      credentialId: null,
      allowBackground: true,
      declared: { kind: "embedding", embedding: { dims: BUILT_IN_EMBED_DIMS, input: ["text", "image"] } },
    });
    await drive.harness.svc.setBinding({ principal: drive.principal, task: "embed", connectionId: second.id });

    // The sweep's first step moves the target, and that one batch deletes the old generation's rows.
    const generation = await drive.svc.resolveGeneration(drive.userId, "embed");
    if (generation === null) {
      throw new Error("expected generation");
    }
    expect(await db.select().from(documentChunks)).toEqual([]);
    await expect(spaceModel(drive.ctx, drive.userId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });

    // Only the documents scope finishes (the card and memory sweeps were cut short): the index holds no old
    // row, and reads keep refusing until every scope promotes the new generation.
    await drive.svc.purgeDocumentVectors({ ownerId: drive.userId, generation });
    expect((await db.select().from(documentChunks)).filter((row) => row.generationId !== generation.id)).toEqual([]);
    await expect(spaceModel(drive.ctx, drive.userId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });
  });

  test("the derived read tag carries the encoder's curated dtype — the fact the backend stamps", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const readTag = await spaceModel(drive.ctx, drive.userId, "embed");
    // Not a string literal: the ASSERTION is that the space tag is not merely the row's model column,
    // because a re-quantised encoder is a different geometry (#2417). A tag equal to the bare model id
    // is the pre-fix shape.
    expect(readTag).not.toBe(ENCODER);
    expect(readTag.startsWith(`${ENCODER}@`)).toBe(true);
  });
});

// ── The space width follows the bound embedder ──────────────────────────────────────────────────────────
//
// An owner's space is as wide as the embedder they bound: nothing is padded, nothing is refused for being
// narrower, and a width change is a space change that re-indexes like a model change. Every read below goes
// through the same `withActiveQuerySpace` door the query verbs use, with the query embedded by the space's own
// connection, so a hit proves the stored rows and the query share one width.

const CARD_ID = castId<CharacterId>("character_width");
const DIGEST_TEXT = "[Mara — the lighthouse] Mara keeps the lamp lit through the storm.";
const SEGMENT_TEXT = "Mara: The lamp has to stay lit.";

/** Every scan a search or a recall runs, taken in the owner's settled space. */
async function readAll(
  drive: Drive,
  chatId: ChatId,
): Promise<{
  readonly cards: readonly CharacterId[];
  readonly digests: readonly string[];
  readonly segments: readonly string[];
}> {
  const db = drive.ctx.db;
  return await withActiveQuerySpace(drive.ctx, drive.userId, "embed", async (space: ActiveQuerySpace) => {
    const query = (await space.connection.embed("who keeps the lamp lit", { inputType: "query" })).vectors[0];
    if (query === null || query === undefined) {
      throw new Error("the space's connection must embed the query");
    }
    const scope = { ownerId: drive.userId, queryVector: query, model: space.model, generationId: space.generationId, limit: 5 };
    return {
      cards: (await nearestCharacters(db, scope)).map((hit) => hit.characterId),
      digests: (await nearestDigests(db, { ...scope, chatIds: [chatId] })).map((hit) => hit.text),
      segments: (await nearestSegments(db, { ...scope, chatIds: [chatId] })).map((hit) => hit.text),
    };
  });
}

/** A card and its chat, with the chat's memory written through the production store verbs. */
async function seedCorpus(db: Db, drive: Drive): Promise<ChatId> {
  await seedCharacter(db, drive.userId, { id: CARD_ID, name: "Mara" });
  const chatId = await seedChat(db, "chat_width", drive.userId);
  await storeMemory(drive, chatId);
  return chatId;
}

/** One memory digest and one verbatim segment, written into the owner's current space. */
async function storeMemory(drive: Drive, chatId: ChatId): Promise<void> {
  const tag = (await requireTaskModel(drive.ctx, drive.userId, "embed")) ?? "";
  await drive.svc.store({
    kind: "chat-block",
    lens: "digest",
    ownerId: drive.userId,
    chatId,
    scopedCharacterId: CARD_ID,
    isGroup: false,
    tier: 0,
    blockIdx: 0,
    text: DIGEST_TEXT,
    topicAnchor: "[Mara — the lighthouse]",
    keywords: [],
    speakerCharacterIds: [CARD_ID],
    contentHash: "digest-width",
    model: tag,
  });
  await drive.svc.storeSegments([
    {
      kind: "chat-block",
      lens: "segment",
      ownerId: drive.userId,
      chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: SEGMENT_TEXT,
      contentHash: "segment-width",
      model: tag,
    },
  ]);
}

async function storedWidths(db: Db): Promise<readonly (readonly [string, number, number])[]> {
  const rows = await db.select().from(characterEmbeddings);
  return rows.map((row) => [row.model, row.dim, row.embedding.length] as const).toSorted((a, b) => a[1] - b[1]);
}

describe("the space width follows the bound embedder", () => {
  test("a 768-wide embedder binds and serves index, search and recall at its own width", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db, { characterIds: [CARD_ID], cardTexts: new Map([[CARD_ID, CARD_TEXT]]) }, undefined, NARROW_ROW);
    const chatId = await seedCorpus(db, drive);
    await runEmbedSweeps(drive);

    expect(await storedWidths(db)).toEqual([[NARROW_ENCODER, NARROW_DIMS, NARROW_DIMS]]);
    expect(await readAll(drive, chatId)).toEqual({ cards: [CARD_ID], digests: [DIGEST_TEXT], segments: [SEGMENT_TEXT] });
  });

  test("switching from the built-in 1024 encoder to a 768 one re-indexes the corpus into the new width", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db, { characterIds: [CARD_ID], cardTexts: new Map([[CARD_ID, CARD_TEXT]]) });
    const chatId = await seedCorpus(db, drive);
    await runEmbedSweeps(drive);
    const builtInTag = await spaceModel(drive.ctx, drive.userId, "embed");
    expect(await storedWidths(db)).toEqual([[builtInTag, BUILT_IN_EMBED_DIMS, BUILT_IN_EMBED_DIMS]]);

    const narrow = await drive.harness.svc.create({
      principal: drive.principal,
      providerId: BYO_PROVIDER,
      model: NARROW_ENCODER,
      baseUrl: NARROW_BASE_URL,
      credentialId: null,
      allowBackground: true,
    });
    await drive.harness.svc.setBinding({ principal: drive.principal, task: "embed", connectionId: narrow.id });
    // The binding write raised the re-index trigger, and reads refuse rather than scan a half-built space.
    expect(drive.harness.embedSpaceChanges).toContain(drive.userId);
    await expect(spaceModel(drive.ctx, drive.userId, "embed")).rejects.toMatchObject({ code: SEARCH_SPACE_REINDEXING });

    // The memory sweep rewrites a chat's blocks into the new space; this fixture stores them the way it would.
    await storeMemory(drive, chatId);
    await runEmbedSweeps(drive);

    expect(await storedWidths(db)).toEqual([[NARROW_ENCODER, NARROW_DIMS, NARROW_DIMS]]);
    expect(await readAll(drive, chatId)).toEqual({ cards: [CARD_ID], digests: [DIGEST_TEXT], segments: [SEGMENT_TEXT] });
  });

  test("narrowing an MRL embedder's width rebuilds at the new width, and a late old-generation write is never ranked", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db, { characterIds: [CARD_ID], cardTexts: new Map([[CARD_ID, CARD_TEXT]]) }, undefined, NARROW_ROW);
    await seedCharacter(db, drive.userId, { id: CARD_ID, name: "Mara" });
    await runEmbedSweeps(drive);
    const oldGeneration = await drive.svc.resolveGeneration(drive.userId, "embed");
    if (oldGeneration === null) {
      throw new Error("expected the bound generation");
    }

    const shorter = 512;
    await drive.harness.svc.update({
      principal: drive.principal,
      connectionId: drive.connectionId,
      patch: { declared: { kind: "embedding", embedding: { dims: shorter } } },
    });
    expect(drive.harness.embedSpaceChanges).toContain(drive.userId);
    await drive.svc.embedCorpus({ force: false, signal: new AbortController().signal, ownerId: drive.userId });

    // The MRL server was asked for the declared width, and the switch left only the new width behind.
    const lastEmbed = drive.harness.requests.filter((request) => request.url.includes(NARROW_ENCODER_ROUTE.match)).at(-1);
    expect(JSON.parse(lastEmbed?.body ?? "{}")).toMatchObject({ dimensions: shorter });
    expect(await storedWidths(db)).toEqual([[NARROW_ENCODER, shorter, shorter]]);

    // A store that pinned the old generation before the switch lands its row afterwards.
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_late"),
      characterId: CARD_ID,
      embedding: queryVector(NARROW_DIMS),
      contentHash: "late-write",
      model: NARROW_ENCODER,
      generationId: oldGeneration.id,
      dim: NARROW_DIMS,
      now: 0,
    });
    // Search ranks only rows of its query's width under one tag, so the late row cannot make libSQL throw…
    const hits = await nearestCharacters(db, { ownerId: drive.userId, queryVector: queryVector(shorter), model: NARROW_ENCODER, limit: 5 });
    expect(hits.map((hit) => hit.characterId)).toEqual([CARD_ID]);
    // …and discovery reads only the owner's current generation, so no pass meets the late row.
    expect((await readOwnedCharacterVectors(db, drive.userId)).map((row) => row.embedding.length)).toEqual([shorter]);

    // The promotion deletes the late row: the index holds one generation at rest.
    await runEmbedSweeps(drive);
    expect(await storedWidths(db)).toEqual([[NARROW_ENCODER, shorter, shorter]]);
  });
});
