// The ingest subsystem (chunk→embed→prune) — the DB4 round-trip checkpoint (databank-design/08 §3).
// Load-bearing assertions:
//   • the derived layer: contiguous chunkIdx 0..n-1, the [charStart,charEnd) spans PARTITION the canon
//     losslessly, every row carries the active (model,dim) space tag + a content_hash;
//   • idempotency: a second ingestDocument is ALL no-ops — ZERO additional embed calls (the counting fake);
//   • prune-on-shrink: re-ingesting with a bigger chunkSize (fewer chunks) deletes the stranded tail rows
//     (store-then-prune), leaving exactly the new set.

import type { Db } from "@orb/db";
import { documentChunks, documents } from "@orb/db";
import type { DocumentId } from "@orb/kit/ids";
import { createExtractText, EXTRACTOR_VERSION } from "@orb/server/infra/extraction";
import { asc, eq } from "drizzle-orm";
import { vi } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { DatabankHarness } from "../_support.ts";
import { EMBED_DIM, EMBED_MODEL, makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

// ~500 chars so it splits at chunkSize 200 (the schema's floor) with the whole-file threshold below it.
const CANON = [
  "The archive holds many scrolls, and each scroll maps a forgotten road.",
  "Travelers trade them for safe passage north through the winter passes.",
  "A keeper tends the shelves, dusting the vellum and mending the bindings.",
  "Some scrolls whisper of towers that sank beneath the salt marsh long ago.",
  "Others chart the trade winds that carried spice across the amber sea.",
  "The oldest map names a city no living cartographer has ever set foot in.",
].join(" ");
const SMALL_CHUNKS = { chunk: { chunkSize: 200, overlapPercent: 0, wholeFileThreshold: 100 }, retrieval: {} } as const;

async function seedDoc(db: Db, ownerHandle: string): Promise<{ h: DatabankHarness; documentId: DocumentId }> {
  const h = makeDatabankHarness(db, { settings: SMALL_CHUNKS });
  const owner = await seedUser(db, { handle: ownerHandle });
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "scrolls.md", text: CANON });
  return { h, documentId: document.id };
}

test("ingestDocument derives contiguous chunks whose spans partition the canon, tagged with the active space", async () => {
  const db = await freshDb();
  const { h, documentId } = await seedDoc(db, "owner");

  const result = await h.ingest.ingestDocument({ documentId, signal: new AbortController().signal });
  expect(result.documents).toBe(1);
  expect(result.chunksUpserted).toBeGreaterThan(1); // the canon splits (chunkSize 40 << length)
  expect(result.failed).toEqual([]);

  const rows = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId)).orderBy(asc(documentChunks.chunkIdx));
  expect(rows.length).toBe(result.chunksUpserted);
  // contiguity + lossless partition: idx is 0..n-1 and the spans concat back to the canon verbatim.
  expect(rows.map((r) => r.chunkIdx)).toEqual(rows.map((_r, i) => i));
  expect(rows.map((r) => CANON.slice(r.charStart, r.charEnd)).join("")).toBe(CANON);
  for (const row of rows) {
    expect(row.model).toBe(EMBED_MODEL);
    expect(row.dim).toBe(EMBED_DIM);
    expect(row.contentHash.length).toBeGreaterThan(0);
  }
});

test("re-ingesting the same canon is all no-ops — zero additional embed calls (idempotent)", async () => {
  const db = await freshDb();
  const { h, documentId } = await seedDoc(db, "owner");

  const first = await h.ingest.ingestDocument({ documentId, signal: new AbortController().signal });
  const embedsAfterFirst = h.roleClients.embed.mock.calls.length;
  expect(embedsAfterFirst).toBe(first.chunksUpserted);

  const second = await h.ingest.ingestDocument({ documentId, signal: new AbortController().signal });
  expect(second.chunksUpserted).toBe(0);
  expect(second.chunksNoop).toBe(first.chunksUpserted);
  expect(second.chunksPruned).toBe(0);
  expect(h.roleClients.embed.mock.calls.length).toBe(embedsAfterFirst); // no new embed calls
});

test("re-ingesting with a bigger chunkSize prunes the stranded tail (store-then-prune)", async () => {
  const db = await freshDb();
  const { documentId } = await seedDoc(db, "owner");

  // First pass: many small chunks.
  const small = makeDatabankHarness(db, { settings: SMALL_CHUNKS });
  const dense = await small.ingest.ingestDocument({ documentId, signal: new AbortController().signal });
  expect(dense.chunksUpserted).toBeGreaterThan(2);

  // Second pass over the SAME document with a whole-file threshold above the canon length → ONE chunk.
  const whole = makeDatabankHarness(db, { settings: { chunk: { chunkSize: 2500, overlapPercent: 0, wholeFileThreshold: 5120 }, retrieval: {} } });
  const collapsed = await whole.ingest.ingestDocument({ documentId, signal: new AbortController().signal });
  expect(collapsed.chunksUpserted).toBe(1);
  expect(collapsed.chunksPruned).toBe(dense.chunksUpserted - 1);

  const remaining = await db.select({ idx: documentChunks.chunkIdx }).from(documentChunks).where(eq(documentChunks.documentId, documentId));
  expect(remaining.map((r) => r.idx)).toEqual([0]);
});

test("mode:'re-extract' refreshes canon + version for a document stamped by an OLDER extractor", async () => {
  const db = await freshDb();
  // The harness injects the REAL infra/extraction dispatcher + its EXTRACTOR_VERSION ("1").
  const h = makeDatabankHarness(db, { settings: SMALL_CHUNKS, extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: "owner" });
  const bytes = new TextEncoder().encode("# Doc\r\n\r\nReal canon body.");
  const { document } = await h.service.upload({ principal: principalFor(owner), bytes, mime: "text/markdown", name: "d.md" });

  // Simulate a row left by an OLDER extractor version (the passthrough era): stale version + stale text.
  await db.update(documents).set({ extractorVersion: "textlike-0", extractedText: "STALE" }).where(eq(documents.id, document.id));

  const result = await h.ingest.reindex({
    ownerId: owner,
    scope: { kind: "document", documentId: document.id },
    mode: "re-extract",
    signal: new AbortController().signal,
  });
  expect(result.reExtracted).toBe(1);

  const rows = await db.select().from(documents).where(eq(documents.id, document.id));
  expect(rows[0]?.extractorVersion).toBe(EXTRACTOR_VERSION); // re-stamped "1"
  expect(rows[0]?.extractedText).toBe("# Doc\n\nReal canon body."); // re-extracted through the real dispatcher, CRLF normalized
});

test("mode:'re-extract' SKIPS a document already at the current extractor version (no redundant re-extract)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { settings: SMALL_CHUNKS, extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: "owner" });
  const bytes = new TextEncoder().encode("# Doc\r\n\r\nReal canon body.");
  const { document } = await h.service.upload({ principal: principalFor(owner), bytes, mime: "text/markdown", name: "d.md" });

  // The row is ALREADY at the current version ("1"). Plant a sentinel canon: if the version guard were
  // deleted, re-extract would run over the stored bytes and overwrite this with the real markdown — the
  // assertion below then fails. So this test BITES the `extractorVersion === current` skip clause.
  await db.update(documents).set({ extractedText: "SENTINEL — must not be re-extracted" }).where(eq(documents.id, document.id));

  const result = await h.ingest.reindex({
    ownerId: owner,
    scope: { kind: "document", documentId: document.id },
    mode: "re-extract",
    signal: new AbortController().signal,
  });
  expect(result.reExtracted).toBe(0);

  const rows = await db.select().from(documents).where(eq(documents.id, document.id));
  expect(rows[0]?.extractedText).toBe("SENTINEL — must not be re-extracted"); // untouched — the current-version doc was skipped
  expect(rows[0]?.extractorVersion).toBe(EXTRACTOR_VERSION);
});

test("mode:'re-extract' SKIPS a text-origin doc (sourceAssetId NULL) even with a STALE version stamp", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { settings: SMALL_CHUNKS, extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: "owner" });
  // A pasted-text doc: origin 'text', sourceAssetId NULL — there are no bytes to re-extract from.
  const { document } = await h.service.createFromText({ principal: principalFor(owner), name: "pasted.md", text: "Pasted body." });

  // Force a STALE version stamp (≠ current "1"): the version clause ALONE would select this doc — only the
  // null-sourceAssetId guard keeps it skipped.
  await db.update(documents).set({ extractorVersion: "textlike-0" }).where(eq(documents.id, document.id));

  // Spy the byte-read seam: the null guard short-circuits BEFORE any fetch. If that clause were deleted, the
  // stale version would fall through to `loadAssetBytes(null)` — so a call here proves the guard is gone.
  const loadBytes = vi.spyOn(h.ctx, "loadAssetBytes");

  const result = await h.ingest.reindex({
    ownerId: owner,
    scope: { kind: "document", documentId: document.id },
    mode: "re-extract",
    signal: new AbortController().signal,
  });
  expect(result.reExtracted).toBe(0);
  expect(loadBytes).not.toHaveBeenCalled();

  const rows = await db.select().from(documents).where(eq(documents.id, document.id));
  expect(rows[0]?.extractedText).toBe("Pasted body."); // unchanged
  expect(rows[0]?.extractorVersion).toBe("textlike-0"); // still stale — never re-extracted
});
