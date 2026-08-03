// verb: createFromText — origin 'text' canon write. Load-bearing: the row lands (origin 'text',
// sourceAssetId NULL, extractorVersion 'none', importHash = sha256(text), byteSize = UTF-8 length); ingest is
// ENQUEUED (not run inline); a re-paste of identical text dedups on (ownerId, importHash) → duplicate/skipped,
// no second enqueue.

import { documents } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

const TEXT = "A note on the northern passes and the toll each keeper charges.";

test("creates a text-origin document, stamps the canon, and enqueues ingest", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const result = await h.service.createFromText({ principal: principalFor(owner), name: "note.md", text: TEXT });
  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("queued");
  expect(result.document.origin).toBe("text");
  expect(result.document.charCount).toBe(TEXT.length);

  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ ownerId: owner, origin: "text", sourceAssetId: null, extractorVersion: "none", extractedText: TEXT });
  expect(rows[0]?.byteSize).toBe(new TextEncoder().encode(TEXT).length);
  expect(h.enqueueIngest).toHaveBeenCalledTimes(1);
  expect(h.enqueueIngest).toHaveBeenCalledWith({ documentId: result.document.id, ownerId: owner });
});

test("a re-paste of identical text dedups (duplicate/skipped, no second enqueue)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const first = await h.service.createFromText({ principal: principalFor(owner), name: "note.md", text: TEXT });
  const second = await h.service.createFromText({ principal: principalFor(owner), name: "note-again.md", text: TEXT });

  expect(second.outcome).toBe("duplicate");
  expect(second.ingest).toBe("skipped");
  expect(second.document.id).toBe(first.document.id); // the existing document is returned
  expect(h.enqueueIngest).toHaveBeenCalledTimes(1); // only the first enqueued
  const rows = await db.select().from(documents).where(eq(documents.ownerId, owner));
  expect(rows).toHaveLength(1);
});

// DBFIX — THE ORPHAN: the `documents` row is inserted BEFORE the ingest is enqueued and the two are not one
// transaction, so a rejected enqueue used to reject the whole mutation while LEAVING the document behind:
// a row with no chunks and no workload, parked at `Queued` on the library forever, under a generic
// "Couldn't save the document." toast that claimed nothing was saved. The enqueue failure is now DATA — the
// document is created (the user's text is never destroyed) and the verb reports the un-indexed truth.
test("a REJECTED ingest enqueue does not reject the create — the document lands, reported as un-indexed", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.enqueueIngest.mockRejectedValueOnce(new Error('That "databank-ingest" run is already in progress'));

  const result = await h.service.createFromText({ principal: principalFor(owner), name: "note.md", text: TEXT });
  expect(result.outcome).toBe("created");
  // The document is REAL and readable — the paste is not lost to a queue refusal.
  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.extractedText).toBe(TEXT);
  // …and the result says so, rather than the caller inferring "queued" from a mutation that threw.
  expect(result.ingest).toBe("not-queued");
});

test("two owners pasting identical text each get their OWN document (dedup is per-owner)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const a = await seedUser(db, { handle: castId<Handle>("a") });
  const b = await seedUser(db, { handle: castId<Handle>("b") });

  const da = await h.service.createFromText({ principal: principalFor(a), name: "n.md", text: TEXT });
  const db2 = await h.service.createFromText({ principal: principalFor(b), name: "n.md", text: TEXT });
  expect(da.outcome).toBe("created");
  expect(db2.outcome).toBe("created");
  expect(da.document.id).not.toBe(db2.document.id);
});
