// verb: upload — the sync canon write (CAS store → extract → row → enqueue). Load-bearing: the asset is
// stored (sourceAssetId set), extraction runs synchronously and its text becomes the canon, origin 'upload';
// re-upload of identical bytes dedups (duplicate/skipped, extraction NOT re-run); an empty extraction surfaces
// the `empty-extraction` warning as DATA (not a throw).

import type { Db } from "@orb/db";
import { documents } from "@orb/db";
import { createAssetsService } from "@orb/server/domain/assets";
import { createExtractText, EXTRACTOR_VERSION } from "@orb/server/infra/extraction";
import { eq } from "drizzle-orm";
import { onTestFinished } from "vitest";
import type { DatabankContext, DatabankService } from "../../../../../packages/server/src/domain/databank/contract/service.ts";
import { createDatabankService } from "../../../../../packages/server/src/domain/databank/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness as makeAssetsHarness } from "../../assets/_support.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

const BYTES = new TextEncoder().encode("# Notes\n\nThe keeper mends the vellum each dawn.");
const MIME = "text/markdown";
// Invalid UTF-8 (lone continuation bytes) claimed as text — the strict-UTF-8 sniff belt rejects it (DBK-A).
const BINARY = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc0]);
const MISMATCH_RE = /mismatch/iu;

/** The databank service over the harness ctx but with the REAL `assets.store` (real CAS + the enforceMagic
 *  sniff belt) swapped in for the default fake — the ONE seam DBK-A fixes (databank-design/02 §6). */
async function withRealAssetsStore(db: Db): Promise<DatabankService> {
  const assetsH = await makeAssetsHarness(db);
  onTestFinished(assetsH.cleanup);
  const assets = createAssetsService(assetsH.ctx);
  const ctx: DatabankContext = { ...makeDatabankHarness(db).ctx, assetsStore: assets.store };
  return createDatabankService(ctx);
}

test("stores the bytes, extracts the canon synchronously, and enqueues ingest", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });

  const result = await h.service.upload({ principal: principalFor(owner), bytes: BYTES, mime: MIME, name: "notes.md" });
  expect(result.outcome).toBe("created");
  expect(result.document.origin).toBe("upload");
  expect(h.assetsStore).toHaveBeenCalledTimes(1);
  expect(h.extractText).toHaveBeenCalledTimes(1);
  expect(h.enqueueIngest).toHaveBeenCalledWith({ documentId: result.document.id, ownerId: owner });

  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows[0]?.origin).toBe("upload");
  expect(rows[0]?.sourceAssetId).not.toBeNull();
  expect(rows[0]?.extractedText).toContain("keeper mends the vellum");
  expect(rows[0]?.extractorVersion).toBe("textlike-1");
});

test("re-upload of identical bytes dedups without re-extracting", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });

  await h.service.upload({ principal: principalFor(owner), bytes: BYTES, mime: MIME, name: "a.md" });
  const second = await h.service.upload({ principal: principalFor(owner), bytes: BYTES, mime: MIME, name: "b.md" });

  expect(second.outcome).toBe("duplicate");
  expect(second.ingest).toBe("skipped");
  expect(h.extractText).toHaveBeenCalledTimes(1); // extraction only ran for the first
  expect(h.enqueueIngest).toHaveBeenCalledTimes(1);
});

test("an empty extraction surfaces the empty-extraction warning (data, not a throw)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  h.extractText.mockResolvedValueOnce({ text: "", meta: { format: "pdf", extractorVersion: "textlike-1", charCount: 0 } });

  const result = await h.service.upload({ principal: principalFor(owner), bytes: new Uint8Array([1, 2, 3]), mime: "application/pdf", name: "scan.pdf" });
  expect(result.outcome).toBe("created");
  expect(result.warning).toBe("empty-extraction");
});

test("round-trips through the REAL infra/extraction dispatcher — canon normalized, version stamped", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: "owner" });

  const bytes = new TextEncoder().encode("# Real\r\n\r\nExtracted through the actual loader.");
  const result = await h.service.upload({ principal: principalFor(owner), bytes, mime: "text/markdown", name: "real.md" });
  expect(result.outcome).toBe("created");

  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows[0]?.extractorVersion).toBe(EXTRACTOR_VERSION); // "1" — not the passthrough's "textlike-1"
  // the real normalize pipeline turned CRLF → \n; markdown syntax kept verbatim.
  expect(rows[0]?.extractedText).toBe("# Real\n\nExtracted through the actual loader.");
});

// DBK-A: at HEAD the enforceMagic belt was image-only, so `assets.store(..., { enforceMagic: true })` threw
// for every document mime — every real upload failed at the CAS. The int suite faked assetsStore, hiding it.
// These drive the upload verb through the REAL `assets.store` (real CAS + the extended sniff belt), no faked
// store: a real text/markdown document lands end-to-end; a mislabeled binary still throws (no document row).
test("a real text/markdown upload succeeds end-to-end through the REAL assets.store belt (no faked store)", async () => {
  const db = await freshDb();
  const service = await withRealAssetsStore(db);
  const owner = await seedUser(db, { handle: "owner" });

  const result = await service.upload({ principal: principalFor(owner), bytes: BYTES, mime: MIME, name: "notes.md" });

  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("queued");
  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows[0]?.origin).toBe("upload");
  // The sourceAssetId FK resolves to a REAL assets row the sniff belt admitted (not a fabricated fake row).
  expect(rows[0]?.sourceAssetId).not.toBeNull();
  expect(rows[0]?.extractedText).toContain("keeper mends the vellum");
});

test("a mislabeled binary claimed text/markdown throws at the REAL belt, writing no document", async () => {
  const db = await freshDb();
  const service = await withRealAssetsStore(db);
  const owner = await seedUser(db, { handle: "owner" });

  await expect(service.upload({ principal: principalFor(owner), bytes: BINARY, mime: MIME, name: "x.md" })).rejects.toThrow(MISMATCH_RE);

  expect(await db.select().from(documents)).toHaveLength(0);
});
