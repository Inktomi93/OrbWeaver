// verb: store — the CAS+row coherence write + the `asset.created` emit. Load-bearing assertions:
//   • within-user content-hash dedup (same bytes ⇒ ONE row, `created:false` on the second) — D21.
//   • per-user CAS scoping (same bytes, two owners ⇒ two rows, two distinct blobs) — D21.
//   • `asset.created` fires on a NEW asset, NOT on a dedup hit (the embeddings seam).
//   • `enforceMagic` rejects a mislabeled binary BEFORE it reaches CAS (invariant #6).
//   • a card blob's CAS hash == sha-256 of the whole file (== `characters.importHash`) — invariant #10.

import { createHash } from "node:crypto";
import { assets } from "@orb/db";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
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
    const owner = await seedUser(db, { handle: "owner" });
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

  test("enforceMagic rejects a non-image labeled image/png (and stores nothing)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });

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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
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
