// verb: countDocumentChunksByOwner — the OWNER-scoped twin of `countDocumentChunks`, injected into databank
// for its library phase lens (the map's key set = "which documents are chunked") and its bank-health census
// (the sums). Load-bearing: the owner scope is real (another user's chunked documents never appear — the
// vector table has no ownerId, so the scope derives through the join to `documents`), the space tag scopes
// (a retired model's rows are not live chunks), and an un-chunked document is absent rather than zero.

import type { DocumentId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, makeStoreHarness, seedDocument, seedUser } from "../_support.ts";

async function storeChunk(svc: ReturnType<typeof createEmbeddingsService>, documentId: DocumentId, chunkIdx: number, ownerId: UserId): Promise<void> {
  await svc.store({
    kind: "document",
    lens: "chunk",
    content: `chunk ${chunkIdx} content`,
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    // biome-ignore lint/suspicious/noExplicitAny: the branded DocumentId is produced by seedDocument; the test passes it straight back through the store arm.
    fkRefs: { documentId: documentId as any, chunkIdx, charStart: chunkIdx * 10, charEnd: chunkIdx * 10 + 10 },
    ownerId,
  });
}

test("counts every chunk in the OWNER's bank, never another owner's, and scopes to the active space", async () => {
  const db = await freshDb();
  const h = makeStoreHarness(db);
  const svc = createEmbeddingsService(h.ctx);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const mine = await seedDocument(db, owner, { id: "document_mine", text: "a" });
  const alsoMine = await seedDocument(db, owner, { id: "document_also", text: "b" });
  const bare = await seedDocument(db, owner, { id: "document_bare", text: "c" });
  const theirs = await seedDocument(db, other, { id: "document_theirs", text: "d" });
  await storeChunk(svc, mine, 0, owner);
  await storeChunk(svc, mine, 1, owner);
  await storeChunk(svc, alsoMine, 0, owner);
  await storeChunk(svc, theirs, 0, other);

  const counts = await svc.countDocumentChunksByOwner({ ownerId: owner, model: EMBED_MODEL });
  expect(counts.get(mine)).toBe(2);
  expect(counts.get(alsoMine)).toBe(1);
  // An un-chunked document is ABSENT, never 0 — the databank phase lens reads the key set as "is it chunked".
  expect(counts.has(bare)).toBe(false);
  // THE OWNER BELT. `document_chunks` carries no ownerId; scope derives through the FK join to `documents`,
  // so a missing join would leak another user's rows into this caller's census.
  expect(counts.has(theirs)).toBe(false);
  expect(counts.size).toBe(2);

  // A retired embed space is not the live bank.
  expect((await svc.countDocumentChunksByOwner({ ownerId: owner, model: "some-other-model" })).size).toBe(0);
});
