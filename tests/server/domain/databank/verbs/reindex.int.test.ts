// verb: reindex — enqueue a databank-reindex workload (owner-gated). A `document` scope verifies ownership
// before enqueue (foreign → NotFound, no enqueue); an `owner` scope enqueues over the caller's whole bank.

import { DocumentNotFoundError } from "@orb/server/domain/databank";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

test("owner-scope reindex enqueues a databank-reindex workload with the resolved mode", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });

  const result = await h.service.reindex({ principal: principalFor(owner), scope: { kind: "owner" } });
  expect(result.workloadId).toBeDefined();
  expect(h.enqueueReindex).toHaveBeenCalledWith({ ownerId: owner, scope: { kind: "owner" }, mode: "chunk-embed" });
});

test("document-scope reindex verifies ownership; a foreign document throws and does NOT enqueue", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const other = await seedUser(db, { handle: "other" });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "doc.md", text: "canon" });

  await h.service.reindex({ principal: principalFor(owner), scope: { kind: "document", documentId: document.id }, mode: "re-extract" });
  expect(h.enqueueReindex).toHaveBeenLastCalledWith({ ownerId: owner, scope: { kind: "document", documentId: document.id }, mode: "re-extract" });

  await expect(h.service.reindex({ principal: principalFor(other), scope: { kind: "document", documentId: document.id } })).rejects.toBeInstanceOf(
    DocumentNotFoundError,
  );
  expect(h.enqueueReindex).toHaveBeenCalledTimes(1); // the foreign attempt did not enqueue
});
