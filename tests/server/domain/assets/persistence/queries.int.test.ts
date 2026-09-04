// persistence: queries — the CAS+row coherence primitive + the owner-scoped reads, tested directly against
// a real db + real CAS (not via the service). Load-bearing: storeBlob writes BOTH the blob and the row;
// dedup is the composite unique(ownerId, hash); reads never leak across owners.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assets } from "@orb/db";
import type { AssetId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCas } from "@orb/server/infra/storage";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { assetIdForHash, metadataForOwnedHash, storeBlob } from "../../../../../packages/server/src/domain/assets/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { pngBytes, pngBytesWithDims, seedUser } from "../_support.ts";

const PNG = "image/png";
const NOW = 1_750_000_000_000;

async function freshCas(): Promise<ReturnType<typeof createCas>> {
  const dir = await mkdtemp(join(tmpdir(), "orb-assets-cas-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return createCas(dir);
}

describe("storeBlob", () => {
  test("writes BOTH the CAS blob and the index row (coherence)", async () => {
    const db = await freshDb();
    const cas = await freshCas();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(1, 2, 3);

    const stored = await storeBlob(db, cas, {
      ownerId: owner,
      bytes,
      kind: "avatar",
      mime: PNG,
      candidateId: castId<AssetId>("asset_one"),
      now: NOW,
      enforceMagic: false,
    });

    expect(stored.created).toBe(true);
    expect(await cas.exists(owner, stored.hash)).toBe(true);
    expect(await assetIdForHash(db, owner, stored.hash)).toBe(stored.assetId);
    const rows = await db.select().from(assets).where(eq(assets.id, stored.assetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.uploadedAt).toBe(NOW);
  });

  // #1529 — the CHECK `assets_measurements_check` (#1378 item 1) says a STORED dimension is positive, and
  // it is right. What was wrong was the value reaching it: `sniffImageBytes` returned a header-declared 0
  // verbatim for PNG/GIF/WebP/JPEG (only the AVIF arm had a `MIN_DIMENSION` floor), `storeAsset` wrote
  // `sniffed?.width ?? null`, and libSQL rejected the INSERT — so a 0-extent upload failed outright rather
  // than storing as dimensions-unknown. The floor moved to the sniffer; these pin the seam end to end.
  test("a 0x0 header STORES as dimensions-unknown — it never reaches the positive-dimension CHECK", async () => {
    const db = await freshDb();
    const cas = await freshCas();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const stored = await storeBlob(db, cas, {
      ownerId: owner,
      bytes: pngBytesWithDims(0, 0, 9),
      kind: "avatar",
      mime: PNG,
      candidateId: castId<AssetId>("asset_zero"),
      now: NOW,
      enforceMagic: false,
    });

    const rows = await db.select().from(assets).where(eq(assets.id, stored.assetId));
    expect(rows).toHaveLength(1);
    // NULL, not 0: "the header declared something impossible" is the same fact as "unreadable header",
    // and the renderer's `auto 16 / 9` fallback already covers it.
    expect(rows[0]?.width).toBeNull();
    expect(rows[0]?.height).toBeNull();
  });

  test("a REAL dimension still stores as itself (the floor is not a blanket null)", async () => {
    const db = await freshDb();
    const cas = await freshCas();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const stored = await storeBlob(db, cas, {
      ownerId: owner,
      bytes: pngBytesWithDims(100, 50, 7),
      kind: "avatar",
      mime: PNG,
      candidateId: castId<AssetId>("asset_sized"),
      now: NOW,
      enforceMagic: false,
    });

    const rows = await db.select().from(assets).where(eq(assets.id, stored.assetId));
    expect(rows[0]?.width).toBe(100);
    expect(rows[0]?.height).toBe(50);
  });

  test("dedups within an owner: second store of the same bytes is one row, created:false", async () => {
    const db = await freshDb();
    const cas = await freshCas();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(7, 7, 7);

    const first = await storeBlob(db, cas, {
      ownerId: owner,
      bytes,
      kind: "avatar",
      mime: PNG,
      candidateId: castId<AssetId>("asset_first"),
      now: NOW,
      enforceMagic: false,
    });
    const second = await storeBlob(db, cas, {
      ownerId: owner,
      bytes,
      kind: "avatar",
      mime: PNG,
      candidateId: castId<AssetId>("asset_second"),
      now: NOW,
      enforceMagic: false,
    });

    expect(second.created).toBe(false);
    expect(second.assetId).toBe(first.assetId);
    const rows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(rows).toHaveLength(1);
  });
});

describe("owner-scoped reads", () => {
  test("reads never leak across owners (the hash lookup + the metadata gate)", async () => {
    const db = await freshDb();
    const cas = await freshCas();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const bytes = pngBytes(2, 4, 6, 8);

    const stored = await storeBlob(db, cas, {
      ownerId: owner,
      bytes,
      kind: "avatar",
      mime: PNG,
      candidateId: castId<AssetId>("asset_x"),
      now: NOW,
      enforceMagic: false,
    });

    expect(await assetIdForHash(db, owner, stored.hash)).toBe(stored.assetId);
    expect(await assetIdForHash(db, other, stored.hash)).toBeUndefined();
    expect(await metadataForOwnedHash(db, owner, stored.hash)).toEqual({
      mime: PNG,
      size: bytes.byteLength,
    });
    expect(await metadataForOwnedHash(db, other, stored.hash)).toBeUndefined();
  });

  test("storeBlob with enforceMagic rejects a non-image and writes nothing", async () => {
    const db = await freshDb();
    const cas = await freshCas();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    await expect(
      storeBlob(db, cas, {
        ownerId: owner,
        bytes: new TextEncoder().encode("not an image"),
        kind: "avatar",
        mime: PNG,
        candidateId: castId<AssetId>("asset_bad"),
        now: NOW,
        enforceMagic: true,
      }),
    ).rejects.toThrow();
    const rows = await db.select().from(assets);
    expect(rows).toHaveLength(0);
  });
});
