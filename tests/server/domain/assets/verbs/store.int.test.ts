// verb: store — the CAS+row coherence write + the `asset.created` emit. Load-bearing assertions:
//   • within-user content-hash dedup (same bytes ⇒ ONE row, `created:false` on the second) — D21.
//   • per-user CAS scoping (same bytes, two owners ⇒ two rows, two distinct blobs) — D21.
//   • `asset.created` fires on a NEW asset, NOT on a dedup hit (the embeddings seam).
//   • a RECOVERED row (blob already on disk, row lost to a crash) is a CREATION: `created` reports the ROW
//     insert, not the CAS write, so the emit — and therefore the indexer — is never skipped for it.
//   • `enforceMagic` rejects a mislabeled binary BEFORE it reaches CAS (invariant #6).
//   • a card blob's CAS hash == sha-256 of the whole file (== `characters.importHash`) — invariant #10.

import { createHash } from "node:crypto";
import { assets } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";
const MAGIC_RE = /magic/iu;
const MISMATCH_RE = /mismatch/iu;
const TOO_LARGE_RE = /over the .*cap/iu;

describe("store", () => {
  test("dedups identical bytes within a user to one row (created:false on the second)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(1, 2, 3);

    const first = await svc.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: PNG,
    });
    const second = await svc.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: PNG,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.assetId).toBe(first.assetId);
    expect(second.hash).toBe(first.hash);

    const rows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(rows).toHaveLength(1);
  });

  test("per-user CAS scoping: same bytes for two owners = two rows, two distinct blobs", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const bytes = pngBytes(9, 9, 9);

    const a = await svc.store({ principal: principal(owner), bytes, kind: "avatar", mime: PNG });
    const b = await svc.store({ principal: principal(other), bytes, kind: "avatar", mime: PNG });

    // Identical bytes ⇒ identical content hash, but distinct owners ⇒ distinct rows + distinct blobs.
    expect(b.hash).toBe(a.hash);
    expect(b.assetId).not.toBe(a.assetId);
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);

    const all = await db.select().from(assets);
    expect(all).toHaveLength(2);
    expect(await h.ctx.cas.exists(owner, a.hash)).toBe(true);
    expect(await h.ctx.cas.exists(other, b.hash)).toBe(true);
    // The on-disk path embeds the owner — the physical half of the per-user gate.
    expect(h.ctx.cas.blobPath(owner, a.hash)).not.toBe(h.ctx.cas.blobPath(other, b.hash));
  });

  test("emits asset.created on a new asset, but NOT on a dedup hit", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(4, 2);

    const first = await svc.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: PNG,
    });
    expect(h.emitted).toEqual([{ type: "asset.created", assetId: first.assetId }]);

    await svc.store({ principal: principal(owner), bytes, kind: "avatar", mime: PNG });
    // Still exactly one emit — the second store deduped, so the indexer is not re-notified.
    expect(h.emitted).toHaveLength(1);
  });

  test("a RECOVERED row over an orphan blob counts as created and emits asset.created", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(3, 1, 4);

    // The crash state: the CAS write landed, the index row did not (purge-asset's benign orphan, or a
    // process death between `putBytes` and the insert). The blob exists; nothing references it.
    const put = await h.ctx.cas.putBytes(owner, bytes, FROZEN_AT_MS);
    expect(put.created).toBe(true);
    expect(await db.select().from(assets)).toHaveLength(0);

    const stored = await svc.store({ principal: principal(owner), bytes, kind: "avatar", mime: PNG });

    // The ROW is what was created — the CAS write deduped. `created` reports the row, so the recovered
    // asset is indexed exactly once (the embeddings seam never hears about it otherwise).
    expect(stored.created).toBe(true);
    expect(h.emitted).toEqual([{ type: "asset.created", assetId: stored.assetId }]);
  });

  test("enforceMagic rejects a non-image labeled image/png (and stores nothing)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const notAnImage = new TextEncoder().encode("#!/bin/sh\nrm -rf /\n");

    await expect(
      svc.store({
        principal: principal(owner),
        bytes: notAnImage,
        kind: "avatar",
        mime: PNG,
        enforceMagic: true,
      }),
    ).rejects.toThrow(MAGIC_RE);

    const rows = await db.select().from(assets);
    expect(rows).toHaveLength(0);
    expect(h.emitted).toHaveLength(0);
  });

  test("enforceMagic rejects a PNG claimed as image/jpeg (claimed-vs-sniffed mismatch)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    await expect(
      svc.store({
        principal: principal(owner),
        bytes: pngBytes(7),
        kind: "avatar",
        mime: "image/jpeg",
        enforceMagic: true,
      }),
    ).rejects.toThrow(MISMATCH_RE);
  });

  test("PD-94: rejects bytes over maxBytes BEFORE the CAS write (stores nothing, no emit)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(1, 2, 3, 4, 5, 6);

    await expect(
      svc.store({
        principal: principal(owner),
        bytes,
        kind: "avatar",
        mime: PNG,
        maxBytes: bytes.byteLength - 1,
      }),
    ).rejects.toThrow(TOO_LARGE_RE);

    // Nothing reached the CAS/index, and the indexer was not notified.
    expect(await db.select().from(assets)).toHaveLength(0);
    expect(h.emitted).toHaveLength(0);
  });

  test("maxBytes at the exact byte length is accepted (boundary is inclusive)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(1, 2, 3);

    const stored = await svc.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: PNG,
      maxBytes: bytes.byteLength,
    });
    expect(stored.created).toBe(true);
  });

  test("a card blob's CAS hash is the sha-256 of the whole file (== characters.importHash)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const card = pngBytes(0xca, 0xfe);

    const stored = await svc.store({
      principal: principal(owner),
      bytes: card,
      kind: "card",
      mime: PNG,
    });
    const expected = createHash("sha256").update(card).digest("hex");
    expect(stored.hash).toBe(expected);
  });
});

// DBK-A: the `enforceMagic` belt was image-only, so every REAL document upload (the databank producer's
// `assets.store(..., { enforceMagic: true })`) threw at the CAS. The belt now dispatches on the claimed mime
// family: pdf/zip by signature, text-family by strict-UTF-8 validity. These drive the
// REAL sniff belt (no faked store) — a valid doc lands, a mislabeled binary still throws.
describe("store — enforceMagic over document mimes (DBK-A)", () => {
  const markdownBytes = new TextEncoder().encode("# Notes\n\nThe keeper mends the vellum each dawn.\n");
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n");
  // Invalid UTF-8: a lone 0xFF/0x80 continuation with no lead byte — a strict decode rejects it.
  const binaryBytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc0]);

  test("a real text/markdown document with enforceMagic passes the UTF-8 belt and stores", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const stored = await svc.store({ principal: principal(owner), bytes: markdownBytes, kind: "document", mime: "text/markdown", enforceMagic: true });
    expect(stored.created).toBe(true);
    const rows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("document");
  });

  test("a real application/pdf document passes the %PDF signature belt and stores", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const stored = await svc.store({ principal: principal(owner), bytes: pdfBytes, kind: "document", mime: "application/pdf", enforceMagic: true });
    expect(stored.created).toBe(true);
  });

  test("a mislabeled binary claimed as text/markdown still throws (fails the UTF-8 belt, stores nothing)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    await expect(svc.store({ principal: principal(owner), bytes: binaryBytes, kind: "document", mime: "text/markdown", enforceMagic: true })).rejects.toThrow(
      MISMATCH_RE,
    );
    expect(await db.select().from(assets)).toHaveLength(0);
  });

  test("text bytes claimed as application/pdf throw (missing the %PDF signature)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    await expect(
      svc.store({ principal: principal(owner), bytes: markdownBytes, kind: "document", mime: "application/pdf", enforceMagic: true }),
    ).rejects.toThrow(MISMATCH_RE);
  });

  // The zip arm checks the FULL 4-byte local-file header (02 §6) — "PK" + wrong bytes must NOT pass.
  const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const zipHeaderBytes = new TextEncoder().encode("PK\x03\x04rest-of-container");
  const pkTextBytes = new TextEncoder().encode("PKWARE license text, not a zip container");

  test("a real zip-container header claimed as docx passes the belt and stores", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const stored = await svc.store({ principal: principal(owner), bytes: zipHeaderBytes, kind: "document", mime: docxMime, enforceMagic: true });
    expect(stored.created).toBe(true);
  });

  test("'PK'-prefixed non-zip bytes claimed as docx throw (the 4-byte header is required, not just 'PK')", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    await expect(svc.store({ principal: principal(owner), bytes: pkTextBytes, kind: "document", mime: docxMime, enforceMagic: true })).rejects.toThrow(
      MISMATCH_RE,
    );
    expect(await db.select().from(assets)).toHaveLength(0);
  });
});
