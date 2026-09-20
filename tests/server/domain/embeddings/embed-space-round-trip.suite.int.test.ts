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
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { EmbeddingsContext } from "../../../../packages/server/src/domain/embeddings/context.ts";
import type { EmbeddingsService } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { requireTaskModel } from "../../../../packages/server/src/domain/embeddings/substrate/task-model.ts";
import { nearestCharacters, nearestDocumentChunks } from "../../../../packages/server/src/domain/search/persistence/nearest.ts";
import { requireSpaceModel } from "../../../../packages/server/src/domain/search/substrate/space.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import type { ConnectionHarness } from "../connection/_support.ts";
import { makeHarness, seedOwner } from "../connection/_support.ts";
import { makeStoreHarness, seedCharacter, seedDocument } from "./_support.ts";

const LOCAL_LIGHT = castId<ProviderId>("local-light");
/** The curated local-light encoder — the row `entry/boot/seed-local-light.ts` seeds on every fresh box. */
const ENCODER = "jinaai/jina-clip-v2";
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
  readonly svc: EmbeddingsService;
  readonly ctx: EmbeddingsContext;
  readonly roleClients: () => Promise<RoleClients>;
}

/** The whole graph one drive needs: a real runtime over a real db, an owner holding a bound `local-light`
 *  encoder connection, and an embeddings service whose role clients come from THAT runtime. */
async function driveOwnerWithBoundEncoder(db: Db): Promise<Drive> {
  const harness = await makeHarness(db, { localLight: true });
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
  const store = makeStoreHarness(db);
  const ctx: EmbeddingsContext = { ...store.ctx, roleClientsFor: roleClients, embedDim: EMBED_SPACE_DIMS, imageEmbedDim: EMBED_SPACE_DIMS };
  return { harness, principal, userId, svc: createEmbeddingsService(ctx), ctx, roleClients };
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

    // The READ side derives its own tag from the same resolved connection, through search's substrate.
    const readTag = await requireSpaceModel(await drive.roleClients(), "embed");
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
    const { chunks } = await drive.svc.purgeDocumentVectors({ ownerId: drive.userId });
    expect(chunks).toBe(0);
    expect(await db.select().from(documentChunks)).toHaveLength(1);

    const readTag = await requireSpaceModel(await drive.roleClients(), "embed");
    const hits = await nearestDocumentChunks(db, {
      documentIds: [documentId],
      queryVector: queryVector(),
      model: readTag,
      dim: EMBED_SPACE_DIMS,
      limit: 5,
    });
    expect(hits).toHaveLength(1);
  });

  test("the derived read tag carries the encoder's curated dtype — the fact the backend stamps", async () => {
    const db = await freshDb();
    const drive = await driveOwnerWithBoundEncoder(db);
    const readTag = await requireSpaceModel(await drive.roleClients(), "embed");
    // Not a string literal: the ASSERTION is that the space tag is not merely the row's model column,
    // because a re-quantised encoder is a different geometry (#2417). A tag equal to the bare model id
    // is the pre-fix shape.
    expect(readTag).not.toBe(ENCODER);
    expect(readTag.startsWith(`${ENCODER}@`)).toBe(true);
  });
});
